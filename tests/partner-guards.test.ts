/**
 * Commission Partner Stripe calls stay in test mode: a live key alone is
 * refused, a test key wins over a live one, live only with the explicit flag,
 * and money-moving calls carry an Idempotency-Key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PARTNER_DEFAULTS, partnerConfig, trialDaysWarning } from "../src/lib/partner-config";
import { PartnerStripeLiveBlocked, PartnerStripeNotSetUp, partnerStripeKey, partnerStripeMode, v1, v2 } from "../src/lib/partner-stripe.server";

const ENV = ["STRIPE_TEST_API_KEY", "STRIPE_LIVE_API_KEY", "STRIPE_SECRET_KEY", "PARTNER_PAYOUTS_ALLOW_LIVE"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

describe("partner Stripe key", () => {
  it("refuses a live key on its own", () => {
    process.env["STRIPE_LIVE_API_KEY"] = "sk_live_abc";
    expect(() => partnerStripeKey()).toThrow(PartnerStripeLiveBlocked);
    delete process.env["STRIPE_LIVE_API_KEY"];
    process.env["STRIPE_SECRET_KEY"] = "rk_live_abc";
    expect(() => partnerStripeKey()).toThrow(PartnerStripeLiveBlocked);
  });

  it("refuses a 'test' variable that holds a live key", () => {
    process.env["STRIPE_TEST_API_KEY"] = "sk_live_oops";
    expect(() => partnerStripeKey()).toThrow(PartnerStripeLiveBlocked);
  });

  it("says when nothing is set up", () => {
    expect(() => partnerStripeKey()).toThrow(PartnerStripeNotSetUp);
  });

  it("uses the test key when both are there", () => {
    process.env["STRIPE_TEST_API_KEY"] = "sk_test_abc";
    process.env["STRIPE_LIVE_API_KEY"] = "sk_live_abc";
    expect(partnerStripeKey()).toBe("sk_test_abc");
    expect(partnerStripeMode()).toBe("test");
  });

  it("allows live only with PARTNER_PAYOUTS_ALLOW_LIVE exactly 'true'", () => {
    process.env["STRIPE_LIVE_API_KEY"] = "sk_live_abc";
    process.env["PARTNER_PAYOUTS_ALLOW_LIVE"] = "yes";
    expect(() => partnerStripeKey()).toThrow(PartnerStripeLiveBlocked);
    process.env["PARTNER_PAYOUTS_ALLOW_LIVE"] = "true";
    expect(partnerStripeKey()).toBe("sk_live_abc");
    expect(partnerStripeMode()).toBe("live");
  });

  it("never puts the key in an error message", () => {
    process.env["STRIPE_LIVE_API_KEY"] = "sk_live_secretvalue";
    try {
      partnerStripeKey();
    } catch (e) {
      expect(String(e)).not.toContain("secretvalue");
    }
  });
});

describe("partner Stripe calls", () => {
  beforeEach(() => {
    process.env["STRIPE_TEST_API_KEY"] = "sk_test_abc";
  });

  it("sends the Idempotency-Key and connected account on v1", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "tr_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await v1<{ id: string }>("/transfers", { amount: 1000, currency: "gbp", destination: "acct_1" }, { idempotencyKey: "payout_1" });
    expect(out.id).toBe("tr_1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/transfers");
    const h = init.headers as Record<string, string>;
    expect(h["Idempotency-Key"]).toBe("payout_1");
    expect(h["Authorization"]).toBe("Bearer sk_test_abc");
    expect(String(init.body)).toBe("amount=1000&currency=gbp&destination=acct_1");
    await v1("/balance", undefined, { account: "acct_9" });
    const h2 = (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(h2["Stripe-Account"]).toBe("acct_9");
    expect(h2["Idempotency-Key"]).toBeUndefined();
  });

  it("sends JSON with the Stripe-Version on v2", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "obp_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await v2("/money_management/outbound_payments", { amount: { value: 1000, currency: "gbp" } }, { version: "2026-09-30.preview", idempotencyKey: "gp_1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v2/money_management/outbound_payments");
    const h = init.headers as Record<string, string>;
    expect(h["Stripe-Version"]).toBe("2026-09-30.preview");
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["Idempotency-Key"]).toBe("gp_1");
    expect(JSON.parse(String(init.body))).toEqual({ amount: { value: 1000, currency: "gbp" } });
  });

  it("raises Stripe's message without the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "No such destination", code: "resource_missing" } }), { status: 400 })));
    await expect(v1("/transfers", { amount: 1 })).rejects.toThrow("No such destination");
  });

  it("makes no call at all when the key is refused", async () => {
    delete process.env["STRIPE_TEST_API_KEY"];
    process.env["STRIPE_LIVE_API_KEY"] = "sk_live_abc";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(v1("/transfers", { amount: 1 }, { idempotencyKey: "x" })).rejects.toThrow(PartnerStripeLiveBlocked);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("partner config", () => {
  it("keeps the agreement's defaults", () => {
    const c = partnerConfig();
    expect(c.holdDays).toBe(45);
    expect(c.minPayoutPence).toBe(1000);
    expect(c.currency).toBe("gbp");
    expect(c.raisesApplyToExisting).toBe(false);
    expect(c.postStopSignupCounts).toBe(false);
    expect(c.globalPayoutsEnabled).toBe(false);
  });

  it("takes valid overrides and ignores bad or fixed ones", () => {
    const c = partnerConfig({ holdDays: 30, nonExpressRoute: "hold", payoutCadence: "weekly", currency: "usd", raisesApplyToExisting: true, maxFeeRatioBps: -5, nope: 1, minPayoutPence: "5" });
    expect(c.holdDays).toBe(30);
    expect(c.nonExpressRoute).toBe("hold");
    expect(c.payoutCadence).toBe("monthly");
    expect(c.currency).toBe("gbp");
    expect(c.raisesApplyToExisting).toBe(false);
    expect(c.maxFeeRatioBps).toBeNull();
    expect(c.minPayoutPence).toBe(PARTNER_DEFAULTS.minPayoutPence);
    expect(partnerConfig("junk")).toEqual(PARTNER_DEFAULTS);
  });

  it("warns when the trial isn't the agreement's 30 days", () => {
    expect(trialDaysWarning(30)).toBeNull();
    expect(trialDaysWarning(14)).toMatch(/14 days/);
  });
});
