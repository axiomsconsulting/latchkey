/**
 * Commission Partner programme settings (agreement draft v0.5). Pure: no I/O.
 *
 * Everything the code needs reads through partnerConfig(), which starts from
 * the defaults below and takes the super admin's overrides
 * (site_settings.commission_partner_programme, read on the server with the
 * service role). The standard rate and the Sign-up Bonus never come from
 * here: they come from the commission_terms row snapshotted onto each
 * referral (6.5). Launch Bonus rate campaigns (7.11) do live here, and the
 * rate they give is fixed on the referral at the host's first payment. The
 * DEFAULT_* values only seed that table and the tests.
 *
 * Values marked TODO(Dx) are open business decisions with the safe default
 * from the build prompt; values citing a clause are fixed by the agreement.
 */

import { DEFAULT_CAMPAIGNS, normaliseCampaigns, type RateCampaign } from "./rate-campaigns";

/** 10% (agreement 6.2). Seed and tests only. */
export const DEFAULT_RATE_BPS = 1000;
/** 12 Paid Months per Referred Host (agreement 6.3, 6.8). Seed and tests only. */
export const DEFAULT_PAID_MONTHS_CAP = 12;

/** The 30-day free trial the agreement names (clause 3, 6.3, 6.4(c)). The real length comes from platform_pricing.trial_days. */
export const AGREEMENT_TRIAL_DAYS = 30;

/** UK, US, Canada, Switzerland and the EEA (EU-27 + Iceland, Liechtenstein, Norway): Stripe Express with a full service agreement. */
export const EXPRESS_COUNTRIES: readonly string[] = [
  "GB",
  "US",
  "CA",
  "CH",
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
];

/**
 * Countries no Commission Partner can be accepted from, whatever the route.
 * TODO(adviser): confirm against the current UK sanctions list.
 */
export const BLOCKED_COUNTRIES: readonly string[] = ["BY", "CU", "IR", "KP", "RU", "SY"];

export type NonExpressRoute = "waitlist" | "hold" | "manual" | "global_payouts";
export type PayoutCadence = "monthly" | "quarterly";
export type LateCodeEntry = "never" | "until_first_paid_invoice" | "window_only";
export type BonusDedupeScope = "owner_identity" | "business";
export type BonusPartialRefund = "full" | "proportional";
export type AnnualAfterMonthly = "pro_rata_remaining" | "none";
export type ClawbackMethod = "offset_only" | "offset_then_reversal";
export type StrongMatchAction = "auto_reject_with_override" | "review";

export type PartnerConfig = {
  currency: "gbp";
  attributionWindowDays: number;
  stripePlatformProfileConfirmed: boolean;
  expressCountries: readonly string[];
  blockedCountries: readonly string[];
  nonExpressRoute: NonExpressRoute;
  globalPayoutsEnabled: boolean;
  globalPayoutsApiVersion: string;
  minPayoutPence: number;
  payoutCadence: PayoutCadence;
  maxFeeRatioBps: number | null;
  agreementAllowsNonMonthly: boolean;
  payoutDueDaysAfterMonthEnd: number;
  lateCodeEntry: LateCodeEntry;
  bonusDedupeScope: BonusDedupeScope;
  requireListingUrl: boolean;
  listingAutoCheck: boolean;
  requirePhoneOtp: boolean;
  holdDays: number;
  bonusFirstPaymentDeadlineDays: number;
  bonusPartialRefund: BonusPartialRefund;
  qpReplacedAfterReversal: boolean;
  annualAfterMonthly: AnnualAfterMonthly;
  clawbackMethod: ClawbackMethod;
  writeOffBelowPence: number;
  repaymentRequestAfterDays: number;
  fraudBurstCount: number;
  fraudBurstHours: number;
  fraudDisputeRateBps: number;
  fraudWindowDays: number;
  hostCanBePartner: boolean;
  reviewRequired: boolean;
  raisesApplyToExisting: boolean;
  postStopSignupCounts: boolean;
  postStopPaymentDeadlineDays: number;
  postStopResumeCounts: boolean;
  strongMatchAction: StrongMatchAction;
  ipHashRetentionDays: number;
  /** The programme's public launch (agreement Annex B, clause 9). YYYY-MM-DD, or null: "to be confirmed". */
  launchDate: string | null;
  /** Where partners send notices to OMS (agreement 21.2, 23.2). Signing stays closed until it is set. */
  noticeEmail: string | null;
  /** The join page takes applications (Phase 0). Off: a "coming soon" page; super admins can preview. */
  signupsOpen: boolean;
  /** Partner ID and selfie photos are kept for review (agreement 17.1). Off: only the details read are kept. */
  idImagesStored: boolean;
  /** Higher-rate campaigns such as the Launch Bonus (agreement 7.11-7.13; src/lib/rate-campaigns.ts). Saved only through saveRateCampaigns. */
  rateCampaigns: RateCampaign[];
};

export const PARTNER_DEFAULTS: PartnerConfig = {
  // Commission is worked out and paid in pounds only (agreement 9.4).
  currency: "gbp",
  // From the first click, or from when the code is first recorded (agreement clause 3).
  attributionWindowDays: 60,
  // TODO(D1): Swapnil to decide. While false, live Express accounts are never created, even with live allowed.
  stripePlatformProfileConfirmed: false,
  expressCountries: EXPRESS_COUNTRIES,
  blockedCountries: BLOCKED_COUNTRIES,
  // TODO(D2): Swapnil to decide. "hold" would match 9.3(c) literally.
  nonExpressRoute: "waitlist",
  // TODO(D2): Swapnil to decide. Also needs PARTNER_GLOBAL_PAYOUTS_ENABLED="true" and GLOBAL_PAYOUTS_FINANCIAL_ACCOUNT_ID.
  globalPayoutsEnabled: false,
  // Check against https://docs.stripe.com/global-payouts/send-money before use.
  globalPayoutsApiVersion: "2026-09-30.preview",
  // £10 (agreement 9.4).
  minPayoutPence: 1000,
  // TODO(D3): Swapnil to decide. Monthly is what 9.4 says; quarterly would breach it.
  payoutCadence: "monthly",
  // TODO(D3): Swapnil to decide. Off; holding payouts for fees would breach 9.4.
  maxFeeRatioBps: null,
  // TODO(D3): Swapnil to decide. While false, quarterly payouts and the fee-ratio hold are refused.
  agreementAllowsNonMonthly: false,
  // Paid within 30 days of the end of the month the amounts became payable (agreement 9.4).
  payoutDueDaysAfterMonthEnd: 30,
  // TODO(D6): Swapnil to decide. The Sign-up Date is account creation through the link or code (clause 3, 8.1).
  lateCodeEntry: "never",
  // TODO(D7): Swapnil to decide. 6.4: no second bonus for "any new account for the same person or business".
  bonusDedupeScope: "owner_identity",
  // TODO(D8): Swapnil to decide. Checked by hand, no Firecrawl.
  requireListingUrl: true,
  listingAutoCheck: false,
  // TODO(D9): Swapnil to decide.
  requirePhoneOtp: false,
  // TODO(D10): Swapnil to decide (9.2 brackets 30, 45 or 60). Commission: from its payment; bonus: from the end of the first Paid Month (9.2).
  holdDays: 45,
  // TODO(D23): Swapnil to decide (6.4(b) brackets 60). Copied into each referral's snapshot.
  bonusFirstPaymentDeadlineDays: 60,
  // TODO(D18): Swapnil to decide. Full refunds and chargebacks of the Qualifying Payment always cancel the bonus (6.7(b)).
  bonusPartialRefund: "full",
  // TODO(D26): Swapnil to decide.
  qpReplacedAfterReversal: false,
  // TODO(D24): Swapnil to decide.
  annualAfterMonthly: "pro_rata_remaining",
  // TODO(D11): Swapnil to decide.
  clawbackMethod: "offset_only",
  // TODO(D11): Swapnil to decide. 0 = never written off.
  writeOffBelowPence: 0,
  // "Within 3 months" (agreement 6.7(c)).
  repaymentRequestAfterDays: 90,
  // TODO(D12): Swapnil to decide.
  fraudBurstCount: 5,
  fraudBurstHours: 24,
  fraudDisputeRateBps: 1000,
  fraudWindowDays: 90,
  // TODO(D13): Swapnil to decide.
  hostCanBePartner: false,
  // Every referral starts in review (8.5 allows holding it while checked).
  reviewRequired: true,
  // Agreement 6.5: increases reach existing referrals only by a terms row with a written-notice reference.
  raisesApplyToExisting: false,
  // Agreement v1.0 20.3(b): no Commission on a host whose Qualifying Payment is on or after the Stop Date. Keep off.
  postStopSignupCounts: false,
  postStopPaymentDeadlineDays: 60,
  // Agreement v1.0 20.3(a): after the Stop Date, a missed payment ends Commission on that host for good. Keep off.
  postStopResumeCounts: false,
  // TODO(D20): Swapnil to decide.
  strongMatchAction: "auto_reject_with_override",
  // TODO(D21): Swapnil to decide; the privacy notice must say the same (8.5).
  ipHashRetentionDays: 180,
  launchDate: null,
  noticeEmail: null,
  // Closed until the super admin opens it (Latchkey admin → Commission Partners → Programme decisions).
  signupsOpen: false,
  idImagesStored: true,
  rateCampaigns: DEFAULT_CAMPAIGNS,
};

const ENUMS: Partial<Record<keyof PartnerConfig, readonly string[]>> = {
  nonExpressRoute: ["waitlist", "hold", "manual", "global_payouts"],
  payoutCadence: ["monthly", "quarterly"],
  lateCodeEntry: ["never", "until_first_paid_invoice", "window_only"],
  bonusDedupeScope: ["owner_identity", "business"],
  bonusPartialRefund: ["full", "proportional"],
  annualAfterMonthly: ["pro_rata_remaining", "none"],
  clawbackMethod: ["offset_only", "offset_then_reversal"],
  strongMatchAction: ["auto_reject_with_override", "review"],
};

/** Settings an override may never change: fixed by the agreement, Stripe, or the hard rules of the build. */
const FIXED = new Set<keyof PartnerConfig>([
  "currency",
  "expressCountries",
  "blockedCountries",
  "raisesApplyToExisting",
  "globalPayoutsApiVersion",
]);

/**
 * The programme's settings: the defaults, with any valid overrides from the
 * super admin. Unknown keys, wrong types, out-of-range numbers and fixed
 * settings are ignored, so a bad saved value can't change how money moves.
 */
export function partnerConfig(overrides?: unknown): PartnerConfig {
  const out: PartnerConfig = { ...PARTNER_DEFAULTS };
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return out;
  for (const [k, v] of Object.entries(overrides as Record<string, unknown>)) {
    const key = k as keyof PartnerConfig;
    if (!(key in PARTNER_DEFAULTS) || FIXED.has(key)) continue;
    const base = PARTNER_DEFAULTS[key];
    const allowed = ENUMS[key];
    if (allowed) {
      if (typeof v === "string" && allowed.includes(v)) (out as Record<string, unknown>)[key] = v;
    } else if (key === "launchDate") {
      if (v === null || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)))
        out.launchDate = v;
    } else if (key === "rateCampaigns") {
      if (Array.isArray(v)) out.rateCampaigns = normaliseCampaigns(v);
    } else if (key === "noticeEmail") {
      if (v === null || v === "") out.noticeEmail = null;
      else if (
        typeof v === "string" &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) &&
        v.length <= 254
      )
        out.noticeEmail = v.trim().toLowerCase();
    } else if (key === "maxFeeRatioBps") {
      if (v === null || (typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 10_000))
        out.maxFeeRatioBps = v;
    } else if (typeof base === "boolean") {
      if (typeof v === "boolean") (out as Record<string, unknown>)[key] = v;
    } else if (typeof base === "number") {
      if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1_000_000)
        (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}

/** A warning for the admin when the billing trial isn't the 30 days the agreement names (null when it matches). */
export function trialDaysWarning(trialDays: number): string | null {
  return trialDays === AGREEMENT_TRIAL_DAYS
    ? null
    : `The free trial is ${trialDays} days, but the Commission Partner agreement says 30. Update one of them so they match.`;
}

/**
 * Stripe fees, for the admin's estimate only. Never charged by Latchkey and
 * never taken from a partner's amount (9.4). Estimate: check Stripe's
 * pricing pages (Connect and Global Payouts, UK) before relying on them.
 */
export const FEE_TABLE = {
  connect: {
    /** Per connected account with a payout that month. */
    activeAccountPence: 200,
    payoutBps: 25,
    payoutFixedPence: 10,
    /** Cross-border, from; waived between the UK and the EEA. */
    crossBorderBps: 25,
  },
  globalPayouts: {
    payoutFixedPence: 50,
    crossBorderBpsMin: 25,
    crossBorderBpsMax: 125,
    /** Currency conversion between GBP, EUR and USD; 2% for others. */
    fxMajorBps: 50,
    fxOtherBps: 200,
  },
} as const;

export type FeeTable = typeof FEE_TABLE;
