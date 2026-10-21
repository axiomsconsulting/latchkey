import { describe, expect, it } from "vitest";

import { marketing } from "../src/content/copy";

describe("home page claims", () => {
  it("never lists something that already exists as 'on the way'", () => {
    const next = marketing.next.items.map((i) => i.title.toLowerCase()).join(" | ");
    for (const shipped of ["housekeeping", "report", "direct stay", "enquir"]) expect(next).not.toContain(shipped);
  });

  it("doesn't make claims the positioning rules out", () => {
    const all = JSON.stringify(marketing).toLowerCase();
    for (const banned of ["no commission", "revpar", "dynamic pricing", "hotel pms that"]) expect(all).not.toContain(banned);
  });
});
