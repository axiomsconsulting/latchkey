import { describe, expect, it } from "vitest";

import {
  POINTER_SPACE,
  cameraCallout,
  normaliseSpots,
  spotFor,
  suggestedSpot,
  type Rect,
} from "@/lib/kiosk-camera-spot";

describe("where the camera is", () => {
  it("keeps good spots, clamps wild ones and drops rubbish", () => {
    expect(normaliseSpots({ landscape: { x: 0.25, y: 2 }, portrait: { x: "a", y: 0 } })).toEqual({
      landscape: { x: 0.25, y: 1 },
    });
    expect(normaliseSpots(null)).toEqual({});
  });
  it("suggests the top middle, and the left for an older iPad on its side", () => {
    expect(suggestedSpot("android|800x1280@2", "landscape")).toEqual({ x: 0.5, y: 0 });
    expect(suggestedSpot(null, "landscape")).toEqual({ x: 0.5, y: 0 });
    expect(suggestedSpot("ipad|768x1024@1", "landscape")).toEqual({ x: 0, y: 0.5 });
    expect(suggestedSpot("ipad|768x1024@1", "portrait")).toEqual({ x: 0.5, y: 0 });
  });
  it("prefers what the host set for that way up", () => {
    const s = { landscape: { x: 1, y: 0.5 } };
    expect(spotFor(s, "ipad|768x1024@1", "landscape")).toEqual({ x: 1, y: 0.5 });
    expect(spotFor(s, "ipad|768x1024@1", "portrait")).toEqual({ x: 0.5, y: 0 });
  });
});

describe("the floating preview", () => {
  const screens = [
    { w: 960, h: 600 },
    { w: 1024, h: 768 },
    { w: 1920, h: 963 },
    { w: 768, h: 1024 },
    { w: 600, h: 960 },
  ];
  const spots = [
    { x: 0.5, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
    { x: 0.5, y: 1 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 0.5, y: 0.08 },
    { x: 0.5, y: 0.5 },
  ];
  const overlap = (a: Rect, b: Rect) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  it("stays on the screen, and leaves a usable block beside it", () => {
    for (const screen of screens)
      for (const s of spots) {
        const c = cameraCallout(s, screen, 72);
        expect(c.box.x).toBeGreaterThanOrEqual(0);
        expect(c.box.y).toBeGreaterThanOrEqual(0);
        expect(c.box.x + c.box.w).toBeLessThanOrEqual(screen.w);
        expect(c.box.y + c.box.h).toBeLessThanOrEqual(screen.h);
        expect(overlap(c.box, c.free)).toBe(false);
        expect(c.free.w).toBeGreaterThan(screen.w * 0.25);
        expect(c.free.h).toBeGreaterThan(screen.h * 0.2);
      }
  });
  it("sits right against the camera", () => {
    const top = cameraCallout({ x: 0.5, y: 0 }, { w: 960, h: 600 }, 72);
    expect(top.pointer.edge).toBe("top");
    expect(top.box.y).toBe(POINTER_SPACE);
    expect(top.box.x).toBeLessThanOrEqual(480);
    expect(top.box.x + top.pointer.at).toBe(480);
    const left = cameraCallout({ x: 0, y: 0.5 }, { w: 960, h: 600 }, 72);
    expect(left.pointer.edge).toBe("left");
    expect(left.box.x).toBe(POINTER_SPACE);
    expect(left.free.x).toBeGreaterThanOrEqual(left.box.x + left.box.w);
    const bottom = cameraCallout({ x: 1, y: 1 }, { w: 960, h: 600 }, 72);
    expect(bottom.box.x + bottom.box.w).toBeGreaterThan(900);
    expect(bottom.free.x + bottom.free.w).toBeLessThanOrEqual(bottom.box.x);
  });
  it("uses a camera under the screen too", () => {
    const c = cameraCallout({ x: 0.5, y: 0.1 }, { w: 1024, h: 768 }, 72);
    expect(c.box.y).toBe(Math.round(0.1 * 768 + POINTER_SPACE));
  });
});
