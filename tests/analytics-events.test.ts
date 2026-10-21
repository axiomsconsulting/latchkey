import { describe, expect, it } from "vitest";

import { cleanProps, cleanUtm, funnelRows, isEventName } from "../src/lib/analytics";

describe("funnel events", () => {
  it("only accepts the five funnel events", () => {
    expect(isEventName("tour_view")).toBe(true);
    expect(isEventName("trial_signup_completed")).toBe(true);
    expect(isEventName("purchase")).toBe(false);
    expect(isEventName(null)).toBe(false);
  });

  it("stores every utm_* field, from new and older pages", () => {
    expect(cleanUtm({ utm_source: " linkedin ", utm_campaign: "launch", utm_medium: "x".repeat(201), other: "no" })).toEqual({ utm_source: "linkedin", utm_campaign: "launch" });
    expect(cleanUtm("newsletter")).toEqual({ utm_source: "newsletter" });
    expect(cleanUtm(42)).toEqual({});
  });

  it("keeps event details small and flat", () => {
    expect(cleanProps({ step: "done", n: 2, ok: true, nested: { a: 1 }, "bad key": 1 })).toEqual({ step: "done", n: 2, ok: true });
    expect(cleanProps({ a: "x".repeat(200), b: "x".repeat(200), c: "x".repeat(200), d: "x".repeat(200), e: "x".repeat(200), f: "x".repeat(200) })).toEqual({});
    expect(cleanProps(["a"])).toEqual({});
  });

  it("counts distinct visitors at each step by source and campaign", () => {
    const rows = funnelRows([
      { name: "tour_view", visitor_id: "a", utm_source: "linkedin", utm_campaign: "launch" },
      { name: "tour_view", visitor_id: "a", utm_source: "linkedin", utm_campaign: "launch" },
      { name: "tour_view", visitor_id: "b", utm_source: "linkedin", utm_campaign: "launch" },
      { name: "demo_host_view", visitor_id: "c", utm_source: "linkedin", utm_campaign: "launch" },
      { name: "trial_signup_completed", visitor_id: "a", utm_source: "linkedin", utm_campaign: "launch" },
      { name: "tour_view", visitor_id: "d", utm_source: null, utm_campaign: null },
      { name: "purchase", visitor_id: "e", utm_source: null, utm_campaign: null },
    ]);
    expect(rows[0]).toMatchObject({ utmSource: "linkedin", utmCampaign: "launch", tourViews: 2, hostDemoViews: 1, trialsCompleted: 1, demoToTrial: 33.3 });
    expect(rows[1]).toMatchObject({ utmSource: "(direct)", utmCampaign: "(none)", tourViews: 1 });
    expect(rows).toHaveLength(2);
  });
});
