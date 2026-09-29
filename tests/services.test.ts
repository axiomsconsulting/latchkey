import { describe, expect, it } from "vitest";

import { DEMO_PROVIDERS } from "../src/lib/contra-demo";
import { earliestArrival, formatPence, recommendProviders } from "../src/lib/services";
import { normaliseTheme, readableOn, themeVars } from "../src/lib/theme";
import { normaliseModes } from "../src/lib/integration-modes";

const tz = "Europe/London";

describe("recommendProviders", () => {
  it("only returns providers for the category", () => {
    const recs = recommendProviders(DEMO_PROVIDERS, "plumbing", { now: new Date("2026-09-29T09:00:00Z"), tz });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((r) => r.provider.categories.includes("plumbing"))).toBe(true);
  });

  it("favours the fastest provider for urgent jobs", () => {
    const recs = recommendProviders(DEMO_PROVIDERS, "cleaning", { now: new Date("2026-09-29T09:00:00Z"), tz, urgency: "urgent" });
    expect(recs[0]!.provider.id).toBe("demo-wycombe-sparkle");
    expect(recs[0]!.reasons).toContain("Soonest");
  });

  it("returns nothing for an unknown category", () => {
    expect(recommendProviders(DEMO_PROVIDERS, "spaceship", { now: new Date(), tz })).toEqual([]);
  });
});

describe("earliestArrival", () => {
  it("rolls over to next working morning outside hours", () => {
    const p = DEMO_PROVIDERS.find((x) => x.id === "demo-chiltern-heat")!; // weekdays 08-18
    // Fri 2 Oct 2026 22:00 London → Mon 5 Oct 08:00 London (07:00Z)
    const eta = earliestArrival(p, new Date("2026-10-02T21:00:00Z"), tz)!;
    expect(eta.toISOString()).toBe("2026-10-05T07:00:00.000Z");
  });
});

describe("formatting and theme", () => {
  it("formats pence in GBP", () => {
    expect(formatPence(1200)).toBe("£12");
    expect(formatPence(1250)).toBe("£12.50");
  });
  it("normalises bad theme input to the preset", () => {
    const t = normaliseTheme({ presetId: "midnight", primary: "red", logoUrl: "javascript:x" });
    expect(t.primary).toBe("#1f2e4d");
    expect(t.logoUrl).toBeNull();
  });
  it("picks readable text colours", () => {
    expect(readableOn("#1f2e4d")).toBe("#fdfbf7");
    expect(readableOn("#f8f3ea")).toBe("#1c1c1c");
    expect(themeVars(normaliseTheme({}))["--radius"]).toBe("1rem");
  });
  it("normalises integration modes", () => {
    expect(normaliseModes({ contra: "live", id_check: "bogus" })).toMatchObject({ contra: "live", id_check: "live", host_email: "demo" });
  });
});
