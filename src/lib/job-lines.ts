/**
 * Jobs on the housekeeping timeline (Bookings → Housekeeping). Maintenance people give a window
 * or a day rather than a time, so a job covers its start (the agreed arrival, else the time
 * wanted) until window_end, or the whole day when it's all day or has no end. A job can cover
 * several rooms (room_ids, else room_id); one without a room is for the whole property. Each
 * job gets its own colour, drawn as a line under that room's stays and cleaning, and the same
 * colour marks it in the services list. Pure; tested in tests/job-lines.test.ts.
 */
import { MINUTES_PER_DAY, laneOf, nowOn } from "./timeline";

export type TimelineJob = {
  id: string;
  title: string;
  status: string;
  source: string;
  urgency?: string | null;
  room_id: string | null;
  room_ids?: string[] | null;
  scheduled_at: string | null;
  eta_at: string | null;
  window_end?: string | null;
  all_day?: boolean | null;
  created_at: string;
};

export const CLOSED_JOB = ["done", "declined", "cancelled"] as const;

/** Which rooms a job covers; empty means the whole property. */
export function jobRooms(j: Pick<TimelineJob, "room_id" | "room_ids">): string[] {
  const list = (j.room_ids ?? []).filter(Boolean);
  if (list.length) return [...new Set(list)];
  return j.room_id ? [j.room_id] : [];
}

/** Where a job sits on the property's clock (timeline minutes), or null when it has no time yet. */
export function jobSpan(
  j: Pick<TimelineJob, "scheduled_at" | "eta_at" | "window_end" | "all_day">,
  tz: string,
): { start: number; end: number; allDay: boolean } | null {
  const from = j.eta_at ?? j.scheduled_at;
  if (!from) return null;
  const start = nowOn(tz, new Date(from));
  const dayStart = Math.floor(start / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  if (!j.all_day && j.window_end) {
    const end = nowOn(tz, new Date(j.window_end));
    if (end > start) return { start, end, allDay: false };
  }
  return { start: dayStart, end: dayStart + MINUTES_PER_DAY, allDay: true };
}

/**
 * Line colours: strong and far apart in hue, readable on white and on the patterned blocks.
 * rgb only (no colour mixes), so every browser draws them the same.
 */
export const JOB_COLOURS = [
  "rgb(37, 99, 235)",
  "rgb(219, 39, 119)",
  "rgb(234, 88, 12)",
  "rgb(13, 148, 136)",
  "rgb(124, 58, 237)",
  "rgb(202, 138, 4)",
  "rgb(220, 38, 38)",
  "rgb(5, 150, 105)",
  "rgb(79, 70, 229)",
  "rgb(190, 24, 93)",
] as const;

/**
 * A colour for every job, given in order of when they were made so two open jobs never share
 * one until there are more jobs than colours. Keyed by job id.
 */
export function jobColours(
  jobs: Array<Pick<TimelineJob, "id" | "created_at">>,
): Record<string, string> {
  const out: Record<string, string> = {};
  [...jobs]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .forEach((j, i) => {
      out[j.id] = JOB_COLOURS[i % JOB_COLOURS.length]!;
    });
  return out;
}

export type JobLine = {
  id: string;
  jobId: string;
  /** A room id, or null for the whole property. */
  roomId: string | null;
  start: number;
  end: number;
  allDay: boolean;
  colour: string;
  lane: number;
};

/**
 * The lines to draw: one per job and room, open jobs with a time only. Lines in the same room
 * that overlap go on separate lanes underneath each other; ones that don't share a lane.
 */
export function jobLines(
  jobs: TimelineJob[],
  tz: string,
  colours: Record<string, string> = jobColours(jobs),
): { lines: JobLine[]; lanes: Record<string, number> } {
  const raw: Array<Omit<JobLine, "lane">> = [];
  for (const j of jobs) {
    if ((CLOSED_JOB as readonly string[]).includes(j.status)) continue;
    const span = jobSpan(j, tz);
    if (!span) continue;
    const rooms = jobRooms(j);
    for (const roomId of rooms.length ? rooms : [null]) {
      raw.push({
        id: `${j.id}:${roomId ?? "all"}`,
        jobId: j.id,
        roomId,
        ...span,
        colour: colours[j.id] ?? JOB_COLOURS[0],
      });
    }
  }
  const lines: JobLine[] = [];
  const lanes: Record<string, number> = {};
  const byRoom = new Map<string, Array<Omit<JobLine, "lane">>>();
  for (const l of raw) {
    const k = l.roomId ?? "";
    byRoom.set(k, [...(byRoom.get(k) ?? []), l]);
  }
  for (const [k, list] of byRoom) {
    const { lane, count } = laneOf(list);
    lanes[k] = count;
    for (const l of list) lines.push({ ...l, lane: lane[l.id] ?? 0 });
  }
  return { lines, lanes };
}

/** "Tue 4 Nov, all day" or "Tue 4 Nov, 08:00–12:00" (or across days), on the property's clock. */
export function jobWhen(
  j: Pick<TimelineJob, "scheduled_at" | "eta_at" | "window_end" | "all_day">,
  tz: string,
): string | null {
  const from = j.eta_at ?? j.scheduled_at;
  if (!from) return null;
  const day = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(iso));
  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  if (j.all_day || !j.window_end || new Date(j.window_end) <= new Date(from))
    return `${day(from)}, all day`;
  return day(from) === day(j.window_end)
    ? `${day(from)}, ${time(from)}–${time(j.window_end)}`
    : `${day(from)} ${time(from)} – ${day(j.window_end)} ${time(j.window_end)}`;
}

/** The open jobs per room, for the room's line on the board (a whole-property job counts for none). */
export function openJobCounts(jobs: TimelineJob[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const j of jobs) {
    if ((CLOSED_JOB as readonly string[]).includes(j.status)) continue;
    for (const r of jobRooms(j)) out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}

/* ---------------------------- repeating services ---------------------------- */

/** A cleaning or other window from the schedule (unavailability_windows). */
export type ServiceWindow = {
  id: string;
  room_id: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  reason: string | null;
  trade_id?: string | null;
  created_at?: string | null;
};

/**
 * One service made of schedule rows: a weekly one is every row with the same name, times and
 * contact, across its days and rooms (saved one row per day and room); a one-off window is its
 * own. Rooms empty = the whole property.
 */
export type WindowGroup = {
  key: string;
  ids: string[];
  weekly: boolean;
  /** 0 = Sunday, Monday first. */
  days: number[];
  rooms: string[];
  start: string;
  end: string;
  startsAt: string | null;
  endsAt: string | null;
  reason: string | null;
  tradeId: string | null;
  created_at: string;
};

const hm = (t: string | null) => (t ?? "").slice(0, 5);
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

export function windowGroups(windows: ServiceWindow[]): WindowGroup[] {
  const weekly = new Map<string, WindowGroup>();
  const out: WindowGroup[] = [];
  for (const w of windows) {
    const created = w.created_at ?? "1970-01-01T00:00:00Z";
    if (w.day_of_week !== null && w.start_time && w.end_time) {
      const k = [
        w.reason ?? "",
        hm(w.start_time),
        hm(w.end_time),
        w.trade_id ?? "",
        w.room_id ?? "",
      ].join("|");
      const g = weekly.get(k);
      if (g) {
        g.ids.push(w.id);
        if (!g.days.includes(w.day_of_week)) g.days.push(w.day_of_week);
        if (created < g.created_at) g.created_at = created;
      } else
        weekly.set(k, {
          key: `w:${w.id}`,
          ids: [w.id],
          weekly: true,
          days: [w.day_of_week],
          rooms: w.room_id ? [w.room_id] : [],
          start: hm(w.start_time),
          end: hm(w.end_time),
          startsAt: null,
          endsAt: null,
          reason: w.reason,
          tradeId: w.trade_id ?? null,
          created_at: created,
        });
    } else if (w.starts_at && w.ends_at) {
      out.push({
        key: `w:${w.id}`,
        ids: [w.id],
        weekly: false,
        days: [],
        rooms: w.room_id ? [w.room_id] : [],
        start: "",
        end: "",
        startsAt: w.starts_at,
        endsAt: w.ends_at,
        reason: w.reason,
        tradeId: w.trade_id ?? null,
        created_at: created,
      });
    }
  }
  // Rows for different rooms on the same days are one service covering those rooms.
  const merged = new Map<string, WindowGroup>();
  for (const g of weekly.values()) {
    g.days.sort((a, b) => MON_FIRST.indexOf(a) - MON_FIRST.indexOf(b));
    const k = [
      g.reason ?? "",
      g.start,
      g.end,
      g.tradeId ?? "",
      g.days.join(","),
      g.rooms.length ? "r" : "all",
    ].join("|");
    const m = merged.get(k);
    if (m) {
      m.ids.push(...g.ids);
      m.rooms.push(...g.rooms);
      if (g.created_at < m.created_at) m.created_at = g.created_at;
    } else merged.set(k, { ...g, ids: [...g.ids], rooms: [...g.rooms] });
  }
  return [...merged.values(), ...out];
}

/** The next time a weekly service comes, from `today` ("YYYY-MM-DD") and the time now ("HH:MM"). */
export function nextVisit(
  g: Pick<WindowGroup, "days" | "end">,
  today: string,
  nowTime: string,
): string | null {
  if (!g.days.length) return null;
  const base = new Date(`${today}T12:00:00Z`);
  for (let i = 0; i < 8; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    if (!g.days.includes(d.getUTCDay())) continue;
    // Today counts until its window is over.
    if (i === 0 && g.end && g.end <= nowTime) continue;
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Colours for every open job and every scheduled service together, in the order they were
 * made, so no two share one until there are more than the colours. Keyed by job id or group key.
 */
export function serviceColours(
  jobs: Array<Pick<TimelineJob, "id" | "created_at">>,
  groups: Array<Pick<WindowGroup, "key" | "created_at">>,
): Record<string, string> {
  return jobColours([...jobs, ...groups.map((g) => ({ id: g.key, created_at: g.created_at }))]);
}
