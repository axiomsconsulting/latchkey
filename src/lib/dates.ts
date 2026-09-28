/**
 * UK date/time helpers. All timestamps are stored in UTC; everything shown to a
 * host or guest is rendered in the property's timezone (Europe/London by default).
 */

export const DEFAULT_TIMEZONE = "Europe/London";

/** Parts of an instant expressed in a given IANA timezone. */
export function zonedParts(instant: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  const hour = out["hour"] === "24" ? "00" : (out["hour"] ?? "00");
  return {
    year: Number(out["year"]),
    month: Number(out["month"]),
    day: Number(out["day"]),
    hour: Number(hour),
    minute: Number(out["minute"]),
    date: `${out["year"]}-${out["month"]}-${out["day"]}`,
    time: `${hour}:${out["minute"]}`,
  };
}

/** "today" in the property timezone, as an ISO yyyy-mm-dd string. */
export function todayInZone(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  return zonedParts(now, timeZone).date;
}

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Tue 30 Sep" from an ISO yyyy-mm-dd date string. */
export function formatUkDate(isoDate: string, opts: { withYear?: boolean } = {}): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const base = `${DAYS_SHORT[dt.getUTCDay()]} ${d} ${MONTHS_SHORT[m - 1]}`;
  return opts.withYear ? `${base} ${y}` : base;
}

/** "15:00" from a Postgres time value such as "15:00:00". */
export function formatUkTime(time: string | null | undefined): string {
  if (!time) return "";
  return time.slice(0, 5);
}

/** "Tue 30 Sep, 15:00" */
export function formatUkDateTime(isoDate: string, time?: string | null): string {
  const d = formatUkDate(isoDate);
  const t = formatUkTime(time);
  return t ? `${d}, ${t}` : d;
}

/** Nights between two ISO dates. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Add days to an ISO yyyy-mm-dd date. */
export function addDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Day of week 0-6 (Sun-Sat) for an ISO date. */
export function dayOfWeek(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

export type StayState =
  | "arriving_today"
  | "in_stay"
  | "departing_today"
  | "upcoming"
  | "past"
  | "cancelled"
  | "needs_details";

/**
 * Derives the display state. Time-derived states are never stored: they are
 * computed from dates and stored status in the property's timezone.
 */
export function stayState(
  booking: {
    status: string;
    check_in_date: string;
    check_out_date: string;
  },
  today: string,
): StayState {
  if (booking.status === "cancelled") return "cancelled";
  if (booking.status === "needs_details") return "needs_details";
  if (booking.check_out_date === today) return "departing_today";
  if (booking.check_in_date === today) return "arriving_today";
  if (booking.check_in_date < today && booking.check_out_date > today) return "in_stay";
  if (booking.check_out_date < today) return "past";
  return "upcoming";
}
