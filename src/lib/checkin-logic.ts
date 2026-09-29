/**
 * Pure rules for guest self check-in. No network or database access so they
 * can be unit tested.
 */

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
export function methodSequence(methods: CheckinMethods, available: { last4: boolean }): CheckinMethod[] {
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

export function findBooking(
  bookings: MatchableBooking[],
  today: string,
  answers: { letter: string; checkOut: string; channel: string },
): MatchableBooking | null {
  const hits = arrivalCandidates(bookings, today).filter(
    (b) =>
      surnameInitial(b.guest_full_name) === answers.letter.toUpperCase() &&
      b.check_out_date === answers.checkOut &&
      b.channel === answers.channel,
  );
  return hits.length === 1 ? hits[0]! : null;
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
): Date | null {
  const windowStart = now.getTime() - LOCKOUT_MINUTES * 60_000;
  const recentFails: number[] = [];
  for (const a of attempts) {
    if (a.succeeded) break;
    const t = Date.parse(a.created_at);
    if (t < windowStart) break;
    recentFails.push(t);
  }
  if (recentFails.length < MAX_FAILED_MATCHES) return null;
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
