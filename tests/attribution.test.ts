import { describe, expect, it } from "vitest";

import {
  appendUtm,
  attributionFrom,
  cleanRefCode,
  mergeAttribution,
  nextRefCookie,
  pickUtm,
  readRefCookie,
} from "../src/lib/attribution";

const NOW = new Date("2026-10-21T10:00:00Z");

describe("attribution", () => {
  it("captures utm_*, ref and only the presence of an ad click id", () => {
    const a = attributionFrom(
      new URLSearchParams(
        "utm_source=linkedin&utm_campaign=launch&ref=swapnil&gclid=SECRET123&page=2",
      ),
      "/tour",
      NOW,
    )!;
    expect(a).toEqual({
      utm_source: "linkedin",
      utm_campaign: "launch",
      ref: "swapnil",
      clickId: true,
      landing_path: "/tour",
      captured_at: NOW.toISOString(),
    });
    expect(JSON.stringify(a)).not.toContain("SECRET123");
    expect(attributionFrom(new URLSearchParams("page=2"), "/", NOW)).toBeNull();
  });

  it("drops values over 200 characters and ignores other params", () => {
    expect(pickUtm({ utm_source: "x".repeat(201), utm_medium: "social", foo: "bar" })).toEqual({
      utm_medium: "social",
    });
  });

  it("keeps the first touch for the session unless new utm_* values arrive", () => {
    const first = attributionFrom({ utm_source: "linkedin" }, "/", NOW);
    const sameAgain = attributionFrom({ utm_source: "linkedin" }, "/tour", NOW);
    const refOnly = attributionFrom({ ref: "friend" }, "/start", NOW);
    const newCampaign = attributionFrom(
      { utm_source: "x", utm_campaign: "oct" },
      "/demo/host",
      NOW,
    );
    expect(mergeAttribution(first, sameAgain)?.landing_path).toBe("/");
    expect(mergeAttribution(first, refOnly)?.ref).toBeUndefined();
    expect(mergeAttribution(first, newCampaign)?.utm_source).toBe("x");
    expect(mergeAttribution(null, refOnly)?.ref).toBe("friend");
    expect(mergeAttribution(first, null)).toBe(first);
  });

  it("adds the session's utm_* to internal links without duplicating keys", () => {
    expect(appendUtm("/kiosk/tour", { utm_source: "linkedin", utm_campaign: "launch" })).toBe(
      "/kiosk/tour?utm_source=linkedin&utm_campaign=launch",
    );
    expect(appendUtm("/app/today?x=1&utm_source=mine#top", { utm_source: "linkedin" })).toBe(
      "/app/today?x=1&utm_source=mine#top",
    );
    expect(appendUtm("/start", {})).toBe("/start");
  });
});

describe("Commission Partner referral cookie", () => {
  const now = Date.parse("2026-11-01T10:00:00Z");
  const cookieFrom = (set: string) => set.split(";")[0]!;

  it("cleans codes and refuses junk", () => {
    expect(cleanRefCode(" oms-ab12 ")).toBe("OMS-AB12");
    expect(cleanRefCode("<script>")).toBeNull();
    expect(cleanRefCode("ab")).toBeNull();
  });

  it("sets the cookie for the window, secure, lax", () => {
    const set = nextRefCookie(null, "oms-ab12", now, 60)!;
    expect(set).toContain("Max-Age=5184000");
    expect(set).toContain("SameSite=Lax");
    expect(set).toContain("Secure");
    expect(readRefCookie(`other=1; ${cookieFrom(set)}`, now + 1000, 60)).toEqual({
      code: "OMS-AB12",
      clicked_at: new Date(now).toISOString(),
    });
  });

  it("keeps the first valid code (8.2)", () => {
    const first = readRefCookie(cookieFrom(nextRefCookie(null, "OMS-FIRST", now, 60)!), now, 60);
    expect(nextRefCookie(first, "OMS-SECOND", now + 1000, 60)).toBeNull();
    // An invalid code never replaces anything either.
    expect(nextRefCookie(null, "x", now, 60)).toBeNull();
  });

  it("expires after the window", () => {
    const c = cookieFrom(nextRefCookie(null, "OMS-AB12", now, 60)!);
    expect(readRefCookie(c, now + 59 * 86_400_000, 60)).not.toBeNull();
    expect(readRefCookie(c, now + 61 * 86_400_000, 60)).toBeNull();
    expect(readRefCookie("lk_ref=%7Bbroken", now, 60)).toBeNull();
  });
});
