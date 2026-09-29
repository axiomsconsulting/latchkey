import { describe, expect, it } from "vitest";

import { earliestArrival, formatPence, recommendProviders, type Provider } from "../src/lib/services";
import { normaliseTheme, readableOn, themeVars } from "../src/lib/theme";
import { normaliseModes } from "../src/lib/integration-modes";

const tz = "Europe/London";

// Fixtures only: Latchkey no longer ships a sample provider list, because no
// marketplace it can reach actually supplies cleaners or heating engineers.
const base: Omit<Provider, "id" | "name" | "categories" | "responseMinutes" | "workDays" | "startHour" | "endHour"> = {
  headline: "Test provider",
  contraUrl: "https://example.com",
  rating: 4.5,
  reviews: 20,
  ratePence: 4000,
  rateUnit: "hour",
  verified: true,
};

const PROVIDERS: Provider[] = [
  { ...base, id: "sparkle", name: "Sparkle", categories: ["cleaning"], responseMinutes: 60, workDays: [1, 2, 3, 4, 5, 6], startHour: 8, endHour: 18 },
  { ...base, id: "slow-clean", name: "Slow Clean", categories: ["cleaning"], responseMinutes: 600, workDays: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 },
  { ...base, id: "pipes", name: "Pipes", categories: ["plumbing"], responseMinutes: 90, workDays: [0, 1, 2, 3, 4, 5, 6], startHour: 7, endHour: 21 },
  { ...base, id: "chiltern-heat", name: "Chiltern Heat", categories: ["heating"], responseMinutes: 120, workDays: [1, 2, 3, 4, 5], startHour: 8, endHour: 18 },
];

describe("recommendProviders", () => {
  it("only returns providers for the category", () => {
    const recs = recommendProviders(PROVIDERS, "plumbing", { now: new Date("2026-09-29T09:00:00Z"), tz });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((r) => r.provider.categories.includes("plumbing"))).toBe(true);
  });

  it("favours the fastest provider for urgent jobs", () => {
    const recs = recommendProviders(PROVIDERS, "cleaning", { now: new Date("2026-09-29T09:00:00Z"), tz, urgency: "urgent" });
    expect(recs[0]!.provider.id).toBe("sparkle");
    expect(recs[0]!.reasons).toContain("Soonest");
  });

  it("returns nothing for an unknown category", () => {
    expect(recommendProviders(PROVIDERS, "spaceship", { now: new Date(), tz })).toEqual([]);
  });
});

describe("earliestArrival", () => {
  it("rolls over to next working morning outside hours", () => {
    const p = PROVIDERS.find((x) => x.id === "chiltern-heat")!; // weekdays 08-18
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
