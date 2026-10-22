import { describe, expect, it } from "vitest";

import {
  BLACK_BAND,
  DEFAULT_NIGHT_LOOK,
  DEFAULT_REST,
  NIGHT_MODES,
  NIGHT_PALETTES,
  PERIODS,
  WARM_WHITE,
  along,
  arrangeClocks,
  blackBand,
  deepen,
  mix,
  nightFrame,
  nightLookFor,
  normaliseRest,
  restNow,
} from "../src/lib/kiosk-rest";

describe("kiosk at rest settings", () => {
  it("starts with the clock screensaver and no night light, safe against anything stored", () => {
    expect(normaliseRest(null)).toEqual(DEFAULT_REST);
    expect(normaliseRest({ nightLight: "yes", mode: "disco", palette: 3, speed: "warp", otherwise: "tv" })).toEqual(DEFAULT_REST);
    expect(normaliseRest({ nightLight: true, nightWhen: "quiet", mode: "aurora", palette: "ocean", speed: "slow", otherwise: "blank", clockQr: true })).toEqual({
      nightLight: true,
      nightWhen: "quiet",
      mode: "aurora",
      palette: "ocean",
      speed: "slow",
      otherwise: "blank",
      clockQr: true,
    });
  });

  it("shows the night light when it's on (and in quiet hours, if only then), else the clock or nothing", () => {
    const on = normaliseRest({ nightLight: true });
    expect(restNow(on, false)).toBe("night");
    const quiet = normaliseRest({ nightLight: true, nightWhen: "quiet", otherwise: "blank" });
    expect(restNow(quiet, true)).toBe("night");
    expect(restNow(quiet, false)).toBe("blank");
    expect(restNow(normaliseRest({}), true)).toBe("clock");
    expect(restNow(normaliseRest({ otherwise: "blank" }), true)).toBe("blank");
  });

  it("keeps the bands' values in range", () => {
    expect(nightLookFor(null)).toEqual(DEFAULT_NIGHT_LOOK);
    expect(nightLookFor({ brightness: 9, depth: -1 })).toEqual({ brightness: 1, depth: 0 });
    expect(nightLookFor({ brightness: 0, depth: 0.333 })).toEqual({ brightness: 0.05, depth: 0.33 });
  });
});

describe("night light colours", () => {
  it("mixes colours and deepens from warm white", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(deepen("#ff0000", 0)).toBe(WARM_WHITE);
    expect(deepen("#ff0000", 1)).toBe("#ff0000");
  });

  it("goes round the palette and back to the start", () => {
    const p = NIGHT_PALETTES.ocean;
    expect(along(p, 0)).toBe(p[0]);
    expect(along(p, 1 / p.length)).toBe(p[1]);
    expect(along(p, 1)).toBe(p[0]);
    expect(along(p, -1 / p.length)).toBe(p[p.length - 1]);
  });

  it("draws every style at any moment", () => {
    for (const mode of NIGHT_MODES) {
      for (const t of [0, 7.3, 600, 86_400]) {
        const f = nightFrame({ mode, palette: "spectrum", speed: "gentle" }, t, 0.7);
        expect(f.background.length).toBeGreaterThan(6);
        expect(f.level).toBeGreaterThanOrEqual(0.3);
        expect(f.level).toBeLessThanOrEqual(1);
      }
    }
  });

  it("breathes between dim and bright, slower when slow", () => {
    const at = (t: number, speed: "slow" | "gentle") => nightFrame({ mode: "breathe", palette: "candle", speed }, t, 1).level;
    expect(at(0, "gentle")).toBeCloseTo(0.3, 5);
    expect(at(PERIODS.breath / 2, "gentle")).toBeCloseTo(1, 5);
    expect(at(PERIODS.breath / 2, "slow")).toBeLessThan(1);
  });

  it("sweeps the dark band across every pixel on each pass", () => {
    const solidHalf = (BLACK_BAND.width * (BLACK_BAND.solid[1] - BLACK_BAND.solid[0])) / 2;
    for (let x = 0; x <= 1; x += 0.05) {
      let blacked = false;
      for (let t = 0; t < PERIODS.blackBand; t += 0.5) {
        if (Math.abs(blackBand(t) - x) <= solidHalf) blacked = true;
      }
      expect(blacked, `pixel at ${x.toFixed(2)}`).toBe(true);
    }
    expect(blackBand(0)).toBeCloseTo(BLACK_BAND.from);
  });
});

describe("clock screensaver layout", () => {
  const five = [{ home: false, c: "LA" }, { home: false, c: "NY" }, { home: true, c: "London" }, { home: false, c: "Dubai" }, { home: false, c: "Tokyo" }];
  it("shows all five in a row on its side", () => {
    expect(arrangeClocks(five, { qr: false, portrait: false })).toEqual({ main: null, row: five });
  });
  it("keeps one either side of home beside the QR code", () => {
    expect(arrangeClocks(five, { qr: true, portrait: false }).row.map((x) => x.c)).toEqual(["NY", "London", "Dubai"]);
  });
  it("puts home on top when upright, the other four under it", () => {
    const a = arrangeClocks(five, { qr: true, portrait: true });
    expect(a.main?.c).toBe("London");
    expect(a.row.map((x) => x.c)).toEqual(["LA", "NY", "Dubai", "Tokyo"]);
  });
});
