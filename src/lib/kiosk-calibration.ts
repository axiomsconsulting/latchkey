/**
 * Door tablet screen calibration, set by the host from the dashboard while
 * looking at the tablet (like lining up a projector): the area the kiosk
 * uses (shift left/right/up/down, pull any edge in or out) and how large
 * everything is drawn (zoom). Kept per paired tablet and per way up
 * (kiosk_devices.calibration), applied by the kiosk at once and kept until
 * the host resets it; with none, the kiosk learns the display itself
 * (settleDisplay in kiosk-fit.ts, which never shrinks for a keyboard,
 * toolbar or navigation bar). Pure; tested in tests/kiosk-calibration.test.ts.
 */
import type { Orientation } from "./kiosk-fit";

/** The area in CSS px of the display it was made against, and the zoom. */
export type Area = { x: number; y: number; w: number; h: number; zoom: number };
/** The display the tablet reported when the host calibrated it. */
export type Base = { w: number; h: number };
export type Calibration = { area: Area; base: Base; at: string };
export type Calibrations = Partial<Record<Orientation, Calibration>>;

export const ZOOM = { min: 0.6, max: 1.8, step: 0.05 } as const;
/** The area may grow past what the browser reports (a toolbar that hides it) or shrink to a part of the screen. */
export const SIZE_SHARE = { min: 0.4, max: 1.5 } as const;
/** How far it may move: at least this share of the area stays on the screen. */
export const ON_SCREEN_SHARE = 0.5;

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const round = (v: number) => Math.round(v);

/** The whole display, unzoomed: where a new calibration starts. */
export const startArea = (b: Base): Area => ({ x: 0, y: 0, w: b.w, h: b.h, zoom: 1 });

/** Keeps the area at least half on the screen, its size sensible and the zoom readable. */
export function clampArea(a: Area, b: Base): Area {
  const w = Math.min(b.w * SIZE_SHARE.max, Math.max(b.w * SIZE_SHARE.min, a.w));
  const h = Math.min(b.h * SIZE_SHARE.max, Math.max(b.h * SIZE_SHARE.min, a.h));
  // At least half of it stays on the screen.
  const keepW = w * ON_SCREEN_SHARE;
  const keepH = h * ON_SCREEN_SHARE;
  return {
    x: round(Math.min(b.w - keepW, Math.max(-keepW, a.x))),
    y: round(Math.min(b.h - keepH, Math.max(-keepH, a.y))),
    w: round(w),
    h: round(h),
    zoom: Math.round(Math.min(ZOOM.max, Math.max(ZOOM.min, a.zoom)) * 100) / 100,
  };
}

export function normaliseCalibrations(raw: unknown): Calibrations {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Calibrations = {};
  for (const o of ["landscape", "portrait"] as const) {
    const c = (raw as Record<string, unknown>)[o] as Record<string, unknown> | undefined;
    if (!c || typeof c !== "object") continue;
    const base = c["base"] as Record<string, unknown> | undefined;
    const area = c["area"] as Record<string, unknown> | undefined;
    const bw = num(base?.["w"], 0);
    const bh = num(base?.["h"], 0);
    if (!(bw >= 200 && bh >= 200 && bw <= 10_000 && bh <= 10_000) || !area) continue;
    const b = { w: round(bw), h: round(bh) };
    out[o] = {
      base: b,
      area: clampArea(
        {
          x: num(area["x"], 0),
          y: num(area["y"], 0),
          w: num(area["w"], b.w),
          h: num(area["h"], b.h),
          zoom: num(area["zoom"], 1),
        },
        b,
      ),
      at: typeof c["at"] === "string" ? c["at"] : "",
    };
  }
  return out;
}

/** Move the whole area. */
export const shift = (a: Area, b: Base, dx: number, dy: number): Area =>
  clampArea({ ...a, x: a.x + dx, y: a.y + dy }, b);

export type Edge = "left" | "right" | "top" | "bottom";

/** Pull one edge out (positive) or in (negative), leaving the opposite edge where it is. */
export function moveEdge(a: Area, b: Base, edge: Edge, d: number): Area {
  const next = { ...a };
  if (edge === "left") Object.assign(next, { x: a.x - d, w: a.w + d });
  if (edge === "right") next.w = a.w + d;
  if (edge === "top") Object.assign(next, { y: a.y - d, h: a.h + d });
  if (edge === "bottom") next.h = a.h + d;
  const c = clampArea(next, b);
  // Hitting the size limit mustn't drag the fixed edge along.
  if (edge === "left") c.x = a.x + a.w - c.w;
  if (edge === "top") c.y = a.y + a.h - c.h;
  return clampArea(c, b);
}

/** Larger or smaller everywhere, around the area's centre (a pinch, or the + and − buttons). */
export const zoomBy = (a: Area, b: Base, factor: number): Area =>
  clampArea({ ...a, zoom: a.zoom * factor }, b);

/** Grow or shrink the area itself around its centre (both edges at once). */
export function scaleArea(a: Area, b: Base, factor: number): Area {
  const w = a.w * factor;
  const h = a.h * factor;
  return clampArea({ ...a, w, h, x: a.x - (w - a.w) / 2, y: a.y - (h - a.h) / 2 }, b);
}

/**
 * What the kiosk uses for a way up: the area scaled to the display it has
 * now (so a browser that reports a few pixels differently still lines up),
 * or null to learn by itself.
 */
export function areaFor(cals: Calibrations, orientation: Orientation, now: Base): Area | null {
  const c = cals[orientation];
  if (!c) return null;
  const sx = now.w / c.base.w;
  const sy = now.h / c.base.h;
  // Only small differences are scaled; a very different display (another tablet) ignores it.
  if (sx < 0.8 || sx > 1.25 || sy < 0.6 || sy > 1.6) return null;
  return {
    x: round(c.area.x * sx),
    y: round(c.area.y * sy),
    w: round(c.area.w * sx),
    h: round(c.area.h * sy),
    zoom: c.area.zoom,
  };
}

/** Same as the whole display at normal size: nothing to keep. */
export const isPlain = (a: Area, b: Base) =>
  a.x === 0 && a.y === 0 && a.w === b.w && a.h === b.h && a.zoom === 1;
