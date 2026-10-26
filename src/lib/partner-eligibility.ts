/**
 * Who can be a Commission Partner from where, and how they'd be paid
 * (agreement 9.3; Stripe Connect cross-border rules). Pure.
 *
 * The UK, US, Canada, Switzerland and the EEA are paid through Stripe Express
 * accounts on a full service agreement (cross-border payouts need "full").
 * Anywhere else follows NON_EXPRESS_ROUTE (D2): a waiting list by default,
 * or accepted with the balance held (9.3(c)), paid by hand, or Global
 * Payouts once it's switched on. Sanctioned countries are never accepted.
 */
import type { PartnerConfig } from "./partner-config";

export type Eligibility =
  | { ok: true; route: "express" | "manual" | "global_payouts" | "none"; status: "pending_review" }
  | { ok: true; route: "none"; status: "waitlisted"; message: string }
  | { ok: false; message: string };

export function eligibilityFor(
  country: string,
  config: Pick<
    PartnerConfig,
    "expressCountries" | "blockedCountries" | "nonExpressRoute" | "globalPayoutsEnabled"
  >,
): Eligibility {
  const c = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return { ok: false, message: "Choose the country you're based in." };
  if (config.blockedCountries.includes(c))
    return { ok: false, message: "We can't accept Commission Partners from this country." };
  if (config.expressCountries.includes(c))
    return { ok: true, route: "express", status: "pending_review" };
  const waitlist = {
    ok: true as const,
    route: "none" as const,
    status: "waitlisted" as const,
    message:
      "Commission Partners in your country are on a waiting list for now. We'll email you when we can pay partners there.",
  };
  switch (config.nonExpressRoute) {
    case "hold":
      return { ok: true, route: "none", status: "pending_review" };
    case "manual":
      return { ok: true, route: "manual", status: "pending_review" };
    case "global_payouts":
      return config.globalPayoutsEnabled
        ? { ok: true, route: "global_payouts", status: "pending_review" }
        : waitlist;
    default:
      return waitlist;
  }
}

// No 0/O, 1/I/L: codes are read aloud and typed from cards.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A readable referral code, OMS-XXXXX. `random` returns 0 ≤ n < 1 (crypto in production). */
export function makeReferralCode(random: () => number, prefix = "OMS"): string {
  let s = "";
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)]!;
  return `${prefix}-${s}`;
}

/**
 * A Commission Partner's Stripe account (Accounts v1), matching Latchkey's
 * Connect platform profile: Stripe covers losses, the account pays its own
 * Stripe fees, full Stripe dashboard, Stripe-hosted onboarding. It only asks
 * for the transfers capability (receives /v1/transfers, never takes card
 * payments). The controller must match the profile, or Stripe refuses it.
 */
export function partnerAccountBody(p: {
  id: string;
  country: string;
  email: string;
  kind?: string | null;
  name?: string | null;
}) {
  return {
    country: p.country.toUpperCase(),
    email: p.email,
    business_type: p.kind === "business" ? "company" : "individual",
    ...(p.name ? { business_profile: { name: p.name.slice(0, 100) } } : {}),
    controller: {
      losses: { payments: "stripe" },
      fees: { payer: "account" },
      stripe_dashboard: { type: "full" },
      requirement_collection: "stripe",
    },
    capabilities: { transfers: { requested: true } },
    metadata: { partner_id: p.id, kind: "commission_partner" },
  };
}

/** Stripe-hosted onboarding for the partner's account, coming back to /partners. */
export function onboardingLinkBody(account: string, origin: string) {
  return {
    account,
    type: "account_onboarding",
    refresh_url: `${origin}/partners?stripe=refresh`,
    return_url: `${origin}/partners?stripe=done`,
  };
}

type AnyAccount = {
  payouts_enabled?: boolean;
  capabilities?: { transfers?: unknown };
  configuration?: {
    recipient?: {
      capabilities?: { stripe_balance?: { stripe_transfers?: { status?: unknown } } };
    } | null;
  } | null;
};

/**
 * Can Latchkey send this partner a transfer? Accounts v2: the recipient's
 * stripe_transfers capability is active. The v1 view of the same account (as
 * in account.updated): transfers active, or payouts enabled.
 */
export function canReceiveTransfers(acct: AnyAccount | null | undefined): boolean {
  if (!acct) return false;
  if (
    acct.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ===
    "active"
  )
    return true;
  return acct.capabilities?.transfers === "active" || acct.payouts_enabled === true;
}

/** Stripe refusals that mean Latchkey's own Connect set-up isn't finished, in plain words. */
export function platformSetupProblem(code: string | null | undefined): string | null {
  if (!code) return null;
  if (
    code === "accounts_v2_access_blocked" ||
    code === "non_connect_platform_accounts_v2_access_blocked" ||
    code.startsWith("account_creation_liability_unacknowledged") ||
    code.startsWith("account_creation_requirement_collection") ||
    code === "connect_profile_not_submitted" ||
    code === "account_creation_losses_collector_unavailable" ||
    code === "account_controller_express_dash_without_application_losses_or_fees" ||
    code === "platform_registration_required"
  )
    return "Latchkey's Stripe Connect set-up isn't finished, so payouts can't be set up yet. Please let Latchkey know.";
  return null;
}
