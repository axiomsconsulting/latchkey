import { describe, expect, it } from "vitest";

import { effectiveRate } from "../src/lib/commission";
import { partnerConfig } from "../src/lib/partner-config";
import {
  campaignChangeProblem,
  campaignsText,
  DEFAULT_CAMPAIGNS,
  inWindow,
  lockRate,
  normaliseCampaigns,
  type RateCampaign,
} from "../src/lib/rate-campaigns";

const at = (s: string) => Date.parse(s);
const LAUNCH = DEFAULT_CAMPAIGNS[0]!;
const SUMMER: RateCampaign = {
  id: "summer",
  label: "Summer Bonus",
  rateBps: 1500,
  startDate: "2027-06-01",
  endDate: "2027-06-30",
};

describe("rate campaigns", () => {
  it("default to the Launch Bonus: 20% from 27 October to 31 December 2026", () => {
    expect(partnerConfig().rateCampaigns).toEqual([LAUNCH]);
    expect(LAUNCH).toMatchObject({ rateBps: 2000, startDate: "2026-10-27", endDate: "2026-12-31" });
  });

  it("use UK time at both ends, in winter (GMT) and summer (BST)", () => {
    // 31 December is GMT: midnight UK is midnight UTC.
    expect(inWindow(LAUNCH, at("2026-12-31T23:59:59.999Z"))).toBe(true);
    expect(inWindow(LAUNCH, at("2027-01-01T00:00:00Z"))).toBe(false);
    // 27 October 2026 is after the clocks went back: 00:00 UK = 00:00 UTC.
    expect(inWindow(LAUNCH, at("2026-10-26T23:59:59Z"))).toBe(false);
    expect(inWindow(LAUNCH, at("2026-10-27T00:00:00Z"))).toBe(true);
    // In June, UK midnight is 23:00 UTC the day before.
    expect(inWindow(SUMMER, at("2027-05-31T23:00:00Z"))).toBe(true);
    expect(inWindow(SUMMER, at("2027-05-31T22:59:59Z"))).toBe(false);
    expect(inWindow(SUMMER, at("2027-06-30T22:59:59Z"))).toBe(true);
    expect(inWindow(SUMMER, at("2027-06-30T23:00:00Z"))).toBe(false);
  });

  it("lock the best campaign at the first payment, or the standard rate", () => {
    expect(lockRate(at("2026-11-15T12:00:00Z"), 1000, [LAUNCH])).toEqual({
      rate_bps: 2000,
      launch_bonus: true,
      campaign_id: "launch-2026",
      campaign_label: "Launch Bonus",
    });
    expect(lockRate(at("2027-01-01T00:00:00Z"), 1000, [LAUNCH])).toEqual({
      rate_bps: 1000,
      launch_bonus: false,
      campaign_id: null,
      campaign_label: null,
    });
    const overlap = {
      ...SUMMER,
      id: "big",
      rateBps: 2500,
      startDate: "2026-12-01",
      endDate: "2026-12-02",
    };
    expect(lockRate(at("2026-12-01T10:00:00Z"), 1000, [LAUNCH, overlap]).rate_bps).toBe(2500);
    // A campaign no better than the standard rate isn't a bonus.
    expect(lockRate(at("2026-11-15T12:00:00Z"), 2000, [LAUNCH]).launch_bonus).toBe(false);
  });

  it("never drop below the fixed rate, but follow a higher standard rate", () => {
    expect(effectiveRate(2000, 1000)).toBe(2000);
    expect(effectiveRate(2000, 2500)).toBe(2500);
    expect(effectiveRate(null, 1000)).toBe(1000);
  });

  it("keep only well-formed campaigns", () => {
    expect(
      normaliseCampaigns([
        LAUNCH,
        { ...SUMMER, rateBps: 0 },
        { ...SUMMER, id: "bad-dates", endDate: "2027-05-01" },
        { ...SUMMER, id: "launch-2026" },
        { ...SUMMER, label: "**Big** {x}" },
        "nonsense",
      ]),
    ).toEqual([LAUNCH, { ...SUMMER, label: "Big x" }]);
    expect(partnerConfig({ rateCampaigns: "no" }).rateCampaigns).toEqual([LAUNCH]);
    expect(partnerConfig({ rateCampaigns: [] }).rateCampaigns).toEqual([]);
  });

  it("describe running and scheduled campaigns for Annex B", () => {
    expect(campaignsText([LAUNCH, SUMMER], at("2026-11-01T00:00:00Z"))).toBe(
      "**20%** for each Referred Host whose first payment is made from 27 October 2026 to 23:59 UK time on 31 December 2026 (Launch Bonus); **15%** for each Referred Host whose first payment is made from 1 June 2027 to 23:59 UK time on 30 June 2027 (Summer Bonus)",
    );
    expect(campaignsText([LAUNCH], at("2027-01-01T00:00:00Z"))).toBe(
      "No Launch Bonus campaign is running or scheduled.",
    );
  });

  it("allow adding, raising and extending at any time", () => {
    const now = at("2026-12-20T12:00:00Z");
    expect(campaignChangeProblem([LAUNCH], [LAUNCH, SUMMER], now)).toBeNull();
    expect(campaignChangeProblem([LAUNCH], [{ ...LAUNCH, rateBps: 2500 }], now)).toBeNull();
    expect(campaignChangeProblem([LAUNCH], [{ ...LAUNCH, endDate: "2027-03-31" }], now)).toBeNull();
  });

  it("need 30 days' notice to withdraw, lower, delay or shorten", () => {
    const now = at("2026-11-01T12:00:00Z");
    expect(campaignChangeProblem([LAUNCH], [], now)).toMatch(/30 days' notice/);
    expect(campaignChangeProblem([LAUNCH], [{ ...LAUNCH, rateBps: 1500 }], now)).toMatch(/30 days/);
    expect(campaignChangeProblem([LAUNCH], [{ ...LAUNCH, endDate: "2026-11-15" }], now)).toMatch(
      /1 December 2026/,
    );
    // Ending it sooner, but still 30+ days away, is fine.
    expect(campaignChangeProblem([LAUNCH], [{ ...LAUNCH, endDate: "2026-12-15" }], now)).toBeNull();
    // A future campaign starting 30+ days away may be withdrawn; one starting sooner may not.
    expect(campaignChangeProblem([SUMMER], [], now)).toBeNull();
    expect(
      campaignChangeProblem(
        [{ ...SUMMER, startDate: "2026-11-10", endDate: "2026-11-30" }],
        [],
        now,
      ),
    ).toMatch(/30 days/);
    // A campaign that has ended can be tidied away.
    expect(campaignChangeProblem([LAUNCH], [], at("2027-01-02T12:00:00Z"))).toBeNull();
  });
});
