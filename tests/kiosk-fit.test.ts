import { describe, expect, it } from "vitest";

import { FIT, displayChanged, fitFontSize, fitted, personalPhone, widthCap } from "../src/lib/kiosk-fit";

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

describe("is the display really different?", () => {
  const tablet = { w: 820, h: 1180, orientation: "portrait" as const };
  it("ignores the on-screen keyboard while typing", () => {
    expect(displayChanged(tablet, { ...tablet, h: 780 }, true)).toBe(false);
  });
  it("ignores a phone's address bar", () => {
    expect(displayChanged(tablet, { ...tablet, h: 1120 }, false)).toBe(false);
  });
  it("fits again when the device turns or the width changes", () => {
    expect(displayChanged(tablet, { w: 1180, h: 820, orientation: "landscape" }, true)).toBe(true);
    expect(displayChanged(tablet, { ...tablet, w: 700 }, false)).toBe(true);
  });
  it("fits again when a desktop window is made much shorter", () => {
    expect(displayChanged({ w: 1400, h: 900, orientation: "landscape" }, { w: 1400, h: 600, orientation: "landscape" }, false)).toBe(true);
  });

  it("tells a guest's phone held upright from a door tablet turned upright", () => {
    // iPhone upright: its own phone.
    expect(personalPhone({ w: 390, h: 844 }, { w: 390, h: 760 })).toBe(true);
    // The same phone on its side: a shared screen, as before.
    expect(personalPhone({ w: 844, h: 390 }, { w: 844, h: 360 })).toBe(false);
    // A small Android tablet and an iPad stood upright stay the kiosk.
    expect(personalPhone({ w: 600, h: 960 }, { w: 600, h: 900 })).toBe(false);
    expect(personalPhone({ w: 820, h: 1180 }, { w: 820, h: 1100 })).toBe(false);
    // A narrow window on a computer is not a phone.
    expect(personalPhone({ w: 1920, h: 1080 }, { w: 420, h: 900 })).toBe(false);
    expect(personalPhone({ w: 0, h: 0 }, { w: 390, h: 800 })).toBe(false);
  });
});
