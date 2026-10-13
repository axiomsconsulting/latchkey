/**
 * Latchkey's own subscription: trial, paying, ended. Pure, so it can be
 * unit tested; the database's host_has_access() applies the same rule.
 */

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "comped";

export type BillingHost = {
  subscription_status: string;
  trial_ends_at: string | null;
  stripe_subscription_id?: string | null;
};

export type Phase = "trial" | "trial_ended" | "active" | "past_due" | "canceled" | "comped";

export function billingPhase(h: BillingHost, now: Date = new Date()): Phase {
  switch (h.subscription_status) {
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "comped":
      return "comped";
    case "canceled":
      return "canceled";
    default:
      return !h.trial_ends_at || Date.parse(h.trial_ends_at) > now.getTime() ? "trial" : "trial_ended";
  }
}

/** Same rule as host_has_access() in the database. */
export function hasAccess(h: BillingHost, now: Date = new Date()): boolean {
  return ["trial", "active", "past_due", "comped"].includes(billingPhase(h, now));
}

export function trialDaysLeft(h: BillingHost, now: Date = new Date()): number {
  if (!h.trial_ends_at) return 0;
  return Math.max(0, Math.ceil((Date.parse(h.trial_ends_at) - now.getTime()) / 86_400_000));
}

/**
 * When Stripe should take the first payment. Stripe Checkout needs a trial
 * to end at least 48 hours ahead; any less and the first payment is taken
 * now, so nobody gets a free period beyond their trial.
 */
export function stripeTrialEnd(trialEndsAt: string | null, now: Date = new Date()): number | null {
  if (!trialEndsAt) return null;
  const end = Date.parse(trialEndsAt);
  return end - now.getTime() >= 48 * 3_600_000 + 60_000 ? Math.floor(end / 1000) : null;
}

/**
 * Stripe's subscription status in our terms. A subscription in Stripe's own
 * trial already has a card, so it counts as active; anything that has
 * stopped billing ends access.
 */
export function fromStripeStatus(s: string): SubscriptionStatus {
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due") return "past_due";
  return "canceled";
}
