/**
 * Taking the photo by itself on a door tablet: is a whole, readable ID in the
 * picture, or a face? Runs on the tablet on a tiny copy of each frame; nothing is
 * kept or sent. A real read still happens after the photo, so this only has to say
 * "worth taking", and the guest's own button always works. Pure; tested in
 * tests/auto-snap.test.ts. The face itself comes from the detector (use-auto-snap.ts).
 */

export type Point = { x: number; y: number };

/** The size of the copy looked at: enough to find edges, quick on an old tablet. */
export const SCAN_WIDTH = 240;

const MAX_TILT_DEG = 12;
const TILT_STEP_DEG = 2;
const EDGE = 26;

export type IdLook =
  | { ok: true; corners: [Point, Point, Point, Point] }
  | {
      ok: false;
      reason: "none" | "cut_off" | "small" | "blurry" | "dark" | "glare";
      corners?: [Point, Point, Point, Point];
    };

/** Luminance from RGBA. */
export function toGrey(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    out[i] = (rgba[i * 4]! * 77 + rgba[i * 4 + 1]! * 150 + rgba[i * 4 + 2]! * 29) >> 8;
  }
  return out;
}

/** Strongest counts first and last along a line of bins: a document's two edges. */
function outerPeaks(bins: Float32Array, need: number, gap: number): [number, number] | null {
  let first = -1;
  let last = -1;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i]! >= need) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0 || last - first < gap) return null;
  // The strongest bin in each edge's neighbourhood, since a soft edge covers a few.
  const best = (from: number, step: number) => {
    let at = from;
    for (let i = from, n = 0; n < 5 && i >= 0 && i < bins.length; i += step, n++) {
      if (bins[i]! > bins[at]!) at = i;
    }
    return at;
  };
  return [best(first, 1), best(last, -1)];
}

function smooth(bins: Float32Array): Float32Array {
  const out = new Float32Array(bins.length);
  for (let i = 1; i < bins.length - 1; i++) out[i] = bins[i - 1]! / 2 + bins[i]! + bins[i + 1]! / 2;
  return out;
}

/**
 * Looks for a card or passport page: two long straight edges each way at any small
 * tilt, the right shape, wholly inside the picture, large enough, sharp and well lit.
 */
export function lookForId(grey: Uint8Array, w: number, h: number): IdLook {
  const xs: number[] = [];
  const ys: number[] = [];
  const horiz: boolean[] = [];
  let sum = 0;
  let glare = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = grey[i]!;
      sum += v;
      if (v >= 250) glare++;
      const gx = grey[i + 1]! - grey[i - 1]!;
      const gy = grey[i + w]! - grey[i - w]!;
      const ax = Math.abs(gx);
      const ay = Math.abs(gy);
      if (ax < EDGE && ay < EDGE) continue;
      xs.push(x);
      ys.push(y);
      horiz.push(ay > ax);
    }
  }
  const area = (w - 2) * (h - 2);
  if (sum / area < 35) return { ok: false, reason: "dark" };

  // The tilt where the long edges line up best; rows and columns shift by it.
  const pad = Math.ceil(Math.tan((MAX_TILT_DEG * Math.PI) / 180) * Math.max(w, h)) + 2;
  const rowsAt = (t: number) => {
    const bins = new Float32Array(h + pad * 2);
    for (let k = 0; k < xs.length; k++) {
      if (horiz[k]) bins[Math.round(ys[k]! + xs[k]! * t) + pad]!++;
    }
    return smooth(bins);
  };
  const colsAt = (t: number) => {
    const bins = new Float32Array(w + pad * 2);
    for (let k = 0; k < xs.length; k++) {
      if (!horiz[k]) bins[Math.round(xs[k]! - ys[k]! * t) + pad]!++;
    }
    return smooth(bins);
  };
  let tilt = 0;
  let bestScore = -1;
  for (let d = -MAX_TILT_DEG; d <= MAX_TILT_DEG; d += TILT_STEP_DEG) {
    const t = Math.tan((d * Math.PI) / 180);
    const r = rowsAt(t);
    const c = colsAt(t);
    const score = Math.max(...r) + Math.max(...c);
    if (score > bestScore) {
      bestScore = score;
      tilt = t;
    }
  }
  const rows = outerPeaks(rowsAt(tilt), w * 0.5, h * 0.25);
  const cols = outerPeaks(colsAt(tilt), h * 0.5, w * 0.25);
  if (!rows || !cols) return { ok: false, reason: "none" };
  const corner = (c: number, r: number): Point => {
    const cc = c - pad;
    const rr = r - pad;
    const x = (cc + rr * tilt) / (1 + tilt * tilt);
    return { x, y: rr - x * tilt };
  };
  const corners: [Point, Point, Point, Point] = [
    corner(cols[0], rows[0]),
    corner(cols[1], rows[0]),
    corner(cols[1], rows[1]),
    corner(cols[0], rows[1]),
  ];
  const across = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
  const down = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
  const ratio = Math.max(across, down) / Math.max(1, Math.min(across, down));
  // A card is 1.59 to 1, a passport page 1.42 to 1.
  if (ratio < 1.25 || ratio > 1.8) return { ok: false, reason: "none" };
  const edge = 2;
  if (corners.some((p) => p.x < edge || p.y < edge || p.x > w - 1 - edge || p.y > h - 1 - edge))
    return { ok: false, reason: "cut_off", corners };
  if ((across * down) / (w * h) < 0.22) return { ok: false, reason: "small", corners };
  if (glare / area > 0.08) return { ok: false, reason: "glare", corners };
  // Sharp print shows as plenty of fine contrast inside the card.
  if (fineContrast(grey, w, h, corners) < 7) return { ok: false, reason: "blurry", corners };
  return { ok: true, corners };
}

/** Average second difference well inside the corners: falls away when out of focus or moving. */
export function fineContrast(
  grey: Uint8Array,
  w: number,
  h: number,
  c: [Point, Point, Point, Point],
) {
  let total = 0;
  let n = 0;
  // Across the card itself, whatever its tilt, keeping clear of its edges.
  const STEPS = 60;
  for (let j = 0; j <= STEPS; j++) {
    for (let k = 0; k <= STEPS; k++) {
      const u = 0.1 + (0.8 * k) / STEPS;
      const v = 0.1 + (0.8 * j) / STEPS;
      const x = Math.round(
        (1 - v) * ((1 - u) * c[0].x + u * c[1].x) + v * ((1 - u) * c[3].x + u * c[2].x),
      );
      const y = Math.round(
        (1 - v) * ((1 - u) * c[0].y + u * c[1].y) + v * ((1 - u) * c[3].y + u * c[2].y),
      );
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      const i = y * w + x;
      total += Math.abs(4 * grey[i]! - grey[i - 1]! - grey[i + 1]! - grey[i - w]! - grey[i + w]!);
      n++;
    }
  }
  return n ? total / n : 0;
}

export type Box = { x: number; y: number; width: number; height: number };

/** A face worth taking: big enough to see, and not cut off by the picture's edge. */
export function faceFits(b: Box, w: number, h: number): boolean {
  const margin = 0.02;
  return (
    b.width / w >= 0.12 &&
    b.x >= w * margin &&
    b.y >= h * margin &&
    b.x + b.width <= w * (1 - margin) &&
    b.y + b.height <= h * (1 - margin)
  );
}

/* ---------- holding still ---------- */

export const HOLD_MS = { id: 900, face: 1200 } as const;
/** After a photo that didn't work: time to move before another is taken. */
export const AGAIN_AFTER_MS = 3000;

export type Hold = { since: number; at: Point; size: number } | null;

/** One look's centre and size (share of the picture's width and height). */
export function centreOf(points: Point[], w: number, h: number): { at: Point; size: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {
    at: { x: (left + right) / 2 / w, y: (top + bottom) / 2 / h },
    size: (right - left) / w,
  };
}

/** Whether it's been held still for long enough. Moving, or nothing to see, starts again. */
export function holdStep(
  hold: Hold,
  seen: { at: Point; size: number } | null,
  now: number,
  needMs: number,
): { hold: Hold; fire: boolean } {
  if (!seen) return { hold: null, fire: false };
  const still =
    !!hold &&
    Math.abs(hold.at.x - seen.at.x) < 0.04 &&
    Math.abs(hold.at.y - seen.at.y) < 0.04 &&
    Math.abs(hold.size - seen.size) < 0.05;
  const next: Hold = still ? hold : { since: now, at: seen.at, size: seen.size };
  return { hold: next, fire: now - next!.since >= needMs };
}
