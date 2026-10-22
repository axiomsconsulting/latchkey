/**
 * What a door kiosk shows at rest (properties.kiosk_rest): a night light that
 * lights the hallway with softly changing colours, the clock screensaver
 * (optionally with the check-in QR code), or nothing. The night light's
 * colours are worked out here frame by frame, and a dark band keeps sweeping
 * across the screen so every pixel regularly goes to black (no burn-in).
 * Pure, so the kiosk, the host's preview and the server agree.
 */

export const NIGHT_MODES = ["breathe", "sweep", "cycle", "aurora", "steady"] as const;
export type NightMode = (typeof NIGHT_MODES)[number];

/** Soothing sets of colours; the warm ones are kindest to sleep. */
export const NIGHT_PALETTES = {
  candle: ["#ffcf8a", "#ffb36b", "#ffe2b0", "#ffc27a"],
  ember: ["#ff8a3d", "#ff5e5b", "#ffb347", "#d9485f"],
  sunset: ["#ff7e5f", "#feb47b", "#c06c84", "#6c5b7b"],
  lavender: ["#9b7bd6", "#d58fd8", "#6c5ce7", "#f1a7c5"],
  moonlight: ["#5b7cfa", "#8fb3ff", "#3a4aa8", "#b6c6ff"],
  ocean: ["#1fb5a8", "#2d7dd2", "#5ad1e6", "#3b5bdb"],
  forest: ["#3fa66b", "#8cc084", "#2e8b57", "#c3d982"],
  spectrum: ["#ff5e5e", "#ffb84d", "#ffe66d", "#6be37a", "#4dc6ff", "#8f6bff"],
} as const satisfies Record<string, readonly string[]>;
export type NightPalette = keyof typeof NIGHT_PALETTES;
export const NIGHT_PALETTE_KEYS = Object.keys(NIGHT_PALETTES) as NightPalette[];

/** How fast everything moves: multiplies every period (bigger = slower). */
export const NIGHT_SPEEDS = { slow: 1.6, gentle: 1, lively: 0.6 } as const;
export type NightSpeed = keyof typeof NIGHT_SPEEDS;

export type KioskRest = {
  /** The night light comes on instead of the clock screensaver. */
  nightLight: boolean;
  /** Whenever the kiosk rests, or only during the property's quiet hours (the rest of the time: `otherwise`). */
  nightWhen: "always" | "quiet";
  mode: NightMode;
  palette: NightPalette;
  speed: NightSpeed;
  /** At rest without the night light: the clock screensaver, or a dark screen. */
  otherwise: "clock" | "blank";
  /** The clock screensaver also shows the "check in on your phone" QR code. */
  clockQr: boolean;
};

export const DEFAULT_REST: KioskRest = {
  nightLight: false,
  nightWhen: "always",
  mode: "breathe",
  palette: "candle",
  speed: "gentle",
  otherwise: "clock",
  clockQr: false,
};

const pick = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T) : fallback);

export function normaliseRest(raw: unknown): KioskRest {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    nightLight: r["nightLight"] === true,
    nightWhen: pick(r["nightWhen"], ["always", "quiet"] as const, DEFAULT_REST.nightWhen),
    mode: pick(r["mode"], NIGHT_MODES, DEFAULT_REST.mode),
    palette: pick(r["palette"], NIGHT_PALETTE_KEYS, DEFAULT_REST.palette),
    speed: pick(r["speed"], Object.keys(NIGHT_SPEEDS) as NightSpeed[], DEFAULT_REST.speed),
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

/** Brightness (left band) and colour depth (right band): 0 depth is a soft warm white, 1 the palette's full colour. */
export const NIGHT_LOOK = {
  brightness: { min: 0.05, max: 1, step: 0.05 },
  depth: { min: 0, max: 1, step: 0.05 },
} as const;
export type NightLook = { brightness: number; depth: number };
export const DEFAULT_NIGHT_LOOK: NightLook = { brightness: 0.4, depth: 0.7 };

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

/** Periods in seconds at "gentle" speed. */
export const PERIODS = {
  /** Steady: once round the palette. */
  steady: 20 * 60,
  /** Breathe: one breath in and out; the colour drifts round the palette meanwhile. */
  breath: 14,
  breatheDrift: 10 * 60,
  /** Colour cycle: each colour in turn. */
  cycleEach: 20,
  /** Sweep: the band of colours crossing the screen. */
  sweep: 45,
  /** Aurora: the slowest of the drifting glows. */
  aurora: 90,
  /** The dark band that takes every pixel through black. */
  blackBand: 150,
} as const;

export type NightFrame = {
  /** CSS background for the coloured layer. */
  background: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  /** 0..1, multiplies the brightness (the breathing). */
  level: number;
};

/** The night light at `t` seconds since it started. */
export function nightFrame(rest: Pick<KioskRest, "mode" | "palette" | "speed">, t: number, depth: number): NightFrame {
  const k = NIGHT_SPEEDS[rest.speed];
  const colours = NIGHT_PALETTES[rest.palette].map((c) => deepen(c, depth));
  const turn = (period: number) => t / (period * k);
  switch (rest.mode) {
    case "steady":
      return { background: along(colours, turn(PERIODS.steady)), level: 1 };
    case "breathe": {
      const breath = 0.5 - 0.5 * Math.cos(2 * Math.PI * turn(PERIODS.breath));
      return { background: along(colours, turn(PERIODS.breatheDrift)), level: 0.3 + 0.7 * breath };
    }
    case "cycle":
      return { background: along(colours, turn(PERIODS.cycleEach * colours.length)), level: 1 };
    case "sweep": {
      // Three colours across a band three screens wide, sliding past; the colours drift too.
      const drift = turn(PERIODS.steady);
      const a = along(colours, drift);
      const b = along(colours, drift + 1 / 3);
      const c = along(colours, drift + 2 / 3);
      const pos = ((turn(PERIODS.sweep) % 1) + 1) % 1;
      return {
        background: `linear-gradient(100deg, ${a} 0%, ${b} 16.7%, ${c} 33.3%, ${a} 50%, ${b} 66.7%, ${c} 83.3%, ${a} 100%)`,
        backgroundSize: "200% 100%",
        backgroundPosition: `${(pos * 100).toFixed(2)}% 50%`,
        level: 1,
      };
    }
    case "aurora": {
      // Three soft glows drifting on slow, different loops over a dim wash of the first.
      const p = turn(PERIODS.aurora) * 2 * Math.PI;
      const blob = (i: number) => {
        const x = 50 + 35 * Math.sin(p * (0.7 + i * 0.23) + i * 2.1);
        const y = 50 + 30 * Math.cos(p * (0.5 + i * 0.31) + i * 1.3);
        const c = along(colours, turn(PERIODS.steady) + i / 3);
        return `radial-gradient(circle at ${x.toFixed(1)}% ${y.toFixed(1)}%, ${c} 0%, ${c}00 60%)`;
      };
      return { background: `${blob(0)}, ${blob(1)}, ${blob(2)}, ${mix("#000000", colours[0]!, 0.35)}`, level: 1 };
    }
  }
}

/**
 * The dark band's centre across the screen (0 = left edge, 1 = right edge)
 * at `t` seconds. It runs from well off one side to well off the other, so
 * every pixel spends a few seconds in its black middle on each pass.
 */
export const BLACK_BAND = { width: 0.4, solid: [0.35, 0.65] as const, from: -0.4, to: 1.4 } as const;
export function blackBand(t: number): number {
  const f = (((t / PERIODS.blackBand) % 1) + 1) % 1;
  return BLACK_BAND.from + (BLACK_BAND.to - BLACK_BAND.from) * f;
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
