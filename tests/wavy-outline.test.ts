import { describe, expect, it } from "vitest";

import { wavyPath } from "../src/lib/wavy-outline";

const points = (d: string) =>
  [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

describe("wavyPath", () => {
  it("is a closed outline that stays within the wave's height of the button", () => {
    const d = wavyPath(300, 80, 20, 3, 18, 0.7);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    for (const p of points(d)) {
      expect(p.x).toBeGreaterThanOrEqual(-3.1);
      expect(p.x).toBeLessThanOrEqual(303.1);
      expect(p.y).toBeGreaterThanOrEqual(-3.1);
      expect(p.y).toBeLessThanOrEqual(83.1);
    }
  });
  it("copes with a pill, a square corner and nothing at all", () => {
    expect(points(wavyPath(200, 60, 999, 2, 16, 0)).length).toBeGreaterThan(24);
    expect(points(wavyPath(200, 60, 0, 2, 16, 0)).length).toBeGreaterThan(24);
    expect(wavyPath(0, 60, 10, 2, 16, 0)).toBe("");
  });
  it("moves with the phase", () => {
    expect(wavyPath(300, 80, 20, 3, 18, 0)).not.toBe(wavyPath(300, 80, 20, 3, 18, 1));
  });
});
