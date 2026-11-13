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

/** The host's name ("Front door"), else what the tablet is ("Galaxy Tab A8"), else "Tablet 2". */
export const tabletName = (d: {
  label?: string | null;
  number?: number | null;
  autoName?: string | null;
}) => d.label?.trim() || d.autoName?.trim() || (d.number ? `Tablet ${d.number}` : "Door tablet");

/* ---------------------- how often a tablet is used ---------------------- */

/** Days a tablet must report on to count as used regularly. */
export const REGULAR_DAYS = 5;
/** A tablet seen on this many days or fewer may be temporary (a test, a guest's own phone). */
export const TEMPORARY_MAX_DAYS = 2;
/** …and is removed once quiet this long. */
export const FORGET_AFTER_DAYS = 7;
/** A tablet that never finished pairing goes sooner. */
export const FORGET_PENDING_AFTER_DAYS = 3;

export type Activity = "regular" | "occasional" | "new" | "temporary";

export type ActivityRow = {
  status: string;
  seenDays: number | null;
  createdAt: string;
  lastSeenAt: string | null;
  label: string | null;
  /** The host set it up: calibrated the screen, placed the camera, or it's in service mode. */
  setUp?: boolean;
};

const DAY = 86_400_000;

/** How the host's tablet list describes it. */
export function deviceActivity(r: ActivityRow, now: number): Activity {
  const days = r.seenDays ?? 1;
  if (days >= REGULAR_DAYS) return "regular";
  const last = r.lastSeenAt ? Date.parse(r.lastSeenAt) : Date.parse(r.createdAt);
  if (now - Date.parse(r.createdAt) < 3 * DAY) return "new";
  if (days <= TEMPORARY_MAX_DAYS && now - last > 2 * DAY) return "temporary";
  return "occasional";
}

/**
 * Should the daily sweep remove it? Only tablets opened once or twice and quiet since,
 * never one the host named or set up, and never one used on three or more days.
 */
export function forgetDevice(r: ActivityRow, now: number): boolean {
  if (r.label?.trim() || r.setUp) return false;
  const days = r.seenDays ?? 1;
  if (days > TEMPORARY_MAX_DAYS) return false;
  const last = r.lastSeenAt ? Date.parse(r.lastSeenAt) : Date.parse(r.createdAt);
  const quiet = now - last;
  return quiet > (r.status === "pending" ? FORGET_PENDING_AFTER_DAYS : FORGET_AFTER_DAYS) * DAY;
}

/** seen_days and last_day after a report on `today` (UTC date). */
export function nextSeen(
  r: { seenDays: number | null; lastDay: string | null },
  today: string,
): { seen_days: number; last_day: string } | null {
  if (r.lastDay === today) return null;
  // The day it was made counts once: the first report only records the day.
  const seen = r.seenDays ?? 0;
  return { seen_days: r.lastDay ? seen + 1 : Math.max(seen, 1), last_day: today };
}

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

/* ---------- the same tablet in another browser ---------- */

type OsFamily = "ipad" | "iphone" | "android" | "mac" | "windows" | "linux" | "other";

function osFamily(ua: string, touchPoints: number): OsFamily {
  if (/iPad/.test(ua)) return "ipad";
  if (/iPhone|iPod/.test(ua)) return "iphone";
  if (/Android/.test(ua)) return "android";
  // Newer iPads in Safari call themselves a Mac; only the touch screen gives them away.
  if (/Mac OS X|Macintosh/.test(ua)) return touchPoints > 1 ? "ipad" : "mac";
  if (/Windows/.test(ua)) return "windows";
  if (/Linux|CrOS/.test(ua)) return "linux";
  return "other";
}

/**
 * What kind of device this is, the same in every browser on it: operating system
 * family and screen, either way up. Browsers offer no real device identifier, so
 * two identical tablets give the same answer; twinFor tells those apart by whether
 * both are in use. Sharpness only on touch devices, as browser zoom changes it on computers.
 */
export function deviceSignature(
  ua: string,
  hw: { w: number; h: number; dpr?: number | undefined; touch?: number | undefined },
): string | null {
  const w = Math.round(Math.min(hw.w, hw.h));
  const h = Math.round(Math.max(hw.w, hw.h));
  if (!(w > 0)) return null;
  const os = osFamily(ua, hw.touch ?? 0);
  const touchDevice = os === "ipad" || os === "iphone" || os === "android";
  return `${os}|${w}x${h}${touchDevice && hw.dpr ? `@${Math.round(hw.dpr * 100) / 100}` : ""}`;
}

export type TwinRow = {
  id: string;
  status: string;
  device_sig: string | null;
  last_seen_at: string | null;
};

/**
 * The entry a device opening the kiosk should take over: the same kind of device,
 * and quiet for SAME_NETWORK_MINUTES. One still reporting is another tablet, or the
 * same one open in two browsers at once, which can't be told apart. A confirmed
 * entry is preferred, then the one seen last.
 */
export function twinFor(rows: TwinRow[], sig: string | null, now: number): TwinRow | null {
  if (!sig) return null;
  const quiet = rows.filter(
    (r) =>
      r.device_sig === sig &&
      (!r.last_seen_at || Date.parse(r.last_seen_at) < now - SAME_NETWORK_MINUTES * 60_000),
  );
  const seen = (r: TwinRow) => (r.last_seen_at ? Date.parse(r.last_seen_at) : 0);
  return (
    [...quiet].sort(
      (a, b) =>
        Number(b.status !== "pending") - Number(a.status !== "pending") || seen(b) - seen(a),
    )[0] ?? null
  );
}
