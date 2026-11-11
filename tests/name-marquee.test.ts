import { describe, expect, it } from "vitest";

import { marqueeStops } from "../src/lib/name-marquee";

describe("marqueeStops", () => {
  it("doesn't move a name that fits", () => {
    expect(marqueeStops(0, 300)).toEqual([0]);
    expect(marqueeStops(-5, 300)).toEqual([0]);
  });
  it("steps through about half the space at a time and ends at the last letter", () => {
    expect(marqueeStops(300, 400)).toEqual([0, 180, 300]);
    expect(marqueeStops(100, 400)).toEqual([0, 100]);
  });
  it("never steps less than a few letters", () => {
    expect(marqueeStops(60, 20)).toEqual([0, 24, 48, 60]);
  });
});
