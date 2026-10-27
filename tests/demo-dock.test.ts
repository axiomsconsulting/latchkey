import { describe, expect, it } from "vitest";

import { clampBottom, defaultDock, dropDock, isDrag, readDock } from "../src/lib/demo-dock";

describe("demo panel tab", () => {
  it("starts in the bottom-right corner, above the phone's bottom bar for the host demo", () => {
    expect(defaultDock(1280, "host")).toEqual({ side: "right", bottom: 16 });
    expect(defaultDock(390, "host")).toEqual({ side: "right", bottom: 104 });
    expect(defaultDock(390, "guest")).toEqual({ side: "right", bottom: 16 });
  });

  it("sticks to the nearer side where it is dropped, always on screen", () => {
    const vp = { w: 390, h: 844 };
    expect(dropDock({ x: 40, y: 400 }, 64, vp)).toEqual({ side: "left", bottom: 412 });
    expect(dropDock({ x: 300, y: 830 }, 64, vp)).toEqual({ side: "right", bottom: 8 });
    expect(dropDock({ x: 300, y: -50 }, 64, vp)).toEqual({ side: "right", bottom: 772 });
    expect(clampBottom(9000, 500, 844)).toBe(336);
    expect(clampBottom(-4, 500, 844)).toBe(8);
    // Taller than the window: pinned near the bottom.
    expect(clampBottom(100, 900, 844)).toBe(8);
  });

  it("tells a tap from a drag", () => {
    expect(isDrag(3, 4)).toBe(false);
    expect(isDrag(5, 5)).toBe(true);
  });

  it("reads what the browser remembered, safely", () => {
    expect(readDock(JSON.stringify({ side: "left", bottom: 60 }))).toEqual({
      side: "left",
      bottom: 60,
    });
    // The old corner panel's shape.
    expect(readDock(JSON.stringify({ right: 40, bottom: 60, collapsed: true }))).toEqual({
      side: "right",
      bottom: 60,
    });
    expect(readDock("not json")).toBeNull();
    expect(readDock(null)).toBeNull();
  });
});
