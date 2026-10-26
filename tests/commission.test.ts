/**
 * The Commission Partner engine against agreement draft v0.5: 10% of Net
 * Receipts for 12 Paid Months (annual = 12 in one line), the Launch Bonus
 * (6.4), clawback (6.7), stopping (11.2, 11.3), effective-dated terms (6.5)
 * and monthly payouts from £10 (9.3, 9.4).
 */
import { describe, expect, it } from "vitest";

import {
  addMonths,
  applyClawback,
  applyFraudOutcome,
  bonusEligibility,
  bonusLine,
  billingInterval,
  clawbackNext,
  commissionFor,
  dayEnd,
  dueBy,
  estimateFees,
  isAnnualPayment,
  isPaidMonth,
  isSettled,
  netReceipts,
  newTermsProblem,
  payoutUrgent,
  planPayouts,
  PayoutPlanRefused,
  postStopAllowed,
  postStopGap,
  qualifyingPayment,
  raisedSnapshot,
  releaseHeld,
  roundHalfUp,
  termsFor,
  type LedgerLine,
  type PartnerState,
  type ReferralState,
  type StripeCharge,
  type StripeInvoice,
  type TermsRow,
  type TermsSnapshot,
} from "../src/lib/commission";
import { FEE_TABLE, PARTNER_DEFAULTS, partnerConfig } from "../src/lib/partner-config";

const DAY = 86_400_000;
const T = (s: string) => Date.parse(s);
const sec = (s: string) => Math.floor(T(s) / 1000);
const C = PARTNER_DEFAULTS;

const SNAP: TermsSnapshot = { terms_id: "t1", label: "v0.5-launch", rate_bps: 1000, paid_months_cap: 12, bonus_amount_pence: 5000, bonus_tiers: null, bonus_end_date: "2026-12-31", bonus_first_payment_deadline_days: 60 };
const HOST = { trialEndsAt: "2026-11-01T00:00:00Z", comped: false };
const ACTIVE: PartnerState = { terminated_at: null, termination_for_breach: false };

function inv(over: Partial<StripeInvoice> & { start?: string; end?: string; interval?: string; count?: number } = {}): StripeInvoice {
  const start = over.start ?? "2026-11-01T00:00:00Z";
  const end = over.end ?? new Date(addMonths(T(start), over.interval === "year" ? 12 : 1)).toISOString();
  return {
    id: over.id ?? "in_1",
    status: "paid",
    amount_paid: 2900,
    total: 2900,
    total_excluding_tax: 2900,
    billing_reason: "subscription_cycle",
    charge: "ch_1",
    status_transitions: { paid_at: sec(start) },
    lines: { data: [{ amount: over.amount_paid ?? 2900, period: { start: sec(start), end: sec(end) }, price: { recurring: { interval: over.interval ?? "month", interval_count: over.count ?? 1 } } }] },
    ...over,
  };
}
const charge = (over: Partial<StripeCharge> = {}): StripeCharge => ({ id: "ch_1", status: "succeeded", amount: 2900, amount_refunded: 0, created: sec("2026-11-01T00:00:00Z"), ...over });
const ref = (over: Partial<ReferralState> = {}): ReferralState => ({ status: "approved", sign_up_at: "2026-10-01T10:00:00Z", paid_months_used: 0, ...over });

function commission(invoice: StripeInvoice, over: { referral?: Partial<ReferralState>; partner?: PartnerState; snapshot?: TermsSnapshot; settled?: boolean; flag?: boolean; host?: typeof HOST; config?: Partial<typeof C> } = {}) {
  return commissionFor({
    invoice,
    host: over.host ?? HOST,
    referral: ref(over.referral),
    partner: over.partner ?? ACTIVE,
    snapshot: over.snapshot ?? SNAP,
    config: { ...C, ...over.config },
    netReceiptsPence: netReceipts(invoice),
    settled: over.settled ?? true,
    strongFlagOpen: over.flag ?? false,
    paidAtMs: (invoice.status_transitions?.paid_at ?? 0) * 1000,
  });
}

describe("Paid Months and Net Receipts", () => {
  it("earns nothing during the trial", () => {
    const trial = inv({ start: "2026-10-02T00:00:00Z", amount_paid: 0, billing_reason: "subscription_create" });
    expect(isPaidMonth(trial, HOST)).toBe(false);
    expect(commission(trial).line).toBeNull();
  });

  it("pays 10% of Net Receipts on the Qualifying Payment and records it", () => {
    const i = inv();
    const r = commission(i);
    expect(r.line).toMatchObject({ paid_month_from: 1, paid_month_to: 1, months_covered: 1, base_pence: 2900, rate_bps: 1000, amount_pence: 290, state: "held" });
    expect(r.line!.payable_after).toBe(new Date(T("2026-11-01T00:00:00Z") + 45 * DAY).toISOString());
    expect(qualifyingPayment(ref(), i, HOST, charge(), C)).toMatchObject({ invoice_id: "in_1", charge_id: "ch_1", paid_at: "2026-11-01T00:00:00.000Z", interval: "month", first_paid_month_end: "2026-12-01T00:00:00.000Z" });
  });

  it("waits for a processing payment to settle before it's the Qualifying Payment", () => {
    const i = inv();
    expect(isSettled(charge({ status: "pending" }))).toBe(false);
    expect(qualifyingPayment(ref(), i, HOST, charge({ status: "pending" }), C)).toBeNull();
    expect(commission(i, { settled: false }).line).toMatchObject({ state: "on_hold", hold_reason: "payment_processing" });
    expect(qualifyingPayment(ref(), i, HOST, charge(), C)).not.toBeNull();
  });

  it("keeps the first Qualifying Payment (D26)", () => {
    expect(qualifyingPayment(ref({ qualifying_invoice_id: "in_0", qp_reversed: true }), inv({ id: "in_2" }), HOST, charge(), C)).toBeNull();
    expect(qualifyingPayment(ref({ qualifying_invoice_id: "in_0", qp_reversed: true }), inv({ id: "in_2" }), HOST, charge(), { qpReplacedAfterReversal: true })).not.toBeNull();
  });

  it("leaves VAT out and never takes off Stripe's fees", () => {
    const vat = inv({ amount_paid: 3480, total: 3480, total_excluding_tax: 2900 });
    expect(netReceipts(vat)).toBe(2900);
    expect(commission(vat).line!.amount_pence).toBe(290);
    // A charge's fee (about 70p) changes nothing.
    expect(netReceipts(inv())).toBe(2900);
  });

  it("uses the amount actually paid in a discounted month", () => {
    expect(commission(inv({ amount_paid: 100, total: 100, total_excluding_tax: 100 })).line!.amount_pence).toBe(10);
  });

  it("doesn't count a £0 (100% coupon) month or an unpaid invoice", () => {
    const free = inv({ amount_paid: 0, total: 0, total_excluding_tax: 0 });
    expect(isPaidMonth(free, HOST)).toBe(false);
    expect(qualifyingPayment(ref(), free, HOST, charge({ amount: 0 }), C)).toBeNull();
    expect(commission(inv({ status: "open", amount_paid: 0 })).line).toBeNull();
    expect(isPaidMonth(inv({ paid_out_of_band: true }), HOST)).toBe(false);
  });

  it("numbers months by Paid Months, so a failed month isn't counted", () => {
    // Month 2 failed: the next paid invoice is Paid Month 2.
    const r = commission(inv({ id: "in_3", start: "2027-01-01T00:00:00Z" }), { referral: { paid_months_used: 1 } });
    expect(r.line).toMatchObject({ paid_month_from: 2, paid_month_to: 2 });
  });

  it("pauses and resumes up to 12 Paid Months, then stops", () => {
    let used = 0;
    const months: number[] = [];
    const paidMonths = ["2026-11", "2026-12", "2027-01", "2027-02", /* gap */ "2027-06", "2027-07", "2027-08", "2027-09", "2027-10", "2027-11", "2027-12", "2028-01", "2028-02", "2028-03"];
    for (const m of paidMonths) {
      const r = commission(inv({ id: `in_${m}`, start: `${m}-01T00:00:00Z` }), { referral: { paid_months_used: used } });
      if (r.line) {
        months.push(r.line.paid_month_to);
        used += r.line.months_covered;
      }
    }
    expect(months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(commission(inv({ id: "in_13" }), { referral: { paid_months_used: 12 } })).toEqual({ line: null, reason: "cap_reached" });
  });

  it("flags and skips intervals other than monthly or yearly", () => {
    const quarterly = inv({ interval: "month", count: 3 });
    expect(billingInterval(quarterly)).toBe("other");
    expect(commission(quarterly)).toEqual({ line: null, reason: "other_interval", flag: "other_interval" });
  });

  it("gives comped hosts and rejected referrals nothing, and holds pending ones", () => {
    expect(commission(inv(), { host: { ...HOST, comped: true } }).line).toBeNull();
    expect(commission(inv(), { referral: { status: "rejected" } }).line).toBeNull();
    expect(commission(inv(), { referral: { status: "pending_review" } }).line).toMatchObject({ state: "on_hold", hold_reason: "under_review" });
    expect(commission(inv(), { flag: true }).line).toMatchObject({ state: "on_hold", hold_reason: "fraud_check" });
  });

  it("rounds half up", () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(2.49)).toBe(2);
    expect(commission(inv({ amount_paid: 2905, total: 2905, total_excluding_tax: 2905 })).line!.amount_pence).toBe(291);
  });
});

describe("annual plans (6.8)", () => {
  const year = inv({ id: "in_y", interval: "year", amount_paid: 6600, total: 6600, total_excluding_tax: 6600 });

  it("pays one line for 12 Paid Months", () => {
    expect(isAnnualPayment(year, HOST)).toBe(true);
    const r = commission(year);
    expect(r.line).toMatchObject({ months_covered: 12, paid_month_from: 1, paid_month_to: 12, amount_pence: 660 });
    expect(r).toMatchObject({ capReached: true });
    expect(r.line!.payable_after).toBe(new Date(T("2026-11-01T00:00:00Z") + 45 * DAY).toISOString());
    expect(commission(inv({ id: "in_m" }), { referral: { paid_months_used: 12 } }).line).toBeNull();
  });

  it("claws back in proportion to a partial refund, keeping the months", () => {
    const line: LedgerLine = { id: "L", partner_id: "p", referral_id: "r", kind: "commission", state: "held", amount_pence: 660, months_covered: 12, stripe_charge_id: "ch_y", payable_after: null };
    const plan = applyClawback({ cause: "refund", charge_id: "ch_y", paid_pence: 6600, amount_pence: 1650, full: false }, [line], { qualifying_charge_id: "ch_other" }, C);
    expect(plan.lines).toEqual([expect.objectContaining({ amount_pence: -165, reverses_ledger_id: "L", state: "held" })]);
    expect(plan.monthsUncounted).toBe(0);
    const full = applyClawback({ cause: "refund", charge_id: "ch_y", paid_pence: 6600, amount_pence: 6600, full: true }, [line], { qualifying_charge_id: "ch_other" }, C);
    expect(full.voids).toEqual(["L"]);
    expect(full.monthsUncounted).toBe(12);
  });

  it("pays the remaining months pro rata after monthly ones (D24)", () => {
    const r = commission(year, { referral: { paid_months_used: 3 } });
    expect(r.line).toMatchObject({ months_covered: 9, paid_month_from: 4, paid_month_to: 12, base_pence: 4950, amount_pence: 495 });
    expect(commission(year, { referral: { paid_months_used: 3 }, config: { annualAfterMonthly: "none" } }).line).toBeNull();
  });

  it("earns the bonus one month into the year", () => {
    const qp = qualifyingPayment(ref(), year, HOST, charge({ id: "ch_y", amount: 6600 }), C)!;
    expect(qp.first_paid_month_end).toBe("2026-12-01T00:00:00.000Z");
    const r = ref({ qualifying_payment_at: qp.paid_at, first_paid_month_end: qp.first_paid_month_end, qualifying_charge_id: "ch_y" });
    const decide = (now: string, extra: Partial<ReferralState> = {}) =>
      bonusEligibility({ referral: { ...r, ...extra }, qpPaidPence: 6600, snapshot: SNAP, now: T(now), priorClaim: false, strongFlagOpen: false, partner: ACTIVE, config: C, earnedBefore: 0 });
    expect(decide("2026-11-20T00:00:00Z").status).toBe("pending");
    expect(decide("2026-12-01T00:00:00Z")).toEqual({ status: "earned", amount_pence: 5000, reason: null });
    // A later partial (pro-rata) refund of the annual payment is a partial refund of the Qualifying Payment.
    expect(decide("2027-03-01T00:00:00Z", { qp_refunded_pence: 4400 }).reason).toBe("qualifying_payment_refunded");
  });
});

describe("refunds and chargebacks (6.7)", () => {
  const mk = (over: Partial<LedgerLine>): LedgerLine => ({ id: "L3", partner_id: "p", referral_id: "r", kind: "commission", state: "paid", amount_pence: 290, months_covered: 1, stripe_charge_id: "ch_3", payable_after: null, ...over });

  it("reverses a fully refunded month and uncounts it", () => {
    const plan = applyClawback({ cause: "refund", charge_id: "ch_3", paid_pence: 2900, amount_pence: 2900, full: true }, [mk({})], { qualifying_charge_id: "ch_1" }, C);
    expect(plan.lines).toEqual([expect.objectContaining({ amount_pence: -290, state: "payable" })]);
    expect(plan.clawbacks).toEqual([expect.objectContaining({ amount_pence: 290, method: "offset", status: "open", cause: "refund" })]);
    expect(plan.monthsUncounted).toBe(1);
    expect(plan.bonus).toBeNull();
  });

  it("reverses a partial refund in proportion and keeps the month", () => {
    const plan = applyClawback({ cause: "refund", charge_id: "ch_3", paid_pence: 2900, amount_pence: 1450, full: false }, [mk({ state: "held" })], { qualifying_charge_id: "ch_1" }, C);
    expect(plan.lines[0]!.amount_pence).toBe(-145);
    expect(plan.monthsUncounted).toBe(0);
  });

  it("never takes back more than the line across several refunds", () => {
    const line = mk({ state: "held" });
    const prior: LedgerLine = { id: "R1", partner_id: "p", referral_id: "r", kind: "clawback", state: "held", amount_pence: -145, reverses_ledger_id: "L3", payable_after: null };
    const plan = applyClawback({ cause: "refund", charge_id: "ch_3", paid_pence: 2900, amount_pence: 2900, full: true }, [line, prior], { qualifying_charge_id: "ch_1" }, C);
    expect(plan.lines[0]!.amount_pence).toBe(-145);
  });

  it("treats a lost chargeback like a full refund", () => {
    const plan = applyClawback({ cause: "chargeback", charge_id: "ch_3", paid_pence: 2900, amount_pence: 2900, full: true }, [mk({ state: "payable" })], { qualifying_charge_id: "ch_1" }, C);
    expect(plan.voids).toEqual(["L3"]);
    expect(plan.monthsUncounted).toBe(1);
  });

  it("uses a transfer reversal only when allowed and possible", () => {
    const ev = { cause: "refund" as const, charge_id: "ch_3", paid_pence: 2900, amount_pence: 2900, full: true };
    expect(applyClawback(ev, [mk({})], { qualifying_charge_id: null }, { ...C, clawbackMethod: "offset_then_reversal" }, { reversalPossible: true }).clawbacks[0]!.method).toBe("reversal");
    expect(applyClawback(ev, [mk({})], { qualifying_charge_id: null }, { ...C, clawbackMethod: "offset_then_reversal" }, { reversalPossible: false }).clawbacks[0]!.method).toBe("offset");
    expect(applyClawback(ev, [mk({})], { qualifying_charge_id: null }, C, { reversalPossible: true }).clawbacks[0]!.method).toBe("offset");
  });

  it("asks for repayment after 3 months with nothing due, never writes off by default", () => {
    const c = { amount_pence: 500, recovered_pence: 0, created_at: "2027-01-01T00:00:00Z", status: "open" };
    expect(clawbackNext(c, true, T("2027-02-01T00:00:00Z"), C)).toBe("offset");
    expect(clawbackNext(c, false, T("2027-05-01T00:00:00Z"), C)).toBe("offset");
    expect(clawbackNext(c, true, T("2027-04-01T00:00:00Z"), C)).toBe("repayment_requested");
    expect(clawbackNext({ ...c, recovered_pence: 500 }, true, T("2027-04-01T00:00:00Z"), C)).toBe("closed");
    expect(clawbackNext(c, true, T("2027-02-01T00:00:00Z"), { ...C, writeOffBelowPence: 1000 })).toBe("written_off");
  });
});

describe("effective-dated terms (6.5)", () => {
  const launch: TermsRow = { id: "t1", label: "launch", partner_id: null, effective_from: "2026-10-26T00:00:00Z", rate_bps: 1000, paid_months_cap: 12, bonus_amount_pence: 5000, bonus_tiers: null, bonus_end_date: "2026-12-31" };
  const cut: TermsRow = { ...launch, id: "t2", label: "cut", effective_from: "2027-03-01T00:00:00Z", rate_bps: 800 };

  it("uses the terms on the Sign-up Date, not the click date", () => {
    expect(termsFor("2027-02-27T12:00:00Z", "p", [launch, cut], 60)!.rate_bps).toBe(1000);
    expect(termsFor("2027-03-02T12:00:00Z", "p", [launch, cut], 60)!.rate_bps).toBe(800);
    // Clicked in February, signed up in March: the new rate.
    expect(termsFor("2027-03-05T00:00:00Z", "p", [launch, cut], 60)!.label).toBe("cut");
    expect(termsFor("2026-10-01T00:00:00Z", "p", [launch, cut], 60)).toBeNull();
  });

  it("prefers a partner's own terms", () => {
    const own: TermsRow = { ...launch, id: "t9", label: "founding", partner_id: "p", rate_bps: 1200, effective_from: "2026-11-01T00:00:00Z" };
    expect(termsFor("2027-03-05T00:00:00Z", "p", [launch, cut, own], 60)!.rate_bps).toBe(1200);
    expect(termsFor("2027-03-05T00:00:00Z", "q", [launch, cut, own], 60)!.rate_bps).toBe(800);
  });

  it("needs 30 days' notice for a reduction, none for an increase", () => {
    const now = T("2027-01-01T00:00:00Z");
    expect(newTermsProblem(launch, { ...cut, effective_from: "2027-01-20T00:00:00Z", notice_sent_at: null }, now)).toMatch(/notice/);
    expect(newTermsProblem(launch, { ...cut, effective_from: "2027-01-20T00:00:00Z", notice_sent_at: "2027-01-01T00:00:00Z" }, now)).toMatch(/30 days/);
    expect(newTermsProblem(launch, { ...cut, effective_from: "2027-02-01T00:00:00Z", notice_sent_at: "2027-01-01T00:00:00Z" }, now)).toBeNull();
    const raise = { ...launch, label: "raise", effective_from: "2027-01-01T00:01:00Z", rate_bps: 1200 };
    expect(newTermsProblem(launch, raise, now)).toBeNull();
    // Removing the bonus or moving the end date earlier is a reduction too.
    expect(newTermsProblem(launch, { ...raise, bonus_amount_pence: null }, now)).toMatch(/notice/);
    expect(newTermsProblem(launch, { ...raise, bonus_end_date: "2026-12-01" }, now)).toMatch(/notice/);
  });

  it("leaves existing snapshots alone unless a written increase says otherwise", () => {
    const snap = termsFor("2026-11-05T00:00:00Z", "p", [launch], 60)!;
    const raise: TermsRow = { ...launch, id: "t3", label: "raise", rate_bps: 1200, effective_from: "2027-01-02T00:00:00Z" };
    expect(raisedSnapshot(snap, raise)).toBeNull();
    expect(raisedSnapshot(snap, { ...raise, applies_to_existing: true, written_notice_ref: "email 2027-01-01" })!.rate_bps).toBe(1200);
    expect(raisedSnapshot(snap, { ...cut, applies_to_existing: true, written_notice_ref: "x" })).toBeNull();
    expect(newTermsProblem(launch, { ...cut, effective_from: "2027-03-01T00:00:00Z", notice_sent_at: "2027-01-01T00:00:00Z", applies_to_existing: true, written_notice_ref: "x" }, T("2027-01-01T00:00:00Z"))).toMatch(/Only increases/);
  });
});

describe("Launch Bonus (6.4)", () => {
  const qpAt = "2026-11-01T00:00:00Z";
  const base = ref({ qualifying_payment_at: qpAt, first_paid_month_end: "2026-12-01T00:00:00Z", qualifying_charge_id: "ch_1" });
  const decide = (over: Partial<ReferralState> = {}, extra: { snapshot?: Partial<TermsSnapshot>; now?: string; prior?: boolean; flag?: boolean; partner?: PartnerState; config?: Partial<typeof C>; earnedBefore?: number } = {}) =>
    bonusEligibility({
      referral: { ...base, ...over },
      qpPaidPence: 2900,
      snapshot: { ...SNAP, ...extra.snapshot },
      now: T(extra.now ?? "2026-12-02T00:00:00Z"),
      priorClaim: extra.prior ?? false,
      strongFlagOpen: extra.flag ?? false,
      partner: extra.partner ?? ACTIVE,
      config: { ...C, ...extra.config },
      earnedBefore: extra.earnedBefore ?? 0,
    });

  it("needs an amount and an end date", () => {
    expect(decide({}, { snapshot: { bonus_amount_pence: null } }).reason).toBe("no_bonus_in_terms");
    expect(decide({}, { snapshot: { bonus_end_date: null } }).reason).toBe("no_bonus_end_date");
    expect(decide()).toEqual({ status: "earned", amount_pence: 5000, reason: null });
  });

  it("judges the Sign-up Date by the end of the Bonus End Date, UK time, across the clock change", () => {
    // 31 Oct 2026 is GMT (clocks went back on 25 Oct): the day ends at 00:00 UTC on 1 Nov.
    const snap = { bonus_end_date: "2026-10-31" };
    expect(decide({ sign_up_at: "2026-10-31T23:59:00Z" }, { snapshot: snap }).status).toBe("earned");
    expect(decide({ sign_up_at: "2026-11-01T00:01:00Z" }, { snapshot: snap }).reason).toBe("signed_up_after_end_date");
    // In summer (BST) the UK day ends at 23:00 UTC.
    expect(dayEnd("2026-07-31")).toBe(T("2026-07-31T23:00:00Z"));
    const summer = { bonus_end_date: "2026-07-31" };
    const r = { sign_up_at: "2026-07-31T22:59:00Z", qualifying_payment_at: "2026-08-31T00:00:00Z", first_paid_month_end: "2026-09-30T00:00:00Z" };
    expect(decide(r, { snapshot: summer, now: "2026-10-01T00:00:00Z" }).status).toBe("earned");
    expect(decide({ ...r, sign_up_at: "2026-07-31T23:01:00Z" }, { snapshot: summer, now: "2026-10-01T00:00:00Z" }).reason).toBe("signed_up_after_end_date");
  });

  it("needs the Qualifying Payment within 60 days of the Sign-up Date", () => {
    const signUp = "2026-10-01T10:00:00Z";
    expect(decide({ sign_up_at: signUp, qualifying_payment_at: new Date(T(signUp) + 60 * DAY).toISOString(), first_paid_month_end: "2027-01-01T00:00:00Z" }, { now: "2027-01-02T00:00:00Z" }).status).toBe("earned");
    expect(decide({ sign_up_at: signUp, qualifying_payment_at: new Date(T(signUp) + 61 * DAY).toISOString(), first_paid_month_end: "2027-01-01T00:00:00Z" }, { now: "2027-01-02T00:00:00Z" }).reason).toBe("qualifying_payment_too_late");
    expect(decide({ qualifying_payment_at: null }, { now: "2026-11-15T00:00:00Z" }).status).toBe("pending");
    expect(decide({ qualifying_payment_at: null }, { now: "2026-12-15T00:00:00Z" }).reason).toBe("qualifying_payment_too_late");
  });

  it("waits until the first Paid Month has finished, then holds for 45 days", () => {
    expect(decide({}, { now: "2026-11-20T00:00:00Z" })).toMatchObject({ status: "pending", reason: "first_month_not_complete" });
    expect(bonusLine(5000, "2026-12-01T00:00:00Z", 45)).toEqual({ kind: "launch_bonus", amount_pence: 5000, base_pence: 0, state: "held", payable_after: "2027-01-15T00:00:00.000Z" });
  });

  it("is cancelled by a full refund of the Qualifying Payment, during or after month 1", () => {
    expect(decide({ qp_refunded_pence: 2900 }, { now: "2026-11-10T00:00:00Z" }).reason).toBe("qualifying_payment_refunded");
    const bonus: LedgerLine = { id: "B", partner_id: "p", referral_id: "r", kind: "launch_bonus", state: "held", amount_pence: 5000, stripe_charge_id: null, payable_after: "2027-01-15T00:00:00Z" };
    const unpaid = applyClawback({ cause: "refund", charge_id: "ch_1", paid_pence: 2900, amount_pence: 2900, full: true }, [bonus], { qualifying_charge_id: "ch_1" }, C);
    expect(unpaid.voids).toContain("B");
    expect(unpaid.bonus).toEqual({ status: "reversed", reason: "qualifying_payment_refunded" });
    const paid = applyClawback({ cause: "refund", charge_id: "ch_1", paid_pence: 2900, amount_pence: 2900, full: true }, [{ ...bonus, state: "paid" }], { qualifying_charge_id: "ch_1" }, C);
    expect(paid.lines).toEqual([expect.objectContaining({ amount_pence: -5000, reverses_ledger_id: "B", state: "payable" })]);
    // Refunded before the bonus was earned: it never will be.
    expect(applyClawback({ cause: "refund", charge_id: "ch_1", paid_pence: 2900, amount_pence: 2900, full: true }, [], { qualifying_charge_id: "ch_1", bonus_status: "pending" }, C).bonus).toEqual({ status: "not_eligible", reason: "qualifying_payment_refunded" });
  });

  it("is reversed in full or in proportion by a partial refund of the Qualifying Payment (D18)", () => {
    const bonus: LedgerLine = { id: "B", partner_id: "p", referral_id: "r", kind: "launch_bonus", state: "held", amount_pence: 5000, payable_after: null };
    const ev = { cause: "refund" as const, charge_id: "ch_1", paid_pence: 2900, amount_pence: 725, full: false };
    expect(applyClawback(ev, [bonus], { qualifying_charge_id: "ch_1" }, C).voids).toEqual(["B"]);
    const prop = applyClawback(ev, [bonus], { qualifying_charge_id: "ch_1" }, { ...C, bonusPartialRefund: "proportional" });
    expect(prop.lines[0]!.amount_pence).toBe(-1250);
    expect(prop.bonus).toBeNull();
    expect(decide({ qp_refunded_pence: 725 }, { config: { bonusPartialRefund: "proportional" } })).toEqual({ status: "earned", amount_pence: 3750, reason: null });
  });

  it("is untouched by refunds of later months", () => {
    const bonus: LedgerLine = { id: "B", partner_id: "p", referral_id: "r", kind: "launch_bonus", state: "held", amount_pence: 5000, payable_after: null };
    const plan = applyClawback({ cause: "refund", charge_id: "ch_month2", paid_pence: 2900, amount_pence: 2900, full: true }, [bonus], { qualifying_charge_id: "ch_1" }, C);
    expect(plan.voids).toEqual([]);
    expect(plan.bonus).toBeNull();
  });

  it("is withheld during a dispute: won releases, lost cancels", () => {
    expect(decide({ qp_dispute: "open" })).toMatchObject({ status: "withheld", reason: "open_dispute" });
    expect(decide({ qp_dispute: "won" }).status).toBe("earned");
    expect(decide({ qp_dispute: "lost" }).reason).toBe("qualifying_payment_refunded");
  });

  it("is paid once per host ever, whichever partner and however long", () => {
    expect(decide({}, { prior: true }).reason).toBe("prior_claim");
  });

  it("is withheld while the referral is checked", () => {
    expect(decide({ status: "pending_review" })).toMatchObject({ status: "withheld", reason: "under_review" });
    expect(decide({}, { flag: true })).toMatchObject({ status: "withheld" });
    expect(decide({ status: "rejected" }).reason).toBe("referral_rejected");
  });

  it("follows tiers by the order bonuses are earned", () => {
    const tiers = { bonus_amount_pence: null, bonus_tiers: [{ from_nth: 1, pence: 2000 }, { from_nth: 6, pence: 3000 }, { from_nth: 11, pence: 4000 }] };
    expect(decide({}, { snapshot: tiers, earnedBefore: 0 }).amount_pence).toBe(2000);
    expect(decide({}, { snapshot: tiers, earnedBefore: 5 }).amount_pence).toBe(3000);
    expect(decide({}, { snapshot: tiers, earnedBefore: 10 }).amount_pence).toBe(4000);
  });

  it("has no cap on hosts per partner", () => {
    let earned = 0;
    for (let n = 0; n < 250; n++) {
      if (commission(inv({ id: `in_${n}` })).line) earned++;
      if (decide({}, { earnedBefore: n }).status === "earned") earned++;
    }
    expect(earned).toBe(500);
  });
});

describe("stopping (11.2, 11.3)", () => {
  const stopped: PartnerState = { terminated_at: "2027-01-15T00:00:00Z", termination_for_breach: false };
  const breach: PartnerState = { terminated_at: "2027-01-15T00:00:00Z", termination_for_breach: true };
  const after = T("2027-03-01T00:00:00Z");

  it("keeps commission and the bonus for a Qualifying Payment before the stop date", () => {
    const r = ref({ qualifying_payment_at: "2027-01-02T00:00:00Z" });
    expect(postStopAllowed(r, stopped, C, "commission", after)).toBe(true);
    expect(postStopAllowed(r, stopped, C, "bonus", after)).toBe(true);
  });

  it("gives nothing for a Qualifying Payment after the stop date unless 11.2(b) is on, and never a bonus", () => {
    const r = ref({ sign_up_at: "2027-01-10T00:00:00Z", qualifying_payment_at: "2027-02-20T00:00:00Z" });
    expect(postStopAllowed(r, stopped, C, "commission", after)).toBe(false);
    const on = { ...C, postStopSignupCounts: true };
    expect(postStopAllowed(r, stopped, on, "commission", after)).toBe(true);
    expect(postStopAllowed(r, stopped, on, "bonus", after)).toBe(false);
    expect(postStopAllowed(ref({ sign_up_at: "2027-01-10T00:00:00Z", qualifying_payment_at: "2027-03-15T00:00:00Z" }), stopped, on, "commission", T("2027-03-20T00:00:00Z"))).toBe(false);
  });

  it("ends commission at the first gap after the stop date unless resuming counts (D25)", () => {
    const r = ref({ qualifying_payment_at: "2027-01-02T00:00:00Z", last_paid_period_end: "2027-02-02T00:00:00Z" });
    expect(postStopGap(r, stopped, T("2027-04-02T00:00:00Z"))).toBe(true);
    expect(postStopGap(r, stopped, T("2027-02-02T00:00:00Z"))).toBe(false);
    const gapped = { ...r, post_stop_gap_at: "2027-03-02T00:00:00Z" };
    expect(postStopAllowed(gapped, stopped, C, "commission", after)).toBe(false);
    expect(postStopAllowed(gapped, stopped, { ...C, postStopResumeCounts: true }, "commission", after)).toBe(true);
  });

  it("writes nothing new after a stop for breach", () => {
    expect(postStopAllowed(ref({ qualifying_payment_at: "2027-01-02T00:00:00Z" }), breach, C, "commission", after)).toBe(false);
    expect(commission(inv({ start: "2027-02-01T00:00:00Z" }), { partner: breach, referral: { qualifying_payment_at: "2026-11-01T00:00:00Z", paid_months_used: 3 } }).line).toBeNull();
    // Before the stop date, lines are still written.
    expect(postStopAllowed(ref({}), breach, C, "commission", T("2027-01-01T00:00:00Z"))).toBe(true);
  });
});

describe("release, fraud and payouts (9.2-9.4)", () => {
  const L = (over: Partial<LedgerLine>): LedgerLine => ({ id: "x", partner_id: "p", referral_id: "r", kind: "commission", state: "payable", amount_pence: 500, payable_after: "2027-01-15T00:00:00Z", ...over });
  const P = { id: "p", status: "active", country: "GB", payout_route: "express" as const, payouts_enabled: true, flagged: false };
  const asOf = T("2027-02-01T00:00:00Z");

  it("releases held lines after the Hold Period, unless disputed or flagged", () => {
    const lines = [L({ id: "a", state: "held" }), L({ id: "b", state: "held", stripe_charge_id: "ch_d" }), L({ id: "c", state: "held", referral_id: "rf" }), L({ id: "d", state: "held", payable_after: "2027-03-01T00:00:00Z" })];
    expect(releaseHeld(lines, asOf, new Set(["ch_d"]), new Set(["rf"]))).toEqual(["a"]);
  });

  it("carries £9.99 forward and pays from £10", () => {
    expect(planPayouts([P], [L({ amount_pence: 999 })], C, FEE_TABLE, asOf)).toEqual({ payouts: [], carried: [{ partner_id: "p", amount_pence: 999, reason: "below_minimum" }] });
    const r = planPayouts([P], [L({ id: "a", amount_pence: 999 }), L({ id: "b", amount_pence: 1 })], C, FEE_TABLE, asOf);
    expect(r.payouts).toEqual([expect.objectContaining({ amount_pence: 1000, ledger_ids: ["a", "b"], route: "express" })]);
  });

  it("holds payouts until the Stripe Account can be paid (9.3(b))", () => {
    expect(planPayouts([{ ...P, payouts_enabled: false }], [L({ amount_pence: 5000 })], C, FEE_TABLE, asOf).carried[0]!.reason).toBe("stripe_account_not_ready");
    expect(planPayouts([P], [L({ amount_pence: 5000 })], C, FEE_TABLE, asOf).payouts).toHaveLength(1);
  });

  it("sets due_by to 30 days after the end of the month it became payable", () => {
    expect(dueBy(T("2027-01-15T00:00:00Z"), 30)).toBe("2027-03-02");
    expect(planPayouts([P], [L({ amount_pence: 5000 })], C, FEE_TABLE, asOf).payouts[0]!.due_by).toBe("2027-03-02");
    expect(payoutUrgent("2027-03-02", T("2027-02-26T00:00:00Z"))).toBe(true);
    expect(payoutUrgent("2027-03-02", T("2027-02-01T00:00:00Z"))).toBe(false);
  });

  it("offsets a clawback against the next payout", () => {
    const r = planPayouts([P], [L({ id: "a", amount_pence: 3000 }), L({ id: "c", kind: "clawback", amount_pence: -1000 })], C, FEE_TABLE, asOf);
    expect(r.payouts[0]).toMatchObject({ amount_pence: 2000, ledger_ids: ["a", "c"] });
    expect(planPayouts([P], [L({ id: "c", kind: "clawback", amount_pence: -1000 })], C, FEE_TABLE, asOf).carried[0]!.reason).toBe("negative_balance");
  });

  it("refuses quarterly payouts and the fee-ratio hold while the agreement says monthly (D3)", () => {
    expect(() => planPayouts([P], [], partnerConfig({ payoutCadence: "quarterly" }), FEE_TABLE, asOf)).toThrow(PayoutPlanRefused);
    expect(() => planPayouts([P], [], partnerConfig({ maxFeeRatioBps: 500 }), FEE_TABLE, asOf)).toThrow(PayoutPlanRefused);
    const allowed = partnerConfig({ maxFeeRatioBps: 500, agreementAllowsNonMonthly: true });
    expect(planPayouts([P], [L({ amount_pence: 1000 })], allowed, FEE_TABLE, asOf).carried[0]!.reason).toBe("fees_too_high");
  });

  it("routes manual and unsupported partners, and holds suspended or flagged ones", () => {
    expect(planPayouts([{ ...P, payout_route: "manual" }], [L({ amount_pence: 2000 })], C, FEE_TABLE, asOf).payouts[0]!.route).toBe("manual");
    expect(planPayouts([{ ...P, payout_route: "global_payouts" }], [L({ amount_pence: 2000 })], C, FEE_TABLE, asOf).carried[0]!.reason).toBe("global_payouts_disabled");
    expect(planPayouts([{ ...P, payout_route: "none" }], [L({ amount_pence: 2000 })], C, FEE_TABLE, asOf).carried[0]!.reason).toBe("no_payout_route");
    expect(planPayouts([{ ...P, status: "suspended" }], [L({ amount_pence: 2000 })], C, FEE_TABLE, asOf).carried[0]!.reason).toBe("suspended");
    expect(planPayouts([{ ...P, flagged: true }], [L({ amount_pence: 2000 })], C, FEE_TABLE, asOf).carried[0]!.reason).toBe("under_review");
  });

  it("estimates fees without ever taking them from the partner", () => {
    const uk = estimateFees("express", 10_000, "GB", FEE_TABLE);
    expect(uk.total_pence).toBe(200 + 25 + 10);
    expect(estimateFees("express", 10_000, "US", FEE_TABLE).total_pence).toBe(200 + 35 + 25);
    expect(estimateFees("manual", 10_000, "IN", FEE_TABLE).total_pence).toBe(0);
    expect(planPayouts([P], [L({ amount_pence: 10_000 })], C, FEE_TABLE, asOf).payouts[0]!.amount_pence).toBe(10_000);
  });

  it("reverses everything on a confirmed fraud flag", () => {
    const plan = applyFraudOutcome([L({ id: "a", state: "held" }), L({ id: "b", state: "paid", amount_pence: 290 }), L({ id: "c", kind: "launch_bonus", state: "payable", amount_pence: 5000 })]);
    expect(plan.voids).toEqual(["a", "c"]);
    expect(plan.lines).toEqual([expect.objectContaining({ amount_pence: -290, reverses_ledger_id: "b" })]);
    expect(plan.bonus).toEqual({ status: "reversed", reason: "fraud" });
  });
});
