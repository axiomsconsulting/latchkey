/**
 * Room devices: lights and switches in a room that the guest staying there
 * controls from their own stay guide, through the host's SmartThings account
 * (a Tapo, Hue or other bulb linked to SmartThings). Pure: which controls a
 * device offers, its state from SmartThings' status, the commands to send,
 * the presets, and when a guest may use them. No network or database.
 */
import { zonedToUtc } from "./guide";

/** SmartThings capabilities Latchkey uses. */
export const CAPABILITIES = ["switch", "switchLevel", "colorTemperature", "colorControl"] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type Control = "power" | "brightness" | "warmth" | "colour";

export const WARMTH = { min: 2200, max: 6500 } as const;
/** Guests may tap this often per minute, across the room's devices. */
export const USES_PER_MINUTE = 40;

export function knownCapabilities(raw: unknown): Capability[] {
  const list = Array.isArray(raw) ? raw : [];
  return CAPABILITIES.filter((c) => list.includes(c));
}

/** What the guest's panel shows for a device. Nothing without on/off. */
export function controlsFor(caps: readonly string[]): Control[] {
  if (!caps.includes("switch")) return [];
  const out: Control[] = ["power"];
  if (caps.includes("switchLevel")) out.push("brightness");
  if (caps.includes("colorTemperature")) out.push("warmth");
  if (caps.includes("colorControl")) out.push("colour");
  return out;
}

export function isLight(caps: readonly string[]): boolean {
  return caps.some((c) => c === "switchLevel" || c === "colorTemperature" || c === "colorControl");
}

export type DeviceState = {
  on: boolean | null;
  /** 1-100 */
  level: number | null;
  /** Kelvin */
  kelvin: number | null;
  /** 0-360 */
  hue: number | null;
  /** 0-100 */
  saturation: number | null;
  online: boolean;
};

export const UNKNOWN_STATE: DeviceState = {
  on: null,
  level: null,
  kelvin: null,
  hue: null,
  saturation: null,
  online: false,
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() && Number.isFinite(Number(v))
      ? Number(v)
      : null;

/** Reads SmartThings' /devices/{id}/status (the main component) and /health. */
export function stateFromStatus(status: unknown, health?: unknown): DeviceState {
  type Attrs = Record<string, Record<string, { value?: unknown }> | undefined>;
  const main: Attrs = (status as { components?: { main?: Attrs } } | null)?.components?.main ?? {};
  const sw = main["switch"]?.["switch"]?.value;
  const level = num(main["switchLevel"]?.["level"]?.value);
  const kelvin = num(main["colorTemperature"]?.["colorTemperature"]?.value);
  const hue = num(main["colorControl"]?.["hue"]?.value);
  const sat = num(main["colorControl"]?.["saturation"]?.value);
  const h = (health as { state?: unknown } | null)?.state;
  return {
    on: sw === "on" ? true : sw === "off" ? false : null,
    level: level === null ? null : clamp(level, 0, 100),
    kelvin,
    // SmartThings keeps hue as 0-100.
    hue: hue === null ? null : Math.round(clamp(hue, 0, 100) * 3.6),
    saturation: sat === null ? null : clamp(sat, 0, 100),
    online: h === undefined ? sw !== undefined : h === "ONLINE",
  };
}

export type Command = {
  power?: boolean;
  level?: number;
  kelvin?: number;
  hue?: number;
  saturation?: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** Keeps only what the device can do, within its ranges. Empty = nothing to send. */
export function cleanCommand(
  raw: { [K in keyof Command]?: Command[K] | undefined },
  controls: readonly Control[],
): Command {
  const out: Command = {};
  if (typeof raw.power === "boolean" && controls.includes("power")) out.power = raw.power;
  if (typeof raw.level === "number" && controls.includes("brightness"))
    out.level = Math.round(clamp(raw.level, 1, 100));
  if (
    typeof raw.hue === "number" &&
    typeof raw.saturation === "number" &&
    controls.includes("colour")
  ) {
    out.hue = Math.round(clamp(raw.hue, 0, 360));
    out.saturation = Math.round(clamp(raw.saturation, 0, 100));
  } else if (typeof raw.kelvin === "number" && controls.includes("warmth")) {
    out.kelvin = Math.round(clamp(raw.kelvin, WARMTH.min, WARMTH.max));
  }
  return out;
}

export const isEmpty = (c: Command) => Object.keys(c).length === 0;

type StCommand = {
  component: "main";
  capability: Capability;
  command: string;
  arguments?: unknown[];
};

/** SmartThings' command list for /devices/{id}/commands. Off goes alone; anything else switches on. */
export function commandsFor(c: Command): StCommand[] {
  const cmd = (capability: Capability, command: string, args?: unknown[]): StCommand =>
    args
      ? { component: "main", capability, command, arguments: args }
      : { component: "main", capability, command };
  if (c.power === false) return [cmd("switch", "off")];
  const out: StCommand[] = [];
  if (c.power === true || c.level !== undefined || c.kelvin !== undefined || c.hue !== undefined)
    out.push(cmd("switch", "on"));
  if (c.level !== undefined) out.push(cmd("switchLevel", "setLevel", [c.level]));
  if (c.kelvin !== undefined) out.push(cmd("colorTemperature", "setColorTemperature", [c.kelvin]));
  if (c.hue !== undefined && c.saturation !== undefined)
    out.push(
      cmd("colorControl", "setColor", [
        { hue: Math.round((c.hue / 360) * 1000) / 10, saturation: c.saturation },
      ]),
    );
  return out;
}

/** What the light looks like after a command (demo mode, and the page before SmartThings answers). */
export function applyCommand(s: DeviceState, c: Command): DeviceState {
  if (c.power === false) return { ...s, on: false };
  const next = { ...s };
  if (!isEmpty(c)) next.on = true;
  if (c.level !== undefined) next.level = c.level;
  if (c.kelvin !== undefined) {
    next.kelvin = c.kelvin;
    next.hue = null;
    next.saturation = null;
  }
  if (c.hue !== undefined && c.saturation !== undefined) {
    next.hue = c.hue;
    next.saturation = c.saturation;
  }
  return next;
}

export type PresetKey = "bright" | "relax" | "night" | "sunset" | "ocean" | "forest" | "lavender";

export const PRESETS: Array<{ key: PresetKey; needs: Control; command: Command; swatch: string }> =
  [
    {
      key: "bright",
      needs: "brightness",
      command: { level: 100, kelvin: 4000 },
      swatch: "#fff4e0",
    },
    { key: "relax", needs: "brightness", command: { level: 50, kelvin: 2700 }, swatch: "#ffd59a" },
    { key: "night", needs: "brightness", command: { level: 8, kelvin: 2200 }, swatch: "#f2a65a" },
    {
      key: "sunset",
      needs: "colour",
      command: { level: 60, hue: 22, saturation: 85 },
      swatch: "#ff8a3d",
    },
    {
      key: "ocean",
      needs: "colour",
      command: { level: 60, hue: 200, saturation: 70 },
      swatch: "#3da9ff",
    },
    {
      key: "forest",
      needs: "colour",
      command: { level: 60, hue: 120, saturation: 55 },
      swatch: "#5fcf6b",
    },
    {
      key: "lavender",
      needs: "colour",
      command: { level: 50, hue: 275, saturation: 50 },
      swatch: "#b58cff",
    },
  ];

/** Presets this device can show. Presets needing warmth fall back to brightness only. */
export function presetsFor(controls: readonly Control[]) {
  return PRESETS.filter((p) => controls.includes(p.needs)).map((p) => ({
    ...p,
    command: cleanCommand(p.command, controls),
  }));
}

/** Colour for the swatch/glow on the guest page. */
export function glowOf(s: DeviceState): string {
  if (!s.on) return "transparent";
  if (s.hue !== null && s.saturation !== null && s.saturation > 5)
    return `hsl(${s.hue} ${Math.max(40, s.saturation)}% 62%)`;
  const k = s.kelvin ?? 3000;
  // Warm amber at 2200K to near white at 6500K.
  const t = (clamp(k, WARMTH.min, WARMTH.max) - WARMTH.min) / (WARMTH.max - WARMTH.min);
  return `hsl(${Math.round(32 + t * 18)} ${Math.round(100 - t * 70)}% ${Math.round(70 + t * 20)}%)`;
}

/* ------------------------------ guest access ------------------------------ */

export type AccessInput = {
  now: Date;
  timezone: string;
  checkInDate: string;
  checkOutDate: string;
  /** "HH:MM" from the stay, else the property's default. */
  checkInTime: string;
  checkOutTime: string;
  status: string;
  /** Someone else is checked in to this room and hasn't left. */
  roomTaken: boolean;
  /** Held for the host (no room yet). */
  held: boolean;
};

export type Access =
  | { ok: true; until: string }
  | { ok: false; reason: "not_yet" | "ended" | "taken" | "no_room"; from?: string };

/**
 * A guest controls the room's devices from their check-in time (or once
 * checked in, if earlier) until their check-out time, never while the last
 * guest is still checked in to the room, and never after checking out.
 */
export function deviceAccess(a: AccessInput): Access {
  if (a.held) return { ok: false, reason: "no_room" };
  const start = zonedToUtc(a.checkInDate, a.checkInTime, a.timezone);
  const end = zonedToUtc(a.checkOutDate, a.checkOutTime, a.timezone);
  if (a.status === "cancelled" || a.status === "checked_out" || a.now >= end)
    return { ok: false, reason: "ended" };
  const started = a.status === "checked_in" || a.now >= start;
  if (!started) return { ok: false, reason: "not_yet", from: start.toISOString() };
  if (a.roomTaken) return { ok: false, reason: "taken" };
  return { ok: true, until: end.toISOString() };
}

/* -------------------------------- demo mode -------------------------------- */

export const DEMO_DEVICE = {
  deviceId: "demo-light",
  label: "Sample bulb (demo)",
  capabilities: [...CAPABILITIES] as Capability[],
};

export function demoState(raw: unknown): DeviceState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<DeviceState>;
  return {
    on: typeof r.on === "boolean" ? r.on : false,
    level: typeof r.level === "number" ? r.level : 70,
    kelvin: typeof r.kelvin === "number" ? r.kelvin : 2700,
    hue: typeof r.hue === "number" ? r.hue : null,
    saturation: typeof r.saturation === "number" ? r.saturation : null,
    online: true,
  };
}
