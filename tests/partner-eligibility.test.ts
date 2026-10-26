/**
 * Commission Partner countries and payout routes (9.3, D2), readable codes,
 * and the Express account body (full service agreement, no on_behalf_of).
 */
import { describe, expect, it } from "vitest";

import { PARTNER_DEFAULTS, partnerConfig } from "../src/lib/partner-config";
import {
  eligibilityFor,
  expressAccountBody,
  makeReferralCode,
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

  it("asks Stripe for a full service agreement and transfers only", () => {
    const b = expressAccountBody({ id: "p1", country: "IE", email: "a@b.ie" });
    expect(b.tos_acceptance.service_agreement).toBe("full");
    expect(b.capabilities).toEqual({ transfers: { requested: true } });
    expect(b.controller.stripe_dashboard.type).toBe("express");
    expect(JSON.stringify(b)).not.toContain("on_behalf_of");
  });
});
