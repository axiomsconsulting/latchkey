import { describe, expect, it } from "vitest";

import { DEFAULT_SAVER, bandFraction, bandValue, glow, lookFor, normaliseDefaults } from "../src/lib/kiosk-saver";

describe("kiosk screensaver look", () => {
  it("falls back to Latchkey's defaults for anything missing or broken", () => {
    expect(normaliseDefaults(null)).toEqual(DEFAULT_SAVER);
    expect(normaliseDefaults({ brightness: "lots", sizeMin: Number.NaN })).toEqual(DEFAULT_SAVER);
  });

  it("keeps the admin's limits inside the hard bounds, in order", () => {
    expect(normaliseDefaults({ brightness: 9, sizeMin: 0.1, sizeMax: 9 })).toMatchObject({ brightness: 3, sizeMin: 0.6, sizeMax: 2.5, size: 1 });
    expect(normaliseDefaults({ sizeMin: 2, sizeMax: 1.2 })).toMatchObject({ sizeMin: 1.2, sizeMax: 2, size: 1.2 });
  });

  it("keeps the kiosk timings whole minutes, in range, and the screensaver never before the reset", () => {
    expect(normaliseDefaults({ resetMinutes: 0, saverMinutes: 999, welcomeMinutes: -3 })).toMatchObject({ resetMinutes: 1, saverMinutes: 240, welcomeMinutes: 0 });
    expect(normaliseDefaults({ resetMinutes: 20, saverMinutes: 5 })).toMatchObject({ resetMinutes: 20, saverMinutes: 20 });
    expect(normaliseDefaults({ resetMinutes: 2.6, saverMinutes: "7", welcomeMinutes: 0 })).toMatchObject({ resetMinutes: 3, saverMinutes: 7, welcomeMinutes: 0 });
  });

  it("shows the full phone panel unless the admin chose the small icon", () => {
    expect(normaliseDefaults({}).qrStyle).toBe("panel");
    expect(normaliseDefaults({ qrStyle: "icon" }).qrStyle).toBe("icon");
    expect(normaliseDefaults({ qrStyle: "huge" }).qrStyle).toBe("panel");
  });

  it("uses the host's own choice, but never past today's limits", () => {
    const d = normaliseDefaults({ brightness: 1.4, sizeMin: 0.9, sizeMax: 1.5 });
    expect(lookFor(d, null)).toEqual({ brightness: 1.4, size: 1 });
    expect(lookFor(d, { brightness: 2.2, size: 1.3 })).toEqual({ brightness: 2.2, size: 1.3 });
    expect(lookFor(d, { brightness: 0, size: 4 })).toEqual({ brightness: 0.5, size: 1.5 });
  });

  it("turns a place on the band into a value on the step, and back", () => {
    expect(bandValue(0, 0.5, 3, 0.05)).toBe(0.5);
    expect(bandValue(1, 0.5, 3, 0.05)).toBe(3);
    expect(bandValue(0.5, 0.5, 3, 0.05)).toBe(1.75);
    expect(bandValue(-2, 0.8, 1.8, 0.05)).toBe(0.8);
    expect(bandFraction(1.3, 0.8, 1.8)).toBeCloseTo(0.5);
    expect(bandFraction(1, 1, 1)).toBe(1);
  });

  it("never shows a mark brighter than full white", () => {
    expect(glow(0.4, 1)).toBe(0.4);
    expect(glow(0.4, 3)).toBe(1);
  });
});
