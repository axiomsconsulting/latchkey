/**
 * Pure reconciliation rules for calendar sync. Kept free of network and
 * database access so they can be unit tested.
 */

import type { ParsedBooking } from "./ical";

export type ExistingBooking = {
  id: string;
  external_uid: string | null;
  connection_id: string | null;
  room_id: string | null;
  status: string;
  check_in_date: string;
  check_out_date: string;
  manual_fields: string[];
  guest_full_name: string | null;
  phone_last4: string | null;
  guest_count: number | null;
  check_in_time: string | null;
  check_out_time: string | null;
  reservation_code: string | null;
  /** Hidden by the host (shown as "Hide"); stays hidden unless the platform changes it. */
  archived_at?: string | null;
};

/** Fields the sync is allowed to write, in database column names. */
export const SYNCABLE_FIELDS = [
  "guest_full_name",
  "phone_last4",
  "guest_count",
  "check_in_date",
  "check_out_date",
  "check_in_time",
  "check_out_time",
  "reservation_code",
  "status",
] as const;

export type BookingPatch = Partial<Record<(typeof SYNCABLE_FIELDS)[number], unknown>>;

/**
 * Builds the update for an existing booking, never touching a field the host
 * has edited by hand (recorded in manual_fields).
 */
export function buildPatch(existing: ExistingBooking, incoming: ParsedBooking): BookingPatch {
  const manual = new Set(existing.manual_fields ?? []);
  const candidate: BookingPatch = {
    guest_full_name: incoming.guestFullName ?? existing.guest_full_name,
    phone_last4: incoming.phoneLast4 ?? existing.phone_last4,
    guest_count: incoming.guestCount ?? existing.guest_count ?? 1,
    check_in_date: incoming.checkInDate,
    check_out_date: incoming.checkOutDate,
    check_in_time: incoming.checkInTime,
    check_out_time: incoming.checkOutTime,
    reservation_code: incoming.reservationCode ?? existing.reservation_code,
  };

  // A stay that reappears in the feed is reinstated; otherwise keep the
  // host-managed lifecycle status (checked_in, checked_out, flagged).
  if (existing.status === "cancelled") {
    candidate.status = incoming.status;
  } else if (
    (existing.status === "needs_details" || existing.status === "blocked") &&
    incoming.status === "upcoming"
  ) {
    candidate.status = "upcoming";
  } else if (existing.status === "needs_details" && incoming.status === "blocked") {
    candidate.status = "blocked";
  }

  // A named guest arriving from the platform is a real booking, even where
  // the host had marked those nights "not a booking".
  const realGuestNow =
    incoming.status === "upcoming" &&
    (existing.status === "blocked" || existing.status === "needs_details");

  const patch: BookingPatch = {};
  for (const key of SYNCABLE_FIELDS) {
    if (manual.has(key) && !(key === "status" && realGuestNow)) continue;
    if (!(key in candidate)) continue;
    const next = candidate[key];
    if (next === undefined) continue;
    if (next !== (existing as unknown as Record<string, unknown>)[key]) {
      patch[key] = next;
    }
  }
  return patch;
}

/**
 * Whether a hidden stay should come back into view: only when the platform
 * has changed it. It reappeared after being cancelled, it became a real
 * booking with a guest, or its dates moved. Otherwise hidden stays hidden.
 */
export function shouldUnhide(existing: ExistingBooking, incoming: ParsedBooking): boolean {
  if (!existing.archived_at) return false;
  if (existing.status === "cancelled") return true;
  if (
    incoming.status === "upcoming" &&
    (existing.status === "blocked" || existing.status === "needs_details")
  )
    return true;
  // Dates the host set by hand always differ from the feed, so they don't count.
  const manual = new Set(existing.manual_fields ?? []);
  const moved =
    (!manual.has("check_in_date") && incoming.checkInDate !== existing.check_in_date) ||
    (!manual.has("check_out_date") && incoming.checkOutDate !== existing.check_out_date);
  return moved;
}

/** Stays the guest has started or finished: a feed dropping them is not a cancellation. */
const UNDER_WAY = new Set(["checked_in", "checked_out"]);

/**
 * Bookings previously delivered by this connection that have vanished from the
 * feed. Only stays still ahead are cancelled, never deleted: sites drop a stay
 * from their calendar once it is under way or on its check-out day, and a stay
 * the guest has checked in to (or out of) was never cancelled.
 */
export function bookingsToCancel(
  existing: ExistingBooking[],
  seenUids: Set<string>,
  connectionId: string,
  today: string,
): string[] {
  return existing
    .filter(
      (b) =>
        b.connection_id === connectionId &&
        b.external_uid != null &&
        !seenUids.has(b.external_uid) &&
        b.status !== "cancelled" &&
        !UNDER_WAY.has(b.status) &&
        b.check_in_date >= today &&
        b.check_out_date > today,
    )
    .map((b) => b.id);
}

function overlapsDates(a: { check_in_date: string; check_out_date: string }, b: ParsedBooking) {
  return a.check_in_date < b.checkOutDate && b.checkInDate < a.check_out_date;
}

function sharedNightsWith(a: { check_in_date: string; check_out_date: string }, b: ParsedBooking) {
  const start = a.check_in_date > b.checkInDate ? a.check_in_date : b.checkInDate;
  const end = a.check_out_date < b.checkOutDate ? a.check_out_date : b.checkOutDate;
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
  );
}

/** The host has made this entry theirs: named the guest, or set its status or dates. */
function hostOwned(b: ExistingBooking): boolean {
  const manual = new Set(b.manual_fields ?? []);
  return (
    manual.has("guest_full_name") ||
    manual.has("status") ||
    manual.has("check_in_date") ||
    manual.has("check_out_date") ||
    UNDER_WAY.has(b.status)
  );
}

/**
 * Closed nights the host gave to a guest (an extension kept free on the site
 * by closing the dates) get a new calendar entry each time the host changes
 * the closure: the old one vanishes and a nameless new one appears on the
 * same room. Pairs each vanished, host-owned entry with the new nameless entry
 * sharing most nights with it, so the stay keeps its guest and simply follows
 * the new entry instead of being cancelled and replaced by an empty one.
 * Returns new uid → existing booking id.
 */
export function adoptReplacements(
  existing: ExistingBooking[],
  incoming: ParsedBooking[],
  connectionId: string,
  roomId: string | null,
): Map<string, string> {
  const known = new Set(existing.map((b) => b.external_uid).filter(Boolean));
  const seen = new Set(incoming.map((b) => b.externalUid));
  const fresh = incoming.filter(
    (b) => !known.has(b.externalUid) && !b.guestFullName && !b.reservationCode,
  );
  const vanished = existing.filter(
    (b) =>
      b.connection_id === connectionId &&
      b.external_uid != null &&
      !seen.has(b.external_uid) &&
      b.status !== "cancelled" &&
      (!roomId || !b.room_id || b.room_id === roomId) &&
      hostOwned(b),
  );
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const b of vanished) {
    const match = fresh
      .filter((f) => !out.has(f.externalUid) && overlapsDates(b, f))
      .sort((x, y) => sharedNightsWith(b, y) - sharedNightsWith(b, x))[0];
    if (match && !taken.has(b.id)) {
      out.set(match.externalUid, b.id);
      taken.add(b.id);
    }
  }
  return out;
}

/**
 * Flags the same reservation showing up against a second room. The first room
 * keeps it; the clash is reported to the host rather than resolved silently.
 */
export function detectRoomClashes(
  existing: ExistingBooking[],
  incoming: ParsedBooking[],
  targetRoomId: string | null,
): string[] {
  const warnings: string[] = [];
  const byUid = new Map(existing.filter((b) => b.external_uid).map((b) => [b.external_uid!, b]));
  for (const b of incoming) {
    const prior = byUid.get(b.externalUid);
    if (prior && prior.room_id && targetRoomId && prior.room_id !== targetRoomId) {
      warnings.push(
        `Reservation ${b.reservationCode ?? b.externalUid} already sits on another room. Kept where it is.`,
      );
    }
  }
  return warnings;
}
