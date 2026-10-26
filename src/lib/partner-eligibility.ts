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

/** The body for a Commission Partner's Express account (controller properties, full service agreement, transfers only). */
export function expressAccountBody(p: { id: string; country: string; email: string }) {
  return {
    country: p.country,
    email: p.email,
    controller: {
      stripe_dashboard: { type: "express" },
      fees: { payer: "application" },
      losses: { payments: "application" },
      requirement_collection: "stripe",
    },
    capabilities: { transfers: { requested: true } },
    tos_acceptance: { service_agreement: "full" },
    metadata: { partner_id: p.id, kind: "commission_partner" },
  };
}
