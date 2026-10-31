/**
 * The check-out goodbye (properties.checkout_goodbye, migration 0068): on a
 * guest's check-out day the door tablet shows them a personal goodbye, a
 * safe-journey wish and where the keys go, and their guest guide puts the
 * check-out things first. Pure; tested in tests/checkout-goodbye.test.ts.
 *
 * When it shows: from `startBeforeMinutes` before their check-out time until
 * it. With a late check-out booked (their check-out time is after the
 * standard one), from `lateLeadMinutes` before the standard check-out until
 * their late time. It goes early when they tap Express check-out, the host
 * dismisses it or marks them checked out.
 */
import { zonedToUtc } from "./guide";

export type Goodbye = {
  on: boolean;
  /** The goodbye in the host's words; {name} is the guest's first name. */
  message: string;
  /** Where the keys go. */
  keyDrop: string;
  /** Remind them to lock the front door behind them. */
  lockDoor: boolean;
  startBeforeMinutes: number;
  lateLeadMinutes: number;
  /** The card's background colour on the door tablet. */
  colour: string;
};

export const DEFAULT_GOODBYE: Goodbye = {
  on: true,
  message: "Thank you for staying with us, {name}. Safe travels, and we hope to see you again.",
  keyDrop: "Please leave your keys on the table in your room, and close the door behind you.",
  lockDoor: true,
  startBeforeMinutes: 120,
  lateLeadMinutes: 30,
  colour: "#CFE3EC",
};

/** Card colours offered first (any colour can be picked too). */
export const CARD_COLOURS = [
  "#F6E2A8",
  "#F4C9B7",
  "#CFE3EC",
  "#D6E9C6",
  "#E3D4F0",
  "#FFFFFF",
  "#183B2B",
  "#7A2E2E",
] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;
export const cardColour = (v: unknown, d: string) =>
  typeof v === "string" && HEX.test(v) ? v.toUpperCase() : d;

/** Dark text on a light card, white on a dark one. */
export function cardInk(bg: string): string {
  const n = Number.parseInt(bg.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.55 ? "#1B1B1B" : "#FFFFFF";
}

/** A stronger shade of the card's colour for its outline (solid, never see-through). */
export function cardEdge(bg: string): string {
  const n = Number.parseInt(bg.slice(1), 16);
  const dark = cardInk(bg) === "#FFFFFF";
  const f = (c: number) =>
    Math.round(dark ? c + (255 - c) * 0.35 : c * 0.55)
      .toString(16)
      .padStart(2, "0");
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`.toUpperCase();
}

export const START_CHOICES = [30, 60, 120, 180, 240] as const;
export const LATE_LEAD_CHOICES = [0, 15, 30, 60] as const;
/** Express check-out's reminder closes by itself after this long. */
export const EXPRESS_CLOSE_MINUTES = 10;
/** More guests than this on one screen: pages, turning every few seconds. */
export const PER_PAGE = 10;
export const PAGE_SECONDS = 5;

const text = (v: unknown, d: string, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : d;
const pick = (v: unknown, list: readonly number[], d: number) =>
  typeof v === "number" && list.includes(v) ? v : d;

export function normaliseGoodbye(raw: unknown): Goodbye {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    on: typeof r["on"] === "boolean" ? r["on"] : DEFAULT_GOODBYE.on,
    message: text(r["message"], DEFAULT_GOODBYE.message, 300) || DEFAULT_GOODBYE.message,
    keyDrop: text(r["keyDrop"], DEFAULT_GOODBYE.keyDrop, 300),
    lockDoor: typeof r["lockDoor"] === "boolean" ? r["lockDoor"] : DEFAULT_GOODBYE.lockDoor,
    startBeforeMinutes: pick(
      r["startBeforeMinutes"],
      START_CHOICES,
      DEFAULT_GOODBYE.startBeforeMinutes,
    ),
    lateLeadMinutes: pick(r["lateLeadMinutes"], LATE_LEAD_CHOICES, DEFAULT_GOODBYE.lateLeadMinutes),
    colour: cardColour(r["colour"], DEFAULT_GOODBYE.colour),
  };
}

/** The goodbye in the host's words, with the guest's first name. */
export const goodbyeText = (g: Goodbye, firstName: string) =>
  g.message
    .replace(/\{name\}/g, firstName || "")
    .replace(/\s+([,.!])/g, "$1")
    .trim();

export type LeavingStay = {
  status: string;
  check_out_date: string;
  /** Their own check-out time (a late check-out moves it), else null for the standard one. */
  check_out_time: string | null;
  goodbye_dismissed_at?: string | null;
  mirror_of?: string | null;
};

/** When this stay's goodbye shows on the tablet (ms). */
export function goodbyeWindow(
  b: Pick<LeavingStay, "check_out_date" | "check_out_time">,
  standardTime: string,
  tz: string,
  g: Goodbye,
): { from: number; until: number; late: boolean } {
  const standard = zonedToUtc(b.check_out_date, standardTime.slice(0, 5), tz).getTime();
  const own = b.check_out_time
    ? zonedToUtc(b.check_out_date, b.check_out_time.slice(0, 5), tz).getTime()
    : standard;
  const late = own > standard;
  return {
    from: late ? standard - g.lateLeadMinutes * 60_000 : own - g.startBeforeMinutes * 60_000,
    until: own,
    late,
  };
}

const STAYING = new Set(["checked_in", "upcoming", "flagged", "needs_details"]);

/** Whether the goodbye shows for this stay now. */
export function showsGoodbye(
  b: LeavingStay,
  today: string,
  nowMs: number,
  standardTime: string,
  tz: string,
  g: Goodbye,
): boolean {
  if (!g.on || b.mirror_of || b.goodbye_dismissed_at || !STAYING.has(b.status)) return false;
  if (b.check_out_date !== today) return false;
  const w = goodbyeWindow(b, standardTime, tz, g);
  return nowMs >= w.from && nowMs < w.until;
}

/** The page of goodbyes on screen now: up to PER_PAGE, turning every PAGE_SECONDS. */
export function pageNow<T>(items: T[], nowMs: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const page = Math.floor(nowMs / (PAGE_SECONDS * 1000)) % pages;
  return { items: items.slice(page * PER_PAGE, (page + 1) * PER_PAGE), page, pages };
}

/* ------------------------------ check-in cards ------------------------------ */

/**
 * Check-in cards (properties.checkin_welcome, migration 0070): the same idea
 * for guests arriving today. A personal welcome on the door tablet from
 * their check-in time, never earlier: the time on their booking when there
 * is one (the host's own early or late check-in, free, agreed or paid
 * offline, or an accepted early check-in extra, which writes it there),
 * else the property's check-in time. It stays until the end of the day or
 * until they check in; the host can still put it up sooner (Show now, the
 * bell). Its Check in button starts with their photo ID, which finds the
 * stay, so a card never skips the ID check. startBeforeMinutes /
 * earlyLeadMinutes are kept in saved settings but no longer bring it
 * forward; startAt only ever starts it later.
 */
export type ArrivalCards = {
  on: boolean;
  /** {name} is the guest's first name. */
  message: string;
  startBeforeMinutes: number;
  /** A set time of day to start ("12:00") instead of a time before check-in; null = before check-in. */
  startAt: string | null;
  earlyLeadMinutes: number;
  /** The card's background colour on the door tablet. */
  colour: string;
};

export const DEFAULT_ARRIVALS: ArrivalCards = {
  on: true,
  message: "Welcome, {name}! We're so glad you're here. Tap Check in to get your room.",
  startBeforeMinutes: 120,
  startAt: null,
  earlyLeadMinutes: 30,
  colour: "#F6E2A8",
};

export function normaliseArrivals(raw: unknown): ArrivalCards {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    on: typeof r["on"] === "boolean" ? r["on"] : DEFAULT_ARRIVALS.on,
    message: text(r["message"], DEFAULT_ARRIVALS.message, 300) || DEFAULT_ARRIVALS.message,
    startBeforeMinutes: pick(
      r["startBeforeMinutes"],
      START_CHOICES,
      DEFAULT_ARRIVALS.startBeforeMinutes,
    ),
    startAt:
      typeof r["startAt"] === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(r["startAt"])
        ? r["startAt"]
        : null,
    earlyLeadMinutes: pick(
      r["earlyLeadMinutes"],
      LATE_LEAD_CHOICES,
      DEFAULT_ARRIVALS.earlyLeadMinutes,
    ),
    colour: cardColour(r["colour"], DEFAULT_ARRIVALS.colour),
  };
}

export const arrivalText = (a: ArrivalCards, firstName: string) =>
  a.message
    .replace(/\{name\}/g, firstName || "")
    .replace(/\s+([,.!])/g, "$1")
    .trim();

export type ArrivingStay = {
  status: string;
  check_in_date: string;
  /** Their own check-in time (set by the host, or by an accepted early check-in), else null for the property's. */
  check_in_time: string | null;
  welcome_card_dismissed_at?: string | null;
  /** The host asked for it to show now, whatever the time. */
  welcome_now_at?: string | null;
  mirror_of?: string | null;
};

/**
 * From when the arrival card shows (ms): their check-in time, never earlier,
 * and later only if the host set a later start. `time` is that check-in time
 * ("11:30"), shown on the card; `early` when it's before the property's.
 */
export function arrivalStart(
  b: Pick<ArrivingStay, "check_in_date" | "check_in_time">,
  standardTime: string,
  tz: string,
  a: ArrivalCards,
): { from: number; early: boolean; time: string } {
  const time = (b.check_in_time ?? standardTime).slice(0, 5);
  const early = time < standardTime.slice(0, 5);
  const from = zonedToUtc(b.check_in_date, time, tz).getTime();
  const later =
    a.startAt && a.startAt > time ? zonedToUtc(b.check_in_date, a.startAt, tz).getTime() : 0;
  return { from: Math.max(from, later), early, time };
}

const ARRIVING = new Set(["upcoming", "flagged", "needs_details"]);

/** Whether a guest arriving today has a card on the tablet now. */
export function showsArrival(
  b: ArrivingStay,
  today: string,
  nowMs: number,
  standardTime: string,
  tz: string,
  a: ArrivalCards,
): boolean {
  if (b.mirror_of || b.welcome_card_dismissed_at || !ARRIVING.has(b.status)) return false;
  if (b.check_in_date !== today) return false;
  if (b.welcome_now_at) return true;
  return a.on && nowMs >= arrivalStart(b, standardTime, tz, a).from;
}

/** A goodbye the host asked to show now shows whatever the time, until they leave or it's taken off. */
export function showsGoodbyeNow(
  b: LeavingStay & { goodbye_now_at?: string | null },
  today: string,
  nowMs: number,
  standardTime: string,
  tz: string,
  g: Goodbye,
): boolean {
  if (b.goodbye_now_at && !b.goodbye_dismissed_at && !b.mirror_of && STAYING.has(b.status))
    return b.check_out_date === today;
  return showsGoodbye(b, today, nowMs, standardTime, tz, g);
}
