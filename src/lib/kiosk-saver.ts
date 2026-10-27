/**
 * How bright the kiosk screensaver is and how large its clocks are drawn.
 * The super admin sets the starting brightness and the smallest and largest
 * clock size (site_settings.kiosk_saver); each host's own choice, made with
 * the bands on the screensaver, is kept in kiosk_looks. Pure, so the kiosk,
 * the server and the admin page agree.
 */

/** Brightness multiplies how strongly the white shows: 1 is the original dim look. */
export const BRIGHTNESS = { min: 0.5, max: 3, step: 0.05 } as const;
/** Size multiplies text and the thickness of hands and markers. Hard bounds for the admin's limits. */
export const SIZE = { min: 0.6, max: 2.5, step: 0.05 } as const;

/** Kiosk timings in minutes: hard bounds for the super admin's choices. */
export const TIMING = {
  reset: { min: 1, max: 60 },
  saver: { min: 1, max: 240 },
  /** 0 = the welcome stays until the end time the host chose. */
  welcome: { min: 0, max: 240 },
} as const;

export type SaverDefaults = {
  brightness: number;
  sizeMin: number;
  sizeMax: number;
  size: number;
  /** No touch for this long: an unfinished check-in goes back to the welcome. */
  resetMinutes: number;
  /** No touch for this long (counted from the last touch, never before the reset): the screensaver starts. */
  saverMinutes: number;
  /** A host's welcome closes by itself after this long on screen; 0 = only at its end time. */
  welcomeMinutes: number;
  /** On a door tablet's welcome: the full "check in on your phone" panel on the right, or just the small icon at the top. */
  qrStyle: "panel" | "icon";
};
export type SaverLook = { brightness: number; size: number };

export const DEFAULT_SAVER: SaverDefaults = {
  brightness: 1.6,
  sizeMin: 0.8,
  sizeMax: 1.8,
  size: 1,
  resetMinutes: 5,
  saverMinutes: 10,
  welcomeMinutes: 15,
  qrStyle: "panel",
};

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
      ? Number(v)
      : null;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Two decimals, so stored values stay tidy. */
const tidy = (v: number) => Math.round(v * 100) / 100;

/** The super admin's settings, safe against anything stored. */
export function normaliseDefaults(raw: unknown): SaverDefaults {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const brightness = tidy(
    clamp(num(r["brightness"]) ?? DEFAULT_SAVER.brightness, BRIGHTNESS.min, BRIGHTNESS.max),
  );
  let sizeMin = tidy(clamp(num(r["sizeMin"]) ?? DEFAULT_SAVER.sizeMin, SIZE.min, SIZE.max));
  let sizeMax = tidy(clamp(num(r["sizeMax"]) ?? DEFAULT_SAVER.sizeMax, SIZE.min, SIZE.max));
  if (sizeMin > sizeMax) [sizeMin, sizeMax] = [sizeMax, sizeMin];
  const size = tidy(clamp(num(r["size"]) ?? DEFAULT_SAVER.size, sizeMin, sizeMax));
  const whole = (v: unknown, fallback: number, lo: number, hi: number) =>
    Math.round(clamp(num(v) ?? fallback, lo, hi));
  const resetMinutes = whole(
    r["resetMinutes"],
    DEFAULT_SAVER.resetMinutes,
    TIMING.reset.min,
    TIMING.reset.max,
  );
  const saverMinutes = whole(
    r["saverMinutes"],
    DEFAULT_SAVER.saverMinutes,
    Math.max(TIMING.saver.min, resetMinutes),
    TIMING.saver.max,
  );
  const welcomeMinutes = whole(
    r["welcomeMinutes"],
    DEFAULT_SAVER.welcomeMinutes,
    TIMING.welcome.min,
    TIMING.welcome.max,
  );
  const qrStyle = r["qrStyle"] === "icon" ? "icon" : "panel";
  return {
    brightness,
    sizeMin,
    sizeMax,
    size,
    resetMinutes,
    saverMinutes,
    welcomeMinutes,
    qrStyle,
  };
}

/** What a kiosk shows: the host's own choice where they made one, kept inside today's limits. */
export function lookFor(defaults: SaverDefaults, own: unknown): SaverLook {
  const o = (own && typeof own === "object" ? own : {}) as Record<string, unknown>;
  return {
    brightness: tidy(
      clamp(num(o["brightness"]) ?? defaults.brightness, BRIGHTNESS.min, BRIGHTNESS.max),
    ),
    size: tidy(clamp(num(o["size"]) ?? defaults.size, defaults.sizeMin, defaults.sizeMax)),
  };
}

/** A position along a band (0 = bottom, 1 = top) as a value between lo and hi, on the step. */
export function bandValue(fraction: number, lo: number, hi: number, step: number): number {
  const v = lo + clamp(fraction, 0, 1) * (hi - lo);
  return tidy(clamp(Math.round(v / step) * step, lo, hi));
}

/** The other way: where on the band (0 bottom, 1 top) a value sits. */
export function bandFraction(value: number, lo: number, hi: number): number {
  return hi === lo ? 1 : clamp((value - lo) / (hi - lo), 0, 1);
}

/** How strongly a white mark shows (its base strength times brightness), never past full white. */
export const glow = (base: number, brightness: number) => Math.min(1, base * brightness);

/**
 * What an idle kiosk should do now, from how long since the last real touch.
 * Worked out from the clock (not chained timers), so a tablet that slept or
 * throttled its timers catches up as soon as it checks.
 * - After resetMinutes: an unfinished check-in goes back to the welcome, once per idle spell.
 * - After saverMinutes (from the same last touch): the screensaver.
 */
export function idleActions(
  idleMs: number,
  t: { resetMinutes: number; saverMinutes: number },
  state: { atWelcome: boolean; resetDone: boolean; saver: boolean },
): { reset: boolean; saver: boolean } {
  return {
    reset: !state.atWelcome && !state.resetDone && idleMs >= t.resetMinutes * 60_000,
    saver: !state.saver && idleMs >= Math.max(t.saverMinutes, t.resetMinutes) * 60_000,
  };
}
