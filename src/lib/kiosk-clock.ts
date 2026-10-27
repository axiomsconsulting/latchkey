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
export function worldClocksFor(
  homeTz: string,
  homeCity: string,
  at: Date,
): Array<{ city: string; tz: string; home: boolean }> {
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
    const best = side.sort(
      (a, b) =>
        Math.abs(a.rel - target) +
        (a.famous ? 0 : 1.5) -
        (Math.abs(b.rel - target) + (b.famous ? 0 : 1.5)),
    )[0];
    if (best) used.add(best.rel);
    return best ?? null;
  };
  const behind = [pick(-8), pick(-5)]
    .filter((c): c is NonNullable<typeof c> => !!c)
    .sort((a, b) => a.rel - b.rel);
  const ahead = [pick(5), pick(8)]
    .filter((c): c is NonNullable<typeof c> => !!c)
    .sort((a, b) => a.rel - b.rel);
  const strip = (c: { city: string; tz: string }) => ({ city: c.city, tz: c.tz, home: false });
  return [...behind.map(strip), { city: homeCity, tz: homeTz, home: true }, ...ahead.map(strip)];
}

function parts(at: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
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
export function kioskNow(at: Date, tz: string): { date: string; time: string; shortDate: string } {
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(at);
  // "Sat 17 Oct": for phones when the property's name needs the room.
  const shortDate = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(at)
    .replace(/,/g, "");
  const p = parts(at, tz);
  return {
    date,
    shortDate,
    time: `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`,
  };
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

/**
 * Whether quiet hours are on now in the property's time zone, and when they
 * end ("07:00"). Handles the usual overnight span (22:00 → 07:00).
 */
export function quietNow(
  at: Date,
  tz: string,
  start: string,
  end: string,
): { active: boolean; until: string } {
  const p = parts(at, tz);
  const mins = p.h * 60 + p.min;
  const toMin = (t: string) => {
    const [h = "0", m = "0"] = t.slice(0, 5).split(":");
    return Number(h) * 60 + Number(m);
  };
  const s = toMin(start);
  const e = toMin(end);
  const active = s === e ? false : s < e ? mins >= s && mins < e : mins >= s || mins < e;
  return { active, until: end.slice(0, 5) };
}

/* ------------------------------ day progress ------------------------------ */

export type DayPhase = "night" | "dawn" | "morning" | "midday" | "afternoon" | "dusk" | "evening";

/** Rough latitude for a time zone (no location needed): the main city, else the region. */
const ZONE_LATITUDE: Record<string, number> = {
  "Europe/London": 51.5,
  "Europe/Dublin": 53.3,
  "Europe/Lisbon": 38.7,
  "Europe/Madrid": 40.4,
  "Europe/Paris": 48.9,
  "Europe/Rome": 41.9,
  "Europe/Berlin": 52.5,
  "Europe/Amsterdam": 52.4,
  "Europe/Stockholm": 59.3,
  "Europe/Oslo": 59.9,
  "Europe/Helsinki": 60.2,
  "Europe/Athens": 38,
  "Europe/Istanbul": 41,
  "Europe/Moscow": 55.8,
  "Atlantic/Reykjavik": 64.1,
  "Africa/Cairo": 30,
  "Africa/Lagos": 6.5,
  "Africa/Nairobi": -1.3,
  "Africa/Johannesburg": -26.2,
  "Asia/Dubai": 25.2,
  "Asia/Kolkata": 22.6,
  "Asia/Singapore": 1.3,
  "Asia/Bangkok": 13.8,
  "Asia/Hong_Kong": 22.3,
  "Asia/Shanghai": 31.2,
  "Asia/Tokyo": 35.7,
  "Asia/Seoul": 37.6,
  "Australia/Sydney": -33.9,
  "Australia/Melbourne": -37.8,
  "Australia/Perth": -32,
  "Australia/Brisbane": -27.5,
  "Pacific/Auckland": -36.8,
  "America/New_York": 40.7,
  "America/Chicago": 41.9,
  "America/Denver": 39.7,
  "America/Los_Angeles": 34,
  "America/Toronto": 43.7,
  "America/Vancouver": 49.3,
  "America/Mexico_City": 19.4,
  "America/Sao_Paulo": -23.6,
  "America/Argentina/Buenos_Aires": -34.6,
  "America/Santiago": -33.4,
  "America/Lima": -12,
  "America/Bogota": 4.7,
};
const REGION_LATITUDE: Record<string, number> = {
  Europe: 50,
  Africa: 0,
  Asia: 30,
  Australia: -33,
  Pacific: -20,
  America: 35,
  Atlantic: 40,
  Indian: -10,
  Antarctica: -75,
};

export function zoneLatitude(tz: string): number {
  return ZONE_LATITUDE[tz] ?? REGION_LATITUDE[tz.split("/")[0] ?? ""] ?? 45;
}

/**
 * Sunrise and sunset in local clock hours for a zone on a day, from the
 * standard daylight formula (the sun's declination and a rough latitude for
 * the zone), with noon at 12:00 standard time, an hour later in summer time.
 * Close enough to say dawn from morning; no location or service needed.
 */
export function sunTimes(at: Date, tz: string): { sunrise: number; sunset: number; noon: number } {
  const p = parts(at, tz);
  const dayOfYear = Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(p.y, 0, 0)) / 86_400_000);
  const lat = (zoneLatitude(tz) * Math.PI) / 180;
  const decl = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
  const cosH = Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(decl)));
  const dayHours = (2 * ((Math.acos(cosH) * 180) / Math.PI)) / 15;
  const standard = Math.min(
    utcOffset(new Date(Date.UTC(p.y, 0, 15)), tz),
    utcOffset(new Date(Date.UTC(p.y, 6, 15)), tz),
  );
  const noon = 12 + (utcOffset(at, tz) - standard) / 60;
  return { sunrise: noon - dayHours / 2, sunset: noon + dayHours / 2, noon };
}

/**
 * Where the day is at a property: its phase, and how far the sun is across
 * the sky (0 at sunrise, 1 at sunset) or the moon across the night.
 */
export function dayProgress(
  at: Date,
  tz: string,
): { phase: DayPhase; sun: number | null; moon: number | null } {
  const p = parts(at, tz);
  const h = p.h + p.min / 60;
  const { sunrise, sunset, noon } = sunTimes(at, tz);
  const phase: DayPhase =
    h >= sunrise - 0.75 && h < sunrise + 0.75
      ? "dawn"
      : h >= sunrise + 0.75 && h < noon - 1.5
        ? "morning"
        : h >= noon - 1.5 && h < noon + 1.5
          ? "midday"
          : h >= noon + 1.5 && h < sunset - 1
            ? "afternoon"
            : h >= sunset - 1 && h < sunset + 0.75
              ? "dusk"
              : h >= sunset + 0.75 && h < Math.max(23, sunset + 1.5)
                ? "evening"
                : "night";
  if (h >= sunrise && h <= sunset)
    return { phase, sun: (h - sunrise) / (sunset - sunrise), moon: null };
  const nightLength = 24 - (sunset - sunrise);
  const since = h > sunset ? h - sunset : h + 24 - sunset;
  return { phase, sun: null, moon: Math.min(1, Math.max(0, since / nightLength)) };
}
