import { describe, expect, it } from "vitest";

import { cycleMode, modeForWidth, readNavMode, stepMode } from "../src/lib/nav-mode";

describe("menu layouts", () => {
  it("snaps a drag to the nearest layout", () => {
    expect(modeForWidth(240)).toBe("full");
    expect(modeForWidth(180)).toBe("full");
    expect(modeForWidth(120)).toBe("rail");
    expect(modeForWidth(50)).toBe("rail");
    expect(modeForWidth(20)).toBe("top");
  });

  it("steps and cycles between layouts", () => {
    expect(stepMode("full", "smaller")).toBe("rail");
    expect(stepMode("top", "smaller")).toBe("top");
    expect(stepMode("top", "larger")).toBe("rail");
    expect(cycleMode("top")).toBe("full");
  });

  it("falls back to the full menu for anything unknown", () => {
    expect(readNavMode("top")).toBe("top");
    expect(readNavMode("sideways")).toBe("full");
    expect(readNavMode(null)).toBe("full");
  });
});
