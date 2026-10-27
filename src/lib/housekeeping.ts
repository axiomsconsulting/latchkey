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
export function occupancyFor(
  day: string,
  stays: BoardStay[],
  closed: boolean,
): {
  occupancy: Occupancy;
  leaving: BoardStay | null;
  arriving: BoardStay | null;
  staying: BoardStay | null;
} {
  const live = stays.filter(LIVE);
  const leaving = live.find((b) => b.check_out_date === day) ?? null;
  const arriving = live.find((b) => b.check_in_date === day) ?? null;
  const staying = live.find((b) => b.check_in_date < day && b.check_out_date > day) ?? null;
  if (leaving && arriving) return { occupancy: "turnover", leaving, arriving, staying: null };
  if (leaving) return { occupancy: "leaving", leaving, arriving: null, staying: null };
  if (arriving) return { occupancy: "arriving", leaving: null, arriving, staying: null };
  if (staying) return { occupancy: "staying", leaving: null, arriving: null, staying };
  // Nights closed by the host, or blocked on a booking site.
  const blocked = stays.some(
    (b) => b.status === "blocked" && b.check_in_date <= day && b.check_out_date > day,
  );
  return {
    occupancy: closed || blocked ? "closed" : "empty",
    leaving: null,
    arriving: null,
    staying: null,
  };
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
    const o = occupancyFor(
      input.day,
      stays,
      !!input.houseClosed || !!input.closedRooms?.has(room.id),
    );
    const row = saved.get(room.id);
    const dueBy = o.arriving
      ? (o.arriving.check_in_time ?? input.defaultCheckIn).slice(0, 5)
      : null;
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

export type BoardTotals = {
  toClean: number;
  inProgress: number;
  ready: number;
  arrivingNotReady: number;
  outOfService: number;
};

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
  const rank = (c: BoardCard) =>
    c.arriving && c.status !== "ready"
      ? 0
      : c.status && c.status !== "ready"
        ? 1
        : c.status === "ready"
          ? 2
          : 3;
  return [...cards].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.dueBy ?? "99").localeCompare(b.dueBy ?? "99") ||
      a.roomName.localeCompare(b.roomName),
  );
}

/* -------------------------------- schedule -------------------------------- */

/**
 * Cleaning and unavailable times (unavailability_windows): weekly ones (a
 * day of the week and hours) and one-off ones (from a moment to a moment).
 * The board shows each day's windows on a timeline beside the rooms' check-out
 * and check-in times, and in the weekly schedule underneath.
 */
export type ScheduleWindow = {
  id: string;
  room_id: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  reason: string | null;
};

/** One window as it falls on a day: "HH:MM" to "HH:MM", for a room or the whole property (roomId null). */
export type DayWindow = {
  id: string;
  roomId: string | null;
  start: string;
  end: string;
  reason: string | null;
  weekly: boolean;
};

const hhmm = (t: string) => t.slice(0, 5);
const dowOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
function zoned(instant: string, tz: string): { date: string; time: string } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  return { date: `${p["year"]}-${p["month"]}-${p["day"]}`, time: `${p["hour"]}:${p["minute"]}` };
}

/** The windows that fall on `day` (in the property's time zone), earliest first. */
export function windowsForDay(windows: ScheduleWindow[], day: string, tz: string): DayWindow[] {
  const dow = dowOf(day);
  const out: DayWindow[] = [];
  for (const w of windows) {
    if (w.day_of_week !== null && w.start_time && w.end_time) {
      if (w.day_of_week === dow)
        out.push({
          id: w.id,
          roomId: w.room_id,
          start: hhmm(w.start_time),
          end: hhmm(w.end_time),
          reason: w.reason,
          weekly: true,
        });
    } else if (w.starts_at && w.ends_at) {
      const s = zoned(w.starts_at, tz);
      const e = zoned(w.ends_at, tz);
      if (s.date <= day && e.date >= day) {
        out.push({
          id: w.id,
          roomId: w.room_id,
          start: s.date === day ? s.time : "00:00",
          end: e.date === day ? e.time : "24:00",
          reason: w.reason,
          weekly: false,
        });
      }
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** A room's windows on the day: its own and the whole property's. */
export const roomWindows = (dayWindows: DayWindow[], roomId: string) =>
  dayWindows.filter((w) => w.roomId === null || w.roomId === roomId);

export const toMinutes = (t: string) => {
  const [h = "0", m = "0"] = t.split(":");
  return Number(h) * 60 + Number(m);
};

/** The hours the day's timeline covers: everything that happens, with an hour either side, at least 08:00–20:00. */
export function dayAxis(input: {
  cards: BoardCard[];
  windows: DayWindow[];
  checkOut: string;
  checkIn: string;
}): { from: number; to: number } {
  const times = [toMinutes(input.checkOut), toMinutes(input.checkIn), 8 * 60, 20 * 60];
  for (const w of input.windows) times.push(toMinutes(w.start), toMinutes(w.end));
  for (const c of input.cards) {
    if (c.leaving?.check_out_time) times.push(toMinutes(c.leaving.check_out_time.slice(0, 5)));
    if (c.dueBy) times.push(toMinutes(c.dueBy));
  }
  const from = Math.max(0, Math.floor((Math.min(...times) - 60) / 60) * 60);
  const to = Math.min(24 * 60, Math.ceil((Math.max(...times) + 60) / 60) * 60);
  return { from, to };
}

export type LaneSegment = {
  kind: "guest_out" | "window" | "free" | "guest_in" | "staying" | "closed";
  from: number;
  to: number;
  label?: string | null;
};

/**
 * One room's day on the timeline: the leaving guest until they check out,
 * the windows, the free time for cleaning in between, and the arriving
 * guest from their check-in. Minutes from midnight, clipped to the axis.
 */
export function roomLane(
  card: BoardCard,
  windows: DayWindow[],
  o: { checkOut: string; checkIn: string; axis: { from: number; to: number } },
): { segments: LaneSegment[]; out: number | null; due: number | null } {
  const { from, to } = o.axis;
  const clip = (s: LaneSegment): LaneSegment | null => {
    const a = Math.max(from, s.from);
    const b = Math.min(to, s.to);
    return b > a ? { ...s, from: a, to: b } : null;
  };
  const out = card.leaving
    ? toMinutes((card.leaving.check_out_time ?? o.checkOut).slice(0, 5))
    : null;
  const due = card.arriving ? toMinutes(card.dueBy ?? o.checkIn) : null;
  const segs: Array<LaneSegment | null> = [];
  if (card.occupancy === "staying") segs.push(clip({ kind: "staying", from, to }));
  else if (card.occupancy === "closed") segs.push(clip({ kind: "closed", from, to }));
  else {
    if (out !== null) segs.push(clip({ kind: "guest_out", from, to: out }));
    segs.push(clip({ kind: "free", from: out ?? from, to: due ?? to }));
    if (due !== null) segs.push(clip({ kind: "guest_in", from: due, to }));
  }
  for (const w of windows)
    segs.push(
      clip({ kind: "window", from: toMinutes(w.start), to: toMinutes(w.end), label: w.reason }),
    );
  return { segments: segs.filter((s): s is LaneSegment => !!s), out, due };
}

/** The weekly schedule as seven days (Monday first), each with its windows in time order. */
export function weekGrid(
  windows: ScheduleWindow[],
): Array<{ dow: number; windows: ScheduleWindow[] }> {
  return [1, 2, 3, 4, 5, 6, 0].map((dow) => ({
    dow,
    windows: windows
      .filter((w) => w.day_of_week === dow && w.start_time && w.end_time)
      .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? "")),
  }));
}

/** The next date on or after `day` that falls on `dow` (0 = Sunday). */
export function nextOnWeekday(day: string, dow: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((dow - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

/* ------------------------------ the timeline ------------------------------ */

/**
 * One room's housekeeping on one day, for the timeline: the stretch from the
 * guest leaving (or the start of the working day) to the next guest's ready-by
 * time (or the end of it), and where the work has got to. Rooms out of
 * service cover the whole day. Times "HH:MM" on that day.
 */
export type Turn = {
  roomId: string;
  day: string;
  from: string;
  to: string;
  status: Readiness | null;
  saved: boolean;
  occupancy: Occupancy;
  dueBy: string | null;
  assignee: string | null;
};

const DAY_START = "06:00";
const DAY_END = "22:00";

export function turnsFor(input: {
  days: string[];
  rooms: BoardRoom[];
  stays: BoardStay[];
  readiness: Array<ReadinessRow & { day: string }>;
  checkIn: string;
  checkOut: string;
}): Turn[] {
  const out: Turn[] = [];
  for (const day of input.days) {
    const cards = buildBoard({
      day,
      rooms: input.rooms,
      stays: input.stays,
      readiness: input.readiness.filter((r) => r.day === day),
      defaultCheckIn: input.checkIn,
    });
    for (const c of cards) {
      const base = {
        roomId: c.roomId,
        day,
        status: c.status,
        saved: c.saved,
        occupancy: c.occupancy,
        dueBy: c.dueBy,
        assignee: c.assignee,
      };
      if (c.status === "out_of_service") out.push({ ...base, from: "00:00", to: "24:00" });
      else if (c.leaving || c.arriving) {
        const from = c.leaving
          ? (c.leaving.check_out_time ?? input.checkOut).slice(0, 5)
          : DAY_START;
        const to = c.arriving ? (c.dueBy ?? input.checkIn) : DAY_END;
        if (from < to) out.push({ ...base, from, to });
      } else if (c.saved && c.status) out.push({ ...base, from: DAY_START, to: DAY_END });
    }
  }
  return out;
}

/** The order of the board's filter and "needs attention" sort. */
export const STATE_ORDER: Array<Readiness | "none"> = [
  "to_clean",
  "cleaning",
  "clean",
  "ready",
  "none",
  "out_of_service",
];
export type RoomFilter = "all" | "arriving" | Readiness;

/** Rooms in the property's own order, or (when chosen) the ones needing work first; a status change never moves a room otherwise. */
export function orderRooms<R extends { id: string }>(
  rooms: R[],
  cards: BoardCard[],
  by: "property" | "state",
): R[] {
  if (by === "property") return rooms;
  const rank = (id: string) => {
    const c = cards.find((x) => x.roomId === id);
    const late = c?.arriving && c.status !== "ready" ? -1 : 0;
    return STATE_ORDER.indexOf(c?.status ?? "none") + late;
  };
  return rooms
    .map((r, i) => ({ r, i, k: rank(r.id) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.r);
}

/** Rooms shown for a filter on the day's cards. */
export function filterRooms<R extends { id: string }>(
  rooms: R[],
  cards: BoardCard[],
  filter: RoomFilter,
): R[] {
  if (filter === "all") return rooms;
  return rooms.filter((r) => {
    const c = cards.find((x) => x.roomId === r.id);
    if (!c) return false;
    return filter === "arriving" ? !!c.arriving : c.status === filter;
  });
}
