/**
 * Landscape kiosks are fitted to the screen's height by setting the page's
 * base font size: every size on the check-in screen is in rem, so text,
 * buttons, spacing and the QR code all grow or shrink together. A phone on
 * its side gets a smaller page, a tablet a larger one. Pure maths here; the
 * kiosk measures and applies it.
 */

/** min: on a screen wider than tall; min_upright: the smallest text a phone held upright gets. */
export const FIT = { min: 8, min_upright: 12, max: 26, base: 16 } as const;

/**
 * The base font size (px) at which content now `contentPx` tall at `currentPx`
 * would just fill `viewportPx`, kept to readable bounds. Content shorter than
 * the screen grows, taller shrinks.
 */
export function fitFontSize(currentPx: number, contentPx: number, viewportPx: number, bounds: { min: number; max: number } = FIT): number {
  if (!(contentPx > 0) || !(viewportPx > 0) || !(currentPx > 0)) return FIT.base;
  const next = currentPx * (viewportPx / contentPx);
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, next)) * 100) / 100;
}

/** Close enough that refitting would only flicker. */
export const fitted = (contentPx: number, viewportPx: number) => Math.abs(contentPx - viewportPx) / viewportPx < 0.03;

/** Wider rem layouts wrap and grow taller instead of filling the screen, so growth also stops at the width. */
export const FIT_WIDTH_REM = 60;
export const widthCap = (viewportWidthPx: number) => viewportWidthPx / FIT_WIDTH_REM;

export type Orientation = "portrait" | "landscape";
export type Display = { w: number; h: number; orientation: Orientation };

/**
 * When the browser says its size changed, is the display really different?
 * - The device turned, or the width changed (a desktop window, a foldable
 *   opening): yes, fit again.
 * - Only the height changed while a text box has focus: that's the on-screen
 *   keyboard; the display hasn't changed.
 * - A small height change: a phone's address bar; ignore.
 * - A big height change with nothing being typed: a desktop window; fit again.
 */
export function displayChanged(was: Display, now: Display, typing: boolean): boolean {
  if (now.orientation !== was.orientation) return true;
  if (Math.abs(now.w - was.w) > 1) return true;
  if (typing) return false;
  return Math.abs(now.h - was.h) > 150;
}
