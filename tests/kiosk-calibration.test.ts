import { describe, expect, it } from "vitest";

import {
  areaFor,
  clampArea,
  isPlain,
  moveEdge,
  normaliseCalibrations,
  scaleArea,
  shift,
  startArea,
  zoomBy,
} from "@/lib/kiosk-calibration";

const base = { w: 1280, h: 752 };

describe("door tablet calibration", () => {
  it("starts as the whole display at normal size", () => {
    const a = startArea(base);
    expect(a).toEqual({ x: 0, y: 0, w: 1280, h: 752, zoom: 1 });
    expect(isPlain(a, base)).toBe(true);
  });

  it("moves, but always keeps at least half of it on the screen", () => {
    expect(shift(startArea(base), base, 12, -8)).toMatchObject({ x: 12, y: -8 });
    expect(shift(startArea(base), base, 5000, 0).x).toBe(640);
  });

  it("pulls one edge, leaving the opposite edge where it is", () => {
    const a = startArea(base);
    const right = moveEdge(a, base, "right", -100);
    expect(right).toMatchObject({ x: 0, w: 1180 });
    const left = moveEdge(a, base, "left", -100);
    expect(left).toMatchObject({ x: 100, w: 1180 });
    // Out past what the browser reports (a toolbar that hides): allowed up to half as much again.
    expect(moveEdge(a, base, "bottom", 56)).toMatchObject({ y: 0, h: 808 });
    // Shrunk to the limit, the fixed edge still stays put.
    const tiny = moveEdge(a, base, "left", -5000);
    expect(tiny.w).toBe(512);
    expect(tiny.x + tiny.w).toBe(1280);
  });

  it("zooms within readable limits, and grows the area around its centre", () => {
    expect(zoomBy(startArea(base), base, 10).zoom).toBe(1.8);
    expect(zoomBy(startArea(base), base, 0.1).zoom).toBe(0.6);
    const big = scaleArea(startArea(base), base, 1.1);
    expect(big).toMatchObject({ w: 1408, h: 827, x: -64, y: -38 });
  });

  it("reads stored calibrations safely and per way up", () => {
    const c = normaliseCalibrations({
      landscape: { base, area: { x: 9999, y: 0, w: 1200, h: 700, zoom: 9 }, at: "t" },
      portrait: { base: { w: 10, h: 10 }, area: {} },
      junk: 1,
    });
    expect(c.portrait).toBeUndefined();
    expect(c.landscape?.area).toEqual({ x: 680, y: 0, w: 1200, h: 700, zoom: 1.8 });
    expect(normaliseCalibrations(null)).toEqual({});
    expect(clampArea({ x: 0.4, y: 0, w: 1280, h: 752, zoom: 1.234 }, base).zoom).toBe(1.23);
  });

  it("applies it to the display the kiosk has now, or not at all on a very different one", () => {
    const c = normaliseCalibrations({
      landscape: { base, area: { x: 10, y: 20, w: 1200, h: 700, zoom: 1.2 } },
    });
    expect(areaFor(c, "landscape", base)).toEqual({ x: 10, y: 20, w: 1200, h: 700, zoom: 1.2 });
    // A few pixels different: scaled to match.
    expect(areaFor(c, "landscape", { w: 1280, h: 800 })?.h).toBe(745);
    expect(areaFor(c, "portrait", base)).toBeNull();
    expect(areaFor(c, "landscape", { w: 600, h: 400 })).toBeNull();
  });
});
