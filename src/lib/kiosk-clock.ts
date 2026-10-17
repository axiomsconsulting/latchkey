/**
 * The front-door kiosk's clocks and screensaver: today's date and time in
 * the property's own time zone, a reception-style row of world clocks, and
 * the slow drift that keeps a screen left on all day from burning in. Pure.
 */

/** Major hubs to choose the side clocks from; well-known ones are preferred. */
export const CLOCK_CITIES: Array<{ city: string; tz: string; famous: boolean }> = [
  { city: "Honolulu", tz: "Pacific/Honolulu", famous: false },
  { city: "Los Angeles", tz: "America/Los_Angeles", famous: true },
  { city: "Chicago", tz: "America/Chicago", famous: false },
  { city: "New York", tz: "America/New_York", famous: true },
  { city: "São Paulo", tz: "America/Sao_Paulo", famous: false },
  { city: "London", tz: "Europe/London", famous: true },
  { city: "Paris", tz: "Europe/Paris", famous: true },
  { city: "Dubai", tz: "Asia/Dubai", famous: true },
  { city: "New Delhi", tz: "Asia/Kolkata", famous: true },
  { city: "Bangkok", tz: "Asia/Bangkok", famous: false },
  { city: "Singapore", tz: "Asia/Singapore", famous: true },
  { city: "Hong Kong", tz: "Asia/Hong_Kong", famous: true },
  { city: "Tokyo", tz: "Asia/Tokyo", famous: true },
  { city: "Sydney", tz: "Australia/Sydney", famous: true },
  { city: "Auckland", tz: "Pacific/Auckland", famous: false },
];

/** Minutes a zone is ahead of UTC at a moment (summer time included). */
export function utcOffset(at: Date, tz: string): number {
  const p = parts(at, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/**
 * The five reception clocks for a property: its own time in the middle, two
 * cities behind it on the left (furthest behind first) and two ahead on the
 * right. Each side aims for roughly 5 and 8 hours away, favouring the
 * best-known cities and never two with the same time.
 */
export function worldClocksFor(homeTz: string, homeCity: string, at: Date): Array<{ city: string; tz: string; home: boolean }> {
  const home = utcOffset(at, homeTz);
  const pool = CLOCK_CITIES.filter((c) => c.tz !== homeTz && c.city !== homeCity).map((c) => {
    let rel = (utcOffset(at, c.tz) - home) / 60;
    // Keep within a day either way, the short way round.
    if (rel > 14) rel -= 24;
    if (rel < -12) rel += 24;
    return { ...c, rel };
  });
  const used = new Set<number>([0]);
  const pick = (target: number) => {
    const side = pool.filter((c) => Math.sign(c.rel) === Math.sign(target) && !used.has(c.rel));
    const best = side.sort((a, b) => Math.abs(a.rel - target) + (a.famous ? 0 : 1.5) - (Math.abs(b.rel - target) + (b.famous ? 0 : 1.5)))[0];
    if (best) used.add(best.rel);
    return best ?? null;
  };
  const behind = [pick(-8), pick(-5)].filter((c): c is NonNullable<typeof c> => !!c).sort((a, b) => a.rel - b.rel);
  const ahead = [pick(5), pick(8)].filter((c): c is NonNullable<typeof c> => !!c).sort((a, b) => a.rel - b.rel);
  const strip = (c: { city: string; tz: string }) => ({ city: c.city, tz: c.tz, home: false });
  return [...behind.map(strip), { city: homeCity, tz: homeTz, home: true }, ...ahead.map(strip)];
}

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
