import { describe, expect, it } from "vitest";

import { normaliseSpots, previewPlace, spotFor, suggestedSpot } from "@/lib/kiosk-camera-spot";

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

describe("where the preview opens", () => {
  it("on its side: towards the camera, at its height", () => {
    expect(previewPlace({ x: 0.1, y: 0.5 }, "landscape")).toEqual({ first: true, align: "center" });
    expect(previewPlace({ x: 0.9, y: 0 }, "landscape")).toEqual({ first: false, align: "start" });
    expect(previewPlace({ x: 0.9, y: 1 }, "landscape")).toEqual({ first: false, align: "end" });
  });
  it("upright: above or below the buttons", () => {
    expect(previewPlace({ x: 0.5, y: 0 }, "portrait").first).toBe(true);
    expect(previewPlace({ x: 0.5, y: 1 }, "portrait").first).toBe(false);
  });
});
