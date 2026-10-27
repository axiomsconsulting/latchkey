/**
 * The Commission Partner month close and payout sending, with storage and
 * Stripe passed in so the rules can be tested. Server code wires them up in
 * partner-close.server.ts.
 *
 * Nothing here sends money without an admin's approval: the close only
 * drafts payouts; sendPayout runs when Latchkey admin clicks Approve and send.
 */
import { breachSetOffPending } from "./commission";
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
  terminated_at?: string | null;
  set_off_done_at?: string | null;
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
  if (breachSetOffPending(partner, Date.now()))
    return {
      status: "refused",
      reason:
        "Stopped for breach: apply any set-off first (agreement 20.4(b)), then the balance can be paid.",
    };
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

export type StatementMeta = {
  /** Unique per partner and month, e.g. SB-OMS-AB12C-202611. */
  number: string;
  issuedOn: string;
  oms: { name: string; companyNumber: string; address: string; vatNumber: string };
  partner: { name: string; address: string | null; vatNumber: string | null };
  /** 12.7(a): a self-billed invoice unless the partner opted out. */
  selfBilled: boolean;
  /** 10.6: set-offs this month (positive pence owed by the partner). */
  setOffPence: number;
  /** Payable now: payable lines less clawbacks and set-offs (10.5, 10.6). */
  payablePence: number;
  /** Paid out this month. */
  paidPence: number;
};

/** Why an amount is still held, in plain words (12.1, 12.2). */
export const HOLD_WORDS: Record<string, string> = {
  hold_period: "Hold Period (45 days)",
  under_review: "Referral being checked",
  fraud_check: "Fraud check open",
  dispute: "Payment dispute open",
  stripe: "Waiting for your Stripe account",
};

/**
 * A partner's monthly statement (agreement v1.0 12.1, 12.7, 13.1) as CSV:
 * one row per Referred Host (initials and town only), amounts held and why,
 * clawbacks, set-offs and the payable balance. Never any Stripe fee (13.1).
 * With `meta`, the header carries what a self-billed invoice needs; the
 * exact self-billing and VAT wording is for OMS's accountant (placeholders).
 */
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
    heldReason?: string | null;
  }>,
  meta?: StatementMeta,
): string {
  const pounds = (p: number) => (p / 100).toFixed(2);
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head =
    "Referred Host,Status,Paid Months used,Net Receipts (£),Commission (£),Launch Bonus (£),Held (£),Held because,Clawback (£)";
  const body = rows.map((r) =>
    [
      esc(r.host),
      esc(r.status),
      r.paidMonths,
      pounds(r.netReceiptsPence),
      pounds(r.commissionPence),
      pounds(r.bonusPence),
      pounds(r.heldPence),
      esc(r.heldPence ? (r.heldReason ?? HOLD_WORDS["hold_period"]!) : ""),
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
  const table = [
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
      "",
      pounds(total.k),
    ].join(","),
  ];
  if (!meta) return table.join("\n");
  const kv = (k: string, v: string) => `${esc(k)},${esc(v)}`;
  const top = [
    kv(meta.selfBilled ? "Self-billed invoice" : "Statement", meta.number),
    kv("Issued", meta.issuedOn),
    kv(
      "Issued by",
      `${meta.oms.name}${meta.oms.companyNumber ? `, company number ${meta.oms.companyNumber}` : ""}`,
    ),
    kv(
      "OMS address",
      meta.oms.address || "[OMS registered address: set in Latchkey admin → Site settings → Legal]",
    ),
    ...(meta.oms.vatNumber ? [kv("OMS VAT number", meta.oms.vatNumber)] : []),
    kv("Commission Partner", meta.partner.name),
    kv("Partner address", meta.partner.address || "[not given]"),
    ...(meta.partner.vatNumber ? [kv("Partner VAT number", meta.partner.vatNumber)] : []),
    ...(meta.selfBilled
      ? [
          kv(
            "Self-billing",
            "[Self-billing statement wording: to be confirmed by OMS's accountant]",
          ),
          ...(meta.partner.vatNumber
            ? [
                kv(
                  "VAT",
                  "[VAT wording for self-billed invoices: to be confirmed by OMS's accountant]",
                ),
              ]
            : []),
        ]
      : [
          kv(
            "Self-billing",
            "The Commission Partner opted out: OMS pays against the partner's own invoice, which must match this statement (12.7(c)).",
          ),
        ]),
    "",
  ];
  const bottom = [
    "",
    kv("Set-off this month (£)", pounds(meta.setOffPence)),
    kv("Payable balance after clawbacks and set-off (£)", pounds(meta.payablePence)),
    kv("Paid this month (£)", pounds(meta.paidPence)),
    kv("Stripe fees", "None deducted by OMS (13.1)."),
  ];
  return [...top, ...table, ...bottom].join("\n");
}

/** The statement number: per partner and month, never reused. */
export function statementNumber(
  referralCode: string | null,
  partnerId: string,
  month: string,
): string {
  return `SB-${(referralCode ?? partnerId.slice(0, 8)).toUpperCase()}-${month.replace("-", "")}`;
}

/** The cut-off before which IP and device hashes are cleared (D21, 8.5). */
export function hashPurgeBefore(now: number, days: number): string {
  return new Date(now - days * 86_400_000).toISOString();
}
