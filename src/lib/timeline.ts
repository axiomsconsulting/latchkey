/**
 * The room timeline shared by Bookings and Housekeeping: rooms down the side,
 * time across, from a single day in hours to a month in days. Times are the
 * property's wall clock as minutes from 1 Jan 1970 00:00 (no time zone
 * maths: a stay's "15:00 on 20 Oct" is placed at 15:00 on 20 Oct). The view
 * is a start and a span; zooming keeps the moment under the finger still,
 * panning moves by a share of the span. Pure.
 */

export const MINUTES_PER_DAY = 1440;

/** ISO date → whole days since 1 Jan 1970. */
export const dayNumber = (iso: string) => Math.round(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000);
export const isoOfDay = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

/** "HH:MM" (or "HH:MM:SS") → minutes from midnight. */
export const clockMinutes = (t: string) => {
  const [h = "0", m = "0"] = t.split(":");
  return Number(h) * 60 + Number(m);
};

/** A date and a time on the property's clock. */
export const at = (iso: string, time: string) => dayNumber(iso) * MINUTES_PER_DAY + clockMinutes(time);

export type View = { from: number; span: number };

export const ZOOMS = [
  { key: "day", span: 18 * 60 },
  { key: "3days", span: 3 * MINUTES_PER_DAY },
  { key: "week", span: 7 * MINUTES_PER_DAY },
  { key: "2weeks", span: 14 * MINUTES_PER_DAY },
  { key: "month", span: 31 * MINUTES_PER_DAY },
] as const;
export type ZoomKey = (typeof ZOOMS)[number]["key"];

/** Closest in, furthest out. */
export const SPAN = { min: 4 * 60, max: 62 * MINUTES_PER_DAY } as const;

/**
 * A preset view around a day: a single day runs 06:00 to midnight (the
 * working day); longer views start the day before, so the leaving guests show.
 */
export function viewFor(zoom: ZoomKey, day: string): View {
  const span = ZOOMS.find((z) => z.key === zoom)!.span;
  const d = dayNumber(day) * MINUTES_PER_DAY;
  if (zoom === "day") return { from: d + 6 * 60, span };
  if (zoom === "3days") return { from: d, span };
  return { from: d - MINUTES_PER_DAY, span };
}

/** The preset closest to a span (for showing which zoom is on). */
export function zoomOf(span: number): ZoomKey {
  return ZOOMS.reduce((best, z) => (Math.abs(Math.log(z.span / span)) < Math.abs(Math.log(best.span / span)) ? z : best)).key;
}

const clampSpan = (s: number) => Math.min(SPAN.max, Math.max(SPAN.min, s));

/** Zoom by `factor` (under 1 zooms in) keeping the moment at `anchor` (0..1 across) where it is. */
export function zoomAt(v: View, factor: number, anchor = 0.5): View {
  const span = clampSpan(v.span * factor);
  const pivot = v.from + v.span * anchor;
  return { from: Math.round(pivot - span * anchor), span: Math.round(span) };
}

/** Move by a share of the span (1 = a whole screen later). */
export const panBy = (v: View, share: number): View => ({ from: Math.round(v.from + v.span * share), span: v.span });

/** One step earlier or later: a day in the day view, otherwise most of a screen. */
export function step(v: View, dir: 1 | -1): View {
  const by = v.span <= MINUTES_PER_DAY ? MINUTES_PER_DAY : Math.max(MINUTES_PER_DAY, Math.round(v.span / MINUTES_PER_DAY - 1) * MINUTES_PER_DAY);
  return { from: v.from + dir * by, span: v.span };
}

/** Where something from `start` to `end` sits across the view, as shares of the width; null when it's off screen. */
export function place(v: View, start: number, end: number): { left: number; width: number; cutStart: boolean; cutEnd: boolean } | null {
  const a = Math.max(start, v.from);
  const b = Math.min(end, v.from + v.span);
  if (b <= a) return null;
  return { left: (a - v.from) / v.span, width: (b - a) / v.span, cutStart: start < v.from, cutEnd: end > v.from + v.span };
}

/** Every day the view touches, as ISO dates. */
export function daysIn(v: View): string[] {
  const first = Math.floor(v.from / MINUTES_PER_DAY);
  const last = Math.floor((v.from + v.span - 1) / MINUTES_PER_DAY);
  const out: string[] = [];
  for (let d = first; d <= last; d++) out.push(isoOfDay(d));
  return out;
}

/** The day in the middle of the view: what "this day" means for its readiness and totals. */
export const centreDay = (v: View) => isoOfDay(Math.floor((v.from + v.span / 2) / MINUTES_PER_DAY));

const STEPS = [30, 60, 120, 180, 360, 720, MINUTES_PER_DAY, 2 * MINUTES_PER_DAY, 7 * MINUTES_PER_DAY];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The marks along the top: hours when zoomed in (with each midnight as a day
 * mark), days when zoomed out, never closer than `minPx` apart.
 */
export function ticks(v: View, widthPx: number, minPx = 56): Array<{ at: number; label: string; day: boolean }> {
  const perMin = widthPx / v.span;
  const stepMin = STEPS.find((s) => s * perMin >= minPx) ?? STEPS[STEPS.length - 1]!;
  const out: Array<{ at: number; label: string; day: boolean }> = [];
  const first = Math.ceil(v.from / stepMin) * stepMin;
  for (let t = first; t <= v.from + v.span; t += stepMin) {
    const day = t % MINUTES_PER_DAY === 0;
    const d = new Date(Math.floor(t / MINUTES_PER_DAY) * 86_400_000);
    const m = t % MINUTES_PER_DAY;
    const clock = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    out.push({ at: t, day, label: stepMin >= MINUTES_PER_DAY || day ? `${DOW[d.getUTCDay()]} ${d.getUTCDate()}` : clock });
  }
  return out;
}

/** "20 Oct" or "20–26 Oct" or "28 Oct – 3 Nov" for the toolbar. */
export function rangeLabel(v: View): string {
  const days = daysIn(v);
  const f = (iso: string, month: boolean) => {
    const d = new Date(`${iso}T12:00:00Z`);
    return `${d.getUTCDate()}${month ? ` ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}` : ""}`;
  };
  const a = days[0]!;
  const b = days[days.length - 1]!;
  if (a === b) return `${DOW[new Date(`${a}T12:00:00Z`).getUTCDay()]} ${f(a, true)}`;
  return a.slice(0, 7) === b.slice(0, 7) ? `${f(a, false)}–${f(b, true)}` : `${f(a, true)} – ${f(b, true)}`;
}

/** Now on the property's clock, in timeline minutes. */
export function nowOn(tz: string, date: Date = new Date()): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return at(`${p["year"]}-${p["month"]}-${p["day"]}`, `${p["hour"]}:${p["minute"]}`);
}

/** A stay from its check-in to its check-out, at the stay's own times or the property's. */
export function stayTimes(b: { check_in_date: string; check_out_date: string; check_in_time?: string | null; check_out_time?: string | null }, defaults: { checkIn: string; checkOut: string }): { start: number; end: number } {
  return { start: at(b.check_in_date, (b.check_in_time ?? defaults.checkIn).slice(0, 5)), end: at(b.check_out_date, (b.check_out_time ?? defaults.checkOut).slice(0, 5)) };
}

/** Overlapping items on separate lines in their row, earliest first. */
export function laneOf<T extends { id: string; start: number; end: number }>(items: T[]): { lane: Record<string, number>; count: number } {
  const ends: number[] = [];
  const lane: Record<string, number> = {};
  for (const it of [...items].sort((a, b) => a.start - b.start || b.end - a.end)) {
    let l = ends.findIndex((e) => e <= it.start);
    if (l < 0) l = ends.length;
    ends[l] = it.end;
    lane[it.id] = l;
  }
  return { lane, count: Math.max(1, ends.length) };
}

/** The range of whole days to load for a view: padded and aligned, so a little panning never loads again. */
export function loadRange(v: View, block = 14): { from: string; to: string } {
  const first = Math.floor(v.from / MINUTES_PER_DAY);
  const last = Math.floor((v.from + v.span) / MINUTES_PER_DAY);
  const a = Math.floor(first / block) * block - block;
  const b = Math.ceil((last + 1) / block) * block + block;
  return { from: isoOfDay(a), to: isoOfDay(b) };
}
