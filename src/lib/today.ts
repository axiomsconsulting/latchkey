/**
 * The Today dashboard: who is arriving, staying and leaving, what needs the
 * host, today's cleaning and changeovers, open guest requests, maintenance
 * coming up and how complete the guest guide is. Pure, so it's tested; the
 * page only lays it out and links each item to where it lives.
 */
import { dayOfWeek, stayState } from "./dates";

export type TodayBooking = {
  id: string;
  room_id: string | null;
  channel: string;
  site_key?: string | null;
  guest_full_name: string | null;
  guest_count: number | null;
  reservation_code: string | null;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: string;
  mirror_of?: string | null;
  archived_at?: string | null;
};

export type Board<B extends TodayBooking = TodayBooking> = {
  arriving: B[];
  staying: B[];
  leaving: B[];
  needsDetails: B[];
  doubleBooked: B[];
};

const byTime = (field: "check_in_time" | "check_out_time", fallback: string) => (a: TodayBooking, b: TodayBooking) =>
  (a[field] ?? fallback).localeCompare(b[field] ?? fallback);

/**
 * Arriving, staying and leaving go by dates, even while a stay still needs a
 * guest name; "needs details" and double bookings are separate to-do lists.
 * Closed nights (blocks, mirrors), cancelled and archived stays never count.
 */
export function todayBoard<B extends TodayBooking>(bookings: B[], today: string): Board<B> {
  const live = bookings.filter((b) => !b.archived_at && !b.mirror_of && b.status !== "cancelled" && b.status !== "blocked");
  const state = (b: B) => stayState(b.status === "needs_details" ? { ...b, status: "upcoming" } : b, today);
  return {
    arriving: live.filter((b) => state(b) === "arriving_today").sort(byTime("check_in_time", "15:00")),
    staying: live.filter((b) => state(b) === "in_stay").sort((a, b) => a.check_out_date.localeCompare(b.check_out_date)),
    leaving: live.filter((b) => state(b) === "departing_today").sort(byTime("check_out_time", "11:00")),
    needsDetails: live.filter((b) => b.status === "needs_details" && b.check_out_date >= today).sort((a, b) => a.check_in_date.localeCompare(b.check_in_date)),
    doubleBooked: live.filter((b) => b.status === "flagged" && b.check_out_date >= today),
  };
}

const minutes = (t: string | null | undefined, fallback: string) => {
  const [h = "0", m = "0"] = (t ?? fallback).slice(0, 5).split(":");
  return Number(h) * 60 + Number(m);
};

export type Turnaround = { roomId: string; leavingId: string; arrivingId: string; gapMinutes: number };

/** The same room emptying and filling today with under two hours to clean. */
export function tightTurnarounds(board: Board, limitMinutes = 120): Turnaround[] {
  const out: Turnaround[] = [];
  for (const out_ of board.leaving) {
    if (!out_.room_id) continue;
    const next = board.arriving.find((a) => a.room_id === out_.room_id);
    if (!next) continue;
    const gap = minutes(next.check_in_time, "15:00") - minutes(out_.check_out_time, "11:00");
    if (gap < limitMinutes) out.push({ roomId: out_.room_id, leavingId: out_.id, arrivingId: next.id, gapMinutes: gap });
  }
  return out;
}

export type Window = { id: string; room_id: string | null; day_of_week: number | null; start_time: string | null; end_time: string | null; reason: string | null };

/** Cleaning and other closed times that apply today, earliest first. */
export function windowsToday<W extends Window>(windows: W[], today: string): W[] {
  const dow = dayOfWeek(today);
  return windows.filter((w) => w.day_of_week === dow).sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
}

export type Job = {
  id: string;
  source: string;
  status: string;
  category: string;
  title: string;
  scheduled_at: string | null;
  created_at: string;
  archived_at?: string | null;
};

const OPEN = ["new", "acknowledged", "booked", "in_progress"];

/** Guest requests not yet sorted out, new ones first, oldest first within. */
export function openGuestRequests<J extends Job>(jobs: J[]): J[] {
  return jobs
    .filter((j) => !j.archived_at && j.source === "guest" && OPEN.includes(j.status))
    .sort((a, b) => Number(b.status === "new") - Number(a.status === "new") || a.created_at.localeCompare(b.created_at));
}

/** The host's own jobs (maintenance, cleaning) booked from today for the next `days` days, soonest first. */
export function maintenanceAhead<J extends Job>(jobs: J[], now: Date, days = 7): J[] {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = start.getTime() + days * 86_400_000;
  return jobs
    .filter((j) => !j.archived_at && j.source !== "guest" && OPEN.includes(j.status) && j.scheduled_at)
    .filter((j) => {
      const t = Date.parse(j.scheduled_at!);
      return t >= start.getTime() && t < end;
    })
    .sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!));
}

/** Which guide sections the house guide has written, and which are still empty. */
export function guideProgress<K extends string>(all: K[], written: Array<{ roomId: string | null; sectionKey: K }>): { done: K[]; missing: K[] } {
  const house = new Set(written.filter((s) => s.roomId === null).map((s) => s.sectionKey));
  return { done: all.filter((k) => house.has(k)), missing: all.filter((k) => !house.has(k)) };
}
