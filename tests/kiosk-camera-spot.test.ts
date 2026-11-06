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

describe("fine-tuning and the space left over", () => {
  const overlap = (a: Rect, b: Rect) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  it("moves the preview by the host's nudge, never off the screen", () => {
    const plain = cameraCallout({ x: 0.5, y: 0 }, { w: 1443, h: 902 }, 72);
    const moved = cameraCallout({ x: 0.5, y: 0, ox: -0.1, oy: 0.05 }, { w: 1443, h: 902 }, 72);
    expect(Math.abs(moved.box.x - (plain.box.x - 144.3))).toBeLessThanOrEqual(1);
    expect(Math.abs(moved.box.y - (plain.box.y + 45.1))).toBeLessThanOrEqual(1);
    const far = cameraCallout({ x: 0.5, y: 0, ox: 0.5, oy: 0.5 }, { w: 1443, h: 902 }, 72);
    expect(far.box.x + far.box.w).toBeLessThanOrEqual(1443);
    expect(far.box.y + far.box.h).toBeLessThanOrEqual(902);
  });
  it("keeps the nudge within reason when saved", () => {
    expect(normaliseSpots({ landscape: { x: 0.5, y: 0, ox: 3, oy: -0.2 } })).toEqual({
      landscape: { x: 0.5, y: 0, ox: 0.5, oy: -0.2 },
    });
  });
  it("offers the space under a top-edge preview for the phone's QR code", () => {
    // The Teclast on its side, camera top middle.
    const c = cameraCallout({ x: 0.5, y: 0 }, { w: 1443, h: 902 }, 72);
    expect(c.extra).not.toBeNull();
    expect(c.extra!.y).toBeGreaterThanOrEqual(c.box.y + c.box.h);
    expect(overlap(c.extra!, c.free)).toBe(false);
    expect(overlap(c.extra!, c.box)).toBe(false);
  });
  it("never offers a space that clashes, whatever the camera", () => {
    for (const s of [
      { x: 0, y: 0.5 },
      { x: 1, y: 1 },
      { x: 0.2, y: 0 },
      { x: 0.5, y: 1 },
    ])
      for (const screen of [
        { w: 960, h: 600 },
        { w: 768, h: 1024 },
      ]) {
        const c = cameraCallout(s, screen, 72);
        if (!c.extra) continue;
        expect(overlap(c.extra, c.free)).toBe(false);
        expect(overlap(c.extra, c.box)).toBe(false);
        expect(c.extra.x + c.extra.w).toBeLessThanOrEqual(screen.w);
        expect(c.extra.y + c.extra.h).toBeLessThanOrEqual(screen.h);
      }
  });
  it("never covers the Back button", () => {
    const back = { x: 20, y: 89, w: 187, h: 95 };
    const c = cameraCallout({ x: 0, y: 0.5 }, { w: 1024, h: 768 }, 130, [back]);
    expect(overlap(c.box, back)).toBe(false);
  });
  it("keeps a top camera's preview at the top when stepping round it", () => {
    const back = { x: 20, y: 89, w: 187, h: 95 };
    const c = cameraCallout({ x: 0.5, y: 0 }, { w: 800, h: 1280 }, 130, [back]);
    expect(overlap(c.box, back)).toBe(false);
    expect(c.box.y).toBe(POINTER_SPACE);
  });
});
