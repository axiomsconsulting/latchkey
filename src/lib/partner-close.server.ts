/**
 * The Commission Partner month close and payout sending against Supabase
 * and Stripe. Server only. Rules in partner-close.ts and commission.ts.
 */
import {
  breachVoidedBonuses,
  clawbackNext,
  planPayouts,
  releaseHeld,
  type LedgerLine,
  type PayoutPartner,
} from "./commission";
import {
  bonusRun,
  hashPurgeBefore,
  sendPayout,
  statementCsv,
  type BonusCandidate,
  type PayoutToSend,
} from "./partner-close";
import { FEE_TABLE, type PartnerConfig } from "./partner-config";
import {
  check,
  checkDisputeRate,
  logPartnerEvent,
  type AnyDb,
  type ReferralRow,
} from "./partner-data.server";

export type CloseSummary = {
  bonusesEarned: number;
  bonusesNotEligible: number;
  released: number;
  drafted: number;
  carried: Array<{ partner_id: string; amount_pence: number; reason: string }>;
  repaymentRequests: number;
  hashesCleared: number;
};

/**
 * Pass 1 (cron or "Run month close now"): Launch Bonus checks, held lines
 * released after their Hold Period, fraud re-checks, old IP hashes cleared,
 * clawbacks moved on, and payouts drafted. Nothing is sent.
 */
export async function closeAndPlan(
  db: AnyDb,
  config: PartnerConfig,
  asOf = Date.now(),
  actor: string | null = null,
): Promise<CloseSummary> {
  const now = new Date(asOf).toISOString();
  const summary: CloseSummary = {
    bonusesEarned: 0,
    bonusesNotEligible: 0,
    released: 0,
    drafted: 0,
    carried: [],
    repaymentRequests: 0,
    hashesCleared: 0,
  };

  // 1. Launch Bonus: referrals whose first Paid Month has ended.
  const due = (check(
    await db
      .from("referrals")
      .select("*")
      .in("bonus_status", ["pending", "withheld"])
      .not("qualifying_payment_at", "is", null)
      .lte("first_paid_month_end", now),
  ) ?? []) as ReferralRow[];
  if (due.length) {
    const partnerIds = [...new Set(due.map((r) => r.partner_id))];
    const { data: partners } = await db
      .from("partners")
      .select("id, terminated_at, termination_for_breach")
      .in("id", partnerIds);
    const { data: claims } = await db
      .from("launch_bonus_claims")
      .select("identity_hashes, referral_id, status");
    const { data: earnedLines } = await db
      .from("commission_ledger")
      .select("partner_id")
      .eq("kind", "launch_bonus")
      .neq("state", "void")
      .in("partner_id", partnerIds);
    const earnedBy: Record<string, number> = {};
    for (const l of (earnedLines ?? []) as Array<{ partner_id: string }>)
      earnedBy[l.partner_id] = (earnedBy[l.partner_id] ?? 0) + 1;
    const cands: BonusCandidate[] = [];
    for (const r of due) {
      const keys = r.host_id
        ? ((await db.from("host_identity_keys").select("kind, value_hash").eq("host_id", r.host_id))
            .data ?? [])
        : [];
      const { data: charge } = r.qualifying_charge_id
        ? await db
            .from("partner_charges")
            .select("amount_pence")
            .eq("charge_id", r.qualifying_charge_id)
            .maybeSingle()
        : { data: null };
      const { count: open } = await db
        .from("fraud_flags")
        .select("id", { count: "exact", head: true })
        .eq("referral_id", r.id)
        .eq("status", "open");
      const p = (
        (partners ?? []) as Array<{
          id: string;
          terminated_at: string | null;
          termination_for_breach: boolean;
        }>
      ).find((x) => x.id === r.partner_id);
      cands.push({
        referral: r,
        keys,
        qpPaidPence: charge?.amount_pence ?? 0,
        partner: {
          terminated_at: p?.terminated_at ?? null,
          termination_for_breach: !!p?.termination_for_breach,
        },
        flagOpen: (open ?? 0) > 0,
      });
    }
    const otherClaims = (
      (claims ?? []) as Array<{ identity_hashes: string[]; referral_id: string }>
    ).filter((c) => !due.some((r) => r.id === c.referral_id));
    for (const res of bonusRun(cands, otherClaims, earnedBy, config, asOf)) {
      const r = due.find((x) => x.id === res.referral_id)!;
      const d = res.decision;
      if (d.status === "earned") {
        // The claim first: its unique referral_id makes a second run a no-op.
        const { error: claimErr } = await db.from("launch_bonus_claims").insert({
          referral_id: r.id,
          host_id: r.host_id,
          identity_hashes: res.identity_hashes,
          status: "earned",
        });
        if (claimErr && claimErr.code !== "23505") throw new Error(claimErr.message);
        const payableAfter = new Date(
          Date.parse(r.first_paid_month_end!) + config.holdDays * 86_400_000,
        ).toISOString();
        const { data: line, error } = await db
          .from("commission_ledger")
          .insert({
            partner_id: r.partner_id,
            referral_id: r.id,
            host_id: r.host_id,
            kind: "launch_bonus",
            state: "held",
            amount_pence: d.amount_pence,
            base_pence: 0,
            payable_after: payableAfter,
            stripe_charge_id: r.qualifying_charge_id,
            note: "Launch Bonus",
            created_by: actor,
          })
          .select("id")
          .single();
        if (error && error.code !== "23505") throw new Error(error.message);
        if (line?.id)
          await db
            .from("launch_bonus_claims")
            .update({ ledger_id: line.id })
            .eq("referral_id", r.id);
        await db
          .from("referrals")
          .update({ bonus_status: "earned", bonus_ineligible_reason: null, updated_at: now })
          .eq("id", r.id);
        summary.bonusesEarned++;
      } else if (d.status !== r.bonus_status || d.reason !== r.bonus_ineligible_reason) {
        await db
          .from("referrals")
          .update({ bonus_status: d.status, bonus_ineligible_reason: d.reason, updated_at: now })
          .eq("id", r.id);
        if (d.status === "not_eligible") summary.bonusesNotEligible++;
      }
    }
  }

  // 2. Release held lines whose Hold Period has passed (not disputed, not flagged).
  const held = (check(
    await db.from("commission_ledger").select("*").eq("state", "held").lte("payable_after", now),
  ) ?? []) as LedgerLine[];
  if (held.length) {
    const { data: disputes } = await db
      .from("partner_charges")
      .select("charge_id")
      .eq("dispute_status", "open");
    const { data: flags } = await db
      .from("fraud_flags")
      .select("referral_id")
      .eq("status", "open")
      .not("referral_id", "is", null);
    const voided = await voidBreachBonuses(db, asOf, actor);
    const ids = releaseHeld(
      held,
      asOf,
      new Set(((disputes ?? []) as Array<{ charge_id: string }>).map((d) => d.charge_id)),
      new Set(((flags ?? []) as Array<{ referral_id: string }>).map((f) => f.referral_id)),
      new Set(voided),
    );
    if (ids.length)
      check(await db.from("commission_ledger").update({ state: "payable" }).in("id", ids));
    summary.released = ids.length;
  }

  // 3. Fraud re-checks for partners with recent activity.
  const { data: active } = await db
    .from("partners")
    .select("id")
    .in("status", ["active", "suspended", "terminated"]);
  for (const p of (active ?? []) as Array<{ id: string }>)
    await checkDisputeRate(db, p.id, config, asOf);

  // 4. Old IP and device hashes (D21). Also run daily by the privacy clean-up.
  summary.hashesCleared = await purgePartnerHashes(db, config, asOf);

  // 5. Clawbacks: ask for repayment after 3 months with nothing due (6.7(c)); write-offs only below the threshold.
  const { data: open } = await db.from("clawbacks").select("*").eq("status", "open");
  for (const c of (open ?? []) as Array<{
    id: string;
    partner_id: string;
    amount_pence: number;
    recovered_pence: number;
    created_at: string;
    status: string;
  }>) {
    const { count } = await db
      .from("commission_ledger")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", c.partner_id)
      .in("state", ["held", "on_hold", "payable"])
      .gt("amount_pence", 0);
    const next = clawbackNext(c, (count ?? 0) === 0, asOf, config);
    if (next === "repayment_requested") {
      await db
        .from("clawbacks")
        .update({ status: "repayment_requested", repayment_requested_at: now })
        .eq("id", c.id);
      await logPartnerEvent(db, {
        partner_id: c.partner_id,
        actor,
        action: "repayment_due",
        details: { clawback: c.id, amount_pence: c.amount_pence - c.recovered_pence },
      });
      summary.repaymentRequests++;
    } else if (next === "written_off" || next === "closed") {
      await db.from("clawbacks").update({ status: next }).eq("id", c.id);
    }
  }

  // 6. Draft payouts for everything payable that isn't already in one.
  const payable = (check(await db.from("commission_ledger").select("*").eq("state", "payable")) ??
    []) as LedgerLine[];
  const { data: items } = await db
    .from("payout_items")
    .select("ledger_id, payouts!inner(status)")
    .not("payouts.status", "in", "(cancelled,failed)");
  const taken = new Set(((items ?? []) as Array<{ ledger_id: string }>).map((i) => i.ledger_id));
  const free = payable.filter((l) => !taken.has(l.id));
  const ids = [...new Set(free.map((l) => l.partner_id))];
  if (ids.length) {
    const { data: ps } = await db
      .from("partners")
      .select("id, status, country, payout_route, payouts_enabled, terminated_at, termination_for_breach, set_off_done_at")
      .in("id", ids);
    const { data: pflags } = await db
      .from("fraud_flags")
      .select("partner_id")
      .eq("status", "open")
      .is("referral_id", null);
    const flagged = new Set(
      ((pflags ?? []) as Array<{ partner_id: string }>).map((f) => f.partner_id),
    );
    const partners: PayoutPartner[] = ((ps ?? []) as Array<Omit<PayoutPartner, "flagged">>).map(
      (p) => ({ ...p, flagged: flagged.has(p.id) }),
    );
    const { payouts, carried } = planPayouts(partners, free, config, FEE_TABLE, asOf);
    const { partnerStripeMode } = await import("./partner-stripe.server");
    let mode: "test" | "live" = "test";
    try {
      mode = partnerStripeMode();
    } catch {
      mode = "test";
    }
    for (const p of payouts) {
      const id = crypto.randomUUID();
      check(
        await db.from("payouts").insert({
          id,
          partner_id: p.partner_id,
          route: p.route,
          amount_pence: p.amount_pence,
          currency: "gbp",
          est_fee_pence: p.est_fee_pence,
          status: "draft",
          idempotency_key: `payout_${id}`,
          due_by: p.due_by,
          mode,
        }),
      );
      check(
        await db
          .from("payout_items")
          .insert(p.ledger_ids.map((ledger_id) => ({ payout_id: id, ledger_id }))),
      );
      summary.drafted++;
    }
    summary.carried = carried;
  }
  await logPartnerEvent(db, {
    actor,
    action: "month_close",
    details: summary as unknown as Record<string, unknown>,
  });
  return summary;
}

/** Pass 2: Latchkey admin approves a draft and it's sent (or queued for paying by hand). */
export async function approveAndSend(
  db: AnyDb,
  payoutId: string,
  actor: string,
  config: PartnerConfig,
) {
  const p = check(
    await db.from("payouts").select("*").eq("id", payoutId).single(),
  ) as PayoutToSend & { mode: string };
  const partner = check(
    await db
      .from("partners")
      .select("id, status, stripe_account_id, payouts_enabled, termination_for_breach, terminated_at, set_off_done_at")
      .eq("id", p.partner_id)
      .single(),
  ) as {
    id: string;
    status: string;
    stripe_account_id: string | null;
    payouts_enabled: boolean;
    termination_for_breach: boolean;
  };
  const { count } = await db
    .from("fraud_flags")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", p.partner_id)
    .is("referral_id", null)
    .eq("status", "open");
  const { partnerStripeKey, partnerStripeMode, v1 } = await import("./partner-stripe.server");
  // Lines refunded, disputed or voided since the draft: never send the old total; draft it again instead.
  const { data: items } = await db
    .from("payout_items")
    .select("ledger_id, commission_ledger(state, amount_pence)")
    .eq("payout_id", p.id);
  const rows = (
    (items ?? []) as Array<{ commission_ledger: { state: string; amount_pence: number } | null }>
  ).map((i) => i.commission_ledger);
  const stillDue =
    rows.every((l) => l?.state === "payable") &&
    rows.reduce((n, l) => n + (l?.amount_pence ?? 0), 0) === p.amount_pence;
  if (p.status !== "failed" && !stillDue) {
    await db
      .from("payouts")
      .update({
        status: "cancelled",
        failure:
          "Changed since it was drafted (a refund, dispute or review): run the month close again.",
      })
      .eq("id", p.id)
      .in("status", ["draft", "approved"]);
    await db.from("payout_items").delete().eq("payout_id", p.id);
    throw new Error(
      "This payout changed since it was drafted, so it's been cancelled. Run the month close again for an up-to-date one.",
    );
  }
  // Claim it: only one click can move a payout from draft/approved/failed to sending.
  const now = new Date().toISOString();
  const claim = await db
    .from("payouts")
    .update({ status: "sending", approved_by: actor, approved_at: now })
    .eq("id", p.id)
    .in("status", ["draft", "approved", "failed"])
    .select("id");
  if (!(claim.data ?? []).length)
    throw new Error("This payout is already being sent or has been sent.");
  const res = await sendPayout(
    { ...p, status: "approved" },
    { ...partner, flagged: (count ?? 0) > 0 },
    {
      assertKey: () => {
        partnerStripeKey();
        if (partnerStripeMode() !== p.mode)
          throw new Error(
            `This payout was drafted in ${p.mode} mode; Stripe is now in ${partnerStripeMode()} mode.`,
          );
      },
      availableGbpPence: async () => {
        const b = await v1<{ available: Array<{ currency: string; amount: number }> }>("/balance");
        return b.available.filter((a) => a.currency === "gbp").reduce((n, a) => n + a.amount, 0);
      },
      transfer: (body, key) => v1<{ id: string }>("/transfers", body, { idempotencyKey: key }),
      ...(config.globalPayoutsEnabled
        ? {
            globalPayout: async (po: PayoutToSend) =>
              (await import("./global-payouts.server")).sendGlobalPayout(db, po, config),
          }
        : {}),
    },
  );
  if (res.status === "sent") {
    await markPaid(db, p.id, {
      status: "sent",
      stripe_transfer_id: p.route === "express" ? res.transferId : null,
      gp_outbound_payment_id: p.route === "global_payouts" ? res.transferId : null,
      sent_at: now,
      failure: null,
    });
  } else if (res.status === "manual_pending") {
    check(await db.from("payouts").update({ status: "manual_pending" }).eq("id", p.id));
  } else {
    const fresh =
      res.status === "failed" && res.rejected
        ? { idempotency_key: `payout_${p.id}_${Date.now()}` }
        : {};
    check(
      await db
        .from("payouts")
        .update({
          status: res.status === "failed" ? "failed" : "draft",
          failure: res.status === "failed" ? res.failure : res.reason,
          ...fresh,
        })
        .eq("id", p.id),
    );
  }
  await logPartnerEvent(db, {
    partner_id: p.partner_id,
    actor,
    action: `payout_${res.status}`,
    details: {
      payout: p.id,
      amount_pence: p.amount_pence,
      route: p.route,
      ...(res.status === "refused" ? { reason: res.reason } : {}),
      ...(res.status === "failed" ? { failure: res.failure } : {}),
    },
  });
  return res;
}

/** A payout reached the partner (or was paid by hand): its lines are paid, bonuses marked paid, offsets recorded. */
export async function markPaid(db: AnyDb, payoutId: string, patch: Record<string, unknown>) {
  check(await db.from("payouts").update(patch).eq("id", payoutId));
  const { data: items } = await db
    .from("payout_items")
    .select("ledger_id")
    .eq("payout_id", payoutId);
  const ids = ((items ?? []) as Array<{ ledger_id: string }>).map((i) => i.ledger_id);
  if (!ids.length) return;
  check(
    await db.from("commission_ledger").update({ state: "paid", payout_id: payoutId }).in("id", ids),
  );
  const { data: lines } = await db
    .from("commission_ledger")
    .select("id, kind, referral_id, amount_pence, reverses_ledger_id")
    .in("id", ids);
  for (const l of (lines ?? []) as Array<{
    kind: string;
    referral_id: string | null;
    amount_pence: number;
    reverses_ledger_id: string | null;
  }>) {
    if (l.kind === "launch_bonus" && l.referral_id) {
      await db.from("referrals").update({ bonus_status: "paid" }).eq("id", l.referral_id);
      await db
        .from("launch_bonus_claims")
        .update({ status: "paid" })
        .eq("referral_id", l.referral_id);
    }
    // A clawback set against this payout: recovered.
    if (l.kind === "clawback" && l.reverses_ledger_id) {
      await db
        .from("clawbacks")
        .update({ status: "offset", recovered_pence: -l.amount_pence })
        .eq("ledger_id", l.reverses_ledger_id)
        .in("status", ["open", "repayment_requested"]);
    }
  }
}

/** Transfer reversals for clawbacks set to "reversal" (only with CLAWBACK_METHOD offset_then_reversal), else they stay offsets. */
export async function runReversals(db: AnyDb) {
  const { data } = await db
    .from("clawbacks")
    .select("id, partner_id, ledger_id, amount_pence")
    .eq("method", "reversal")
    .eq("status", "open");
  const { v1 } = await import("./partner-stripe.server");
  for (const c of (data ?? []) as Array<{
    id: string;
    partner_id: string;
    ledger_id: string;
    amount_pence: number;
  }>) {
    const { data: line } = await db
      .from("commission_ledger")
      .select("payout_id")
      .eq("id", c.ledger_id)
      .single();
    const { data: payout } = line?.payout_id
      ? await db.from("payouts").select("stripe_transfer_id").eq("id", line.payout_id).single()
      : { data: null };
    const { data: partner } = await db
      .from("partners")
      .select("stripe_account_id")
      .eq("id", c.partner_id)
      .single();
    const offset = async (why: string) => {
      await db.from("clawbacks").update({ method: "offset" }).eq("id", c.id);
      await logPartnerEvent(db, {
        partner_id: c.partner_id,
        action: "reversal_skipped",
        details: { clawback: c.id, why },
      });
    };
    if (!payout?.stripe_transfer_id || !partner?.stripe_account_id) {
      await offset("no transfer to reverse");
      continue;
    }
    const bal = await v1<{ available: Array<{ currency: string; amount: number }> }>(
      "/balance",
      undefined,
      { account: partner.stripe_account_id },
    ).catch(() => null);
    const available = (bal?.available ?? [])
      .filter((a) => a.currency === "gbp")
      .reduce((n, a) => n + a.amount, 0);
    if (available < c.amount_pence) {
      await offset("not enough left in the partner's Stripe balance");
      continue;
    }
    const rev = await v1<{ id: string }>(
      `/transfers/${encodeURIComponent(payout.stripe_transfer_id)}/reversals`,
      { amount: c.amount_pence },
      { idempotencyKey: `reversal_${c.id}` },
    );
    await db
      .from("clawbacks")
      .update({ status: "reversed", stripe_reversal_id: rev.id, recovered_pence: c.amount_pence })
      .eq("id", c.id);
    // The matching negative line would otherwise also come off the next payout.
    await db
      .from("commission_ledger")
      .update({ state: "void" })
      .eq("reverses_ledger_id", c.ledger_id)
      .eq("kind", "clawback")
      .eq("state", "payable");
  }
}

/** A month's statement for one partner (12.1, 12.7), as CSV. */
export async function partnerStatement(
  db: AnyDb,
  partnerId: string,
  month: string,
): Promise<string> {
  const start = `${month}-01T00:00:00Z`;
  const d = new Date(start);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
  const partner = check(
    await db
      .from("partners")
      .select("id, legal_name, business_name, referral_code, postal_address, vat_number, self_billing_opt_out")
      .eq("id", partnerId)
      .single(),
  ) as {
    id: string;
    legal_name: string;
    business_name: string | null;
    referral_code: string | null;
    postal_address: string | null;
    vat_number: string | null;
    self_billing_opt_out: boolean | null;
  };
  const { data: refs } = await db
    .from("referrals")
    .select("id, host_label, status, status_detail, paid_months_used")
    .eq("partner_id", partnerId);
  const { data: lines } = await db
    .from("commission_ledger")
    .select("referral_id, kind, amount_pence, base_pence, state, created_at")
    .eq("partner_id", partnerId)
    .gte("created_at", start)
    .lt("created_at", end);
  const { data: heldNow } = await db
    .from("commission_ledger")
    .select("referral_id, amount_pence, state, note, stripe_charge_id")
    .eq("partner_id", partnerId)
    .in("state", ["held", "on_hold"]);
  const { data: payableNow } = await db
    .from("commission_ledger")
    .select("amount_pence")
    .eq("partner_id", partnerId)
    .eq("state", "payable");
  const { data: paid } = await db
    .from("payouts")
    .select("amount_pence")
    .eq("partner_id", partnerId)
    .in("status", ["sent", "manual_done"])
    .gte("sent_at", start)
    .lt("sent_at", end);
  const L = (lines ?? []) as Array<{
    referral_id: string | null;
    kind: string;
    amount_pence: number;
    base_pence: number;
    state: string;
  }>;
  const H = (heldNow ?? []) as Array<{
    referral_id: string | null;
    amount_pence: number;
    state: string;
    note: string | null;
  }>;
  const { HOLD_WORDS, statementNumber } = await import("./partner-close");
  const reasonFor = (refId: string) => {
    const mine = H.filter((h) => h.referral_id === refId && h.amount_pence > 0);
    if (!mine.length) return null;
    const onHold = mine.find((h) => h.state === "on_hold");
    if (!onHold) return HOLD_WORDS["hold_period"]!;
    if (onHold.note === "under_review") return HOLD_WORDS["under_review"]!;
    if (onHold.note === "fraud_check") return HOLD_WORDS["fraud_check"]!;
    return HOLD_WORDS["dispute"]!;
  };
  const { data: settings } = await db.from("site_settings").select("legal").eq("id", 1).maybeSingle();
  const legal = (settings?.legal ?? {}) as Record<string, string | undefined>;
  return statementCsv(
    (
      (refs ?? []) as Array<{
        id: string;
        host_label: string | null;
        status: string;
        status_detail: string;
        paid_months_used: number;
      }>
    ).map((r) => {
      const mine = L.filter((l) => l.referral_id === r.id && l.state !== "void");
      return {
        host: r.host_label ?? "Host",
        status: r.status === "approved" ? r.status_detail : r.status,
        paidMonths: r.paid_months_used,
        netReceiptsPence: mine
          .filter((l) => l.kind === "commission")
          .reduce((n, l) => n + l.base_pence, 0),
        commissionPence: mine
          .filter((l) => l.kind === "commission")
          .reduce((n, l) => n + l.amount_pence, 0),
        bonusPence: mine
          .filter((l) => l.kind === "launch_bonus")
          .reduce((n, l) => n + l.amount_pence, 0),
        heldPence: H.filter((h) => h.referral_id === r.id).reduce((n, h) => n + h.amount_pence, 0),
        heldReason: reasonFor(r.id),
        clawbackPence: -mine
          .filter((l) => l.kind === "clawback")
          .reduce((n, l) => n + l.amount_pence, 0),
      };
    }),
    {
      number: statementNumber(partner.referral_code, partner.id, month),
      issuedOn: new Date().toISOString().slice(0, 10),
      oms: {
        name: legal["companyName"] || "Omnispace Estates Ltd",
        companyNumber: legal["companyNumber"] || "",
        address: legal["registeredAddress"] || "",
        vatNumber: legal["vatNumber"] || "",
      },
      partner: {
        name: partner.business_name || partner.legal_name,
        address: partner.postal_address,
        vatNumber: partner.vat_number,
      },
      selfBilled: !partner.self_billing_opt_out,
      setOffPence: -L.filter((l) => l.kind === "set_off" && l.state !== "void").reduce((n, l) => n + l.amount_pence, 0),
      payablePence: ((payableNow ?? []) as Array<{ amount_pence: number }>).reduce((n, l) => n + l.amount_pence, 0),
      paidPence: ((paid ?? []) as Array<{ amount_pence: number }>).reduce((n, l) => n + l.amount_pence, 0),
    },
  );
}

/**
 * Clears IP and device hashes older than the retention period (agreement
 * 17.1: 180 days). Run by the daily privacy clean-up whether or not the
 * month close is switched on, and again by the month close; safe to repeat.
 */
export async function purgePartnerHashes(
  db: AnyDb,
  config: Pick<PartnerConfig, "ipHashRetentionDays">,
  asOf: number,
): Promise<number> {
  const cutoff = hashPurgeBefore(asOf, config.ipHashRetentionDays);
  const cleared = await db
    .from("referral_clicks")
    .update({ ip_hash: null, device_hash: null })
    .lt("clicked_at", cutoff)
    .not("ip_hash", "is", null)
    .select("id");
  await db
    .from("host_identity_keys")
    .delete()
    .in("kind", ["ip_hash", "device_hash"])
    .lt("seen_at", cutoff);
  await db
    .from("partner_identity_keys")
    .delete()
    .in("kind", ["ip_hash", "device_hash"])
    .lt("seen_at", cutoff);
  await db.from("partner_events").update({ ip_hash: null }).lt("created_at", cutoff).not("ip_hash", "is", null);
  await db.from("partner_id_access_log").update({ ip_hash: null }).lt("viewed_at", cutoff).not("ip_hash", "is", null);
  return (cleared.data ?? []).length;
}

/**
 * Partner ID photos go 30 days after OMS approves or rejects the check
 * (agreement 17.1); the details read and the result stay. Checks whose
 * keep-until date has passed (the agreement plus 6 years) go entirely.
 */
export async function purgePartnerIdImages(db: AnyDb, asOf: number): Promise<number> {
  const now = new Date(asOf).toISOString();
  const { data } = await db
    .from("partner_id_checks")
    .select("id, id_image_path, selfie_image_path")
    .lte("images_delete_after", now)
    .is("images_deleted_at", null)
    .limit(300);
  const rows = (data ?? []) as Array<{ id: string; id_image_path: string | null; selfie_image_path: string | null }>;
  if (rows.length) {
    const { removePrivate } = await import("./private-store.server");
    await removePrivate(rows.flatMap((r) => [r.id_image_path, r.selfie_image_path]));
    await db
      .from("partner_id_checks")
      .update({ id_image_path: null, selfie_image_path: null, images_deleted_at: now })
      .in("id", rows.map((r) => r.id));
  }
  const { data: old } = await db.from("partner_id_checks").select("id, id_image_path, selfie_image_path").lte("retain_until", now).limit(300);
  const gone = (old ?? []) as Array<{ id: string; id_image_path: string | null; selfie_image_path: string | null }>;
  if (gone.length) {
    const { removePrivate } = await import("./private-store.server");
    await removePrivate(gone.flatMap((r) => [r.id_image_path, r.selfie_image_path]));
    await db.from("partner_id_checks").delete().in("id", gone.map((r) => r.id));
  }
  return rows.length;
}

/**
 * 8.2(f), 20.4(a): Launch Bonus lines not yet paid whose first Paid Month
 * ended on or after a breach Stop Date are cancelled (state void, bonus
 * reversed with reason breach_stop). Returns the cancelled line ids.
 */
export async function voidBreachBonuses(db: AnyDb, asOf: number, actor: string | null): Promise<string[]> {
  const { data: ps } = await db
    .from("partners")
    .select("id, terminated_at, termination_for_breach")
    .eq("termination_for_breach", true)
    .not("terminated_at", "is", null);
  const partners = new Map(
    ((ps ?? []) as Array<{ id: string; terminated_at: string | null; termination_for_breach: boolean }>).map((p) => [p.id, p]),
  );
  if (!partners.size) return [];
  const { data: lines } = await db
    .from("commission_ledger")
    .select("id, kind, state, partner_id, referral_id")
    .eq("kind", "launch_bonus")
    .in("state", ["held", "on_hold", "payable"])
    .in("partner_id", [...partners.keys()]);
  const list = (lines ?? []) as Array<Pick<LedgerLine, "id" | "kind" | "state" | "partner_id" | "referral_id">>;
  if (!list.length) return [];
  const refIds = [...new Set(list.map((l) => l.referral_id).filter((x): x is string => !!x))];
  const { data: refs } = await db.from("referrals").select("id, first_paid_month_end").in("id", refIds);
  const fpme = new Map(
    ((refs ?? []) as Array<{ id: string; first_paid_month_end: string | null }>).map((r) => [r.id, r.first_paid_month_end]),
  );
  const ids = breachVoidedBonuses(list, partners, fpme, asOf);
  if (!ids.length) return [];
  // Only lines not already in a payout being sent.
  check(await db.from("commission_ledger").update({ state: "void" }).in("id", ids));
  const voidedRefs = list.filter((l) => ids.includes(l.id)).map((l) => l.referral_id).filter((x): x is string => !!x);
  await db
    .from("referrals")
    .update({ bonus_status: "reversed", bonus_ineligible_reason: "breach_stop", updated_at: new Date(asOf).toISOString() })
    .in("id", voidedRefs);
  await db.from("launch_bonus_claims").update({ status: "reversed" }).in("referral_id", voidedRefs);
  for (const l of list.filter((x) => ids.includes(x.id)))
    await logPartnerEvent(db, {
      partner_id: l.partner_id,
      referral_id: l.referral_id ?? null,
      actor,
      action: "bonus_reversed_breach_stop",
      details: { ledger: l.id },
    });
  return ids;
}

/**
 * 10.6, 20.4(b): OMS records what the partner owes (overpayments, losses
 * or costs under 22.4, each with a note) as negative set-off lines, and
 * marks the set-off done so the remaining balance can be paid (still from
 * £10 and approved by hand). Clawbacks already offset themselves.
 */
export async function applySetOff(
  db: AnyDb,
  partnerId: string,
  items: Array<{ amount_pence: number; note: string }>,
  actor: string,
) {
  for (const i of items) {
    if (!(Number.isInteger(i.amount_pence) && i.amount_pence > 0)) throw new Error("Each set-off must be a positive amount in pence.");
    if (i.note.trim().length < 3) throw new Error("Each set-off needs a note.");
  }
  if (items.length)
    check(
      await db.from("commission_ledger").insert(
        items.map((i) => ({
          partner_id: partnerId,
          kind: "set_off",
          amount_pence: -i.amount_pence,
          base_pence: 0,
          state: "payable",
          note: i.note.trim().slice(0, 300),
          created_by: actor,
        })),
      ),
    );
  check(await db.from("partners").update({ set_off_done_at: new Date().toISOString() }).eq("id", partnerId));
  await logPartnerEvent(db, {
    partner_id: partnerId,
    actor,
    action: "set_off_applied",
    details: { items },
  });
}