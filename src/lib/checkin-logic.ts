/**
 * Pure rules for guest self check-in. No network or database access so they
 * can be unit tested.
 */

import { platformKey } from "./booking-sites";
import { addDays } from "./dates";

export type CheckinMethod = "photo_id" | "last4" | "self_declare";

export type CheckinMethods = {
  order: CheckinMethod[];
  enabled: Record<CheckinMethod, boolean>;
};

export const DEFAULT_METHODS: CheckinMethods = {
  order: ["photo_id", "last4", "self_declare"],
  enabled: { photo_id: true, last4: true, self_declare: true },
};

export const MAX_FAILED_MATCHES = 3;
/** With three check-out days to pick from: two wrong picks pause the device. */
export const MAX_FAILED_CHOICES = 2;
export const LOCKOUT_MINUTES = 10;
export const MAX_PHOTO_ATTEMPTS = 2;
export const MAX_LAST4_ATTEMPTS = 3;

export function normaliseMethods(raw: unknown): CheckinMethods {
  const r = (raw ?? {}) as Partial<CheckinMethods>;
  const all: CheckinMethod[] = ["photo_id", "last4", "self_declare"];
  const order = Array.isArray(r.order)
    ? [...new Set(r.order.filter((m): m is CheckinMethod => all.includes(m as CheckinMethod)))]
    : [];
  for (const m of all) if (!order.includes(m)) order.push(m);
  const enabled = { ...DEFAULT_METHODS.enabled, ...(r.enabled ?? {}) };
  return { order, enabled };
}

/** True when the host has turned off every real identity check. */
export function usesListFlow(methods: CheckinMethods): boolean {
  return !methods.enabled.photo_id && !methods.enabled.last4;
}

/**
 * The identity methods to try, in order. Self-declaration is always the last
 * resort so a guest is never left stuck at the door.
 */
export function methodSequence(
  methods: CheckinMethods,
  available: { last4: boolean },
): CheckinMethod[] {
  const seq = methods.order.filter((m) => {
    if (m === "self_declare") return false;
    if (!methods.enabled[m]) return false;
    if (m === "last4" && !available.last4) return false;
    return true;
  });
  seq.push("self_declare");
  return seq;
}

export function nextMethod(seq: CheckinMethod[], current: CheckinMethod): CheckinMethod {
  const i = seq.indexOf(current);
  return seq[Math.min(i + 1, seq.length - 1)] ?? "self_declare";
}

export type MatchableBooking = {
  id: string;
  channel: string;
  status: string;
  check_in_date: string;
  check_out_date: string;
  guest_full_name: string | null;
  mirror_of: string | null;
  /** Set when the stay came from a booking site the host added. */
  site_key?: string | null;
};

export function surnameInitial(name: string | null | undefined): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  const letter = last
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .charAt(0)
    .toUpperCase();
  return /[A-Z]/.test(letter) ? letter : null;
}

/** Bookings a guest could be checking in to right now. */
export function arrivalCandidates(bookings: MatchableBooking[], today: string): MatchableBooking[] {
  const yesterday = addDays(today, -1);
  return bookings.filter(
    (b) =>
      (b.status === "upcoming" || b.status === "flagged") &&
      !b.mirror_of &&
      (b.check_in_date === today || b.check_in_date === yesterday) &&
      b.check_out_date > today,
  );
}

/**
 * Guests who are already checked in and still staying. They come back to the
 * kiosk to reread the rules or order towels, so we look them up rather than
 * telling them their booking doesn't exist.
 */
export function stayingCandidates(bookings: MatchableBooking[], today: string): MatchableBooking[] {
  return bookings.filter(
    (b) =>
      b.status === "checked_in" &&
      !b.mirror_of &&
      b.check_in_date <= today &&
      b.check_out_date > today,
  );
}

function matches(
  b: MatchableBooking,
  answers: { letter: string; checkOut: string; channel: string },
): boolean {
  return (
    surnameInitial(b.guest_full_name) === answers.letter.toUpperCase() &&
    b.check_out_date === answers.checkOut &&
    platformKey(b) === answers.channel
  );
}

export function findBooking(
  bookings: MatchableBooking[],
  today: string,
  answers: { letter: string; checkOut: string; channel: string },
): MatchableBooking | null {
  const hits = arrivalCandidates(bookings, today).filter((b) => matches(b, answers));
  return hits.length === 1 ? hits[0]! : null;
}

/** Same three answers, but for someone who has already checked in. */
export function findStaying(
  bookings: MatchableBooking[],
  today: string,
  answers: { letter: string; checkOut: string; channel: string },
): MatchableBooking | null {
  const hits = stayingCandidates(bookings, today).filter((b) => matches(b, answers));
  return hits.length === 1 ? hits[0]! : null;
}

export type Resolution =
  | { kind: "match"; booking: MatchableBooking; needsName: boolean; returning: boolean }
  | { kind: "choose"; channels: string[] }
  | { kind: "none" };

function hasName(b: MatchableBooking): boolean {
  return !!b.guest_full_name?.trim();
}

/**
 * Works out who is checking in from their surname initial and check-out day,
 * asking for the platform only when that alone tells two stays apart.
 *  - A named stay with that initial wins.
 *  - Otherwise a stay that has no guest name yet (calendar links often send
 *    none) can match on the day alone; the guest then types their name.
 *  - Someone already checked in is recognised as returning.
 * A channel narrows the search once the guest has picked one.
 */
export function resolveArrival(
  bookings: MatchableBooking[],
  today: string,
  answers: { letter: string; checkOut: string; channel?: string | null | undefined },
): Resolution {
  const letter = answers.letter.toUpperCase();
  const fits = (b: MatchableBooking) =>
    b.check_out_date === answers.checkOut &&
    (!answers.channel || platformKey(b) === answers.channel);

  const arriving = bookings.filter(
    (b) =>
      !b.mirror_of &&
      (b.status === "upcoming" || b.status === "flagged" || b.status === "needs_details") &&
      (b.check_in_date === today || b.check_in_date === addDays(today, -1)) &&
      b.check_out_date > today &&
      fits(b),
  );
  const named = arriving.filter((b) => hasName(b) && surnameInitial(b.guest_full_name) === letter);
  const staying = stayingCandidates(bookings, today).filter(
    (b) => fits(b) && surnameInitial(b.guest_full_name) === letter,
  );
  const nameless = arriving.filter((b) => !hasName(b));

  const hits = named.length ? named : staying.length ? staying : nameless;
  if (hits.length === 0) return { kind: "none" };
  const channels = [...new Set(hits.map(platformKey))];
  if (!answers.channel && channels.length > 1) return { kind: "choose", channels };
  if (hits.length !== 1) return { kind: "none" };
  const booking = hits[0]!;
  return {
    kind: "match",
    booking,
    needsName: !hasName(booking),
    returning: booking.status === "checked_in",
  };
}

/** A full name a guest types at check-in: two or more words, letters first. */
export function cleanGuestName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 80) return null;
  const parts = name.split(" ");
  if (parts.length < 2 || parts.some((p) => !/^\p{L}/u.test(p))) return null;
  return name;
}

/**
 * Seven check-out day buttons. Before 06:00 a late arrival from yesterday may
 * be leaving today, so the list starts today; otherwise it starts tomorrow.
 */
export function checkoutChoices(today: string, hourNow: number): string[] {
  const start = hourNow < 6 ? 0 : 1;
  return Array.from({ length: 7 }, (_, i) => addDays(today, start + i));
}

/** Failed attempts since the last success, newest first. */
export function lockedUntil(
  attempts: Array<{ succeeded: boolean; created_at: string }>,
  now: Date,
  /** Fewer when the guest picks from three check-out days (a wrong guess is easier there). */
  max: number = MAX_FAILED_MATCHES,
): Date | null {
  const windowStart = now.getTime() - LOCKOUT_MINUTES * 60_000;
  const recentFails: number[] = [];
  for (const a of attempts) {
    if (a.succeeded) break;
    const t = Date.parse(a.created_at);
    if (t < windowStart) break;
    recentFails.push(t);
  }
  if (recentFails.length < max) return null;
  const until = new Date(Math.max(...recentFails) + LOCKOUT_MINUTES * 60_000);
  return until > now ? until : null;
}

export function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? "";
}

/** "Priya S." for the pick-your-booking list. */
export function shortName(name: string | null | undefined): string {
  const parts = name?.trim().split(/\s+/) ?? [];
  if (parts.length === 0) return "";
  const last = parts.length > 1 ? ` ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.` : "";
  return `${parts[0]}${last}`;
}

/** Compares the last 4 characters of a reference or phone, ignoring spaces and case. */
export function last4Matches(secret: string | null | undefined, typed: string): boolean {
  const clean = (s: string) => s.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const s = clean(secret ?? "");
  const t = clean(typed);
  return s.length >= 4 && t.length === 4 && s.slice(-4) === t;
}

export function emailMatches(stored: string | null | undefined, typed: string): boolean {
  if (!stored) return false;
  return stored.trim().toLowerCase() === typed.trim().toLowerCase();
}

/** Nights between two days (YYYY-MM-DD). */
export function nightsBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** The first day a guest arriving now can be leaving: tomorrow, or today before 06:00 (a late arrival from yesterday). */
export function firstCheckout(today: string, hourNow: number): string {
  return addDays(today, hourNow < 6 ? 0 : 1);
}

/**
 * Three check-out days to pick from once the guest has tapped their surname
 * initial: the real day of each arriving stay with that initial, and close
 * days that aren't (a day or two either side), so the right one never looks
 * like the odd one out. Picked by `seed` (the server makes it from the
 * property, the day and the letter), so asking again shows the same three
 * and can't reveal which is real by what changes. Sorted by date. More than
 * three real days (rare) are all shown.
 */
export function threeCheckouts(real: string[], earliest: string, seed: number): string[] {
  const days = [...new Set(real)].filter((d) => d >= earliest).sort();
  if (days.length >= 3) return days.slice(0, 7);
  // With no stay to hide, three close days around a made-up one.
  const anchors = days.length ? days : [addDays(earliest, seed % 4)];
  const near: string[] = [];
  for (const offset of [1, -1, 2, -2, 3, 4]) {
    for (const a of anchors) {
      const d = addDays(a, offset);
      if (d >= earliest && !days.includes(d) && !near.includes(d)) near.push(d);
    }
  }
  const out = [...days];
  if (!days.length) out.push(anchors[0]!);
  // Each pick is one of the next two nearest, so the real day isn't always in the middle.
  let s = seed;
  while (out.length < 3 && near.length) {
    const i = near.length > 1 ? s % 2 : 0;
    out.push(near.splice(i, 1)[0]!);
    s = Math.floor(s / 2) + 7;
  }
  return out.sort();
}
