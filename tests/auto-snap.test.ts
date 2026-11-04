import { describe, expect, it } from "vitest";

import {
  HOLD_MS,
  centreOf,
  faceFits,
  holdStep,
  lookForId,
  toGrey,
  type Hold,
} from "@/lib/auto-snap";

const W = 240;
const H = 180;

/** A picture: a plain background, and optionally a light card with lines of print. */
function picture(card?: {
  left: number;
  top: number;
  width: number;
  height: number;
  tiltDeg?: number;
  print?: boolean;
  brightness?: number;
}) {
  const g = new Uint8Array(W * H).fill(70);
  // A little sensor noise, the same every run.
  for (let i = 0; i < g.length; i++) g[i] = 70 + ((i * 7919) % 7);
  if (!card) return g;
  const t = Math.tan(((card.tiltDeg ?? 0) * Math.PI) / 180);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x - W / 2 + (y - H / 2) * t) / (1 + t * t) + W / 2;
      const v = y - H / 2 - (u - W / 2) * t + H / 2;
      const inside =
        u >= card.left && u < card.left + card.width && v >= card.top && v < card.top + card.height;
      if (!inside) continue;
      // Lines of print starting 8 in from the card's edge, broken into words of differing lengths.
      const print =
        card.print !== false &&
        u > card.left + 8 &&
        u < card.left + card.width - 8 &&
        v > card.top + 8 &&
        v < card.top + card.height - 8 &&
        Math.floor((v - card.top) / 7) % 2 === 1 &&
        (Math.floor(u) * 13 + Math.floor((v - card.top) / 14) * 29) % 11 < 6;
      g[y * W + x] = print ? 60 : (card.brightness ?? 215);
    }
  }
  return g;
}

describe("looking for an ID", () => {
  it("finds a whole, sharp card and its corners", () => {
    const look = lookForId(picture({ left: 40, top: 40, width: 160, height: 100 }), W, H);
    expect(look.ok).toBe(true);
    if (look.ok) {
      expect(look.corners[0].x).toBeCloseTo(40, -1);
      expect(look.corners[2].y).toBeCloseTo(140, -1);
    }
  });
  it("copes with a card held at a small tilt", () => {
    const look = lookForId(
      picture({ left: 45, top: 45, width: 150, height: 94, tiltDeg: 6 }),
      W,
      H,
    );
    expect(look.ok).toBe(true);
  });
  it("copes with a tilt either way", () => {
    for (const tiltDeg of [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10]) {
      const look = lookForId(picture({ left: 45, top: 45, width: 150, height: 94, tiltDeg }), W, H);
      expect([tiltDeg, look.ok]).toEqual([tiltDeg, true]);
    }
  });
  it("finds a passport page's shape", () => {
    expect(lookForId(picture({ left: 40, top: 30, width: 160, height: 112 }), W, H).ok).toBe(true);
  });
  it("sees nothing in an empty picture", () => {
    expect(lookForId(picture(), W, H)).toEqual({ ok: false, reason: "none" });
  });
  it("won't take a card cut off by the edge", () => {
    const look = lookForId(picture({ left: 0, top: 40, width: 160, height: 100 }), W, H);
    expect(look.ok).toBe(false);
  });
  it("wants it close enough", () => {
    const look = lookForId(picture({ left: 90, top: 70, width: 64, height: 40 }), W, H);
    expect(look.ok).toBe(false);
  });
  it("won't take a card with no sharp print", () => {
    const look = lookForId(
      picture({ left: 40, top: 40, width: 160, height: 100, print: false }),
      W,
      H,
    );
    expect(look).toMatchObject({ ok: false, reason: "blurry" });
  });
  it("says when it's too dark, or there's glare", () => {
    expect(lookForId(new Uint8Array(W * H).fill(10), W, H)).toMatchObject({ reason: "dark" });
    const look = lookForId(
      picture({ left: 40, top: 40, width: 160, height: 100, brightness: 255 }),
      W,
      H,
    );
    expect(look).toMatchObject({ ok: false, reason: "glare" });
  });
  it("turns colour into grey", () => {
    const g = toGrey(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1);
    expect(g[0]).toBeGreaterThan(250);
    expect(g[1]).toBe(0);
  });
});

describe("a face", () => {
  it("must be big enough and not cut off", () => {
    expect(faceFits({ x: 400, y: 200, width: 300, height: 300 }, 1280, 720)).toBe(true);
    expect(faceFits({ x: 400, y: 200, width: 50, height: 50 }, 1280, 720)).toBe(false);
    expect(faceFits({ x: 0, y: 200, width: 300, height: 300 }, 1280, 720)).toBe(false);
    expect(faceFits({ x: 400, y: 600, width: 300, height: 300 }, 1280, 720)).toBe(false);
  });
});

describe("holding still", () => {
  const here = { at: { x: 0.5, y: 0.5 }, size: 0.5 };
  it("fires only after being still long enough", () => {
    let hold: Hold = null;
    let r = holdStep(hold, here, 1000, HOLD_MS.id);
    expect(r.fire).toBe(false);
    hold = r.hold;
    r = holdStep(hold, here, 1000 + HOLD_MS.id - 1, HOLD_MS.id);
    expect(r.fire).toBe(false);
    r = holdStep(r.hold, here, 1000 + HOLD_MS.id, HOLD_MS.id);
    expect(r.fire).toBe(true);
  });
  it("starts again when it moves or goes away", () => {
    const first = holdStep(null, here, 0, 100).hold;
    const moved = holdStep(first, { at: { x: 0.7, y: 0.5 }, size: 0.5 }, 500, 100);
    expect(moved.fire).toBe(false);
    expect(holdStep(first, null, 500, 100)).toEqual({ hold: null, fire: false });
  });
  it("measures a shape from its corners", () => {
    const c = centreOf(
      [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 90 },
        { x: 0, y: 90 },
      ],
      240,
      180,
    );
    expect(c).toEqual({ at: { x: 0.25, y: 0.25 }, size: 0.5 });
  });
});
