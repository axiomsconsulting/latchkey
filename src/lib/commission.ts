/**
 * The Commission Partner commission engine (agreement draft v0.5, clauses 3,
 * 6, 8, 9 and 11). Pure: no I/O, money in integer pence, times as ISO
 * strings or Stripe's unix seconds, everything passed in.
 *
 * Commission is a flat Commission Rate (10%) of Net Receipts for each of a
 * Referred Host's first 12 Paid Months (6.1-6.3); an annual payment counts as
 * 12 Paid Months in one line (6.8). There are no tiers and no host-count or
 * volume rules of any kind, and no cap on hosts per partner (6.4). A
 * one-off Launch Bonus per Referred Host (6.4) is earned when the first Paid
 * Month completes, held for the Hold Period from then (9.2), and paid once
 * per host ever. Refunds, chargebacks and reversed payments claw back
 * (6.7); only the Qualifying Payment's affect the bonus (6.7(b)).
 *
 * Terms are the snapshot taken on the referral at its Sign-up Date (6.5),
 * never the current terms.
 */
import type { BonusPartialRefund, FeeTable, PartnerConfig } from "./partner-config";

const DAY = 86_400_000;

/* --------------------------------------------------------------- dates */

/** Stripe's unix seconds, an ISO string or a Date, as milliseconds. */
export function ms(t: number | string | Date | null | undefined): number | null {
  if (t === null || t === undefined) return null;
  if (t instanceof Date) return t.getTime();
  if (typeof t === "number") return t < 1e12 ? t * 1000 : t;
  const v = Date.parse(t);
  return Number.isNaN(v) ? null : v;
}
const iso = (m: number) => new Date(m).toISOString();

/** The UTC offset (ms) of a time zone at an instant. */
function zoneOffset(at: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const local = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return local - Math.floor(at / 1000) * 1000;
}

/** The instant a calendar day (YYYY-MM-DD) starts in a time zone. */
export function dayStart(date: string, tz = "Europe/London"): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - zoneOffset(guess, tz);
  t = guess - zoneOffset(t, tz);
  return t;
}

/** The first instant after a calendar day ends in a time zone ("by the end of that day, UK time"). */
export function dayEnd(date: string, tz = "Europe/London"): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return dayStart(next, tz);
}

/** The same day of the month, `n` months on (clamped to the month's last day), keeping the time of day. */
export function addMonths(at: number, n: number): number {
  const d = new Date(at);
  const day = d.getUTCDate();
  const target = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + n,
      1,
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  );
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.getTime();
}

/** Round half up, for non-negative amounts: 2.5p → 3p. Documented so statements can be checked by hand. */
export function roundHalfUp(n: number): number {
  return n >= 0 ? Math.floor(n + 0.5) : -Math.floor(-n + 0.5);
}

/** Rate (basis points) of an amount in pence, rounded half up. */
export function pct(amountPence: number, bps: number): number {
  return roundHalfUp((amountPence * bps) / 10_000);
}

/* --------------------------------------------------------------- terms */

export type BonusTier = { from_nth: number; pence: number };

export type TermsRow = {
  id: string;
  label: string;
  partner_id: string | null;
  effective_from: string;
  rate_bps: number;
  paid_months_cap: number;
  bonus_amount_pence: number | null;
  bonus_tiers: BonusTier[] | null;
  bonus_end_date: string | null;
  bonus_first_payment_deadline_days?: number | null;
  applies_to_existing?: boolean;
  written_notice_ref?: string | null;
  notice_sent_at?: string | null;
};

/** What a referral keeps for life (6.5): the terms on its Sign-up Date. */
export type TermsSnapshot = {
  terms_id: string;
  label: string;
  rate_bps: number;
  paid_months_cap: number;
  bonus_amount_pence: number | null;
  bonus_tiers: BonusTier[] | null;
  bonus_end_date: string | null;
  bonus_first_payment_deadline_days: number;
};

export function snapshotOf(row: TermsRow, deadlineDays: number): TermsSnapshot {
  return {
    terms_id: row.id,
    label: row.label,
    rate_bps: row.rate_bps,
    paid_months_cap: row.paid_months_cap,
    bonus_amount_pence: row.bonus_amount_pence,
    bonus_tiers:
      row.bonus_tiers && row.bonus_tiers.length
        ? [...row.bonus_tiers].sort((a, b) => a.from_nth - b.from_nth)
        : null,
    bonus_end_date: row.bonus_end_date,
    bonus_first_payment_deadline_days: row.bonus_first_payment_deadline_days ?? deadlineDays,
  };
}

/**
 * The terms for a host: the latest row in effect at its Sign-up Date (not
 * the click date), a partner's own terms winning over the programme's.
 */
export function termsFor(
  signUpAt: string,
  partnerId: string,
  rows: TermsRow[],
  deadlineDays: number,
): TermsSnapshot | null {
  const at = ms(signUpAt)!;
  const inForce = rows.filter((r) => (ms(r.effective_from) ?? Infinity) <= at);
  const latest = (list: TermsRow[]) =>
    [...list].sort((a, b) => ms(b.effective_from)! - ms(a.effective_from)!)[0];
  const row =
    latest(inForce.filter((r) => r.partner_id === partnerId)) ??
    latest(inForce.filter((r) => r.partner_id === null));
  return row ? snapshotOf(row, deadlineDays) : null;
}

const tiersBelow = (prev: BonusTier[] | null, next: BonusTier[] | null): boolean => {
  if (!prev?.length) return false;
  if (!next?.length) return true;
  // A tier is lower if, for any host number, the new terms pay less.
  const at = (t: BonusTier[], n: number) =>
    [...t]
      .sort((a, b) => a.from_nth - b.from_nth)
      .filter((x) => x.from_nth <= n)
      .pop()?.pence ?? 0;
  const points = new Set([...prev, ...next].map((t) => t.from_nth));
  return [...points].some((n) => at(next, n) < at(prev, n));
};

/** Whether new terms take anything away from the current ones (6.5 needs 30 days' notice for that). */
type TermsMoney = Pick<
  TermsRow,
  | "rate_bps"
  | "paid_months_cap"
  | "bonus_amount_pence"
  | "bonus_tiers"
  | "bonus_end_date"
  | "bonus_first_payment_deadline_days"
>;

export function isReduction(prev: TermsMoney, next: TermsMoney): boolean {
  if (next.rate_bps < prev.rate_bps) return true;
  if (next.paid_months_cap < prev.paid_months_cap) return true;
  if (
    (next.bonus_first_payment_deadline_days ?? 60) < (prev.bonus_first_payment_deadline_days ?? 60)
  )
    return true;
  if (
    prev.bonus_amount_pence !== null &&
    (next.bonus_amount_pence === null || next.bonus_amount_pence < prev.bonus_amount_pence) &&
    !next.bonus_tiers?.length
  )
    return true;
  if (tiersBelow(prev.bonus_tiers, next.bonus_tiers)) return true;
  if (prev.bonus_end_date && (!next.bonus_end_date || next.bonus_end_date < prev.bonus_end_date))
    return true;
  return false;
}

export const TERMS_NOTICE_DAYS = 30;

/**
 * Checks a new terms row before it's saved (admin "New terms"). Reductions
 * need the notice recorded and take effect 30+ days after it (6.5);
 * increases may start at once. Applying to existing referrals needs a
 * written-notice reference and is for pure increases only.
 */
export function newTermsProblem(
  prev: TermsRow | null,
  next: Omit<TermsRow, "id">,
  now: number,
): string | null {
  if (next.rate_bps < 0 || next.rate_bps > 10_000) return "The rate must be between 0% and 100%.";
  if (next.paid_months_cap < 1 || next.paid_months_cap > 12)
    return "Paid Months must be between 1 and 12.";
  if (next.bonus_amount_pence !== null && next.bonus_amount_pence < 0)
    return "The Launch Bonus can't be negative.";
  if (next.bonus_tiers?.some((t) => !Number.isInteger(t.from_nth) || t.from_nth < 1 || t.pence < 0))
    return "Each bonus tier needs a host number from 1 and an amount.";
  const from = ms(next.effective_from);
  if (from === null) return "Choose when the terms take effect.";
  if (prev && from <= (ms(prev.effective_from) ?? 0))
    return "New terms must start after the current ones.";
  const reduces = !!prev && isReduction(prev, next);
  if (reduces) {
    const notice = ms(next.notice_sent_at ?? null);
    if (notice === null)
      return "These terms reduce or remove something: record when the 30 days' notice was emailed first.";
    if (from < notice + TERMS_NOTICE_DAYS * DAY)
      return "Reduced terms can only take effect 30 days or more after the notice was emailed.";
  } else if (from < now - 60_000) {
    return "New terms can't start in the past.";
  }
  if (next.applies_to_existing) {
    if (!next.written_notice_ref?.trim())
      return "Applying terms to hosts already referred needs the written notice's reference.";
    if (reduces) return "Only increases can apply to hosts already referred.";
  }
  return null;
}

/** An existing snapshot raised to new terms, only where the terms say so in writing and only upwards (6.5). */
export function raisedSnapshot(snap: TermsSnapshot, row: TermsRow): TermsSnapshot | null {
  if (!row.applies_to_existing || !row.written_notice_ref) return null;
  const next = snapshotOf(row, snap.bonus_first_payment_deadline_days);
  if (isReduction(snap, next)) return null;
  return {
    ...next,
    bonus_first_payment_deadline_days: Math.max(
      next.bonus_first_payment_deadline_days,
      snap.bonus_first_payment_deadline_days,
    ),
  };
}

/* ------------------------------------------------------------ invoices */

export type StripeInvoiceLine = {
  amount?: number;
  proration?: boolean;
  period?: { start: number; end: number };
  price?: { recurring?: { interval?: string; interval_count?: number } | null } | null;
  plan?: { interval?: string; interval_count?: number } | null;
};

export type StripeInvoice = {
  id: string;
  status?: string;
  amount_paid: number;
  total?: number;
  total_excluding_tax?: number | null;
  tax?: number | null;
  total_taxes?: Array<{ amount: number }> | null;
  billing_reason?: string | null;
  paid_out_of_band?: boolean;
  charge?: string | null;
  period_start?: number;
  period_end?: number;
  status_transitions?: { paid_at?: number | null } | null;
  lines?: { data: StripeInvoiceLine[] };
};

export type StripeCharge = {
  id: string;
  status: string;
  amount: number;
  amount_refunded?: number;
  refunded?: boolean;
  created?: number;
  disputed?: boolean;
  dispute_status?: "open" | "won" | "lost" | null;
};

export type HostBilling = { trialEndsAt: string | null; comped: boolean };

const subLine = (inv: StripeInvoice) =>
  inv.lines?.data.find((l) => l.price?.recurring || l.plan) ?? inv.lines?.data[0];

/** "month", "year", or "other" (weekly, every 3 months…), which earns nothing and is flagged. */
export function billingInterval(inv: StripeInvoice): "month" | "year" | "other" {
  const l = subLine(inv);
  const r = l?.price?.recurring ?? l?.plan ?? null;
  if (!r?.interval) return "other";
  const count = r.interval_count ?? 1;
  if (r.interval === "month" && count === 1) return "month";
  if (r.interval === "year" && count === 1) return "year";
  return "other";
}

/** The billing period the invoice pays for (the subscription line's), in ms. */
export function invoicePeriod(inv: StripeInvoice): { start: number; end: number } | null {
  const l = subLine(inv);
  const start = ms(l?.period?.start ?? inv.period_start ?? null);
  const end = ms(l?.period?.end ?? inv.period_end ?? null);
  return start !== null && end !== null ? { start, end } : null;
}

/** VAT in the invoice (Latchkey charges none today). */
export function invoiceTax(inv: StripeInvoice): number {
  if (typeof inv.total === "number" && typeof inv.total_excluding_tax === "number")
    return Math.max(0, inv.total - inv.total_excluding_tax);
  if (inv.total_taxes?.length) return inv.total_taxes.reduce((s, t) => s + (t.amount || 0), 0);
  return Math.max(0, inv.tax ?? 0);
}

/**
 * Net Receipts (clause 3): what was actually paid, without VAT, less refunds,
 * chargebacks and reversed payments. Stripe's fees are never taken off, and
 * the list price is never used. Refunds and disputes are of the gross
 * amount, so their VAT share comes off with them. Never negative.
 */
export function netReceipts(inv: StripeInvoice, refundedPence = 0, lostDisputePence = 0): number {
  const paid = Math.max(0, inv.amount_paid);
  if (paid === 0) return 0;
  const exTax = Math.max(0, paid - Math.min(paid, invoiceTax(inv)));
  const share = (x: number) => roundHalfUp((Math.max(0, x) * exTax) / paid);
  return Math.max(0, exTax - share(refundedPence) - share(lostDisputePence));
}

const COUNTED_REASONS = new Set([
  "subscription_create",
  "subscription_cycle",
  "subscription_update",
]);
// A minute's leeway: Stripe starts the first paid period at the trial's last second.
const TRIAL_LEEWAY = 60_000;

function paidAfterTrial(inv: StripeInvoice, host: HostBilling): boolean {
  if (inv.status !== "paid" || inv.amount_paid <= 0 || inv.paid_out_of_band) return false;
  if (!COUNTED_REASONS.has(inv.billing_reason ?? "")) return false;
  // TODO(Swapnil): confirm whether Latchkey prorates plan changes; proration-only invoices never start a new Paid Month.
  const lines = inv.lines?.data ?? [];
  if (lines.length && lines.every((l) => l.proration)) return false;
  const period = invoicePeriod(inv);
  const trialEnd = ms(host.trialEndsAt);
  if (!period) return false;
  return trialEnd === null || period.start >= trialEnd - TRIAL_LEEWAY;
}

/** A Paid Month (clause 3): a monthly period after the free trial, paid, more than £0. */
export function isPaidMonth(inv: StripeInvoice, host: HostBilling): boolean {
  return billingInterval(inv) === "month" && paidAfterTrial(inv, host);
}

/** An annual payment (6.8): counts as 12 Paid Months. */
export function isAnnualPayment(inv: StripeInvoice, host: HostBilling): boolean {
  return billingInterval(inv) === "year" && paidAfterTrial(inv, host);
}

/** A payment that has settled: succeeded, not fully refunded, no lost dispute. Processing payments aren't settled yet. */
export function isSettled(c: StripeCharge | null | undefined): boolean {
  if (!c || c.status !== "succeeded") return false;
  if (c.refunded || (c.amount_refunded ?? 0) >= c.amount) return false;
  return c.dispute_status !== "lost";
}

/** When a payment was made: the invoice's paid time, else the charge's. */
export function paidAt(inv: StripeInvoice, charge?: StripeCharge | null): number | null {
  return ms(inv.status_transitions?.paid_at ?? null) ?? ms(charge?.created ?? null);
}

/** The first Paid Month's end: the monthly period's end; for an annual plan, one month into the year (6.8). */
export function firstPaidMonthEnd(inv: StripeInvoice): number | null {
  const p = invoicePeriod(inv);
  if (!p) return null;
  return billingInterval(inv) === "year" ? addMonths(p.start, 1) : p.end;
}

export type ReferralState = {
  status: "pending_review" | "approved" | "rejected";
  sign_up_at: string;
  paid_months_used: number;
  qualifying_invoice_id?: string | null;
  qualifying_charge_id?: string | null;
  qualifying_payment_at?: string | null;
  first_paid_month_end?: string | null;
  post_stop_gap_at?: string | null;
  last_paid_period_end?: string | null;
  qp_refunded_pence?: number;
  qp_dispute?: "open" | "won" | "lost" | null;
  bonus_status?: "not_eligible" | "pending" | "earned" | "withheld" | "reversed" | "paid";
  /** The Qualifying Payment has since been fully refunded or charged back. */
  qp_reversed?: boolean;
};

export type QualifyingPayment = {
  invoice_id: string;
  charge_id: string | null;
  paid_at: string;
  interval: "month" | "year";
  first_paid_month_end: string;
};

/**
 * The Qualifying Payment (clause 3): the first successful payment after the
 * trial, once settled. Kept once found: a later payment never replaces it,
 * unless D26 says a fully reversed one may be replaced.
 */
export function qualifyingPayment(
  r: ReferralState,
  inv: StripeInvoice,
  host: HostBilling,
  charge: StripeCharge | null,
  config: Pick<PartnerConfig, "qpReplacedAfterReversal">,
): QualifyingPayment | null {
  if (r.qualifying_invoice_id && !(config.qpReplacedAfterReversal && r.qp_reversed)) return null;
  const monthly = isPaidMonth(inv, host);
  if (!monthly && !isAnnualPayment(inv, host)) return null;
  if (!isSettled(charge)) return null;
  const at = paidAt(inv, charge);
  const fpme = firstPaidMonthEnd(inv);
  if (at === null || fpme === null) return null;
  return {
    invoice_id: inv.id,
    charge_id: charge?.id ?? null,
    paid_at: iso(at),
    interval: monthly ? "month" : "year",
    first_paid_month_end: iso(fpme),
  };
}

/* ------------------------------------------------------------ stopping */

export type PartnerState = { terminated_at: string | null; termination_for_breach: boolean };

/**
 * Whether commission or a bonus may still be written after the partner
 * stopped (11.2, 11.3). Stopped for breach: nothing new. Otherwise
 * commission continues for hosts whose Qualifying Payment came before the
 * stop date, while they keep paying (11.2(a), D25); 11.2(b) only behind its
 * flag (D22); a bonus only when the Qualifying Payment was before the stop
 * date (11.2(c), (d)).
 */
export function postStopAllowed(
  r: Pick<ReferralState, "qualifying_payment_at" | "sign_up_at" | "post_stop_gap_at">,
  p: PartnerState,
  config: Pick<
    PartnerConfig,
    "postStopSignupCounts" | "postStopPaymentDeadlineDays" | "postStopResumeCounts"
  >,
  kind: "commission" | "bonus",
  at: number = Date.now(),
): boolean {
  const stop = ms(p.terminated_at);
  if (stop === null || at < stop) return true;
  if (p.termination_for_breach) return false;
  const qp = ms(r.qualifying_payment_at ?? null);
  const qpBefore = qp !== null && qp < stop;
  if (kind === "bonus") return qpBefore;
  if (qpBefore) return config.postStopResumeCounts || !r.post_stop_gap_at;
  if (!config.postStopSignupCounts) return false;
  const signUp = ms(r.sign_up_at)!;
  return signUp < stop && qp !== null && qp <= signUp + config.postStopPaymentDeadlineDays * DAY;
}

/** A gap in paying after the stop date (11.2(a)): a new period starting more than a day after the last paid one ended. */
export function postStopGap(
  r: Pick<ReferralState, "last_paid_period_end">,
  p: PartnerState,
  periodStart: number,
): boolean {
  const stop = ms(p.terminated_at);
  const last = ms(r.last_paid_period_end ?? null);
  if (stop === null || last === null) return false;
  return periodStart - last > DAY && periodStart > stop;
}

/* ---------------------------------------------------------- commission */

export type LedgerState = "held" | "on_hold" | "payable" | "paid" | "void";

export type CommissionLine = {
  kind: "commission";
  paid_month_from: number;
  paid_month_to: number;
  months_covered: number;
  base_pence: number;
  rate_bps: number;
  amount_pence: number;
  state: "held" | "on_hold";
  payable_after: string;
  period_start: string;
  period_end: string;
  hold_reason: string | null;
};

export type CommissionResult =
  | { line: CommissionLine; capReached: boolean }
  | { line: null; reason: string; flag?: "other_interval" };

/**
 * The commission for one paid invoice, or why there's none. A pending
 * referral or one with an open strong fraud flag still gets its line, held
 * on hold until reviewed (8.5), so nothing earned is lost; a rejected
 * referral gets nothing. A payment still processing is held on hold too.
 */
export function commissionFor(input: {
  invoice: StripeInvoice;
  host: HostBilling;
  referral: ReferralState;
  partner: PartnerState;
  snapshot: TermsSnapshot;
  config: Pick<
    PartnerConfig,
    | "holdDays"
    | "annualAfterMonthly"
    | "postStopSignupCounts"
    | "postStopPaymentDeadlineDays"
    | "postStopResumeCounts"
  >;
  netReceiptsPence: number;
  settled: boolean;
  strongFlagOpen: boolean;
  paidAtMs: number;
}): CommissionResult {
  const { invoice, host, referral, partner, snapshot, config } = input;
  if (host.comped) return { line: null, reason: "comped" };
  const interval = billingInterval(invoice);
  if (interval === "other" && invoice.status === "paid" && invoice.amount_paid > 0)
    return { line: null, reason: "other_interval", flag: "other_interval" };
  const monthly = isPaidMonth(invoice, host);
  const annual = !monthly && isAnnualPayment(invoice, host);
  if (!monthly && !annual) return { line: null, reason: "not_a_paid_month" };
  if (referral.status === "rejected") return { line: null, reason: "referral_rejected" };
  const cap = Math.min(12, snapshot.paid_months_cap);
  const used = referral.paid_months_used;
  if (used >= cap) return { line: null, reason: "cap_reached" };
  if (!postStopAllowed(referral, partner, config, "commission", input.paidAtMs))
    return { line: null, reason: "partner_stopped" };
  const period = invoicePeriod(invoice)!;
  const net = Math.max(0, input.netReceiptsPence);
  const remaining = cap - used;
  let months: number;
  let base: number;
  if (monthly) {
    months = 1;
    base = net;
  } else if (remaining >= 12) {
    months = 12;
    base = net;
  } else if (config.annualAfterMonthly === "pro_rata_remaining") {
    months = remaining;
    base = roundHalfUp((net * remaining) / 12);
  } else {
    return { line: null, reason: "annual_after_monthly" };
  }
  const holdReason = !input.settled
    ? "payment_processing"
    : referral.status === "pending_review"
      ? "under_review"
      : input.strongFlagOpen
        ? "fraud_check"
        : null;
  return {
    line: {
      kind: "commission",
      paid_month_from: used + 1,
      paid_month_to: used + months,
      months_covered: months,
      base_pence: base,
      rate_bps: snapshot.rate_bps,
      amount_pence: pct(base, snapshot.rate_bps),
      state: holdReason ? "on_hold" : "held",
      payable_after: iso(input.paidAtMs + config.holdDays * DAY),
      period_start: iso(period.start),
      period_end: iso(period.end),
      hold_reason: holdReason,
    },
    capReached: used + months >= cap,
  };
}

/* --------------------------------------------------------------- bonus */

export type BonusDecision =
  | { status: "earned"; amount_pence: number; reason: null }
  | { status: "pending" | "withheld" | "not_eligible"; amount_pence: 0; reason: string };

/** The tier amount for the n-th earned bonus (1-based). */
export function tierAmount(tiers: BonusTier[], nth: number): number {
  return (
    [...tiers]
      .sort((a, b) => a.from_nth - b.from_nth)
      .filter((t) => t.from_nth <= nth)
      .pop()?.pence ?? 0
  );
}

/**
 * Whether the Launch Bonus is earned now (6.4), and how much. "pending"
 * means not yet (waiting for the Qualifying Payment or the first month to
 * finish), "withheld" means held for review or an open dispute (9.2, 8.5),
 * "not_eligible" is final, with the reason. Commission is unaffected by
 * any of these.
 */
export function bonusEligibility(input: {
  referral: ReferralState;
  /** The Qualifying Payment's gross amount, to judge partial refunds. */
  qpPaidPence: number;
  snapshot: TermsSnapshot;
  now: number;
  /** This host's identity already has a claim, with any partner, at any time, in any state. */
  priorClaim: boolean;
  strongFlagOpen: boolean;
  partner: PartnerState;
  config: Pick<
    PartnerConfig,
    | "bonusPartialRefund"
    | "postStopSignupCounts"
    | "postStopPaymentDeadlineDays"
    | "postStopResumeCounts"
  >;
  /** How many of this partner's bonuses were earned before this one (reversed ones don't count). */
  earnedBefore: number;
}): BonusDecision {
  const { referral: r, snapshot: s, now } = input;
  const no = (reason: string): BonusDecision => ({
    status: "not_eligible",
    amount_pence: 0,
    reason,
  });
  const wait = (status: "pending" | "withheld", reason: string): BonusDecision => ({
    status,
    amount_pence: 0,
    reason,
  });
  if (s.bonus_amount_pence === null && !s.bonus_tiers?.length) return no("no_bonus_in_terms");
  if (!s.bonus_end_date) return no("no_bonus_end_date");
  const signUp = ms(r.sign_up_at)!;
  if (signUp >= dayEnd(s.bonus_end_date)) return no("signed_up_after_end_date");
  const deadline = signUp + s.bonus_first_payment_deadline_days * DAY;
  const qp = ms(r.qualifying_payment_at ?? null);
  if (qp === null)
    return now > deadline
      ? no("qualifying_payment_too_late")
      : wait("pending", "waiting_for_qualifying_payment");
  if (qp > deadline) return no("qualifying_payment_too_late");
  if (r.status === "rejected") return no("referral_rejected");
  if (!postStopAllowed(r, input.partner, input.config, "bonus", qp)) return no("post_stop");
  if (input.priorClaim) return no("prior_claim");
  const paid = Math.max(0, input.qpPaidPence);
  const refunded = Math.max(0, r.qp_refunded_pence ?? 0);
  if (r.qp_reversed || r.qp_dispute === "lost" || (paid > 0 && refunded >= paid))
    return no("qualifying_payment_refunded");
  if (refunded > 0 && input.config.bonusPartialRefund === "full")
    return no("qualifying_payment_refunded");
  const fpme = ms(r.first_paid_month_end ?? null);
  if (fpme === null || now < fpme) return wait("pending", "first_month_not_complete");
  if (r.qp_dispute === "open") return wait("withheld", "open_dispute");
  if (r.status === "pending_review" || input.strongFlagOpen)
    return wait("withheld", "under_review");
  const full = s.bonus_tiers?.length
    ? tierAmount(s.bonus_tiers, input.earnedBefore + 1)
    : (s.bonus_amount_pence ?? 0);
  const amount = refunded > 0 && paid > 0 ? roundHalfUp((full * (paid - refunded)) / paid) : full;
  if (amount <= 0) return no("no_bonus_in_terms");
  return { status: "earned", amount_pence: amount, reason: null };
}

/** The bonus ledger line: held until the Hold Period after the first Paid Month ends (9.2). */
export function bonusLine(amountPence: number, firstPaidMonthEnd: string, holdDays: number) {
  return {
    kind: "launch_bonus" as const,
    amount_pence: amountPence,
    base_pence: 0,
    state: "held" as const,
    payable_after: iso(ms(firstPaidMonthEnd)! + holdDays * DAY),
  };
}

/* ------------------------------------------------------------ releases */

export type LedgerLine = {
  id: string;
  partner_id: string;
  referral_id: string | null;
  kind:
    | "commission"
    | "launch_bonus"
    | "clawback"
    | "dispute_hold"
    | "dispute_release"
    | "adjustment"
    | "write_off";
  state: LedgerState;
  amount_pence: number;
  months_covered?: number | null;
  stripe_invoice_id?: string | null;
  stripe_charge_id?: string | null;
  payable_after: string | null;
  reverses_ledger_id?: string | null;
  created_at?: string;
};

/** Held lines whose Hold Period has passed, with no open dispute on their charge and no open fraud flag on their referral. */
export function releaseHeld(
  lines: LedgerLine[],
  now: number,
  openDisputeCharges: ReadonlySet<string>,
  flaggedReferrals: ReadonlySet<string>,
): string[] {
  return lines
    .filter((l) => l.state === "held" && (ms(l.payable_after) ?? Infinity) <= now)
    .filter((l) => !(l.stripe_charge_id && openDisputeCharges.has(l.stripe_charge_id)))
    .filter((l) => !(l.referral_id && flaggedReferrals.has(l.referral_id)))
    .map((l) => l.id);
}

/* ---------------------------------------------------------------- fees */

const EEA_UK = new Set([
  "GB",
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
]);
const MAJOR_FX = new Set([
  "US",
  "AT",
  "BE",
  "HR",
  "CY",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PT",
  "SK",
  "SI",
  "ES",
]);

export type FeeEstimate = { total_pence: number; parts: Array<{ label: string; pence: number }> };

/** Stripe's fees for a payout, an estimate only: never charged by Latchkey and never taken from the partner (9.4). */
export function estimateFees(
  route: "express" | "global_payouts" | "manual",
  amountPence: number,
  country: string,
  t: FeeTable,
): FeeEstimate {
  const parts: FeeEstimate["parts"] = [];
  if (route === "express") {
    parts.push({ label: "Active account (monthly)", pence: t.connect.activeAccountPence });
    parts.push({
      label: "Payout",
      pence: pct(amountPence, t.connect.payoutBps) + t.connect.payoutFixedPence,
    });
    if (!EEA_UK.has(country))
      parts.push({ label: "Cross-border", pence: pct(amountPence, t.connect.crossBorderBps) });
  } else if (route === "global_payouts") {
    parts.push({ label: "Payout", pence: t.globalPayouts.payoutFixedPence });
    if (country !== "GB") {
      parts.push({
        label: "Cross-border (up to)",
        pence: pct(amountPence, t.globalPayouts.crossBorderBpsMax),
      });
      parts.push({
        label: "Currency conversion",
        pence: pct(
          amountPence,
          MAJOR_FX.has(country) ? t.globalPayouts.fxMajorBps : t.globalPayouts.fxOtherBps,
        ),
      });
    }
  }
  return { total_pence: parts.reduce((s, p) => s + p.pence, 0), parts };
}

/* ------------------------------------------------------------- payouts */

export type PayoutPartner = {
  id: string;
  status: string;
  country: string;
  payout_route: "express" | "global_payouts" | "manual" | "none";
  payouts_enabled: boolean;
  /** A partner-level flag (dispute rate) still open: payouts wait for review. */
  flagged: boolean;
};

export type PlannedPayout = {
  partner_id: string;
  route: "express" | "global_payouts" | "manual";
  amount_pence: number;
  ledger_ids: string[];
  est_fee_pence: number;
  due_by: string;
};

export type CarryForward = { partner_id: string; amount_pence: number; reason: string };

/** End of the month an amount became payable, plus the days allowed (9.4). */
export function dueBy(becamePayable: number, days: number): string {
  const d = new Date(becamePayable);
  const monthEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
  return new Date(monthEnd + days * DAY).toISOString().slice(0, 10);
}

export class PayoutPlanRefused extends Error {}

/**
 * Monthly payouts of everything payable (9.4): at least £10, else carried
 * forward; held until the Stripe Account can be paid (9.3(b)); negative
 * lines (clawbacks) offset in the same payout. Quarterly payouts and the
 * fee-ratio hold would breach 9.4, so they're refused unless the agreement
 * is changed (D3).
 */
export function planPayouts(
  partners: PayoutPartner[],
  payableLines: LedgerLine[],
  config: Pick<
    PartnerConfig,
    | "minPayoutPence"
    | "payoutCadence"
    | "maxFeeRatioBps"
    | "agreementAllowsNonMonthly"
    | "payoutDueDaysAfterMonthEnd"
    | "globalPayoutsEnabled"
  >,
  fees: FeeTable,
  asOf: number,
): { payouts: PlannedPayout[]; carried: CarryForward[] } {
  if (
    (config.payoutCadence !== "monthly" || config.maxFeeRatioBps !== null) &&
    !config.agreementAllowsNonMonthly
  ) {
    throw new PayoutPlanRefused(
      "The agreement (9.4) says payouts are monthly from £10: quarterly payouts and holding for fees need the agreement changed first.",
    );
  }
  const payouts: PlannedPayout[] = [];
  const carried: CarryForward[] = [];
  const quarterEnd = [2, 5, 8, 11].includes(new Date(asOf).getUTCMonth());
  for (const p of partners) {
    const lines = payableLines.filter((l) => l.partner_id === p.id && l.state === "payable");
    if (!lines.length) continue;
    const amount = lines.reduce((s, l) => s + l.amount_pence, 0);
    const carry = (reason: string) =>
      carried.push({ partner_id: p.id, amount_pence: amount, reason });
    if (amount <= 0) {
      carry("negative_balance");
      continue;
    }
    if (amount < config.minPayoutPence) {
      carry("below_minimum");
      continue;
    }
    if (p.status === "suspended") {
      carry("suspended");
      continue;
    }
    if (p.flagged) {
      carry("under_review");
      continue;
    }
    if (config.payoutCadence === "quarterly" && !quarterEnd) {
      carry("quarterly");
      continue;
    }
    let route: PlannedPayout["route"];
    if (p.payout_route === "express") {
      if (!p.payouts_enabled) {
        carry("stripe_account_not_ready");
        continue;
      }
      route = "express";
    } else if (p.payout_route === "manual") {
      route = "manual";
    } else if (p.payout_route === "global_payouts") {
      if (!config.globalPayoutsEnabled) {
        carry("global_payouts_disabled");
        continue;
      }
      route = "global_payouts";
    } else {
      carry("no_payout_route");
      continue;
    }
    const est = estimateFees(route, amount, p.country, fees).total_pence;
    if (config.maxFeeRatioBps !== null && est * 10_000 > amount * config.maxFeeRatioBps) {
      carry("fees_too_high");
      continue;
    }
    const oldest = Math.min(
      ...lines.filter((l) => l.amount_pence > 0).map((l) => ms(l.payable_after) ?? asOf),
    );
    payouts.push({
      partner_id: p.id,
      route,
      amount_pence: amount,
      ledger_ids: lines.map((l) => l.id),
      est_fee_pence: est,
      due_by: dueBy(oldest, config.payoutDueDaysAfterMonthEnd),
    });
  }
  return { payouts, carried };
}

/** Drafts due within `days` (or overdue), for the admin's highlight. */
export function payoutUrgent(dueByDate: string, now: number, days = 5): boolean {
  return dayStart(dueByDate, "UTC") - now <= days * DAY;
}

/* ------------------------------------------------------------ clawback */

export type ClawbackEvent = {
  cause: "refund" | "chargeback" | "reversed_payment";
  charge_id: string;
  /** What was paid on the charge (gross, pence). */
  paid_pence: number;
  /** Newly refunded or lost on this event (gross, pence). */
  amount_pence: number;
  /** The payment is now fully refunded or charged back. */
  full: boolean;
};

export type ClawbackPlan = {
  /** Unpaid lines cancelled outright. */
  voids: string[];
  /** Negative lines to add: against unpaid lines they take that line's state; against paid ones they're payable (offset). */
  lines: Array<{
    kind: "clawback";
    amount_pence: number;
    reverses_ledger_id: string;
    state: LedgerState;
    payable_after: string | null;
    stripe_charge_id: string;
  }>;
  /** Clawbacks rows for the record (paid lines, and voided ones for the audit). */
  clawbacks: Array<{
    ledger_id: string;
    cause: "refund" | "chargeback" | "reversed_payment" | "fraud";
    amount_pence: number;
    method: "offset" | "reversal";
    status: "open" | "closed";
  }>;
  /** Paid Months to take back (full refunds and lost chargebacks only). */
  monthsUncounted: number;
  bonus: null | { status: "reversed" | "not_eligible"; reason: string };
};

const already = (line: LedgerLine, all: LedgerLine[]) =>
  all
    .filter((l) => l.reverses_ledger_id === line.id && l.state !== "void")
    .reduce((s, l) => s - l.amount_pence, 0);

function reverseLine(
  line: LedgerLine,
  all: LedgerLine[],
  amount: number,
  full: boolean,
  cause: ClawbackPlan["clawbacks"][number]["cause"],
  method: "offset" | "reversal",
  chargeId: string,
  plan: ClawbackPlan,
) {
  if (line.state === "void") return;
  const left = line.amount_pence - already(line, all);
  const take = Math.min(left, full ? left : amount);
  if (take <= 0) return;
  if (line.state === "paid") {
    plan.lines.push({
      kind: "clawback",
      amount_pence: -take,
      reverses_ledger_id: line.id,
      state: "payable",
      payable_after: null,
      stripe_charge_id: chargeId,
    });
    plan.clawbacks.push({ ledger_id: line.id, cause, amount_pence: take, method, status: "open" });
  } else if (take === line.amount_pence) {
    plan.voids.push(line.id);
    plan.clawbacks.push({
      ledger_id: line.id,
      cause,
      amount_pence: take,
      method: "offset",
      status: "closed",
    });
  } else {
    plan.lines.push({
      kind: "clawback",
      amount_pence: -take,
      reverses_ledger_id: line.id,
      state: line.state,
      payable_after: line.payable_after,
      stripe_charge_id: chargeId,
    });
    plan.clawbacks.push({
      ledger_id: line.id,
      cause,
      amount_pence: take,
      method: "offset",
      status: "closed",
    });
  }
}

/**
 * What a refund, chargeback or reversed payment takes back (6.7, 6.8): the
 * commission on that amount (in proportion for partial refunds, annual
 * payments too); the payment's Paid Months only when it's fully refunded or
 * charged back; the Launch Bonus only for the Qualifying Payment (6.7(b)),
 * a partial refund per D18. Unpaid amounts are cancelled; paid ones are
 * set against the next payouts.
 */
export function applyClawback(
  ev: ClawbackEvent,
  lines: LedgerLine[],
  referral: Pick<ReferralState, "qualifying_charge_id" | "bonus_status">,
  config: Pick<PartnerConfig, "bonusPartialRefund" | "clawbackMethod">,
  opts: { reversalPossible?: boolean } = {},
): ClawbackPlan {
  const plan: ClawbackPlan = {
    voids: [],
    lines: [],
    clawbacks: [],
    monthsUncounted: 0,
    bonus: null,
  };
  const method =
    config.clawbackMethod === "offset_then_reversal" && opts.reversalPossible
      ? "reversal"
      : "offset";
  const share = (amount: number) =>
    ev.paid_pence > 0
      ? roundHalfUp((amount * Math.min(ev.amount_pence, ev.paid_pence)) / ev.paid_pence)
      : 0;
  for (const l of lines.filter(
    (x) => x.kind === "commission" && x.stripe_charge_id === ev.charge_id && x.state !== "void",
  )) {
    reverseLine(l, lines, share(l.amount_pence), ev.full, ev.cause, method, ev.charge_id, plan);
    if (ev.full) plan.monthsUncounted += l.months_covered ?? 1;
  }
  if (referral.qualifying_charge_id && referral.qualifying_charge_id === ev.charge_id) {
    const bonus = lines.find((x) => x.kind === "launch_bonus" && x.state !== "void");
    const whole = ev.full || config.bonusPartialRefund === "full";
    if (bonus) {
      reverseLine(
        bonus,
        lines,
        share(bonus.amount_pence),
        whole,
        ev.cause,
        method,
        ev.charge_id,
        plan,
      );
      if (whole) plan.bonus = { status: "reversed", reason: "qualifying_payment_refunded" };
    } else if (whole && referral.bonus_status !== "reversed") {
      plan.bonus = { status: "not_eligible", reason: "qualifying_payment_refunded" };
    }
  }
  return plan;
}

/**
 * A confirmed fraud flag (8.4 → 6.7): every unpaid line is cancelled,
 * everything paid is set against future payouts, and the bonus is reversed.
 * Ending the arrangement is the admin's decision, never automatic.
 */
export function applyFraudOutcome(lines: LedgerLine[]): ClawbackPlan {
  const plan: ClawbackPlan = {
    voids: [],
    lines: [],
    clawbacks: [],
    monthsUncounted: 0,
    bonus: { status: "reversed", reason: "fraud" },
  };
  for (const l of lines.filter(
    (x) => (x.kind === "commission" || x.kind === "launch_bonus") && x.state !== "void",
  )) {
    const left = l.amount_pence - already(l, lines);
    if (left <= 0) continue;
    if (l.state === "paid") {
      plan.lines.push({
        kind: "clawback",
        amount_pence: -left,
        reverses_ledger_id: l.id,
        state: "payable",
        payable_after: null,
        stripe_charge_id: l.stripe_charge_id ?? "",
      });
      plan.clawbacks.push({
        ledger_id: l.id,
        cause: "fraud",
        amount_pence: left,
        method: "offset",
        status: "open",
      });
    } else {
      plan.voids.push(l.id);
      plan.clawbacks.push({
        ledger_id: l.id,
        cause: "fraud",
        amount_pence: left,
        method: "offset",
        status: "closed",
      });
    }
  }
  return plan;
}

/**
 * An open clawback's next step (6.7(c)): set against payouts while anything
 * is due; after 3 months with nothing due, ask for repayment; written off
 * only below the threshold (never, by default).
 */
export function clawbackNext(
  c: { amount_pence: number; recovered_pence: number; created_at: string; status: string },
  nothingDue: boolean,
  now: number,
  config: Pick<PartnerConfig, "repaymentRequestAfterDays" | "writeOffBelowPence">,
): "offset" | "repayment_requested" | "written_off" | "closed" {
  const left = c.amount_pence - c.recovered_pence;
  if (left <= 0) return "closed";
  if (left < config.writeOffBelowPence) return "written_off";
  if (nothingDue && now - ms(c.created_at)! >= config.repaymentRequestAfterDays * DAY)
    return "repayment_requested";
  return "offset";
}

/** The admin's words for each reason a bonus or payout is held back. */
export const REASONS: Record<string, string> = {
  no_bonus_in_terms: "No Launch Bonus in the terms for this host",
  no_bonus_end_date: "No Bonus End Date set in the terms",
  signed_up_after_end_date: "Signed up after the Bonus End Date",
  qualifying_payment_too_late: "First payment more than 60 days after sign-up",
  waiting_for_qualifying_payment: "Waiting for the first payment after the trial",
  first_month_not_complete: "First Paid Month not finished yet",
  qualifying_payment_refunded: "First payment refunded or charged back",
  open_dispute: "First payment is disputed",
  under_review: "Being checked",
  referral_rejected: "Referral rejected",
  prior_claim: "This host has had a Launch Bonus before",
  post_stop: "First payment after the partner stopped",
  fraud: "Reversed after a fraud check",
  below_minimum: "Under £10: carried forward",
  negative_balance: "Owes a clawback: carried forward",
  stripe_account_not_ready: "Stripe Account can't take payouts yet",
  suspended: "Partner suspended",
  global_payouts_disabled: "Global Payouts is switched off",
  no_payout_route: "No way to pay this partner yet",
  quarterly: "Paid quarterly",
  fees_too_high: "Fees too high for the amount",
};

export function reasonText(code: string | null | undefined): string {
  return code ? (REASONS[code] ?? code.replace(/_/g, " ")) : "";
}

export type { BonusPartialRefund };
