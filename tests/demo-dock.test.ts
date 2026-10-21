import { describe, expect, it } from "vitest";

import { clampDock, defaultDock, moveDock, readDock } from "../src/lib/demo-dock";

describe("demo panel position", () => {
  it("starts in the bottom-right corner, above the phone's bottom bar for the host demo", () => {
    expect(defaultDock(1280, "host")).toEqual({ right: 16, bottom: 16 });
    expect(defaultDock(390, "host")).toEqual({ right: 16, bottom: 104 });
    expect(defaultDock(390, "guest")).toEqual({ right: 16, bottom: 16 });
  });

  it("moves with the pointer and always stays on screen", () => {
    expect(moveDock({ right: 16, bottom: 16 }, -100, -50)).toEqual({ right: 116, bottom: 66 });
    const size = { w: 300, h: 200 };
    const vp = { w: 390, h: 844 };
    expect(clampDock({ right: -40, bottom: 9000 }, size, vp)).toEqual({ right: 8, bottom: 636 });
    expect(clampDock({ right: 500, bottom: 20 }, size, vp)).toEqual({ right: 82, bottom: 20 });
  });

  it("reads what the browser remembered, safely", () => {
    expect(readDock(JSON.stringify({ right: 40, bottom: 60, collapsed: true }))).toEqual({ pos: { right: 40, bottom: 60 }, collapsed: true });
    expect(readDock("not json")).toEqual({ pos: null, collapsed: false });
    expect(readDock(null)).toEqual({ pos: null, collapsed: false });
  });
});
