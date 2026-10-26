/**
 * The Commission Partner month close and payout sending, with storage and
 * Stripe passed in so the rules can be tested. Server code wires them up in
 * partner-close.server.ts.
 *
 * Nothing here sends money without an admin's approval: the close only
 * drafts payouts; sendPayout runs when Latchkey admin clicks Approve and send.
 */
import {
  bonusEligibility,
  type BonusDecision,
  type PartnerState,
  type ReferralState,
  type TermsSnapshot,
} from "./commission";
import { dedupeKeys, type HashedKey } from "./partner-fraud";
import type { PartnerConfig } from "./partner-config";

export type BonusCandidate = {
  referral: ReferralState & { id: string; partner_id: string; terms_snapshot: TermsSnapshot };
  keys: HashedKey[];
  qpPaidPence: number;
  partner: PartnerState;
  flagOpen: boolean;
};

export type BonusRunResult = {
  referral_id: string;
  partner_id: string;
  decision: BonusDecision;
  identity_hashes: string[];
};

/**
 * Checks each referral whose first Paid Month has ended, in order, so two
 * referrals for the same host identity in one run can't both earn a bonus:
 * the first claim is added before the next is checked (6.4, once ever).
 * Tier positions count bonuses as they're earned.
 */
export function bonusRun(
  cands: BonusCandidate[],
  claims: Array<{ identity_hashes: string[] }>,
  earnedByPartner: Record<string, number>,
  config: PartnerConfig,
  now: number,
): BonusRunResult[] {
  const known = claims.map((c) => new Set(c.identity_hashes));
  const earned = { ...earnedByPartner };
  const order = [...cands].sort(
    (a, b) =>
      Date.parse(a.referral.first_paid_month_end ?? "") -
        Date.parse(b.referral.first_paid_month_end ?? "") ||
      a.referral.id.localeCompare(b.referral.id),
  );
  const out: BonusRunResult[] = [];
  for (const c of order) {
    const hashes = dedupeKeys(c.keys, config.bonusDedupeScope);
    const priorClaim = hashes.some((h) => known.some((k) => k.has(h)));
    const decision = bonusEligibility({
      referral: c.referral,
      qpPaidPence: c.qpPaidPence,
      snapshot: c.referral.terms_snapshot,
      now,
      priorClaim,
      strongFlagOpen: c.flagOpen,
      partner: c.partner,
      config,
      earnedBefore: earned[c.referral.partner_id] ?? 0,
    });
    if (decision.status === "earned") {
      known.push(new Set(hashes));
      earned[c.referral.partner_id] = (earned[c.referral.partner_id] ?? 0) + 1;
    }
    out.push({
      referral_id: c.referral.id,
      partner_id: c.referral.partner_id,
      decision,
      identity_hashes: hashes,
    });
  }
  return out;
}

export type PayoutToSend = {
  id: string;
  partner_id: string;
  route: "express" | "global_payouts" | "manual";
  amount_pence: number;
  currency: string;
  status: string;
  idempotency_key: string;
};
export type PartnerToPay = {
  id: string;
  status: string;
  stripe_account_id: string | null;
  payouts_enabled: boolean;
  termination_for_breach: boolean;
  flagged: boolean;
};

export type SendDeps = {
  /** The partner Stripe key check (throws in live mode without permission). */
  assertKey: () => void;
  availableGbpPence: () => Promise<number>;
  transfer: (body: Record<string, unknown>, idempotencyKey: string) => Promise<{ id: string }>;
  globalPayout?: (p: PayoutToSend) => Promise<{ id: string }>;
};

/** failed.rejected: Stripe answered with a refusal, so nothing moved and a retry needs a fresh idempotency key; otherwise (a timeout) the same key must be reused. */
export type SendResult =
  | { status: "sent"; transferId: string }
  | { status: "manual_pending" }
  | { status: "refused"; reason: string }
  | { status: "failed"; failure: string; rejected: boolean };

const rejectedByStripe = (e: unknown) =>
  e instanceof Error &&
  e.name === "PartnerStripeError" &&
  typeof (e as { status?: number }).status === "number" &&
  (e as unknown as { status: number }).status < 500;

/**
 * Sends one approved payout. Express: a Transfer from the platform's GBP
 * balance to the partner's account, keyed payout_<id> so a second click or a
 * retry can't pay twice. Checks first: the key (test mode unless allowed),
 * the partner can be paid, nothing open on them, enough balance.
 */
export async function sendPayout(
  p: PayoutToSend,
  partner: PartnerToPay,
  deps: SendDeps,
): Promise<SendResult> {
  if (!["draft", "approved", "failed", "sending"].includes(p.status))
    return { status: "refused", reason: `This payout is ${p.status.replace(/_/g, " ")}.` };
  if (partner.status === "suspended")
    return { status: "refused", reason: "The partner is suspended." };
  if (partner.flagged)
    return { status: "refused", reason: "The partner has an open review: resolve it first." };
  if (p.currency !== "gbp")
    return { status: "refused", reason: "Commission Partner payouts are in pounds only (9.4)." };
  if (p.route === "manual") return { status: "manual_pending" };
  try {
    deps.assertKey();
  } catch (e) {
    return {
      status: "refused",
      reason: e instanceof Error ? e.message : "Stripe isn't set up for partner payouts.",
    };
  }
  if (p.route === "global_payouts") {
    if (!deps.globalPayout)
      return {
        status: "refused",
        reason: "Global Payouts is switched off: pay this partner by hand instead.",
      };
    try {
      return { status: "sent", transferId: (await deps.globalPayout(p)).id };
    } catch (e) {
      return {
        status: "failed",
        failure: e instanceof Error ? e.message : String(e),
        rejected: rejectedByStripe(e),
      };
    }
  }
  if (!partner.stripe_account_id || !partner.payouts_enabled)
    return {
      status: "refused",
      reason: "The partner's Stripe Account can't take payouts yet (9.3(b)): it carries forward.",
    };
  const available = await deps.availableGbpPence();
  if (available < p.amount_pence)
    return {
      status: "refused",
      reason: `Not enough in Latchkey's Stripe balance (£${(available / 100).toFixed(2)} available). Add funds and try again.`,
    };
  try {
    const t = await deps.transfer(
      {
        amount: p.amount_pence,
        currency: "gbp",
        destination: partner.stripe_account_id,
        transfer_group: `payout_${p.id}`,
        metadata: { partner_id: p.partner_id, payout_id: p.id, kind: "commission_partner_payout" },
      },
      p.idempotency_key,
    );
    return { status: "sent", transferId: t.id };
  } catch (e) {
    return {
      status: "failed",
      failure: e instanceof Error ? e.message : String(e),
      rejected: rejectedByStripe(e),
    };
  }
}

/** One statement row per referred host for a month (agreement 9.1). CSV, hosts anonymised. */
export function statementCsv(
  rows: Array<{
    host: string;
    status: string;
    paidMonths: number;
    netReceiptsPence: number;
    commissionPence: number;
    bonusPence: number;
    heldPence: number;
    clawbackPence: number;
  }>,
): string {
  const pounds = (p: number) => (p / 100).toFixed(2);
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head =
    "Referred Host,Status,Paid Months used,Net Receipts (£),Commission (£),Launch Bonus (£),Held (£),Clawback (£)";
  const body = rows.map((r) =>
    [
      esc(r.host),
      esc(r.status),
      r.paidMonths,
      pounds(r.netReceiptsPence),
      pounds(r.commissionPence),
      pounds(r.bonusPence),
      pounds(r.heldPence),
      pounds(r.clawbackPence),
    ].join(","),
  );
  const total = rows.reduce(
    (t, r) => ({
      c: t.c + r.commissionPence,
      b: t.b + r.bonusPence,
      h: t.h + r.heldPence,
      k: t.k + r.clawbackPence,
      n: t.n + r.netReceiptsPence,
    }),
    { c: 0, b: 0, h: 0, k: 0, n: 0 },
  );
  return [
    head,
    ...body,
    [
      "Total",
      "",
      "",
      pounds(total.n),
      pounds(total.c),
      pounds(total.b),
      pounds(total.h),
      pounds(total.k),
    ].join(","),
  ].join("\n");
}

/** The cut-off before which IP and device hashes are cleared (D21, 8.5). */
export function hashPurgeBefore(now: number, days: number): string {
  return new Date(now - days * 86_400_000).toISOString();
}
