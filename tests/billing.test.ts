import { describe, expect, it } from "vitest";

import {
  billingPhase,
  fromStripeStatus,
  hasAccess,
  stripeTrialEnd,
  trialDaysLeft,
} from "../src/lib/billing";

const now = new Date("2026-10-13T12:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

describe("billing", () => {
  it("gives access during the trial and stops the moment it ends", () => {
    expect(hasAccess({ subscription_status: "trialing", trial_ends_at: inDays(3) }, now)).toBe(
      true,
    );
    expect(
      billingPhase({ subscription_status: "trialing", trial_ends_at: inDays(-0.001) }, now),
    ).toBe("trial_ended");
    expect(hasAccess({ subscription_status: "trialing", trial_ends_at: inDays(-0.001) }, now)).toBe(
      false,
    );
  });
  it("ends access when cancelled, keeps it while paying", () => {
    expect(hasAccess({ subscription_status: "canceled", trial_ends_at: inDays(20) }, now)).toBe(
      false,
    );
    expect(hasAccess({ subscription_status: "active", trial_ends_at: inDays(-90) }, now)).toBe(
      true,
    );
    expect(hasAccess({ subscription_status: "past_due", trial_ends_at: null }, now)).toBe(true);
  });
  it("counts trial days left", () => {
    expect(
      trialDaysLeft({ subscription_status: "trialing", trial_ends_at: inDays(2.5) }, now),
    ).toBe(3);
    expect(trialDaysLeft({ subscription_status: "trialing", trial_ends_at: inDays(-1) }, now)).toBe(
      0,
    );
  });
  it("starts charging at the trial's end, or now if that's under 48 hours away", () => {
    expect(stripeTrialEnd(inDays(10), now)).toBe(Math.floor(Date.parse(inDays(10)) / 1000));
    expect(stripeTrialEnd(inDays(1), now)).toBeNull();
    expect(stripeTrialEnd(null, now)).toBeNull();
  });
  it("maps Stripe's statuses", () => {
    expect(fromStripeStatus("trialing")).toBe("active");
    expect(fromStripeStatus("past_due")).toBe("past_due");
    expect(fromStripeStatus("unpaid")).toBe("canceled");
    expect(fromStripeStatus("incomplete_expired")).toBe("canceled");
  });
});
