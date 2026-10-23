/**
 * What a door kiosk shows at rest (properties.kiosk_rest): a night light that
 * lights the hallway with softly changing colours, the clock screensaver
 * or nothing, each optionally with the check-in QR code (moving every few
 * minutes). The night light's colours are worked out here frame by frame, at
 * full brightness, with a fine moving shimmer over them so no pixel ever
 * holds one colour (no burn-in). Pure, so the kiosk, the host's preview and
 * the server agree.
 */

/**
 * Three patterns: Glow (one colour at a time, gently brightening and dimming:
 * what used to be Breathe and Steady), Flow (bands of colour drifting across:
 * Sweep and Colour cycle) and Aurora (soft glows wandering).
 */
export const NIGHT_MODES = ["glow", "flow", "aurora"] as const;
export type NightMode = (typeof NIGHT_MODES)[number];
/** Patterns saved before they were grouped. */
const OLD_MODES: Record<string, NightMode> = { breathe: "glow", steady: "glow", sweep: "flow", cycle: "flow" };

/**
 * Five bright colour families, each a few close shades so the light drifts
 * gently: yellowish, reddish, bluish, greenish and whitish. The warm ones are
 * kindest to sleep.
 */
export const NIGHT_PALETTES = {
  candle: ["#ffd29a", "#ffbf75", "#ffe2b5", "#ffc887"],
  ember: ["#ff8a6b", "#ff6f7d", "#ffa07a", "#ff7f9a"],
  moonlight: ["#8fb0ff", "#a6c4ff", "#7fa2ff", "#b9cfff"],
  meadow: ["#7fe3a3", "#a6ef9a", "#6fd9b0", "#c2f2a0"],
  pearl: ["#fff4e6", "#f3f0ff", "#fffaf0", "#eef6ff"],
} as const satisfies Record<string, readonly string[]>;
export type NightPalette = keyof typeof NIGHT_PALETTES;
export const NIGHT_PALETTE_KEYS = Object.keys(NIGHT_PALETTES) as NightPalette[];
/** Colours saved before they were grouped into five families. */
const OLD_PALETTES: Record<string, NightPalette> = { sunset: "ember", lavender: "moonlight", ocean: "moonlight", forest: "meadow", spectrum: "candle" };

/** Speed 1 (slowest) to 5 (liveliest); 3 is how the preview always looked. Each multiplies every period. */
export const NIGHT_SPEED = { min: 1, max: 5, default: 3 } as const;
const SPEED_FACTOR = [3, 1.7, 1, 0.6, 0.35] as const;
export const speedFactor = (speed: number) => SPEED_FACTOR[Math.min(4, Math.max(0, Math.round(speed) - 1))]!;
/** Speeds saved as words before the slider. */
const OLD_SPEEDS: Record<string, number> = { slow: 2, gentle: 3, lively: 4 };

export type KioskRest = {
  /** The night light comes on instead of the clock screensaver. */
  nightLight: boolean;
  /** Whenever the kiosk rests, or only during the property's quiet hours (the rest of the time: `otherwise`). */
  nightWhen: "always" | "quiet";
  mode: NightMode;
  palette: NightPalette;
  /** 1 (slowest) to 5. */
  speed: number;
  /** At rest without the night light: the clock screensaver, or a dark screen. */
  otherwise: "clock" | "blank";
  /** The "check in on your phone" QR code whatever shows at rest (clock, night light, screen off). Stored as clockQr. */
  clockQr: boolean;
};

export const DEFAULT_REST: KioskRest = {
  nightLight: false,
  nightWhen: "always",
  mode: "glow",
  palette: "candle",
  speed: NIGHT_SPEED.default,
  otherwise: "clock",
  clockQr: false,
};

const pick = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T) : fallback);

export function normaliseRest(raw: unknown): KioskRest {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    nightLight: r["nightLight"] === true,
    nightWhen: pick(r["nightWhen"], ["always", "quiet"] as const, DEFAULT_REST.nightWhen),
    mode: pick(typeof r["mode"] === "string" ? (OLD_MODES[r["mode"]] ?? r["mode"]) : null, NIGHT_MODES, DEFAULT_REST.mode),
    palette: pick(typeof r["palette"] === "string" ? (OLD_PALETTES[r["palette"]] ?? r["palette"]) : null, NIGHT_PALETTE_KEYS, DEFAULT_REST.palette),
    speed: Math.min(NIGHT_SPEED.max, Math.max(NIGHT_SPEED.min, Math.round(typeof r["speed"] === "number" ? r["speed"] : typeof r["speed"] === "string" ? (OLD_SPEEDS[r["speed"]] ?? NIGHT_SPEED.default) : NIGHT_SPEED.default))),
    otherwise: pick(r["otherwise"], ["clock", "blank"] as const, DEFAULT_REST.otherwise),
    clockQr: r["clockQr"] === true,
  };
}

/** What shows at rest right now. */
export function restNow(rest: KioskRest, quietHours: boolean): "night" | "clock" | "blank" {
  if (rest.nightLight && (rest.nightWhen === "always" || quietHours)) return "night";
  return rest.otherwise;
}

/* ------------------------------ night look ------------------------------ */

/** Brightness (left band) and colour depth (right band): 0 depth is a soft warm white, 1 the palette's full colour. Full brightness to start: it has to light the hall. */
export const NIGHT_LOOK = {
  brightness: { min: 0.05, max: 1, step: 0.05 },
  depth: { min: 0, max: 1, step: 0.05 },
} as const;
export type NightLook = { brightness: number; depth: number };
export const DEFAULT_NIGHT_LOOK: NightLook = { brightness: 1, depth: 0.85 };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const tidy = (v: number) => Math.round(v * 100) / 100;

export function nightLookFor(own: unknown): NightLook {
  const o = (own && typeof own === "object" ? own : {}) as Record<string, unknown>;
  return {
    brightness: tidy(clamp(num(o["brightness"]) ?? DEFAULT_NIGHT_LOOK.brightness, NIGHT_LOOK.brightness.min, NIGHT_LOOK.brightness.max)),
    depth: tidy(clamp(num(o["depth"]) ?? DEFAULT_NIGHT_LOOK.depth, NIGHT_LOOK.depth.min, NIGHT_LOOK.depth.max)),
  };
}

/* -------------------------------- colours -------------------------------- */

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
};
const hex = (c: Rgb) => `#${c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("")}`;

/** a → b by f (0..1). */
export function mix(a: string, b: string, f: number): string {
  const x = rgb(a);
  const y = rgb(b);
  const t = clamp(f, 0, 1);
  return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** The soft warm white that a colour depth of 0 shows. */
export const WARM_WHITE = "#ffe9c7";

/** A point around the palette's circle (phase in turns), eased so it lingers on each colour. */
export function along(colours: readonly string[], phase: number): string {
  const n = colours.length;
  const p = (((phase % 1) + 1) % 1) * n;
  const i = Math.floor(p);
  const f = p - i;
  const eased = 0.5 - 0.5 * Math.cos(Math.PI * f);
  return mix(colours[i]!, colours[(i + 1) % n]!, eased);
}

/** Colour depth: the palette's colour mixed toward warm white. */
export const deepen = (colour: string, depth: number) => mix(WARM_WHITE, colour, depth);

/* --------------------------------- frames -------------------------------- */

/** Periods in seconds at speed 3 (multiplied by speedFactor). */
export const PERIODS = {
  /** Once round the palette. */
  drift: 90,
  /** Glow: one slow swell and fade. */
  glow: 8,
  /** Flow: the bands of colour crossing the screen. */
  flow: 12,
  /** Aurora: the glows' wandering. */
  aurora: 20,
  /** The shimmer that keeps every pixel changing: one full turn of its angle. */
  care: 45,
} as const;

/** The dimmest Glow gets in its fade: never so dim it looks like the screen failing. */
export const GLOW_LOW = 0.78;

export type NightFrame = {
  /** CSS background for the coloured layer. */
  background: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  /** 0..1, multiplies the brightness (Glow's swell). */
  level: number;
};

/** The night light at `t` seconds since it started. */
export function nightFrame(rest: Pick<KioskRest, "mode" | "palette" | "speed">, t: number, depth: number): NightFrame {
  const k = speedFactor(rest.speed);
  const colours = NIGHT_PALETTES[rest.palette].map((c) => deepen(c, depth));
  const turn = (period: number) => t / (period * k);
  const drift = turn(PERIODS.drift);
  switch (rest.mode) {
    case "glow": {
      const swell = 0.5 - 0.5 * Math.cos(2 * Math.PI * turn(PERIODS.glow));
      // A soft spot of the next colour keeps even one colour from sitting flat.
      const a = along(colours, drift);
      const b = along(colours, drift + 0.25);
      return { background: `radial-gradient(120% 120% at 50% 40%, ${b} 0%, ${a} 70%)`, level: GLOW_LOW + (1 - GLOW_LOW) * swell };
    }
    case "flow": {
      const a = along(colours, drift);
      const b = along(colours, drift + 1 / 3);
      const c = along(colours, drift + 2 / 3);
      const pos = ((turn(PERIODS.flow) % 1) + 1) % 1;
      return {
        background: `linear-gradient(100deg, ${a} 0%, ${b} 16.7%, ${c} 33.3%, ${a} 50%, ${b} 66.7%, ${c} 83.3%, ${a} 100%)`,
        backgroundSize: "200% 100%",
        backgroundPosition: `${(pos * 100).toFixed(2)}% 50%`,
        level: 1,
      };
    }
    case "aurora": {
      // Three bright glows wandering on slow, different loops over a wash of the palette (never dark).
      const p = turn(PERIODS.aurora) * 2 * Math.PI;
      const blob = (i: number) => {
        const x = 50 + 35 * Math.sin(p * (0.7 + i * 0.23) + i * 2.1);
        const y = 50 + 30 * Math.cos(p * (0.5 + i * 0.31) + i * 1.3);
        const c = along(colours, drift + i / 3);
        return `radial-gradient(circle at ${x.toFixed(1)}% ${y.toFixed(1)}%, ${c} 0%, ${c}00 62%)`;
      };
      return { background: `${blob(0)}, ${blob(1)}, ${blob(2)}, ${mix(along(colours, drift + 0.5), "#000000", 0.15)}`, level: 1 };
    }
  }
}

/**
 * The shimmer over the night light: faint, wide ripples spreading from a
 * slowly wandering centre, so every pixel keeps changing a little and none
 * holds one colour for long (no burn-in), without any band or line that could
 * look like a fault. CSS background and position at `t` seconds.
 */
export function carePattern(t: number, speed: number): { background: string; backgroundPosition: string } {
  const k = speedFactor(speed);
  const p = (t / (PERIODS.care * k)) * 2 * Math.PI;
  const x = 50 + 40 * Math.sin(p);
  const y = 50 + 35 * Math.sin(p * 0.7 + 1);
  // The rings spread outwards continuously: a 90px ripple moving 4px a second at speed 3.
  const r = ((t * 4) / k) % 90;
  return {
    background: `repeating-radial-gradient(circle at ${x.toFixed(1)}% ${y.toFixed(1)}%, rgb(255 255 255 / 0.07) ${r.toFixed(1)}px, rgb(0 0 0 / 0.04) ${(r + 45).toFixed(1)}px, rgb(255 255 255 / 0.07) ${(r + 90).toFixed(1)}px)`,
    backgroundPosition: "0 0",
  };
}

/* ------------------------------- the QR code ------------------------------ */

/** Where the resting QR code sits, moving on every few minutes so it never burns in. */
export const QR_MOVE_MINUTES = 3;
export const QR_SPOTS = [
  { x: "right", y: "bottom" },
  { x: "left", y: "top" },
  { x: "center", y: "bottom" },
  { x: "right", y: "top" },
  { x: "left", y: "bottom" },
  { x: "center", y: "top" },
] as const;
export type QrSpot = (typeof QR_SPOTS)[number];
export function qrSpot(at: Date): QrSpot {
  return QR_SPOTS[Math.floor(at.getTime() / (QR_MOVE_MINUTES * 60_000)) % QR_SPOTS.length]!;
}

/* ------------------------------ clock layout ----------------------------- */

/**
 * Which clocks the screensaver shows, and where. Upright: the home clock on
 * top on its own (larger), the others in a row under it. On its side with
 * the QR code: just the nearest city behind, home and the nearest ahead, so
 * the QR fits beside them. Otherwise all five in one row.
 */
export function arrangeClocks<C extends { home: boolean }>(clocks: C[], o: { qr: boolean; portrait: boolean }): { main: C | null; row: C[] } {
  const at = clocks.findIndex((c) => c.home);
  if (o.portrait && at >= 0) return { main: clocks[at]!, row: clocks.filter((_, i) => i !== at) };
  if (o.qr && at >= 0) return { main: null, row: clocks.slice(Math.max(0, at - 1), at + 2) };
  return { main: null, row: clocks };
}
