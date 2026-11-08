/* eslint-disable @typescript-eslint/no-explicit-any -- partner_setups (migration 0097) isn't in the generated types yet */
/**
 * Commission Partners and their own host businesses (agreement v1.3):
 *
 * - startOwnBusiness: a partner opens a host business of their own (3.2(b)).
 *   It never earns them anything (6.4(c); ownBusiness in partner-fraud.ts).
 * - startHostSetup / handOverSetup / cancelHostSetup: a partner sets up a new
 *   business for a host and hands it over (6.9). The partner is its owner
 *   until the host accepts the owner invitation with their own sign-in;
 *   completeSetupHandover (called from acceptInvite) then removes the
 *   partner, restarts the free trial, and records the referral (source
 *   "setup", Sign-up Date = the day the host took over).
 *
 * partner_setups is server-only (no RLS policies), so everything here uses
 * the service role after checking who is asking.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";

type Ctx = { userId: string; supabase: unknown; claims?: Record<string, unknown> };

async function partnerOf(userId: string) {
  const { adminDb, check } = await import("./partner-data.server");
  const db = await adminDb();
  const p = check(
    await db.from("partners").select("*").eq("user_id", userId).maybeSingle(),
  ) as Record<string, any> | null;
  return { db, p };
}

async function canReferNow(db: any, p: Record<string, any>) {
  const { activationFor } = await import("./partner-agreement.functions");
  const { canRefer } = await import("./partner-activation");
  return canRefer(await activationFor(db, p), Date.now());
}

/** Makes a host business owned by this user (the service role, so it works beside other memberships). */
async function newBusiness(db: any, userId: string, name: string, contactEmail: string) {
  const { check } = await import("./partner-data.server");
  const host = check(
    await db
      .from("hosts")
      .insert({ business_name: name, contact_email: contactEmail })
      .select("id")
      .single(),
  ) as { id: string };
  check(await db.from("host_members").insert({ host_id: host.id, user_id: userId, role: "owner" }));
  // Open it next time the dashboard loads.
  await db
    .from("user_prefs")
    .upsert({ user_id: userId, last_host_id: host.id, updated_at: new Date().toISOString() });
  return host.id;
}

/** A Commission Partner opens a host business of their own (it never earns them commission). */
export const startOwnBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ businessName: z.string().trim().min(1).max(120) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    assertNotSharedDemo(ctx.claims as never);
    const { db, p } = await partnerOf(ctx.userId);
    if (!p) throw new Error("This is for Commission Partners.");
    const { loadPartnerConfig } = await import("./partner-data.server");
    if (!(await loadPartnerConfig(db)).hostCanBePartner)
      throw new Error("Commission Partners can't open host accounts just now.");
    const email = (ctx.claims?.["email"] as string | undefined) ?? p["email"] ?? "";
    const hostId = await newBusiness(db, ctx.userId, data.businessName, email);
    const { logPartnerEvent } = await import("./partner-data.server");
    await logPartnerEvent(db, {
      partner_id: p["id"],
      actor: ctx.userId,
      action: "own_business_opened",
      details: { host_id: hostId },
    });
    return { hostId };
  });

const setupInput = z.object({
  businessName: z.string().trim().min(1).max(120),
  ownerName: z.string().trim().min(2).max(120),
  ownerEmail: z.string().trim().email().max(254),
});

/** Starts a business for a host (6.9): the partner sets it up, then hands it over. */
export const startHostSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setupInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    assertNotSharedDemo(ctx.claims as never);
    const { db, p } = await partnerOf(ctx.userId);
    if (!p) throw new Error("This is for Commission Partners.");
    if (!(await canReferNow(db, p)))
      throw new Error(
        "Your Commission Partner account needs to be active before you set up a business for a host.",
      );
    const ownerEmail = data.ownerEmail.toLowerCase();
    const mine = [p["email"], ctx.claims?.["email"]]
      .filter(Boolean)
      .map((e) => String(e).toLowerCase());
    if (mine.includes(ownerEmail))
      throw new Error(
        "That's your own email address. Use the host's own address: they take the business over with it.",
      );
    const { check, logPartnerEvent } = await import("./partner-data.server");
    const open = check(
      await db
        .from("partner_setups")
        .select("id", { count: "exact" })
        .eq("partner_id", p["id"])
        .in("status", ["setting_up", "invited"]),
    ) as unknown[];
    if ((open ?? []).length >= 20)
      throw new Error("Hand over or cancel some of the businesses you're setting up first.");
    const hostId = await newBusiness(db, ctx.userId, data.businessName, ownerEmail);
    const row = check(
      await db
        .from("partner_setups")
        .insert({
          partner_id: p["id"],
          host_id: hostId,
          owner_name: data.ownerName,
          owner_email: ownerEmail,
        })
        .select("id")
        .single(),
    ) as { id: string };
    await logPartnerEvent(db, {
      partner_id: p["id"],
      actor: ctx.userId,
      action: "setup_started",
      details: { setup: row.id, host_id: hostId },
    });
    return { hostId, setupId: row.id };
  });

/** The businesses a partner is setting up or has handed over. */
export const listHostSetups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const { db, p } = await partnerOf(ctx.userId);
    if (!p) return { setups: [], ownBusinesses: [] };
    const { data: rows } = await db
      .from("partner_setups")
      .select(
        "id, host_id, owner_name, owner_email, status, created_at, invited_at, handed_over_at",
      )
      .eq("partner_id", p["id"])
      .order("created_at", { ascending: false })
      .limit(50);
    type SetupRow = {
      id: string;
      host_id: string;
      owner_name: string;
      owner_email: string;
      status: "setting_up" | "invited" | "handed_over" | "cancelled";
      created_at: string;
      handed_over_at: string | null;
    };
    const setups = (rows ?? []) as SetupRow[];
    const { data: mine } = await db
      .from("host_members")
      .select("host_id, role, hosts(business_name)")
      .eq("user_id", ctx.userId)
      .eq("role", "owner");
    const setupHosts = new Set(setups.map((s) => s.host_id));
    const ids = setups.map((s) => s.host_id).filter(Boolean);
    const { data: names } = ids.length
      ? await db.from("hosts").select("id, business_name").in("id", ids)
      : { data: [] };
    const nameOf = new Map(
      ((names ?? []) as Array<{ id: string; business_name: string }>).map((h) => [
        h.id,
        h.business_name,
      ]),
    );
    return {
      setups: setups.map((s) => ({
        id: s.id,
        hostId: s.host_id,
        businessName: nameOf.get(s.host_id) ?? "",
        ownerName: s.owner_name,
        ownerEmail: s.owner_email,
        status: s.status,
        createdAt: s.created_at,
        handedOverAt: s.handed_over_at,
      })),
      // Businesses the partner owns that aren't being set up for someone else: their own.
      ownBusinesses: ((mine ?? []) as Array<{ host_id: string; hosts: { business_name: string } }>)
        .filter((m) => !setupHosts.has(m.host_id))
        .map((m) => ({ hostId: m.host_id, businessName: m.hosts?.business_name ?? "" })),
    };
  });

async function ownSetup(userId: string, setupId: string) {
  const { db, p } = await partnerOf(userId);
  if (!p) throw new Error("This is for Commission Partners.");
  const { data: s } = await db
    .from("partner_setups")
    .select("*")
    .eq("id", setupId)
    .eq("partner_id", p["id"])
    .maybeSingle();
  if (!s) throw new Error("That set-up wasn't found.");
  return { db, p, s: s as Record<string, any> };
}

/** Sends the host the owner invitation (6.9(a)). Again sends a fresh link. */
export const handOverSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ setupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    assertNotSharedDemo(ctx.claims as never);
    const { db, p, s } = await ownSetup(ctx.userId, data.setupId);
    if (s["status"] !== "setting_up" && s["status"] !== "invited")
      throw new Error("This business has already been handed over or cancelled.");
    const { requireOwner } = await import("@/lib/roles");
    await requireOwner(ctx.supabase as never, s["host_id"]);
    const { createInvitation } = await import("./team-invite.server");
    const r = await createInvitation(ctx.supabase, {
      hostId: s["host_id"],
      email: s["owner_email"],
      role: "owner",
      propertyIds: null,
      invitedBy: ctx.userId,
      inviterEmail: (ctx.claims?.["email"] as string | undefined) ?? null,
    });
    const now = new Date().toISOString();
    await db
      .from("partner_setups")
      .update({ status: "invited", invited_at: now })
      .eq("id", s["id"]);
    const { logPartnerEvent } = await import("./partner-data.server");
    await logPartnerEvent(db, {
      partner_id: p["id"],
      actor: ctx.userId,
      action: "setup_invited",
      details: { setup: s["id"], emailed: r.emailed },
    });
    return { emailed: r.emailed };
  });

/** Stops a set-up nobody has taken over: the business is closed (it earns nothing). */
export const cancelHostSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ setupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    assertNotSharedDemo(ctx.claims as never);
    const { db, p, s } = await ownSetup(ctx.userId, data.setupId);
    if (s["status"] === "handed_over") throw new Error("The host owns this business now.");
    if (s["status"] === "cancelled") return { ok: true };
    const now = new Date().toISOString();
    await db
      .from("hosts")
      .update({
        closed_at: now,
        closed_by: ctx.userId,
        close_reason: "Set-up cancelled by the Commission Partner",
      })
      .eq("id", s["host_id"]);
    await db
      .from("host_invitations")
      .update({ revoked_at: now })
      .eq("host_id", s["host_id"])
      .is("accepted_at", null)
      .is("revoked_at", null);
    await db
      .from("partner_setups")
      .update({ status: "cancelled", cancelled_at: now })
      .eq("id", s["id"]);
    const { logPartnerEvent } = await import("./partner-data.server");
    await logPartnerEvent(db, {
      partner_id: p["id"],
      actor: ctx.userId,
      action: "setup_cancelled",
      details: { setup: s["id"] },
    });
    return { ok: true };
  });
