/**
 * The front-door kiosk's clocks and screensaver: today's date and time in
 * the property's own time zone, a reception-style row of world clocks, and
 * the slow drift that keeps a screen left on all day from burning in. Pure.
 */

/** Five cities a 5-star reception would show, west to east. */
export const WORLD_CLOCKS = [
  { city: "New York", tz: "America/New_York" },
  { city: "London", tz: "Europe/London" },
  { city: "New Delhi", tz: "Asia/Kolkata" },
  { city: "Singapore", tz: "Asia/Singapore" },
  { city: "Tokyo", tz: "Asia/Tokyo" },
] as const;

/** No tap for this long: the check-in on this tablet is cancelled and the welcome shows again. */
export const KIOSK_RESET_MS = 5 * 60_000;
/** And this much longer: the screensaver comes on. */
export const KIOSK_SAVER_MS = 5 * 60_000;

function parts(at: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const get = (t: string) => Number(f.formatToParts(at).find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

export type Hands = { hourDeg: number; minuteDeg: number; time: string; dayShift: -1 | 0 | 1 };

/** Where the hands point in a city, and whether it's yesterday or tomorrow there. */
export function clockHands(at: Date, tz: string, homeTz: string): Hands {
  const p = parts(at, tz);
  const home = parts(at, homeTz);
  const day = (x: { y: number; m: number; d: number }) => Date.UTC(x.y, x.m - 1, x.d);
  const diff = Math.round((day(p) - day(home)) / 86_400_000);
  return {
    hourDeg: ((p.h % 12) + p.min / 60) * 30,
    minuteDeg: p.min * 6,
    time: `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`,
    dayShift: diff > 0 ? 1 : diff < 0 ? -1 : 0,
  };
}

/** "Saturday 17 October" and "14:32", in the property's time zone. */
export function kioskNow(at: Date, tz: string): { date: string; time: string } {
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(at);
  const p = parts(at, tz);
  return { date, time: `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}` };
}

/**
 * The screensaver's position: a slow, smooth wander (a few pixels a minute,
 * never more than ±48 by ±28 px) so nothing sits on the same pixels for long.
 * Moving only, never scaling, so the clocks are never distorted.
 */
export function burnDrift(ms: number): { x: number; y: number } {
  const t = ms / 60_000;
  return { x: Math.round(48 * Math.sin(t / 3.1)), y: Math.round(28 * Math.sin(t / 4.7 + 1)) };
}
