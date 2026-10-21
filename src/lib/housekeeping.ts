/**
 * The housekeeping and readiness board (/app/housekeeping): one card per room
 * for a day, showing what the day means for it (leaving, arriving, a
 * turnover, staying, empty or closed), where cleaning has got to, who is on
 * it, when it must be ready and anything open on it. Status lives in
 * room_readiness (migration 0042), one row per room and day; with no row the
 * board starts from what the bookings say. Pure: no network or database.
 */

export const READINESS = ["to_clean", "cleaning", "clean", "ready", "out_of_service"] as const;
export type Readiness = (typeof READINESS)[number];

/** The usual order of work; "out of service" sits outside it. */
export const FLOW: Readiness[] = ["to_clean", "cleaning", "clean", "ready"];

export type Occupancy = "turnover" | "leaving" | "arriving" | "staying" | "empty" | "closed";

export type BoardStay = {
  id: string;
  room_id: string | null;
  guest_full_name: string | null;
  check_in_date: string;
  check_out_date: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  status: string;
  guest_count?: number | null;
};

export type BoardRoom = { id: string; display_name: string };

export type ReadinessRow = {
  room_id: string;
  status: Readiness;
  assignee: string | null;
  due_time: string | null;
  note: string | null;
  updated_at: string | null;
  updated_by_name?: string | null;
};

export type BoardWindow = { room_id: string | null; reason?: string | null };

export type BoardCard = {
  roomId: string;
  roomName: string;
  occupancy: Occupancy;
  leaving: BoardStay | null;
  arriving: BoardStay | null;
  staying: BoardStay | null;
  /** Where the work has got to: saved, or what the day suggests. */
  status: Readiness | null;
  saved: boolean;
  assignee: string | null;
  /** "HH:MM" it should be ready by (the arrival's check-in), if anyone arrives. */
  dueBy: string | null;
  note: string | null;
  openJobs: number;
  updatedAt: string | null;
};

const LIVE = (b: BoardStay) => b.status !== "cancelled" && b.status !== "blocked";

/** What the day means for one room. */
export function occupancyFor(day: string, stays: BoardStay[], closed: boolean): { occupancy: Occupancy; leaving: BoardStay | null; arriving: BoardStay | null; staying: BoardStay | null } {
  const live = stays.filter(LIVE);
  const leaving = live.find((b) => b.check_out_date === day) ?? null;
  const arriving = live.find((b) => b.check_in_date === day) ?? null;
  const staying = live.find((b) => b.check_in_date < day && b.check_out_date > day) ?? null;
  if (leaving && arriving) return { occupancy: "turnover", leaving, arriving, staying: null };
  if (leaving) return { occupancy: "leaving", leaving, arriving: null, staying: null };
  if (arriving) return { occupancy: "arriving", leaving: null, arriving, staying: null };
  if (staying) return { occupancy: "staying", leaving: null, arriving: null, staying };
  // Nights closed by the host, or blocked on a booking site.
  const blocked = stays.some((b) => b.status === "blocked" && b.check_in_date <= day && b.check_out_date > day);
  return { occupancy: closed || blocked ? "closed" : "empty", leaving: null, arriving: null, staying: null };
}

/** Where the board starts before anyone has touched a room that day. */
export function suggestedStatus(o: Occupancy): Readiness | null {
  if (o === "turnover" || o === "leaving") return "to_clean";
  // Nobody left today: the room should already be clean, waiting for its "ready" check.
  if (o === "arriving") return "clean";
  return null;
}

export function buildBoard(input: {
  day: string;
  rooms: BoardRoom[];
  stays: BoardStay[];
  readiness: ReadinessRow[];
  closedRooms?: Set<string>;
  /** Closures for the whole property (room_id null) close every room. */
  houseClosed?: boolean;
  openJobs?: Record<string, number>;
  defaultCheckIn: string;
}): BoardCard[] {
  const saved = new Map(input.readiness.map((r) => [r.room_id, r]));
  return input.rooms.map((room) => {
    const stays = input.stays.filter((b) => b.room_id === room.id);
    const o = occupancyFor(input.day, stays, !!input.houseClosed || !!input.closedRooms?.has(room.id));
    const row = saved.get(room.id);
    const dueBy = o.arriving ? (o.arriving.check_in_time ?? input.defaultCheckIn).slice(0, 5) : null;
    return {
      roomId: room.id,
      roomName: room.display_name,
      ...o,
      status: row?.status ?? suggestedStatus(o.occupancy),
      saved: !!row,
      assignee: row?.assignee ?? null,
      dueBy: row?.due_time ? row.due_time.slice(0, 5) : dueBy,
      note: row?.note ?? null,
      openJobs: input.openJobs?.[room.id] ?? 0,
      updatedAt: row?.updated_at ?? null,
    };
  });
}

/** The next step in the usual order (ready stays ready). */
export function nextStatus(s: Readiness | null): Readiness {
  if (!s || s === "out_of_service") return "to_clean";
  const i = FLOW.indexOf(s);
  return FLOW[Math.min(FLOW.length - 1, i + 1)]!;
}

/** Rooms someone arrives in that aren't confirmed ready: the ones to worry about. */
export function notReady(cards: BoardCard[]): BoardCard[] {
  return cards.filter((c) => c.arriving && c.status !== "ready");
}

export type BoardTotals = { toClean: number; inProgress: number; ready: number; arrivingNotReady: number; outOfService: number };

export function boardTotals(cards: BoardCard[]): BoardTotals {
  return {
    toClean: cards.filter((c) => c.status === "to_clean").length,
    inProgress: cards.filter((c) => c.status === "cleaning" || c.status === "clean").length,
    ready: cards.filter((c) => c.status === "ready").length,
    arrivingNotReady: notReady(cards).length,
    outOfService: cards.filter((c) => c.status === "out_of_service").length,
  };
}

/** Late first: rooms with someone arriving and not ready, by due time; then the rest of the work; then quiet rooms. */
export function boardOrder(cards: BoardCard[]): BoardCard[] {
  const rank = (c: BoardCard) => (c.arriving && c.status !== "ready" ? 0 : c.status && c.status !== "ready" ? 1 : c.status === "ready" ? 2 : 3);
  return [...cards].sort((a, b) => rank(a) - rank(b) || (a.dueBy ?? "99").localeCompare(b.dueBy ?? "99") || a.roomName.localeCompare(b.roomName));
}
