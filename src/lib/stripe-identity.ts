/**
 * Telling Stripe accounts apart. Hosts, and Latchkey's super admins, need to
 * see which Stripe account takes a business's payments: its name, its
 * account ID (acct_…, the one thing that never changes and that Stripe shows
 * in its own dashboard under Settings → Business → Account details), its
 * email and country, live or test, and what guests see on their card
 * statement. Pure: the Stripe calls live in payments.functions.ts.
 */

import { appError } from "@/lib/app-error";
import { rebrand } from "@/lib/brand";

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
export function stripeDashboardUrl(
  kind: "connected" | "own",
  id: string | null,
  live: boolean,
): string {
  const test = live ? "" : "/test";
  if (kind === "connected" && id)
    return `https://dashboard.stripe.com${test}/connect/accounts/${encodeURIComponent(id)}`;
  return `https://dashboard.stripe.com${test}/settings/account`;
}

/**
 * What Latchkey's own Stripe key must be allowed to do when it's a restricted
 * key (rk_). Hosts never paste keys: connecting a host creates their account
 * and its sign-up link with this key, and guest payments are made in the
 * host's account with it too.
 */
export const RESTRICTED_KEY_NEEDS: Array<{
  resource: string;
  access: "Read" | "Write";
  why: string;
}> = [
  {
    resource: "Connect → Accounts",
    access: "Write",
    why: "create each host's Stripe account and its sign-up link, and check it",
  },
  {
    resource: "Checkout Sessions",
    access: "Write",
    why: "guest card payments (in the host's account) and subscriptions",
  },
  { resource: "Products", access: "Write", why: "price lists sent to hosts' accounts" },
  { resource: "Prices", access: "Write", why: "price lists sent to hosts' accounts" },
  { resource: "Subscriptions", access: "Write", why: "hosts' Latchkey plans" },
  { resource: "Customer portal", access: "Write", why: "hosts managing their plan" },
];

/** Stripe refusing because of Latchkey's own set-up, not anything the host did. */
export function stripeSetupProblem(message: string): "permission" | "connect_off" | null {
  if (
    /does not have the required permissions|connected_account_write|_write'?\)? permissions/i.test(
      message,
    )
  )
    return "permission";
  if (
    /signed up for Connect|sign up for Connect|platform profile|Connect.*(not|isn't) enabled/i.test(
      message,
    )
  )
    return "connect_off";
  return null;
}

/**
 * A Stripe refusal as an error a host can act on: plain words, next steps,
 * Stripe's own message folded away as the details.
 */
export function stripeFailure(e: unknown, action: string): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("LKERR:")) return e instanceof Error ? e : new Error(msg);
  const setup = stripeSetupProblem(msg);
  return appError({
    code: setup ? `stripe_${setup}` : "stripe_refused",
    title: `${action} didn't work`,
    body: setup
      ? rebrand(
          "This is on Latchkey's side, not yours: Latchkey's Stripe set-up needs a change. Nothing is wrong with your details.",
        )
      : "Stripe, which handles card payments, didn't accept the request. This usually clears if you try again.",
    steps: setup
      ? [
          { text: rebrand("Press Send to Latchkey support below so we know.") },
          { text: "We'll email you when it's fixed; then try again." },
        ]
      : [
          { text: "Wait a minute and try again." },
          { text: rebrand("If it happens again, press Send to Latchkey support below.") },
        ],
    detail: msg,
  });
}
