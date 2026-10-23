import { describe, expect, it } from "vitest";

import {
  DEFAULT_NIGHT_LOOK,
  DEFAULT_REST,
  GLOW_LOW,
  NIGHT_MODES,
  NIGHT_PALETTES,
  PERIODS,
  QR_MOVE_MINUTES,
  QR_SPOTS,
  WARM_WHITE,
  along,
  arrangeClocks,
  carePattern,
  deepen,
  mix,
  nightFrame,
  nightLookFor,
  normaliseRest,
  qrSpot,
  restNow,
  speedFactor,
} from "../src/lib/kiosk-rest";

describe("kiosk at rest settings", () => {
  it("starts with the clock screensaver and no night light, safe against anything stored", () => {
    expect(normaliseRest(null)).toEqual(DEFAULT_REST);
    expect(normaliseRest({ nightLight: "yes", mode: "disco", palette: 3, speed: "warp", otherwise: "tv" })).toEqual(DEFAULT_REST);
    expect(normaliseRest({ nightLight: true, nightWhen: "quiet", mode: "aurora", palette: "ocean", speed: 5, otherwise: "blank", clockQr: true })).toEqual({
      nightLight: true,
      nightWhen: "quiet",
      mode: "aurora",
      palette: "ocean",
      speed: 5,
      otherwise: "blank",
      clockQr: true,
    });
  });

  it("keeps what was saved before patterns were grouped and speed became a slider", () => {
    expect(normaliseRest({ mode: "breathe", speed: "slow" })).toMatchObject({ mode: "glow", speed: 2 });
    expect(normaliseRest({ mode: "steady", speed: "lively" })).toMatchObject({ mode: "glow", speed: 4 });
    expect(normaliseRest({ mode: "sweep" }).mode).toBe("flow");
    expect(normaliseRest({ mode: "cycle", speed: 99 })).toMatchObject({ mode: "flow", speed: 5 });
    expect(NIGHT_MODES).toEqual(["glow", "flow", "aurora"]);
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

  it("keeps the bands' values in range, starting at full brightness", () => {
    expect(nightLookFor(null)).toEqual(DEFAULT_NIGHT_LOOK);
    expect(DEFAULT_NIGHT_LOOK.brightness).toBe(1);
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
        const f = nightFrame({ mode, palette: "spectrum", speed: 3 }, t, 0.7);
        expect(f.background.length).toBeGreaterThan(6);
        expect(f.level).toBeGreaterThanOrEqual(GLOW_LOW);
        expect(f.level).toBeLessThanOrEqual(1);
      }
    }
  });

  it("glows between nearly full and full brightness, slower when slow", () => {
    const at = (t: number, speed: number) => nightFrame({ mode: "glow", palette: "candle", speed }, t, 1).level;
    expect(at(0, 3)).toBeCloseTo(GLOW_LOW, 5);
    expect(at(PERIODS.glow / 2, 3)).toBeCloseTo(1, 5);
    expect(at(PERIODS.glow / 2, 1)).toBeLessThan(1);
    expect(speedFactor(1)).toBeGreaterThan(speedFactor(5));
  });

  it("keeps every pixel changing with soft spreading ripples, never a dark band", () => {
    const a = carePattern(0, 3);
    const b = carePattern(5, 3);
    expect(a.background).not.toBe(b.background);
    // Soft: light and dark only a few percent either way, never solid black.
    expect(a.background).toMatch(/0\.07\)/);
    expect(a.background).not.toMatch(/#000|rgb\(0 0 0\)/);
  });
});

describe("the QR code at rest", () => {
  it("moves to a new spot every few minutes and comes round again", () => {
    const t0 = new Date("2026-10-23T22:00:00Z");
    const later = new Date(t0.getTime() + QR_MOVE_MINUTES * 60_000);
    expect(qrSpot(t0)).not.toEqual(qrSpot(later));
    const round = new Date(t0.getTime() + QR_SPOTS.length * QR_MOVE_MINUTES * 60_000);
    expect(qrSpot(round)).toEqual(qrSpot(t0));
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
