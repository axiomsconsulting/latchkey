/**
 * ID and selfie first, room second. Once a guest's ID is read they're
 * registered, and Latchkey places them on the stay it best can: by the name on
 * the ID, else the only stay it could be. Anything less than a clear name match
 * is flagged for the host (bookings.room_check), and if it can't tell at all the
 * guest is held with no room until the host places them. Pure, tested.
 */
import { addDays } from "@/lib/dates";
import { compareNames } from "@/lib/name-match";

export type RoomCheckReason =
  /** The name on the ID only partly fits the stay's name. */
  | "name_close"
  /** Two stays carry this name (a group booked under one name): placed on the first. */
  | "same_name"
  /** The ID found no name, and this was the only nameless stay today, with no other arrival. */
  | "only_stay"
  /** The ID fits no named arrival, so it went on the one nameless stay today. */
  | "only_nameless"
  /** The only arrival today is in someone else's name: they may have booked for this guest. */
  | "someone_else"
  /** Found by check-out day, with the name taken from the ID. */
  | "name_from_id"
  /** Held: several stays have no name. */
  | "several_nameless"
  /** Held: several named stays, and the ID fits none. */
  | "several_named"
  /** Held: no stay for today. */
  | "no_stay"
  /** Held: the booker turned up after someone else checked in to their stay. */
  | "booker_after_other";

export type RoomCheck = {
  reason: RoomCheckReason;
  /** No stay yet: the row only holds the guest's check-in. */
  held: boolean;
  /** The name on the ID. */
  idName: string;
  at: string;
};

export type AllocatableStay = {
  id: string;
  status: string;
  check_in_date: string;
  check_out_date: string;
  guest_full_name: string | null;
  mirror_of: string | null;
  room_check?: RoomCheck | null;
};

export type Allocation =
  | {
      kind: "stay";
      stayId: string;
      /** How the ID compares with the stay's name: null when the stay has none to compare. */
      nameMatch: "matched" | "partial" | "not_matched" | null;
      /** Already checked in: back for another look, not a new arrival. */
      returning: boolean;
      /** Not sure: flag it for the host. */
      check: RoomCheckReason | null;
    }
  | { kind: "held"; reason: RoomCheckReason };

const named = (s: AllocatableStay) => !!s.guest_full_name?.trim();
const WAITING = ["upcoming", "flagged", "needs_details"];

/**
 * Where a guest whose ID reads `idName` goes.
 * Names first: a clear match is sure, and a partial one (or the same name on two
 * stays) is placed and flagged. With no match, the one stay it could be is placed
 * and flagged; otherwise the guest is held for the host, never asked to choose.
 */
export function allocateArrival(
  stays: AllocatableStay[],
  idName: string,
  today: string,
  hourNow: number,
): Allocation {
  const live = stays.filter((s) => !s.mirror_of && !s.room_check?.held);
  const yesterday = addDays(today, -1);
  const arriving = live.filter(
    (s) =>
      WAITING.includes(s.status) &&
      (s.check_in_date === today || s.check_in_date === yesterday) &&
      s.check_out_date > today,
  );
  const staying = live.filter(
    (s) => s.status === "checked_in" && s.check_in_date <= today && s.check_out_date > today,
  );
  const fit = (s: AllocatableStay) => (named(s) ? compareNames(s.guest_full_name, idName) : null);
  const full = (list: AllocatableStay[]) => list.filter((s) => fit(s) === "matched");

  const arrivingFull = full(arriving);
  if (arrivingFull.length)
    return {
      kind: "stay",
      stayId: arrivingFull[0]!.id,
      nameMatch: "matched",
      returning: false,
      check: arrivingFull.length > 1 ? "same_name" : null,
    };
  const stayingFull = full(staying);
  if (stayingFull.length) {
    const own = stayingFull.find((s) => s.room_check?.reason !== "someone_else") ?? null;
    // Someone else's ID is on the stay this name belongs to: for the host, without overwriting it.
    if (!own) return { kind: "held", reason: "booker_after_other" };
    return { kind: "stay", stayId: own.id, nameMatch: "matched", returning: true, check: null };
  }
  // Back for another look, on a stay booked in someone else's name.
  const back = staying.find((s) => compareNames(s.room_check?.idName ?? "", idName) === "matched");
  if (back)
    return {
      kind: "stay",
      stayId: back.id,
      nameMatch: "not_matched",
      returning: true,
      check: null,
    };
  const partial = [...arriving, ...staying].filter((s) => fit(s) === "partial");
  if (partial.length === 1)
    return {
      kind: "stay",
      stayId: partial[0]!.id,
      nameMatch: "partial",
      returning: partial[0]!.status === "checked_in",
      check: "name_close",
    };

  // No name fits. Before 06:00 a late arrival from yesterday still counts as tonight's.
  const tonight = arriving.filter(
    (s) => s.check_in_date === today || (hourNow < 6 && s.check_in_date === yesterday),
  );
  const nameless = tonight.filter((s) => !named(s));
  const others = tonight.filter(named);
  if (nameless.length === 1)
    return {
      kind: "stay",
      stayId: nameless[0]!.id,
      nameMatch: null,
      returning: false,
      check: others.length ? "only_nameless" : "only_stay",
    };
  if (nameless.length > 1) return { kind: "held", reason: "several_nameless" };
  if (others.length === 1)
    return {
      kind: "stay",
      stayId: others[0]!.id,
      nameMatch: "not_matched",
      returning: false,
      check: "someone_else",
    };
  return { kind: "held", reason: others.length ? "several_named" : "no_stay" };
}

/** The most this property holds at once: past it, a stranger with a pile of IDs goes the usual way. */
export const MAX_HELD_ARRIVALS = 6;

/** Reads a stored room_check; anything unrecognised counts as none. */
export function normaliseRoomCheck(v: unknown): RoomCheck | null {
  const c = v as Partial<RoomCheck> | null;
  if (!c || typeof c !== "object" || typeof c.reason !== "string") return null;
  return {
    reason: c.reason as RoomCheckReason,
    held: c.held === true,
    idName: typeof c.idName === "string" ? c.idName : "",
    at: typeof c.at === "string" ? c.at : "",
  };
}

/** The stays a guest could be moved to, the likeliest first: their name, then no name, then the rest. */
export function rankStays<T extends { guest_full_name: string | null; check_in_date: string }>(
  stays: T[],
  idName: string,
  today: string,
): Array<T & { likely: boolean }> {
  const score = (s: T) => {
    const fit = s.guest_full_name?.trim() ? compareNames(s.guest_full_name, idName) : null;
    const name = fit === "matched" ? 0 : fit === "partial" ? 1 : fit === null ? 2 : 3;
    return name * 2 + (s.check_in_date === today ? 0 : 1);
  };
  return stays
    .map((s) => ({ s, n: score(s) }))
    .sort((a, b) => a.n - b.n)
    .map(({ s, n }) => ({ ...s, likely: n < 2 }));
}

/** What the host is told (alert), in plain words. */
export function roomCheckMessage(
  reason: RoomCheckReason,
  idName: string,
  bookingName: string | null,
  room: string | null,
  property: string,
): string {
  const on = room ? `${room} at ${property}` : property;
  switch (reason) {
    case "name_close":
      return `${idName} checked in to ${on}, booked as ${bookingName}: the names only partly match. Please check.`;
    case "same_name":
      return `${idName} checked in to ${on}, but that name is on more than one stay. Please check it's the right room.`;
    case "only_stay":
    case "name_from_id":
      return `${idName} checked in to ${on}. The booking had no name, so it came from their ID. Please check.`;
    case "only_nameless":
      return `${idName} checked in to ${on}: their ID fits no named booking, so they went on the one with no name. Please check.`;
    case "someone_else":
      return `${idName} checked in to ${on}, booked by ${bookingName}. They may have booked for them. Please check.`;
    case "several_nameless":
      return `${idName} has registered at ${property} and needs a room: several bookings today have no name. Please place them.`;
    case "several_named":
      return `${idName} has registered at ${property} and needs a room: their ID fits none of today's bookings. Please place them.`;
    case "no_stay":
      return `${idName} has registered at ${property} and needs a room: no booking today. Please place them.`;
    case "booker_after_other":
      return `${idName} has registered at ${property} and needs a room: their booking already has someone else's ID on it. Please sort it out.`;
  }
}
