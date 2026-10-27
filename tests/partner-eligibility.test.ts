/**
 * Commission Partner countries and payout routes (9.3, D2), readable codes,
 * and the Stripe account (Accounts v2 recipient, Express dashboard, Latchkey
 * liable for fees and losses: Stripe won't take losses on transfer-only accounts).
 */
import { describe, expect, it } from "vitest";

import { PARTNER_DEFAULTS, partnerConfig } from "../src/lib/partner-config";
import {
  canReceiveTransfers,
  eligibilityFor,
  makeReferralCode,
  onboardingLinkBody,
  platformSetupProblem,
  partnerAccountBody,
  payoutModeStatus,
} from "../src/lib/partner-eligibility";

describe("partner eligibility", () => {
  it("pays the UK, EEA, US, Canada and Switzerland through Express", () => {
    for (const c of ["GB", "IE", "FR", "NO", "US", "CA", "CH"])
      expect(eligibilityFor(c, PARTNER_DEFAULTS)).toEqual({
        ok: true,
        route: "express",
        status: "pending_review",
      });
  });

  it("waitlists other countries by default, or follows the chosen route", () => {
    expect(eligibilityFor("IN", PARTNER_DEFAULTS)).toMatchObject({
      ok: true,
      status: "waitlisted",
      route: "none",
    });
    expect(eligibilityFor("IN", partnerConfig({ nonExpressRoute: "hold" }))).toEqual({
      ok: true,
      route: "none",
      status: "pending_review",
    });
    expect(eligibilityFor("IN", partnerConfig({ nonExpressRoute: "manual" }))).toEqual({
      ok: true,
      route: "manual",
      status: "pending_review",
    });
    expect(
      eligibilityFor("IN", partnerConfig({ nonExpressRoute: "global_payouts" })),
    ).toMatchObject({ status: "waitlisted" });
    expect(
      eligibilityFor(
        "IN",
        partnerConfig({ nonExpressRoute: "global_payouts", globalPayoutsEnabled: true }),
      ),
    ).toMatchObject({ route: "global_payouts" });
  });

  it("refuses sanctioned countries and nonsense", () => {
    expect(eligibilityFor("RU", PARTNER_DEFAULTS).ok).toBe(false);
    expect(eligibilityFor("KP", partnerConfig({ nonExpressRoute: "manual" })).ok).toBe(false);
    expect(eligibilityFor("UK!", PARTNER_DEFAULTS).ok).toBe(false);
  });

  it("makes readable codes", () => {
    let i = 0;
    const seq = [0, 0.99, 0.5, 0.25, 0.75];
    const code = makeReferralCode(() => seq[i++ % seq.length]!);
    expect(code).toMatch(/^OMS-[A-HJKMNP-Z2-9]{5}$/);
  });

  it("asks Stripe for an account matching the platform profile", () => {
    const b = partnerAccountBody({
      id: "p1",
      country: "ie",
      email: "a@b.ie",
      kind: "business",
      name: "Acme",
    });
    expect(b.country).toBe("IE");
    expect(b.business_type).toBe("company");
    expect(b.controller).toEqual({
      losses: { payments: "stripe" },
      fees: { payer: "account" },
      stripe_dashboard: { type: "full" },
      requirement_collection: "stripe",
    });
    // Full-dashboard accounts only get transfers alongside card_payments.
    expect(b.capabilities).toEqual({
      card_payments: { requested: true },
      transfers: { requested: true },
    });
    const json = JSON.stringify(b);
    expect(json).not.toContain('"type":"express"');
    expect(json).not.toContain('"application"');
    expect(partnerAccountBody({ id: "p2", country: "GB", email: "x@y.uk" }).business_type).toBe(
      "individual",
    );
  });

  it("onboards on Stripe's page and comes back to /partners", () => {
    const l = onboardingLinkBody("acct_1", "https://x.test");
    expect(l.type).toBe("account_onboarding");
    expect(l.return_url).toBe("https://x.test/partners?stripe=done");
    expect(l.refresh_url).toBe("https://x.test/partners?stripe=refresh");
  });

  it("is payable only with transfers and payouts on and nothing due at Stripe (12.4(b))", () => {
    const ok = { capabilities: { transfers: "active" }, payouts_enabled: true, requirements: { currently_due: [], past_due: [], disabled_reason: null } };
    expect(canReceiveTransfers(ok)).toBe(true);
    expect(canReceiveTransfers({ ...ok, payouts_enabled: false })).toBe(false);
    expect(canReceiveTransfers({ ...ok, capabilities: { transfers: "inactive" } })).toBe(false);
    expect(canReceiveTransfers({ ...ok, requirements: { currently_due: ["individual.dob.day"] } })).toBe(false);
    expect(canReceiveTransfers({ ...ok, requirements: { past_due: ["external_account"] } })).toBe(false);
    expect(canReceiveTransfers({ ...ok, requirements: { disabled_reason: "requirements.past_due" } })).toBe(false);
    expect(canReceiveTransfers({ payouts_enabled: true })).toBe(false);
    expect(canReceiveTransfers(null)).toBe(false);
  });

  it("explains refusals caused by Latchkey's own Connect set-up", () => {
    expect(platformSetupProblem("account_creation_liability_unacknowledged")).toMatch(
      /Connect set-up/,
    );
    expect(platformSetupProblem("accounts_v2_access_blocked")).toMatch(/set-up/);
    expect(platformSetupProblem("email_invalid")).toBeNull();
    expect(platformSetupProblem(null)).toBeNull();
  });

  it("says which Stripe mode partner payouts use and what's left to go live", () => {
    const base = { hasTestKey: true, hasLiveKey: true, allowLive: false, profileConfirmed: false };
    const t = payoutModeStatus(base);
    expect(t.mode).toBe("test");
    expect(t.canSetUp).toBe(true);
    expect(t.toGoLive.join(" ")).toMatch(/PARTNER_PAYOUTS_ALLOW_LIVE/);
    expect(t.toGoLive.join(" ")).toMatch(/D1/);
    expect(t.toGoLive.join(" ")).not.toMatch(/live Stripe secret key/);

    const noD1 = payoutModeStatus({ ...base, allowLive: true });
    expect(noD1.mode).toBe("live");
    expect(noD1.canSetUp).toBe(false);

    const live = payoutModeStatus({ ...base, allowLive: true, profileConfirmed: true });
    expect(live).toMatchObject({ mode: "live", canSetUp: true, toGoLive: [] });

    // Allowed but no live key: the test key is still used.
    expect(payoutModeStatus({ ...base, hasLiveKey: false, allowLive: true }).mode).toBe("test");
    expect(payoutModeStatus({ ...base, hasTestKey: false }).mode).toBe("off");
    expect(payoutModeStatus({ ...base, hasTestKey: false, hasLiveKey: false }).summary).toMatch(
      /no Stripe key/,
    );
  });
});
