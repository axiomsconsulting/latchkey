import { describe, expect, it } from "vitest";

import { RELEASES, featuresByArea } from "../src/content/changelog";

describe("change log", () => {
  it("lists each version once, newest first, with real dates", () => {
    expect(new Set(RELEASES.map((r) => r.version)).size).toBe(RELEASES.length);
    const dates = RELEASES.map((r) => r.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const d of dates) expect(Number.isNaN(Date.parse(d))).toBe(false);
    for (const r of RELEASES) expect(r.items.length).toBeGreaterThan(0);
  });

  it("builds the features log from every new item", () => {
    const total = RELEASES.flatMap((r) => r.items).filter((i) => i.kind === "new").length;
    expect(featuresByArea().reduce((n, g) => n + g.features.length, 0)).toBe(total);
  });
});
