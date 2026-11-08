/**
 * Pausing, resuming, closing and reopening a host business (migration 0097;
 * rules in src/lib/account-state.ts). The owner or Latchkey admin acts; the
 * columns are written with the service role (the protect_account_state
 * trigger stops owners editing them directly). Pausing pauses billing at
 * Stripe (pause_collection, nothing charged while paused); closing cancels
 * the subscription as cancelSubscription does.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { actionProblem, type AccountAction } from "@/lib/account-state";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { isSuperAdmin } from "@/lib/roles";

type Ctx = {
  supabase: { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown }> };
  userId: string;
  claims?: Record<string, unknown>;
};

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

const input = z.object({
  hostId: z.string().uuid(),
  action: z.enum(["pause", "resume", "close", "reopen"]),
  reason: z.string().trim().max(500).optional(),
  /** Closing needs the word typed, so it's never a slip. */
  confirm: z.string().optional(),
});

async function pauseBilling(subscriptionId: string | null, paused: boolean) {
  if (!subscriptionId) return;
  const { stripeCall } = await import("./stripe.server");
  try {
    await stripeCall(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      pause_collection: paused ? { behavior: "void" } : "",
    });
  } catch (err) {
    if (err instanceof Error && /No such subscription/i.test(err.message)) return;
    throw (await import("./stripe-identity")).stripeFailure(err, paused ? "Pausing" : "Resuming");
  }
}

/** Pause, resume, close or reopen a business. */
export const changeAccountState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    assertNotSharedDemo(ctx.claims as never);
    const admin = await isSuperAdmin(ctx.supabase);
    const { data: isOwner } = await ctx.supabase.rpc("has_host_role", {
      _host_id: data.hostId,
      _role: "owner",
    });
    const owner = isOwner === true;
    const db = await adminDb();
    const { data: h, error } = await db
      .from("hosts")
      .select("id, suspended_at, suspend_source, closed_at, stripe_subscription_id")
      .eq("id", data.hostId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!h) throw new Error("Business not found.");
    const problem = actionProblem(data.action as AccountAction, h, { owner, admin });
    if (problem) throw new Error(problem);
    if (data.action === "close" && data.confirm !== "CLOSE")
      throw new Error("Type CLOSE to close the business.");
    if ((data.action === "pause" || data.action === "close") && admin && !owner && !data.reason)
      throw new Error("Add a reason: the owner sees it.");

    const now = new Date().toISOString();
    const source = admin && !owner ? "admin" : "owner";
    let patch: Record<string, unknown>;
    if (data.action === "pause") {
      await pauseBilling(h.stripe_subscription_id, true);
      patch = {
        suspended_at: now,
        suspended_by: ctx.userId,
        suspend_source: source,
        suspend_reason: data.reason || null,
      };
    } else if (data.action === "resume") {
      await pauseBilling(h.stripe_subscription_id, false);
      patch = {
        suspended_at: null,
        suspended_by: null,
        suspend_source: null,
        suspend_reason: null,
      };
    } else if (data.action === "close") {
      if (h.stripe_subscription_id) {
        const { stripeCall } = await import("./stripe.server");
        try {
          await stripeCall(
            `/subscriptions/${encodeURIComponent(h.stripe_subscription_id)}`,
            undefined,
            "DELETE",
          );
        } catch (err) {
          if (!(err instanceof Error && /No such subscription/i.test(err.message)))
            throw (await import("./stripe-identity")).stripeFailure(err, "Cancelling");
        }
      }
      patch = {
        closed_at: now,
        closed_by: ctx.userId,
        close_reason: data.reason || (source === "owner" ? "Closed by the owner" : null),
        subscription_status: "canceled",
        canceled_at: now,
        current_period_end: null,
      };
    } else {
      // Reopened: no access until the owner subscribes again (or admin comps it).
      patch = {
        closed_at: null,
        closed_by: null,
        close_reason: null,
        suspended_at: null,
        suspended_by: null,
        suspend_source: null,
        suspend_reason: null,
      };
    }
    const { error: upErr } = await db.from("hosts").update(patch).eq("id", data.hostId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

/** The business's paused/closed state and what the signed-in person may do about it. */
export const getAccountState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await isSuperAdmin(ctx.supabase);
    const { data: isOwner } = await ctx.supabase.rpc("has_host_role", {
      _host_id: data.hostId,
      _role: "owner",
    });
    if (!admin && isOwner !== true) return { available: false as const };
    const db = await adminDb();
    const { data: h, error } = await db
      .from("hosts")
      .select("suspended_at, suspend_source, suspend_reason, closed_at, close_reason")
      .eq("id", data.hostId)
      .maybeSingle();
    // Before migration 0097 the columns aren't there: nothing to show.
    if (error || !h) return { available: false as const };
    return {
      available: true as const,
      owner: isOwner === true,
      admin,
      state: h as {
        suspended_at: string | null;
        suspend_source: string | null;
        suspend_reason: string | null;
        closed_at: string | null;
        close_reason: string | null;
      },
    };
  });
