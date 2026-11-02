import { describe, expect, it } from "vitest";

import { marketing } from "../src/content/copy";

describe("home page claims", () => {
  it("doesn't advertise unfinished features on the sales page", () => {
    const all = JSON.stringify(marketing).toLowerCase();
    expect(all).not.toContain("on the way");
    expect(all).not.toContain("not available yet");
  });

  it("keeps each feature frame to one short line until opened", () => {
    for (const p of marketing.pillars.items) expect(p.summary.length).toBeLessThanOrEqual(100);
  });

  it("says 'hotel-grade' at most once on the home page", () => {
    expect(JSON.stringify(marketing).match(/hotel-grade/gi)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it("doesn't make claims the positioning rules out", () => {
    const all = JSON.stringify(marketing).toLowerCase();
    for (const banned of ["no commission", "revpar", "dynamic pricing", "hotel pms that"])
      expect(all).not.toContain(banned);
  });
});
