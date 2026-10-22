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
/** The display the kiosk fits to. `estimated`: worked out while a keyboard was up, so the first real measurement replaces it. */
export type Display = { w: number; h: number; orientation: Orientation; estimated?: boolean };

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

/* ------------------------------ the display ------------------------------ */

export type ScreenSize = { w: number; h: number };

/** The device's screen (CSS px) the way it's held now. */
export function orientedScreen(s: ScreenSize, o: Orientation): ScreenSize {
  const long = Math.max(s.w, s.h);
  const short = Math.min(s.w, s.h);
  return o === "landscape" ? { w: long, h: short } : { w: short, h: long };
}

/** With no keyboard the page has most of the screen (minus the status and address bars); a keyboard takes far more. */
export const KEYBOARD_SHARE = 0.72;
export const keyboardLikely = (pageH: number, screenH: number) => screenH > 0 && pageH < screenH * KEYBOARD_SHARE;
/** What's left of the screen for the page in a browser tab, when it can't be measured (the keyboard is up). */
export const BROWSER_SHARE = 0.9;
/** A touch screen only grows its display by more than this (the keyboard was up when it was first measured, or it went full screen). */
export const GROW_STEP = 32;

export type DisplayContext = {
  /** A touch screen (phone, tablet): its page only ever shrinks for a keyboard or a toolbar. */
  touch: boolean;
  screen: ScreenSize;
  /** A text box has focus (or just had). */
  typing: boolean;
  /** Full screen or installed: the page has the whole screen. */
  fullscreen: boolean;
  /** This device's page height held this way, remembered from an earlier visit with no keyboard up. */
  calibrated: number | null;
};

/**
 * The display to fit to, given the last one and what the browser says now.
 * Touch screens: the same way up and the same width keeps the display,
 * whatever a keyboard or toolbar does; it only grows (by a real amount, with
 * no keyboard up) or swaps an estimate for a real measurement. Turning the
 * device or changing width measures again; if a keyboard is up at that
 * moment (the address was just typed), the height comes from what this
 * device remembered, or from its screen. Computers: as displayChanged.
 */
export function settleDisplay(prev: Display | null, now: Display, ctx: DisplayContext): Display {
  if (!ctx.touch) return !prev || displayChanged(prev, now, ctx.typing) ? now : prev;
  const screen = orientedScreen(ctx.screen, now.orientation);
  const keyboard = ctx.typing || keyboardLikely(now.h, screen.h);
  const same = !!prev && prev.orientation === now.orientation && Math.abs(prev.w - now.w) <= 1;
  if (same) {
    if (keyboard) return prev!;
    if (prev!.estimated) return Math.abs(now.h - prev!.h) > 1 ? now : { ...prev!, estimated: false };
    return now.h > prev!.h + GROW_STEP ? now : prev!;
  }
  if (!keyboard) return now;
  const guess = ctx.calibrated ?? Math.round(screen.h * (ctx.fullscreen ? 1 : BROWSER_SHARE));
  return { ...now, h: Math.max(now.h, guess), estimated: ctx.calibrated === null };
}

/** Where this device's page height is remembered: by its screen and the way it's held. */
export const calibrationKey = (s: ScreenSize, o: Orientation) => `${Math.min(s.w, s.h)}x${Math.max(s.w, s.h)}:${o}`;

/** Phones' shorter side is well under this (CSS px); even small tablets' is above it. */
export const PHONE_SHORT_SIDE = 600;

/**
 * Someone's own phone held upright, rather than a door tablet (which may
 * stand either way up). Judged by the device's screen, not the window, so a
 * tablet turned upright stays the shared kiosk. Held upright is the
 * device's own orientation, so a keyboard making the page wider than tall
 * never turns it into a shared screen.
 */
export function personalPhone(screen: ScreenSize, orientation: Orientation): boolean {
  const short = Math.min(screen.w, screen.h);
  return short > 0 && short < PHONE_SHORT_SIDE && orientation === "portrait";
}
