/**
 * Operations reports (/app/reports): built from every stay in Latchkey,
 * whichever site it was booked on. Occupancy, arrivals and departures,
 * check-in completion, rooms ready on arrival day, guest requests and
 * maintenance, extras revenue and how fast guests get answers. Not revenue
 * management: no rates, ADR or forecasts. Pure: no network or database.
 */
import { addDays } from "./dates";

export type ReportStay = {
  id: string;
  room_id: string | null;
  check_in_date: string;
  check_out_date: string;
  status: string;
  /** The booking site (platformKey): built-in channel or the host's own site. */
  site: string;
  guest_count: number | null;
  checked_in_at: string | null;
};

export type ReportJob = {
  source: string;
  status: string;
  created_at: string;
  acknowledged_at: string | null;
  completed_at: string | null;
};
export type ReportRequest = {
  status: string;
  total_pence: number;
  paid_at: string | null;
  created_at: string;
};
export type ReportMessage = { booking_id: string; direction: string; created_at: string };
export type ReportReadiness = { room_id: string; day: string; status: string };

export type Range = { from: string; to: string };

/** Nights in the range, from `from` up to but not including `to`. */
export function nightsIn(r: Range): string[] {
  const out: string[] = [];
  for (let d = r.from; d < r.to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

const LIVE = (s: ReportStay) => s.status !== "cancelled" && s.status !== "blocked";
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const minutesBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60_000;
const pct = (n: number, d: number): number | null =>
  d > 0 ? Math.round((n / d) * 1000) / 10 : null;

export type DayRow = {
  day: string;
  occupied: number;
  available: number;
  arrivals: number;
  departures: number;
};
export type SiteRow = { site: string; stays: number; nights: number; share: number | null };

export type Report = {
  nights: number;
  rooms: number;
  occupancy: number | null;
  occupiedNights: number;
  availableNights: number;
  arrivals: number;
  departures: number;
  averageStay: number | null;
  averageParty: number | null;
  checkInRate: number | null;
  readyOnArrival: number | null;
  sites: SiteRow[];
  days: DayRow[];
  requests: {
    created: number;
    done: number;
    openNow: number;
    medianAcknowledgeMinutes: number | null;
    medianCompleteHours: number | null;
  };
  maintenance: { created: number; done: number; openNow: number };
  extras: { paidCount: number; revenuePence: number; requested: number };
  replies: { threads: number; medianReplyMinutes: number | null };
};

export function buildReport(input: {
  range: Range;
  /** Today in the property's time zone: completion rates only count arrivals up to today. */
  today: string;
  rooms: number;
  stays: ReportStay[];
  jobs: ReportJob[];
  requests: ReportRequest[];
  messages: ReportMessage[];
  readiness: ReportReadiness[];
}): Report {
  const { range, today } = input;
  const days = nightsIn(range);
  const live = input.stays.filter(LIVE);
  // Nights closed on a booking site (blocked) aren't available to sell.
  const blocked = input.stays.filter((s) => s.status === "blocked");
  const occupiedOn = (d: string) =>
    live.filter((s) => s.check_in_date <= d && s.check_out_date > d).length;
  const closedOn = (d: string) =>
    new Set(
      blocked.filter((s) => s.check_in_date <= d && s.check_out_date > d).map((s) => s.room_id),
    ).size;

  const dayRows: DayRow[] = days.map((d) => {
    const occupied = Math.min(input.rooms, occupiedOn(d));
    return {
      day: d,
      occupied,
      available: Math.max(0, input.rooms - closedOn(d)),
      arrivals: live.filter((s) => s.check_in_date === d).length,
      departures: live.filter((s) => s.check_out_date === d).length,
    };
  });
  const occupiedNights = dayRows.reduce((a, r) => a + r.occupied, 0);
  const availableNights = dayRows.reduce((a, r) => a + r.available, 0);

  const inRange = (d: string) => d >= range.from && d < range.to;
  const arriving = live.filter((s) => inRange(s.check_in_date));
  const departing = live.filter((s) => inRange(s.check_out_date));
  const stayNights = (s: ReportStay) =>
    Math.max(
      0,
      Math.round((Date.parse(s.check_out_date) - Date.parse(s.check_in_date)) / 86_400_000),
    );
  const parties = arriving.map((s) => s.guest_count ?? 0).filter((n) => n > 0);

  // Only arrivals that have happened can have checked in.
  const due = arriving.filter((s) => s.check_in_date <= today);
  const checkedIn = due.filter(
    (s) => s.checked_in_at || s.status === "checked_in" || s.status === "checked_out",
  );
  const readyRooms = new Set(
    input.readiness.filter((r) => r.status === "ready").map((r) => `${r.room_id}:${r.day}`),
  );
  const roomDue = due.filter((s) => s.room_id);
  const readyCount = roomDue.filter((s) =>
    readyRooms.has(`${s.room_id}:${s.check_in_date}`),
  ).length;

  // Where the nights came from.
  const bySite = new Map<string, { stays: number; nights: number }>();
  for (const s of live) {
    const n = days.filter((d) => s.check_in_date <= d && s.check_out_date > d).length;
    if (!n && !inRange(s.check_in_date)) continue;
    const row = bySite.get(s.site) ?? { stays: 0, nights: 0 };
    row.nights += n;
    if (inRange(s.check_in_date)) row.stays += 1;
    bySite.set(s.site, row);
  }
  const sites = [...bySite.entries()]
    .map(([site, r]) => ({ site, ...r, share: pct(r.nights, occupiedNights) }))
    .sort((a, b) => b.nights - a.nights || b.stays - a.stays);

  const createdIn = (j: { created_at: string }) => inRange(j.created_at.slice(0, 10));
  const open = (j: ReportJob) => !["done", "declined", "cancelled"].includes(j.status);
  const guestJobs = input.jobs.filter((j) => j.source === "guest");
  const upkeep = input.jobs.filter((j) => j.source !== "guest");
  const guestCreated = guestJobs.filter(createdIn);

  // First host reply after each guest message that was waiting.
  const replyMinutes: number[] = [];
  const byStay = new Map<string, ReportMessage[]>();
  for (const m of input.messages)
    byStay.set(m.booking_id, [...(byStay.get(m.booking_id) ?? []), m]);
  for (const list of byStay.values()) {
    let waiting: string | null = null;
    for (const m of [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (m.direction === "inbound") waiting ??= m.created_at;
      else if (waiting) {
        if (inRange(waiting.slice(0, 10))) replyMinutes.push(minutesBetween(waiting, m.created_at));
        waiting = null;
      }
    }
  }

  const paid = input.requests.filter((r) => r.paid_at && inRange(r.paid_at.slice(0, 10)));
  return {
    nights: days.length,
    rooms: input.rooms,
    occupancy: pct(occupiedNights, availableNights),
    occupiedNights,
    availableNights,
    arrivals: arriving.length,
    departures: departing.length,
    averageStay: arriving.length
      ? Math.round((arriving.reduce((a, s) => a + stayNights(s), 0) / arriving.length) * 10) / 10
      : null,
    averageParty: parties.length
      ? Math.round((parties.reduce((a, n) => a + n, 0) / parties.length) * 10) / 10
      : null,
    checkInRate: pct(checkedIn.length, due.length),
    readyOnArrival: pct(readyCount, roomDue.length),
    sites,
    days: dayRows,
    requests: {
      created: guestCreated.length,
      done: guestJobs.filter((j) => j.completed_at && inRange(j.completed_at.slice(0, 10))).length,
      openNow: guestJobs.filter(open).length,
      medianAcknowledgeMinutes: median(
        guestCreated
          .filter((j) => j.acknowledged_at)
          .map((j) => minutesBetween(j.created_at, j.acknowledged_at!)),
      ),
      medianCompleteHours: ((m) => (m === null ? null : Math.round(m * 10) / 10))(
        median(
          guestCreated
            .filter((j) => j.completed_at)
            .map((j) => minutesBetween(j.created_at, j.completed_at!) / 60),
        ),
      ),
    },
    maintenance: {
      created: upkeep.filter(createdIn).length,
      done: upkeep.filter((j) => j.completed_at && inRange(j.completed_at.slice(0, 10))).length,
      openNow: upkeep.filter(open).length,
    },
    extras: {
      paidCount: paid.length,
      revenuePence: paid.reduce((a, r) => a + (r.total_pence ?? 0), 0),
      requested: input.requests.filter((r) => inRange(r.created_at.slice(0, 10))).length,
    },
    replies: {
      threads: replyMinutes.length,
      medianReplyMinutes: ((m) => (m === null ? null : Math.round(m)))(median(replyMinutes)),
    },
  };
}

/** The usual ranges, ending today (inclusive) in the property's time zone. */
export function presetRange(preset: "7d" | "30d" | "month" | "lastMonth", today: string): Range {
  if (preset === "7d") return { from: addDays(today, -6), to: addDays(today, 1) };
  if (preset === "30d") return { from: addDays(today, -29), to: addDays(today, 1) };
  const [y, m] = today.split("-").map(Number) as [number, number];
  const first = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  if (preset === "month")
    return { from: first(y, m), to: m === 12 ? first(y + 1, 1) : first(y, m + 1) };
  return { from: m === 1 ? first(y - 1, 12) : first(y, m - 1), to: first(y, m) };
}

/** A spreadsheet of the days: one line each, for the host's own records. */
export function daysCsv(r: Report): string {
  const lines = [
    ["Date", "Rooms occupied", "Rooms available", "Occupancy %", "Arrivals", "Departures"].join(
      ",",
    ),
  ];
  for (const d of r.days)
    lines.push(
      [
        d.day,
        d.occupied,
        d.available,
        d.available ? Math.round((d.occupied / d.available) * 1000) / 10 : "",
        d.arrivals,
        d.departures,
      ].join(","),
    );
  return lines.join("\n");
}
