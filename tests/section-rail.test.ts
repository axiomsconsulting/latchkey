import { describe, expect, it } from "vitest";

import { activeSection, railStart } from "../src/lib/section-rail";

describe("section rail", () => {
  it("follows the section whose top has passed the reading line", () => {
    const tops = [-900, -200, 150, 700, 1400];
    expect(activeSection(tops, 250)).toBe(2);
    expect(activeSection(tops, -500)).toBe(0);
    expect(activeSection([400, 900], 250)).toBe(0);
  });

  it("keeps the active name in the middle of five, never past either end", () => {
    expect(railStart(0, 12)).toBe(0);
    expect(railStart(6, 12)).toBe(4);
    expect(railStart(11, 12)).toBe(7);
    expect(railStart(3, 4)).toBe(0);
  });
});
