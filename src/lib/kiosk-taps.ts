/**
 * Three quick taps for the door tablet's hidden corner controls (full
 * screen, Update): no press-and-hold, which brings up the browser's own
 * menu on tablets. Pure; tested in tests/kiosk-taps.test.ts.
 */
export const TAPS = 3;
/** All three taps within this long. */
export const TAP_WINDOW_MS = 1_500;

/** Adds a tap at `now` to the recent ones: `fired` on the third within the window. */
export function countTap(taps: number[], now: number): { taps: number[]; fired: boolean } {
  const recent = [...taps.filter((t) => now - t < TAP_WINDOW_MS), now];
  return recent.length >= TAPS ? { taps: [], fired: true } : { taps: recent, fired: false };
}
