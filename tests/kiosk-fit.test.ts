import { describe, expect, it } from "vitest";

import { FIT, fitFontSize, fitted, widthCap } from "../src/lib/kiosk-fit";

describe("kiosk fit to screen", () => {
  it("shrinks the page on a phone on its side", () => {
    // Welcome is 780px tall at 16px; an iPhone in landscape has 390px.
    expect(fitFontSize(16, 780, 390)).toBe(8);
    expect(fitFontSize(16, 700, 430)).toBeCloseTo(9.83, 2);
  });

  it("grows it on a tablet with room to spare", () => {
    expect(fitFontSize(16, 640, 820)).toBe(20.5);
  });

  it("stays within readable bounds and survives bad measurements", () => {
    expect(fitFontSize(16, 100, 2000)).toBe(FIT.max);
    expect(fitFontSize(16, 0, 800)).toBe(FIT.base);
  });

  it("doesn't grow past what the width can lay out", () => {
    expect(fitFontSize(16, 640, 820, { min: FIT.min, max: widthCap(1180) })).toBeCloseTo(19.67, 2);
  });

  it("leaves a near fit alone", () => {
    expect(fitted(805, 820)).toBe(true);
    expect(fitted(700, 820)).toBe(false);
  });
});
