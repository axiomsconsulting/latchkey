/**
 * Door tablets per property (kiosk_devices, migration 0067): each has a
 * number (1, 2, 3…) and a name the host gives it. A tablet that opens the
 * kiosk joins by itself: pending, showing a six-digit setup code the host
 * types into the dashboard, or straight away when it's on the same Wi-Fi as
 * (or close by) a tablet already in use and the host allows that
 * (properties.kiosk_auto_pair). Pure; tested in tests/kiosk-devices.test.ts.
 */
import { nearKiosk, type Fix } from "./stay-access";

export const MAX_TABLETS = 99;
/** A setup code is good for this long (it's renewed while the tablet stays open). */
export const PAIR_CODE_HOURS = 24;
/** A tablet already in use counts as "on this Wi-Fi" if it reported within this long. */
export const SAME_NETWORK_MINUTES = 20;

/** Six digits, never starting with 0 so it reads the same everywhere. */
export function newPairCode(random: () => number = Math.random): string {
  return String(100_000 + Math.floor(random() * 900_000));
}

/** "482 913" from what the host typed ("482-913", " 482913 "), or null. */
export function readPairCode(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return /^[1-9]\d{5}$/.test(digits) ? digits : null;
}

export const showPairCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** The lowest number no tablet of this property has. */
export function nextNumber(taken: Array<number | null | undefined>): number | null {
  const used = new Set(taken.filter((n): n is number => typeof n === "number"));
  for (let n = 1; n <= MAX_TABLETS; n++) if (!used.has(n)) return n;
  return null;
}

/** "Front door", or "Tablet 2" until it has a name. */
export const tabletName = (d: { label?: string | null; number?: number | null }) =>
  d.label?.trim() || (d.number ? `Tablet ${d.number}` : "Door tablet");

export type InUse = {
  netHash: string | null;
  netDay: string | null;
  lastSeenAt: string | null;
  fix: Fix | null;
};

/**
 * Is a new tablet at the property? Same connection (a one-day pseudonym of
 * the public address) as a tablet seen in the last 20 minutes, or close to
 * where one is, when both locations are known.
 */
export function besideTabletInUse(
  me: { netHash: string | null; day: string; fix: Fix | null },
  inUse: InUse[],
  nowMs: number,
): boolean {
  return inUse.some((t) => {
    const recent =
      !!t.lastSeenAt && nowMs - Date.parse(t.lastSeenAt) <= SAME_NETWORK_MINUTES * 60_000;
    if (recent && me.netHash && t.netHash === me.netHash && t.netDay === me.day) return true;
    return !!me.fix && !!t.fix && nearKiosk(t.fix, me.fix);
  });
}

/** Rows and columns for a wall of tablets (or their cameras): as square as it can be, wider than tall. */
export function gridFor(n: number): { cols: number; rows: number } {
  if (n <= 0) return { cols: 1, rows: 0 };
  const cols = Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols) };
}

/** Seen recently enough to count as on now. */
export const isOnline = (lastSeenAt: string | null, nowMs: number) =>
  !!lastSeenAt && nowMs - Date.parse(lastSeenAt) < 7 * 60_000;

export type CameraBlock =
  "not_paired" | "not_allowed" | "offline" | "no_camera" | "browser_blocked" | "needs_allow";

/**
 * Why a tablet's live camera can't be opened now, so the host is told
 * instead of waiting: not set up yet, not allowed by the host, not seen
 * lately, no camera, or its browser refuses or would ask (nobody's there
 * to tap Allow). Null: try.
 */
export function cameraBlock(
  d: {
    status: string | null;
    camera_allowed: boolean | null;
    last_seen_at: string | null;
    screen?: { camera?: boolean | null; camPermission?: string | null } | null;
  },
  nowMs: number,
): CameraBlock | null {
  if (d.status !== "confirmed") return "not_paired";
  if (!d.camera_allowed) return "not_allowed";
  if (!isOnline(d.last_seen_at, nowMs)) return "offline";
  if (d.screen?.camera === false || d.screen?.camPermission === "none") return "no_camera";
  if (d.screen?.camPermission === "denied") return "browser_blocked";
  if (d.screen?.camPermission === "prompt") return "needs_allow";
  return null;
}
