/**
 * Telling Stripe accounts apart. Hosts, and Latchkey's super admins, need to
 * see which Stripe account takes a business's payments: its name, its
 * account ID (acct_…, the one thing that never changes and that Stripe shows
 * in its own dashboard under Settings → Business → Account details), its
 * email and country, live or test, and what guests see on their card
 * statement. Pure: the Stripe calls live in payments.functions.ts.
 */

export type StripeAccountRaw = {
  id: string;
  email?: string | null;
  country?: string | null;
  default_currency?: string | null;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  business_profile?: { name?: string | null; url?: string | null } | null;
  settings?: {
    dashboard?: { display_name?: string | null } | null;
    payments?: { statement_descriptor?: string | null } | null;
  } | null;
};

export type StripeIdentity = {
  id: string;
  name: string | null;
  email: string | null;
  country: string | null;
  currency: string | null;
  statement: string | null;
  charges: boolean;
  payouts: boolean;
  submitted: boolean;
  live: boolean;
};

/** What we show for an account Stripe returned. */
export function identityOf(a: StripeAccountRaw, live: boolean): StripeIdentity {
  const s = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    id: a.id,
    name: s(a.settings?.dashboard?.display_name) ?? s(a.business_profile?.name),
    email: s(a.email),
    country: s(a.country)?.toUpperCase() ?? null,
    currency: s(a.default_currency)?.toUpperCase() ?? null,
    statement: s(a.settings?.payments?.statement_descriptor),
    charges: !!a.charges_enabled,
    payouts: !!a.payouts_enabled,
    submitted: !!a.details_submitted,
    live,
  };
}

/** acct_1AbCdEfGhIjKlMnO → "acct_…KlMnO": enough to tell accounts apart at a glance. */
export function shortAccount(id: string | null | undefined): string {
  if (!id) return "";
  if (!/^acct_[A-Za-z0-9]+$/.test(id) || id.length <= 12) return id;
  return `acct_…${id.slice(-5)}`;
}

/**
 * Where to look in Stripe. The platform (Latchkey's account) can open any
 * connected account from its Connect list; a host opens their own account's
 * details page after signing in to Stripe, which shows the same acct_ ID.
 */
export function stripeDashboardUrl(kind: "connected" | "own", id: string | null, live: boolean): string {
  const test = live ? "" : "/test";
  if (kind === "connected" && id) return `https://dashboard.stripe.com${test}/connect/accounts/${encodeURIComponent(id)}`;
  return `https://dashboard.stripe.com${test}/settings/account`;
}
