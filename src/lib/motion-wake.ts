/**
 * Waking the door tablet when someone walks up: a very small picture from its
 * camera, or how loud the room is, compared with a moment ago. Everything stays
 * on the tablet: nothing is kept or sent, and it only runs while the tablet rests.
 * Pure, tested; the hook is src/hooks/use-motion-wake.ts.
 */

/** A very small picture is enough to see movement, and all that's ever looked at. */
export const WAKE_FRAME = { width: 32, height: 24 } as const;
/** How often it looks or listens. */
export const WAKE_STEP_MS = 600;
/** Cameras settle after opening: this many looks don't count. */
export const WAKE_SETTLE_STEPS = 4;
/** Two looks in a row, so a flicker of light doesn't wake it. */
export const WAKE_NEEDS_STEPS = 2;

const CHANGED_LEVEL = 28;
const MOVED_SHARE = 0.05;

/** The share of the picture that changed between two RGBA frames (0 to 1). */
export function changedShare(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let changed = 0;
  let total = 0;
  for (let i = 0; i + 2 < n; i += 4) {
    total += 1;
    const la = 0.3 * a[i]! + 0.59 * a[i + 1]! + 0.11 * a[i + 2]!;
    const lb = 0.3 * b[i]! + 0.59 * b[i + 1]! + 0.11 * b[i + 2]!;
    if (Math.abs(la - lb) > CHANGED_LEVEL) changed += 1;
  }
  return total ? changed / total : 0;
}

/**
 * Whether the picture shows someone moving. A whole-picture change is a light
 * being switched on or a cloud passing, not a person, so it doesn't count.
 */
export function movedIn(share: number): boolean {
  return share >= MOVED_SHARE && share < 0.85;
}

/** How loud a stretch of sound is (root mean square of samples from -1 to 1). */
export function loudness(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

/** The room's usual level, following it slowly, so a fridge or a fan doesn't count. */
export function nextBaseline(baseline: number, level: number): number {
  return baseline === 0 ? level : baseline * 0.95 + level * 0.05;
}

/** Clearly louder than the room's usual level. */
export function isLoud(level: number, baseline: number): boolean {
  return level > Math.max(0.03, baseline * 3);
}
