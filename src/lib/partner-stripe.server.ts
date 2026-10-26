/**
 * Stripe calls for the Commission Partner programme. Server only.
 *
 * Kept apart from stripe.server.ts on purpose: that client prefers a live key
 * when one exists (host subscriptions and guest payments), while partner
 * payouts are built and tested in Stripe's test mode. Here the test key
 * (STRIPE_TEST_API_KEY, which must contain "_test_") is the only key used,
 * unless PARTNER_PAYOUTS_ALLOW_LIVE is exactly "true". Without that flag a
 * live-only set-up refuses with PartnerStripeLiveBlocked instead of moving
 * real money. Keys are never logged or put in error messages.
 *
 * Every POST that moves money (transfers, reversals, outbound payments)
 * passes an Idempotency-Key, so a retry can't pay twice.
 */
import { form } from "./stripe.server";

const V1 = "https://api.stripe.com/v1";
const V2 = "https://api.stripe.com/v2";

export class PartnerStripeLiveBlocked extends Error {
  constructor() {
    super(
      "Commission Partner payouts only run in Stripe test mode. Add STRIPE_TEST_API_KEY (a test key), or have Latchkey's admin allow live payouts.",
    );
    this.name = "PartnerStripeLiveBlocked";
  }
}

export class PartnerStripeNotSetUp extends Error {
  constructor() {
    super("Stripe isn't set up for Commission Partner payouts yet: add STRIPE_TEST_API_KEY.");
    this.name = "PartnerStripeNotSetUp";
  }
}

export class PartnerStripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "PartnerStripeError";
  }
}

const isLiveKey = (k: string | undefined): k is string =>
  !!k && (k.startsWith("sk_live_") || k.startsWith("rk_live_") || k.includes("_live_"));
const isTestKey = (k: string | undefined): k is string => !!k && k.includes("_test_");

export function liveAllowed(): boolean {
  return process.env["PARTNER_PAYOUTS_ALLOW_LIVE"] === "true";
}

/**
 * The key for partner calls: the test key; a live key only when
 * PARTNER_PAYOUTS_ALLOW_LIVE === "true" (and then the live key wins, as the
 * flag is the deliberate switch to real money).
 */
export function partnerStripeKey(): string {
  const test = process.env["STRIPE_TEST_API_KEY"];
  const live = [process.env["STRIPE_LIVE_API_KEY"], process.env["STRIPE_SECRET_KEY"]].find(
    isLiveKey,
  );
  if (liveAllowed() && live) return live;
  if (isTestKey(test)) return test;
  if (live || test) throw new PartnerStripeLiveBlocked();
  throw new PartnerStripeNotSetUp();
}

export function partnerStripeMode(): "test" | "live" {
  return isTestKey(partnerStripeKey()) ? "test" : "live";
}

type CallOptions = {
  method?: "GET" | "POST" | "DELETE";
  idempotencyKey?: string;
  account?: string | null;
};

async function send<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string };
  };
  if (!res.ok)
    throw new PartnerStripeError(
      json?.error?.message ?? "Stripe didn't accept that request.",
      res.status,
      json?.error?.code ?? null,
    );
  return json as T;
}

/** Stripe's v1 API (form-encoded). `account` makes the call on a connected account. */
export async function v1<T>(
  path: string,
  body?: Record<string, unknown>,
  opts: CallOptions = {},
): Promise<T> {
  const method = opts.method ?? (body ? "POST" : "GET");
  return send<T>(`${V1}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${partnerStripeKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(opts.account ? { "Stripe-Account": opts.account } : {}),
      ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
    },
    ...(body && method === "POST" ? { body: form(body).toString() } : {}),
  });
}

/** Stripe's v2 API (JSON, a pinned preview version), used by Global Payouts. */
export async function v2<T>(
  path: string,
  json?: Record<string, unknown>,
  opts: CallOptions & { version: string } = { version: "" },
): Promise<T> {
  const method = opts.method ?? (json ? "POST" : "GET");
  if (!opts.version) throw new Error("A Stripe-Version is needed for v2 calls.");
  return send<T>(`${V2}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${partnerStripeKey()}`,
      "Content-Type": "application/json",
      "Stripe-Version": opts.version,
      ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
    },
    ...(json && method === "POST" ? { body: JSON.stringify(json) } : {}),
  });
}
