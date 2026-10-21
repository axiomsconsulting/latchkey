import { describe, expect, it } from "vitest";

import { appendUtm, attributionFrom, mergeAttribution, pickUtm } from "../src/lib/attribution";

const NOW = new Date("2026-10-21T10:00:00Z");

describe("attribution", () => {
  it("captures utm_*, ref and only the presence of an ad click id", () => {
    const a = attributionFrom(new URLSearchParams("utm_source=linkedin&utm_campaign=launch&ref=swapnil&gclid=SECRET123&page=2"), "/tour", NOW)!;
    expect(a).toEqual({ utm_source: "linkedin", utm_campaign: "launch", ref: "swapnil", clickId: true, landing_path: "/tour", captured_at: NOW.toISOString() });
    expect(JSON.stringify(a)).not.toContain("SECRET123");
    expect(attributionFrom(new URLSearchParams("page=2"), "/", NOW)).toBeNull();
  });

  it("drops values over 200 characters and ignores other params", () => {
    expect(pickUtm({ utm_source: "x".repeat(201), utm_medium: "social", foo: "bar" })).toEqual({ utm_medium: "social" });
  });

  it("keeps the first touch for the session unless new utm_* values arrive", () => {
    const first = attributionFrom({ utm_source: "linkedin" }, "/", NOW);
    const sameAgain = attributionFrom({ utm_source: "linkedin" }, "/tour", NOW);
    const refOnly = attributionFrom({ ref: "friend" }, "/start", NOW);
    const newCampaign = attributionFrom({ utm_source: "x", utm_campaign: "oct" }, "/demo/host", NOW);
    expect(mergeAttribution(first, sameAgain)?.landing_path).toBe("/");
    expect(mergeAttribution(first, refOnly)?.ref).toBeUndefined();
    expect(mergeAttribution(first, newCampaign)?.utm_source).toBe("x");
    expect(mergeAttribution(null, refOnly)?.ref).toBe("friend");
    expect(mergeAttribution(first, null)).toBe(first);
  });

  it("adds the session's utm_* to internal links without duplicating keys", () => {
    expect(appendUtm("/kiosk/tour", { utm_source: "linkedin", utm_campaign: "launch" })).toBe("/kiosk/tour?utm_source=linkedin&utm_campaign=launch");
    expect(appendUtm("/app/today?x=1&utm_source=mine#top", { utm_source: "linkedin" })).toBe("/app/today?x=1&utm_source=mine#top");
    expect(appendUtm("/start", {})).toBe("/start");
  });
});
