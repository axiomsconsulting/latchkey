import { describe, expect, it } from "vitest";

import {
  DEFAULT_OFFER,
  nextMonthPence,
  normaliseOffer,
  offerNowUsed,
  offerRunning,
  pendingOffer,
  ukToday,
} from "../src/lib/offer";

describe("launch offer", () => {
  it("runs between its start and end days, inclusive, only when switched on", () => {
    expect(offerRunning(DEFAULT_OFFER, "2026-10-14")).toBe(true);
    expect(offerRunning(DEFAULT_OFFER, "2026-12-31")).toBe(true);
    expect(offerRunning(DEFAULT_OFFER, "2027-01-01")).toBe(false);
    expect(offerRunning(DEFAULT_OFFER, "2026-10-13")).toBe(false);
    expect(offerRunning({ ...DEFAULT_OFFER, enabled: false }, "2026-11-01")).toBe(false);
  });

  it("uses UK days", () => {
    // 23:30 UTC on 31 Dec is still 31 Dec in London (GMT); 23:30 UTC on 30 Jun is 1 Jul (BST).
    expect(ukToday(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
    expect(ukToday(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
  });

  it("is free trial, then the offer for one month, then standard", () => {
    const host = { offer_pence: 100, offer_used_at: null };
    expect(pendingOffer(host)).toBe(100);
    expect(nextMonthPence(450, pendingOffer(host))).toBe(100);
    // Still on trial: not used yet.
    expect(offerNowUsed(100, "trialing")).toBe(false);
    // First paid month starts: used.
    expect(offerNowUsed(100, "active")).toBe(true);
    const after = { ...host, offer_used_at: "2026-11-14T00:00:00Z" };
    expect(pendingOffer(after)).toBeNull();
    expect(nextMonthPence(450, pendingOffer(after))).toBe(450);
  });

  it("never charges more than standard, and ignores accounts without an offer", () => {
    expect(nextMonthPence(50, 100)).toBe(50);
    expect(pendingOffer({ offer_pence: null })).toBeNull();
    expect(pendingOffer({})).toBeNull();
    expect(offerNowUsed(null, "active")).toBe(false);
  });

  it("cleans up stored settings", () => {
    expect(normaliseOffer(null).enabled).toBe(false);
    const o = normaliseOffer({
      enabled: true,
      pricePence: -5,
      label: "  ",
      startsOn: "soon",
      endsOn: "2027-01-31",
    });
    expect(o).toEqual({ ...DEFAULT_OFFER, endsOn: "2027-01-31" });
  });
});
