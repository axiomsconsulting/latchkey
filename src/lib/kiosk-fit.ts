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
export function fitFontSize(
  currentPx: number,
  contentPx: number,
  viewportPx: number,
  bounds: { min: number; max: number } = FIT,
): number {
  if (!(contentPx > 0) || !(viewportPx > 0) || !(currentPx > 0)) return FIT.base;
  const next = currentPx * (viewportPx / contentPx);
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, next)) * 100) / 100;
}

/** Close enough that refitting would only flicker. */
export const fitted = (contentPx: number, viewportPx: number) =>
  Math.abs(contentPx - viewportPx) / viewportPx < 0.03;

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
export const keyboardLikely = (pageH: number, screenH: number) =>
  screenH > 0 && pageH < screenH * KEYBOARD_SHARE;
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
  /** The largest page this device has had held this way (no keyboard up), remembered across visits. */
  learned: ScreenSize | null;
};

/** A touch screen only measures again when the width falls by more than this share (a foldable closing), never for a side navigation bar. */
export const NARROWER_SHARE = 0.75;

/**
 * The display to fit to, given the last one and what the browser says now.
 * Touch screens: the size of the screen doesn't change, so the display is
 * the largest page seen held this way, today or on an earlier visit
 * (`learned`), and a keyboard, an address bar, a toolbar or a navigation
 * bar (at the bottom, or the side when on its side) never shrinks it; it
 * only grows by a real amount, or swaps an estimate for a measurement.
 * Turning the device measures again (with what this device learned held
 * that way); a width that falls a long way (a foldable closing) too. A
 * keyboard up at that moment (the address was just typed) means the height
 * comes from what it learned, or its screen. Computers: as displayChanged.
 */
export function settleDisplay(prev: Display | null, now: Display, ctx: DisplayContext): Display {
  if (!ctx.touch) return !prev || displayChanged(prev, now, ctx.typing) ? now : prev;
  const screen = orientedScreen(ctx.screen, now.orientation);
  const keyboard = ctx.typing || keyboardLikely(now.h, screen.h);
  const turned = !prev || prev.orientation !== now.orientation;
  const folded = !!prev && !turned && now.w < prev.w * NARROWER_SHARE;
  if (!turned && !folded) {
    const p = prev!;
    const w = Math.max(p.w, now.w);
    if (keyboard) return w === p.w ? p : { ...p, w };
    if (p.estimated) return { ...now, w, h: Math.abs(now.h - p.h) > 1 ? now.h : p.h };
    const h = now.h > p.h + GROW_STEP ? now.h : p.h;
    return w === p.w && h === p.h ? p : { ...p, w, h };
  }
  // A display learned at about this width: never smaller than it.
  const fits = !!ctx.learned && Math.abs(ctx.learned.w - now.w) <= now.w * (1 - NARROWER_SHARE);
  const learned = fits ? ctx.learned : null;
  const w = learned ? Math.max(now.w, learned.w) : now.w;
  if (!keyboard) return learned ? { ...now, w, h: Math.max(now.h, learned.h) } : now;
  const guess = learned?.h ?? Math.round(screen.h * (ctx.fullscreen ? 1 : BROWSER_SHARE));
  return { ...now, w, h: Math.max(now.h, guess), estimated: learned === null };
}

/** Where this device's page height is remembered: by its screen and the way it's held. */
export const calibrationKey = (s: ScreenSize, o: Orientation) =>
  `${Math.min(s.w, s.h)}x${Math.max(s.w, s.h)}:${o}`;

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

/**
 * Runs in the kiosk page's <head>, before anything is drawn: a door tablet
 * this browser has seen before gets its remembered display height
 * (--kiosk-h) and text scale (html font size, --kiosk-header) at once, so
 * the first screen already has its final size. A guest's own phone (an
 * upright phone, or ?guest / ?resume / ?join) is left alone. Mirrors
 * calibrationKey and the kiosk's latchkey.display / latchkey.kioskScale.
 */
export const KIOSK_FIT_SCRIPT = `(function(){try{
var q=location.search;if(/[?&](guest|resume|join)=/.test(q))return;
var s=screen,sw=Math.min(s.width,s.height),sh=Math.max(s.width,s.height);
var t=(s.orientation&&s.orientation.type)||"";
var land=t?t.indexOf("landscape")===0:innerWidth>innerHeight;
if(sw<600&&!land)return;
var key=sw+"x"+sh+":"+(land?"landscape":"portrait");
var d=JSON.parse(localStorage.getItem("latchkey.display")||"{}")[key];
var h=typeof d==="number"?d:d&&d.h;
var r=document.documentElement.style;
if(h)r.setProperty("--kiosk-h",h+"px");
var sc=JSON.parse(localStorage.getItem("latchkey.kioskScale")||"{}")[key];
if(land&&sc&&sc.px&&sc.h){var px=sc.px*((h||sc.h)/sc.h);r.fontSize=px+"px";r.setProperty("--kiosk-header",px+"px");}
}catch(e){}})();`;
