/* eslint-disable @typescript-eslint/no-explicit-any -- the 0061 tables aren't in the generated types yet, and Stripe payloads are read field by field */
/**
 * Commission Partner webhook logic: what each Stripe event does to referrals,
 * the ledger and payouts. Storage and Stripe are passed in (PartnerStore),
 * so this runs the same against Supabase (partner-webhook.server.ts) and in
 * tests. Idempotent by event id, and every ledger insert is also guarded by
 * the database's unique rules, so a replayed event never counts twice.
 *
 * Only platform events about a business with a Commission Partner are
 * handled; everything else returns "not ours" so the existing webhook
 * branches (host Connect accounts, subscriptions, guest payments) run
 * exactly as before.
 */
import {
  applyClawback,
  billingInterval,
  commissionFor,
  invoicePeriod,
  isSettled,
  ms,
  netReceipts,
  postStopAllowed,
  postStopGap,
  qualifyingPayment,
  type ClawbackPlan,
  type HostBilling,
  type LedgerLine,
  type PartnerState,
  type ReferralState,
  type StripeCharge,
  type StripeInvoice,
  type TermsSnapshot,
} from "./commission";
import type { PartnerConfig } from "./partner-config";

// Stripe's event payloads, read defensively field by field.
type StripeObj = any;

export type Referral = ReferralState & {
  id: string;
  host_id: string | null;
  partner_id: string;
  terms_snapshot: TermsSnapshot;
  status_detail?: string;
  billing_interval?: "month" | "year" | null;
  locked_at?: string | null;
};

export type Partner = PartnerState & { id: string; stripe_account_id: string | null };

export type ChargeRecord = {
  charge_id: string;
  referral_id: string;
  invoice_id: string | null;
  amount_pence: number;
  refunded_pence: number;
  dispute_status: "open" | "won" | "lost" | null;
};

export type NewLedgerLine = Omit<LedgerLine, "id" | "created_at"> & {
  host_id?: string | null;
  source_event_id?: string | null;
  base_pence?: number;
  rate_bps?: number | null;
  paid_month_from?: number | null;
  paid_month_to?: number | null;
  period_start?: string | null;
  period_end?: string | null;
  note?: string | null;
};

export interface PartnerStore {
  /** "new" when this call owns the event; "done" with its result; "busy" while another delivery is working on it. */
  claimEvent(
    id: string,
    type: string,
    livemode: boolean,
  ): Promise<{ state: "new" } | { state: "done"; result: string | null } | { state: "busy" }>;
  finishEvent(id: string, result: string | null, error?: string | null): Promise<void>;
  config(): Promise<PartnerConfig>;
  /** "test" or "live": the key partner calls use. Throws when Stripe isn't set up for partners. */
  mode(): "test" | "live";
  hostIdForInvoice(inv: StripeObj): Promise<string | null>;
  referralForHost(hostId: string): Promise<Referral | null>;
  referral(id: string): Promise<Referral | null>;
  partner(id: string): Promise<Partner | null>;
  partnerByAccount(account: string): Promise<Partner | null>;
  hostBilling(hostId: string): Promise<HostBilling>;
  hasOpenFlag(referralId: string): Promise<boolean>;
  fetchCharge(id: string): Promise<(StripeCharge & StripeObj) | null>;
  fetchInvoice(id: string): Promise<(StripeInvoice & StripeObj) | null>;
  chargeRecord(chargeId: string): Promise<ChargeRecord | null>;
  saveCharge(c: ChargeRecord): Promise<void>;
  updateCharge(chargeId: string, patch: Partial<ChargeRecord>): Promise<void>;
  updateReferral(id: string, patch: Record<string, unknown>): Promise<void>;
  /** Inserts lines; one already there (same invoice, same bonus) is skipped. */
  insertLines(lines: NewLedgerLine[]): Promise<number>;
  linesForCharge(chargeId: string): Promise<LedgerLine[]>;
  linesForReferral(referralId: string): Promise<LedgerLine[]>;
  setLineState(ids: string[], state: LedgerLine["state"]): Promise<void>;
  /** Clawback rows; the same line and event twice is skipped (a retry). */
  insertClawbacks(
    partnerId: string,
    rows: ClawbackPlan["clawbacks"],
    eventId: string,
  ): Promise<void>;
  setBonusClaim(referralId: string, status: "reversed" | "withheld" | "earned"): Promise<void>;
  addHostCard(hostId: string, fingerprint: string): Promise<void>;
  recheck(referralId: string): Promise<void>;
  checkDisputeRate(partnerId: string): Promise<void>;
  flag(
    referralId: string | null,
    partnerId: string,
    kind: string,
    details: Record<string, unknown>,
  ): Promise<void>;
  updatePartner(id: string, patch: Record<string, unknown>): Promise<void>;
  payoutTransferReversed(
    transferId: string,
    amountReversed: number,
    fully: boolean,
  ): Promise<boolean>;
  log(e: {
    partner_id?: string | null;
    referral_id?: string | null;
    action: string;
    details?: Record<string, unknown>;
  }): Promise<void>;
}

export type Outcome = "handled" | "not_ours";

const HANDLED = new Set([
  "invoice.paid",
  "invoice.payment_failed",
  "charge.succeeded",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
  "account.updated",
  "transfer.reversed",
  "payout.failed",
]);

export function isPartnerEventType(type: unknown): boolean {
  return typeof type === "string" && HANDLED.has(type);
}

const isoOf = (t: number | null) => (t === null ? null : new Date(t).toISOString());
const chargeIdOf = (x: unknown): string | null =>
  typeof x === "string"
    ? x
    : x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string"
      ? (x as { id: string }).id
      : null;

/* ------------------------------------------------------------ invoices */

async function onInvoicePaid(
  event: StripeObj,
  s: PartnerStore,
  config: PartnerConfig,
): Promise<Outcome> {
  const inv = event.data.object as StripeInvoice & StripeObj;
  const hostId = await s.hostIdForInvoice(inv);
  if (!hostId) return "not_ours";
  let r = await s.referralForHost(hostId);
  if (!r) return "not_ours";
  const partner = await s.partner(r.partner_id);
  if (!partner) return "not_ours";

  const chargeId = chargeIdOf(inv.charge) ?? chargeIdOf(inv.payment_intent?.latest_charge);
  const charge = chargeId ? await s.fetchCharge(chargeId) : null;
  const fp = charge?.payment_method_details?.card?.fingerprint;
  if (typeof fp === "string" && fp) {
    await s.addHostCard(hostId, fp);
    await s.recheck(r.id);
    r = (await s.referral(r.id)) ?? r;
  }
  const host = await s.hostBilling(hostId);
  const settled = isSettled(charge);
  const patch: Record<string, unknown> = {};

  // The Qualifying Payment: the first settled payment after the trial (clause 3).
  const qp = qualifyingPayment(r, inv, host, charge, config);
  if (qp) {
    Object.assign(patch, {
      qualifying_invoice_id: qp.invoice_id,
      qualifying_charge_id: qp.charge_id,
      qualifying_payment_at: qp.paid_at,
      billing_interval: qp.interval,
      first_paid_month_end: qp.first_paid_month_end,
      locked_at: r.locked_at ?? qp.paid_at,
    });
    r = {
      ...r,
      qualifying_invoice_id: qp.invoice_id,
      qualifying_charge_id: qp.charge_id,
      qualifying_payment_at: qp.paid_at,
      first_paid_month_end: qp.first_paid_month_end,
    };
    if (r.bonus_status === "pending" || r.bonus_status === "withheld") {
      const deadline =
        ms(r.sign_up_at)! + r.terms_snapshot.bonus_first_payment_deadline_days * 86_400_000;
      if (ms(qp.paid_at)! > deadline)
        Object.assign(patch, {
          bonus_status: "not_eligible",
          bonus_ineligible_reason: "qualifying_payment_too_late",
        });
      else if (!postStopAllowed(r, partner, config, "bonus", ms(qp.paid_at)!))
        Object.assign(patch, {
          bonus_status: "not_eligible",
          bonus_ineligible_reason: "post_stop",
        });
    }
  }

  // A gap in paying after the partner stopped ends commission for this host (11.2(a), D25).
  const period = invoicePeriod(inv);
  if (period && !r.post_stop_gap_at && postStopGap(r, partner, period.start)) {
    patch["post_stop_gap_at"] = isoOf(period.start);
    r = { ...r, post_stop_gap_at: isoOf(period.start) };
  }

  const paidAtMs =
    ms(inv.status_transitions?.paid_at ?? null) ?? ms(charge?.created ?? null) ?? Date.now();
  const result = commissionFor({
    invoice: inv,
    host,
    referral: r,
    partner,
    snapshot: r.terms_snapshot,
    config,
    netReceiptsPence: netReceipts(inv),
    settled,
    strongFlagOpen: await s.hasOpenFlag(r.id),
    paidAtMs,
  });
  if (result.line) {
    const l = result.line;
    if (chargeId)
      await s.saveCharge({
        charge_id: chargeId,
        referral_id: r.id,
        invoice_id: inv.id,
        amount_pence: charge?.amount ?? inv.amount_paid,
        refunded_pence: 0,
        dispute_status: null,
      });
    const added = await s.insertLines([
      {
        partner_id: r.partner_id,
        referral_id: r.id,
        host_id: hostId,
        kind: "commission",
        state: l.state,
        amount_pence: l.amount_pence,
        base_pence: l.base_pence,
        rate_bps: l.rate_bps,
        months_covered: l.months_covered,
        paid_month_from: l.paid_month_from,
        paid_month_to: l.paid_month_to,
        period_start: l.period_start,
        period_end: l.period_end,
        payable_after: l.payable_after,
        stripe_invoice_id: inv.id,
        stripe_charge_id: chargeId,
        source_event_id: event.id,
        note: l.hold_reason,
      },
    ]);
    // Counted once: by this call, or by a retry of one that saved the line but failed before counting it.
    const counted =
      !added &&
      !!r.last_paid_period_end &&
      Date.parse(r.last_paid_period_end) >= Date.parse(l.period_end);
    if (!counted) {
      patch["paid_months_used"] = r.paid_months_used + l.months_covered;
      patch["last_paid_period_end"] = l.period_end;
      patch["status_detail"] = result.capReached ? "cap_reached" : "paying";
    }
  } else if (result.reason === "other_interval") {
    await s.flag(r.id, r.partner_id, "other_interval", {
      invoice: inv.id,
      interval: billingInterval(inv),
    });
  } else if (result.reason === "cap_reached") {
    patch["status_detail"] = "cap_reached";
  } else if (result.reason === "partner_stopped") {
    patch["status_detail"] = "ended";
  }
  if (Object.keys(patch).length)
    await s.updateReferral(r.id, { ...patch, updated_at: new Date().toISOString() });
  // A refund that reached us before this payment did: take it off now.
  if (result.line && charge && chargeId && (charge.amount_refunded ?? 0) > 0)
    await refundCharge(s, config, charge, event.id);
  return "handled";
}

async function onPaymentFailed(event: StripeObj, s: PartnerStore): Promise<Outcome> {
  const hostId = await s.hostIdForInvoice(event.data.object);
  const r = hostId ? await s.referralForHost(hostId) : null;
  if (!r) return "not_ours";
  const partner = await s.partner(r.partner_id);
  const patch: Record<string, unknown> = {
    status_detail: r.status_detail === "cap_reached" ? "cap_reached" : "paused",
    updated_at: new Date().toISOString(),
  };
  // A missed month after the partner stopped (11.2(a)).
  if (partner?.terminated_at && Date.now() >= ms(partner.terminated_at)! && !r.post_stop_gap_at)
    patch["post_stop_gap_at"] = new Date().toISOString();
  await s.updateReferral(r.id, patch);
  return "handled";
}

/** A payment that was still processing has now settled: its commission is held as normal, and it may be the Qualifying Payment. */
async function onChargeSucceeded(
  event: StripeObj,
  s: PartnerStore,
  config: PartnerConfig,
): Promise<Outcome> {
  const charge = event.data.object as StripeCharge & StripeObj;
  const lines = (await s.linesForCharge(charge.id)).filter(
    (l) => l.kind === "commission" && l.state === "on_hold",
  );
  const rec = await s.chargeRecord(charge.id);
  if (!rec || !lines.length) return "not_ours";
  const r = await s.referral(rec.referral_id);
  if (!r) return "not_ours";
  if (!(await s.hasOpenFlag(r.id)) && r.status === "approved")
    await s.setLineState(
      lines.map((l) => l.id),
      "held",
    );
  if (!r.qualifying_invoice_id && rec.invoice_id && r.host_id) {
    const inv = await s.fetchInvoice(rec.invoice_id);
    const host = await s.hostBilling(r.host_id);
    const qp = inv ? qualifyingPayment(r, inv, host, charge, config) : null;
    if (qp) {
      await s.updateReferral(r.id, {
        qualifying_invoice_id: qp.invoice_id,
        qualifying_charge_id: qp.charge_id,
        qualifying_payment_at: qp.paid_at,
        billing_interval: qp.interval,
        first_paid_month_end: qp.first_paid_month_end,
        locked_at: r.locked_at ?? qp.paid_at,
        updated_at: new Date().toISOString(),
      });
    }
  }
  return "handled";
}

/* ----------------------------------------------------------- clawbacks */

async function applyPlan(s: PartnerStore, r: Referral, plan: ClawbackPlan, eventId: string) {
  if (plan.voids.length) await s.setLineState(plan.voids, "void");
  if (plan.lines.length) {
    await s.insertLines(
      plan.lines.map((l) => ({
        partner_id: r.partner_id,
        referral_id: r.id,
        host_id: r.host_id,
        kind: "clawback",
        state: l.state,
        amount_pence: l.amount_pence,
        reverses_ledger_id: l.reverses_ledger_id,
        payable_after: l.payable_after,
        stripe_charge_id: l.stripe_charge_id,
        source_event_id: eventId,
      })),
    );
  }
  if (plan.clawbacks.length) await s.insertClawbacks(r.partner_id, plan.clawbacks, eventId);
  const patch: Record<string, unknown> = {};
  if (plan.monthsUncounted) {
    patch["paid_months_used"] = Math.max(0, r.paid_months_used - plan.monthsUncounted);
    if (r.status_detail === "cap_reached") patch["status_detail"] = "paused";
  }
  if (plan.bonus) {
    patch["bonus_status"] = plan.bonus.status;
    patch["bonus_ineligible_reason"] = plan.bonus.reason;
    if (plan.bonus.status === "reversed") await s.setBonusClaim(r.id, "reversed");
  }
  if (Object.keys(patch).length)
    await s.updateReferral(r.id, { ...patch, updated_at: new Date().toISOString() });
}

/** Claws back what's newly refunded on a referred payment (Stripe reports the running total). */
async function refundCharge(
  s: PartnerStore,
  config: PartnerConfig,
  charge: StripeCharge & StripeObj,
  eventId: string,
): Promise<Outcome> {
  const rec = await s.chargeRecord(charge.id);
  if (!rec) return "not_ours";
  const r = await s.referral(rec.referral_id);
  if (!r) return "not_ours";
  const total = Math.max(0, charge.amount_refunded ?? 0);
  const fresh = total - rec.refunded_pence;
  if (fresh <= 0) return "handled";
  const full = !!charge.refunded || total >= rec.amount_pence;
  const lines = await s.linesForReferral(r.id);
  const plan = applyClawback(
    {
      cause: "refund",
      charge_id: charge.id,
      paid_pence: rec.amount_pence,
      amount_pence: fresh,
      full,
    },
    lines,
    r,
    config,
  );
  await applyPlan(s, r, plan, eventId);
  // Saved last, so a failure above leaves the refund to be taken off again on Stripe's retry.
  await s.updateCharge(charge.id, { refunded_pence: total });
  if (r.qualifying_charge_id === charge.id)
    await s.updateReferral(r.id, {
      qp_refunded_pence: total,
      updated_at: new Date().toISOString(),
    });
  await s.checkDisputeRate(r.partner_id);
  return "handled";
}

async function onRefunded(
  event: StripeObj,
  s: PartnerStore,
  config: PartnerConfig,
): Promise<Outcome> {
  return refundCharge(s, config, event.data.object as StripeCharge & StripeObj, event.id);
}

async function onDisputeCreated(event: StripeObj, s: PartnerStore): Promise<Outcome> {
  const dispute = event.data.object as StripeObj;
  const chargeId = chargeIdOf(dispute.charge);
  const rec = chargeId ? await s.chargeRecord(chargeId) : null;
  if (!rec || !chargeId) return "not_ours";
  const r = await s.referral(rec.referral_id);
  if (!r) return "not_ours";
  await s.updateCharge(chargeId, { dispute_status: "open" });
  const lines = await s.linesForReferral(r.id);
  const hold = lines
    .filter(
      (l) =>
        (l.stripe_charge_id === chargeId ||
          (l.kind === "launch_bonus" && r.qualifying_charge_id === chargeId)) &&
        (l.state === "held" || l.state === "payable"),
    )
    .map((l) => l.id);
  if (hold.length) await s.setLineState(hold, "on_hold");
  await s.insertLines([
    {
      partner_id: r.partner_id,
      referral_id: r.id,
      host_id: r.host_id,
      kind: "dispute_hold",
      state: "on_hold",
      amount_pence: 0,
      payable_after: null,
      stripe_charge_id: chargeId,
      source_event_id: event.id,
    },
  ]);
  if (r.qualifying_charge_id === chargeId) {
    await s.updateReferral(r.id, {
      qp_dispute: "open",
      ...(r.bonus_status === "earned" ? { bonus_status: "withheld" } : {}),
      updated_at: new Date().toISOString(),
    });
    if (r.bonus_status === "earned") await s.setBonusClaim(r.id, "withheld");
  }
  await s.checkDisputeRate(r.partner_id);
  return "handled";
}

async function onDisputeClosed(
  event: StripeObj,
  s: PartnerStore,
  config: PartnerConfig,
): Promise<Outcome> {
  const dispute = event.data.object as StripeObj;
  const chargeId = chargeIdOf(dispute.charge);
  const rec = chargeId ? await s.chargeRecord(chargeId) : null;
  if (!rec || !chargeId) return "not_ours";
  const r = await s.referral(rec.referral_id);
  if (!r) return "not_ours";
  const lines = await s.linesForReferral(r.id);
  const held = lines.filter(
    (l) =>
      (l.stripe_charge_id === chargeId ||
        (l.kind === "launch_bonus" && r.qualifying_charge_id === chargeId)) &&
      l.state === "on_hold" &&
      l.kind !== "dispute_hold",
  );
  if (dispute.status === "won") {
    await s.updateCharge(chargeId, { dispute_status: "won" });
    const reviewHold = (await s.hasOpenFlag(r.id)) || r.status !== "approved";
    if (held.length && !reviewHold)
      await s.setLineState(
        held.map((l) => l.id),
        "held",
      );
    await s.insertLines([
      {
        partner_id: r.partner_id,
        referral_id: r.id,
        host_id: r.host_id,
        kind: "dispute_release",
        state: "held",
        amount_pence: 0,
        payable_after: null,
        stripe_charge_id: chargeId,
        source_event_id: event.id,
      },
    ]);
    if (r.qualifying_charge_id === chargeId) {
      await s.updateReferral(r.id, {
        qp_dispute: "won",
        ...(r.bonus_status === "withheld" &&
        lines.some((l) => l.kind === "launch_bonus" && l.state !== "void")
          ? { bonus_status: "earned" }
          : {}),
        updated_at: new Date().toISOString(),
      });
      await s.setBonusClaim(r.id, "earned");
    }
    return "handled";
  }
  if (dispute.status === "lost") {
    await s.updateCharge(chargeId, { dispute_status: "lost" });
    const amount = Math.min(
      rec.amount_pence,
      Math.max(0, Number(dispute.amount ?? rec.amount_pence)),
    );
    const plan = applyClawback(
      {
        cause: "chargeback",
        charge_id: chargeId,
        paid_pence: rec.amount_pence,
        amount_pence: amount,
        full: amount >= rec.amount_pence,
      },
      lines,
      r,
      { ...config, bonusPartialRefund: "full" },
    );
    await applyPlan(s, r, plan, event.id);
    if (r.qualifying_charge_id === chargeId)
      await s.updateReferral(r.id, { qp_dispute: "lost", updated_at: new Date().toISOString() });
    await s.checkDisputeRate(r.partner_id);
    return "handled";
  }
  // Anything else (warning closed, an unusual outcome): stays held for the admin.
  await s.log({
    partner_id: r.partner_id,
    referral_id: r.id,
    action: "dispute_unclear",
    details: { charge: chargeId, status: dispute.status },
  });
  await s.flag(r.id, r.partner_id, "dispute_rate", {
    charge: chargeId,
    dispute_status: dispute.status,
    note: "Dispute closed with an unusual status: check it in Stripe.",
  });
  return "handled";
}

/* ----------------------------------------------------- partner accounts */

async function onAccountUpdated(event: StripeObj, s: PartnerStore): Promise<Outcome> {
  const acct = event.data.object as StripeObj;
  if (typeof acct.id !== "string") return "not_ours";
  const p = await s.partnerByAccount(acct.id);
  if (!p) return "not_ours";
  await s.updatePartner(p.id, {
    payouts_enabled: !!acct.payouts_enabled,
    stripe_requirements: acct.requirements ?? null,
    updated_at: new Date().toISOString(),
  });
  await s.log({
    partner_id: p.id,
    action: "stripe_account_updated",
    details: {
      payouts_enabled: !!acct.payouts_enabled,
      due: acct.requirements?.currently_due ?? [],
    },
  });
  return "handled";
}

async function onTransferReversed(event: StripeObj, s: PartnerStore): Promise<Outcome> {
  const t = event.data.object as StripeObj;
  if (typeof t.id !== "string") return "not_ours";
  const fully = Number(t.amount_reversed ?? 0) >= Number(t.amount ?? Infinity);
  return (await s.payoutTransferReversed(t.id, Number(t.amount_reversed ?? 0), fully))
    ? "handled"
    : "not_ours";
}

async function onPayoutFailed(event: StripeObj, s: PartnerStore): Promise<Outcome> {
  if (typeof event.account !== "string") return "not_ours";
  const p = await s.partnerByAccount(event.account);
  if (!p) return "not_ours";
  const po = event.data.object as StripeObj;
  await s.log({
    partner_id: p.id,
    action: "bank_payout_failed",
    details: {
      payout: po.id,
      failure: po.failure_code ?? null,
      message: po.failure_message ?? null,
    },
  });
  return "handled";
}

/* ------------------------------------------------------------ dispatch */

/**
 * Handles one event if it's about a Commission Partner. "busy" means
 * another delivery of the same event is still working (the route answers
 * 409 so Stripe tries again later); errors are recorded and re-thrown so
 * Stripe retries.
 */
export async function processPartnerEvent(
  event: StripeObj,
  s: PartnerStore,
): Promise<Outcome | "busy"> {
  if (!event || typeof event.id !== "string" || !isPartnerEventType(event.type)) return "not_ours";
  // Events on a host's own connected account are the host's business, except account.updated / payout.failed for a partner's account.
  if (event.account && !["account.updated", "payout.failed"].includes(event.type))
    return "not_ours";
  let mode: "test" | "live";
  try {
    mode = s.mode();
  } catch {
    return "not_ours";
  }
  if (!!event.livemode !== (mode === "live")) return "not_ours";

  const claim = await s.claimEvent(event.id, event.type, !!event.livemode);
  if (claim.state === "busy") return "busy";
  if (claim.state === "done") return claim.result === "not_ours" ? "not_ours" : "handled";
  try {
    const config = await s.config();
    let out: Outcome;
    switch (event.type) {
      case "invoice.paid":
        out = await onInvoicePaid(event, s, config);
        break;
      case "invoice.payment_failed":
        out = await onPaymentFailed(event, s);
        break;
      case "charge.succeeded":
        out = await onChargeSucceeded(event, s, config);
        break;
      case "charge.refunded":
        out = await onRefunded(event, s, config);
        break;
      case "charge.dispute.created":
        out = await onDisputeCreated(event, s);
        break;
      case "charge.dispute.closed":
        out = await onDisputeClosed(event, s, config);
        break;
      case "account.updated":
        out = await onAccountUpdated(event, s);
        break;
      case "transfer.reversed":
        out = await onTransferReversed(event, s);
        break;
      case "payout.failed":
        out = await onPayoutFailed(event, s);
        break;
      default:
        out = "not_ours";
    }
    await s.finishEvent(event.id, out);
    return out;
  } catch (e) {
    await s.finishEvent(event.id, null, String(e instanceof Error ? e.message : e).slice(0, 500));
    throw e;
  }
}
