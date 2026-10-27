/**
 * Latchkey admin's Commission Partner payout tools: run the month close now
 * (same as the commission_close routine), approve and send a draft payout,
 * record one paid by hand, cancel a draft, and a partner's monthly statement.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSuperAdmin } from "@/lib/roles";

async function admin(context: unknown) {
  await requireSuperAdmin((context as { supabase: unknown }).supabase);
  const d = await import("./partner-data.server");
  const db = await d.adminDb();
  return {
    ...d,
    db,
    actor: (context as { userId: string }).userId,
    config: await d.loadPartnerConfig(db),
  };
}

export const runMonthCloseNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, actor, config } = await admin(context);
    const { closeAndPlan, runReversals } = await import("./partner-close.server");
    const summary = await closeAndPlan(db, config, Date.now(), actor);
    if (config.clawbackMethod === "offset_then_reversal") await runReversals(db);
    return summary;
  });

/**
 * "Apply set-off and release" (10.6, 20.4(b)): records what a partner owes,
 * each with a note, then lets the remaining balance be paid. Empty items:
 * nothing is owed, the hold simply ends.
 */
export const applyPartnerSetOff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        partnerId: z.string().uuid(),
        items: z
          .array(
            z.object({
              amount_pence: z.number().int().positive().max(10_000_000),
              note: z.string().trim().min(3).max(300),
            }),
          )
          .max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db, actor } = await admin(context);
    const { applySetOff } = await import("./partner-close.server");
    await applySetOff(db, data.partnerId, data.items, actor);
    return { ok: true };
  });

export const approveAndSendPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ payoutId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, actor, config } = await admin(context);
    const { approveAndSend } = await import("./partner-close.server");
    return approveAndSend(db, data.payoutId, actor, config);
  });

export const recordManualPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ payoutId: z.string().uuid(), reference: z.string().trim().min(3).max(200) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db, actor, check, logPartnerEvent } = await admin(context);
    const p = check(
      await db
        .from("payouts")
        .select("id, partner_id, status, route, amount_pence")
        .eq("id", data.payoutId)
        .single(),
    ) as { id: string; partner_id: string; status: string; route: string; amount_pence: number };
    if (p.route !== "manual" || p.status !== "manual_pending")
      throw new Error("Only a payout waiting to be paid by hand can be marked done.");
    const { markPaid } = await import("./partner-close.server");
    await markPaid(db, p.id, {
      status: "manual_done",
      manual_reference: data.reference,
      sent_at: new Date().toISOString(),
    });
    await logPartnerEvent(db, {
      partner_id: p.partner_id,
      actor,
      action: "payout_manual_done",
      details: { payout: p.id, amount_pence: p.amount_pence, reference: data.reference },
    });
    return { ok: true };
  });

export const cancelPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ payoutId: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db, actor, check, logPartnerEvent } = await admin(context);
    const res = check(
      await db
        .from("payouts")
        .update({ status: "cancelled", failure: data.reason })
        .eq("id", data.payoutId)
        .in("status", ["draft", "approved", "failed", "manual_pending"])
        .select("id, partner_id"),
    ) as Array<{ id: string; partner_id: string }>;
    if (!res.length) throw new Error("Only a payout that hasn't been sent can be cancelled.");
    await db.from("payout_items").delete().eq("payout_id", data.payoutId);
    await logPartnerEvent(db, {
      partner_id: res[0]!.partner_id,
      actor,
      action: "payout_cancelled",
      details: { payout: data.payoutId, reason: data.reason },
    });
    return { ok: true };
  });

export const partnerStatementCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ partnerId: z.string().uuid(), month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db } = await admin(context);
    const { partnerStatement } = await import("./partner-close.server");
    return { csv: await partnerStatement(db, data.partnerId, data.month) };
  });
