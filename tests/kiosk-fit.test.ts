import { describe, expect, it } from "vitest";

import {
  FIT,
  calibrationKey,
  displayChanged,
  fitFontSize,
  fitted,
  keyboardLikely,
  orientedScreen,
  personalPhone,
  settleDisplay,
  widthCap,
} from "../src/lib/kiosk-fit";

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
    expect(
      displayChanged(
        { w: 1400, h: 900, orientation: "landscape" },
        { w: 1400, h: 600, orientation: "landscape" },
        false,
      ),
    ).toBe(true);
  });

  it("tells a guest's phone held upright from a door tablet turned upright", () => {
    // iPhone upright: its own phone, even with the keyboard making the page wider than tall.
    expect(personalPhone({ w: 390, h: 844 }, "portrait")).toBe(true);
    // The same phone on its side: a shared screen, as before.
    expect(personalPhone({ w: 390, h: 844 }, "landscape")).toBe(false);
    // A small Android tablet and an iPad stood upright stay the kiosk.
    expect(personalPhone({ w: 600, h: 960 }, "portrait")).toBe(false);
    expect(personalPhone({ w: 820, h: 1180 }, "portrait")).toBe(false);
    expect(personalPhone({ w: 0, h: 0 }, "portrait")).toBe(false);
  });
});

describe("the kiosk's display", () => {
  const tablet = {
    touch: true,
    screen: { w: 800, h: 1280 },
    typing: false,
    fullscreen: false,
    calibrated: null,
  };
  const upright = (h: number) => ({ w: 800, h, orientation: "portrait" as const });

  it("holds the screen as the device's, the way it's held", () => {
    expect(orientedScreen({ w: 800, h: 1280 }, "landscape")).toEqual({ w: 1280, h: 800 });
    expect(orientedScreen({ w: 1280, h: 800 }, "portrait")).toEqual({ w: 800, h: 1280 });
    expect(keyboardLikely(600, 1280)).toBe(true);
    expect(keyboardLikely(1180, 1280)).toBe(false);
  });

  it("opened with the keyboard still up (the address was just typed): sized from the screen, then put right once", () => {
    const first = settleDisplay(null, upright(640), tablet);
    expect(first).toEqual({ w: 800, h: 1152, orientation: "portrait", estimated: true });
    // The keyboard goes: the real height replaces the estimate, smaller or larger.
    expect(settleDisplay(first, upright(1180), tablet)).toEqual(upright(1180));
    expect(settleDisplay(first, upright(1100), tablet)).toEqual(upright(1100));
    // While it's still up nothing moves.
    expect(settleDisplay(first, upright(600), tablet)).toBe(first);
  });

  it("uses what this tablet remembered, and the whole screen in full screen", () => {
    expect(settleDisplay(null, upright(640), { ...tablet, calibrated: 1188 })).toEqual({
      w: 800,
      h: 1188,
      orientation: "portrait",
      estimated: false,
    });
    expect(settleDisplay(null, upright(640), { ...tablet, fullscreen: true }).h).toBe(1280);
  });

  it("never shrinks for a keyboard or a toolbar on a touch screen; grows only by a real amount", () => {
    const d = upright(1180);
    expect(settleDisplay(d, upright(700), tablet)).toBe(d);
    expect(settleDisplay(d, upright(1124), tablet)).toBe(d);
    expect(settleDisplay(d, upright(1200), tablet)).toBe(d);
    expect(settleDisplay(d, upright(1280), { ...tablet, fullscreen: true })).toEqual(upright(1280));
    // Typing in a box: nothing changes even if the page grows back.
    expect(settleDisplay(d, upright(1280), { ...tablet, typing: true })).toBe(d);
  });

  it("measures again when the device turns", () => {
    const d = upright(1180);
    expect(settleDisplay(d, { w: 1280, h: 720, orientation: "landscape" }, tablet)).toEqual({
      w: 1280,
      h: 720,
      orientation: "landscape",
    });
    // Turned with the keyboard up: from the screen held that way.
    expect(settleDisplay(d, { w: 1280, h: 300, orientation: "landscape" }, tablet).h).toBe(720);
  });

  it("follows a computer's window as before", () => {
    const desk = { ...tablet, touch: false, screen: { w: 1920, h: 1080 } };
    const d = { w: 1200, h: 800, orientation: "landscape" as const };
    expect(settleDisplay(d, { ...d, h: 500 }, desk)).toEqual({ ...d, h: 500 });
    expect(settleDisplay(d, { ...d, h: 760 }, desk)).toBe(d);
  });

  it("remembers per screen and way up", () => {
    expect(calibrationKey({ w: 1280, h: 800 }, "landscape")).toBe("800x1280:landscape");
  });
});
