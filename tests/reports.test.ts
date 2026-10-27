import { describe, expect, it } from "vitest";

import { buildReport, daysCsv, nightsIn, presetRange, type ReportStay } from "../src/lib/reports";

const stay = (
  id: string,
  room: string,
  inD: string,
  outD: string,
  extra: Partial<ReportStay> = {},
): ReportStay => ({
  id,
  room_id: room,
  check_in_date: inD,
  check_out_date: outD,
  status: "upcoming",
  site: "airbnb",
  guest_count: 2,
  checked_in_at: null,
  ...extra,
});

describe("operations reports", () => {
  const range = { from: "2026-10-01", to: "2026-10-11" }; // 10 nights
  const r = buildReport({
    range,
    today: "2026-10-08",
    rooms: 2,
    stays: [
      stay("a", "r1", "2026-10-01", "2026-10-04", { checked_in_at: "2026-10-01T15:00:00Z" }), // 3 nights
      stay("b", "r1", "2026-10-05", "2026-10-07", { site: "booking_com", status: "checked_out" }), // 2 nights
      stay("c", "r2", "2026-10-09", "2026-10-12", { site: "direct" }), // 2 nights in range, arrives after today
      stay("x", "r2", "2026-10-01", "2026-10-03", { status: "cancelled" }),
      stay("blk", "r2", "2026-10-03", "2026-10-05", { status: "blocked", site: "airbnb" }), // 2 closed nights
    ],
    jobs: [
      {
        source: "guest",
        status: "done",
        created_at: "2026-10-02T10:00:00Z",
        acknowledged_at: "2026-10-02T10:20:00Z",
        completed_at: "2026-10-02T12:00:00Z",
      },
      {
        source: "guest",
        status: "new",
        created_at: "2026-10-06T09:00:00Z",
        acknowledged_at: null,
        completed_at: null,
      },
      {
        source: "maintenance",
        status: "in_progress",
        created_at: "2026-10-03T09:00:00Z",
        acknowledged_at: null,
        completed_at: null,
      },
    ],
    requests: [
      {
        status: "confirmed",
        total_pence: 1500,
        paid_at: "2026-10-02T11:00:00Z",
        created_at: "2026-10-02T09:00:00Z",
      },
      { status: "declined", total_pence: 900, paid_at: null, created_at: "2026-10-03T09:00:00Z" },
    ],
    messages: [
      { booking_id: "a", direction: "inbound", created_at: "2026-10-01T20:00:00Z" },
      { booking_id: "a", direction: "inbound", created_at: "2026-10-01T20:05:00Z" },
      { booking_id: "a", direction: "outbound", created_at: "2026-10-01T20:30:00Z" },
      { booking_id: "b", direction: "inbound", created_at: "2026-10-05T08:00:00Z" },
      { booking_id: "b", direction: "outbound", created_at: "2026-10-05T08:10:00Z" },
    ],
    readiness: [{ room_id: "r1", day: "2026-10-05", status: "ready" }],
  });

  it("counts occupancy across every site, leaving cancelled stays out and closed nights unsellable", () => {
    expect(nightsIn(range)).toHaveLength(10);
    expect(r.occupiedNights).toBe(7);
    expect(r.availableNights).toBe(18);
    expect(r.occupancy).toBe(38.9);
    expect(r.sites.map((s) => [s.site, s.stays, s.nights])).toEqual([
      ["airbnb", 1, 3],
      ["booking_com", 1, 2],
      ["direct", 1, 2],
    ]);
  });

  it("measures arrivals, check-ins and rooms ready, only for arrivals that have happened", () => {
    expect(r).toMatchObject({ arrivals: 3, departures: 2, averageStay: 2.7, averageParty: 2 });
    expect(r.checkInRate).toBe(100);
    expect(r.readyOnArrival).toBe(50);
  });

  it("measures requests, upkeep, extras and how fast guests get a reply", () => {
    expect(r.requests).toEqual({
      created: 2,
      done: 1,
      openNow: 1,
      medianAcknowledgeMinutes: 20,
      medianCompleteHours: 2,
    });
    expect(r.maintenance).toEqual({ created: 1, done: 0, openNow: 1 });
    expect(r.extras).toEqual({ paidCount: 1, revenuePence: 1500, requested: 2 });
    // Replies are timed from the first waiting message: 30 and 10 minutes.
    expect(r.replies).toEqual({ threads: 2, medianReplyMinutes: 20 });
  });

  it("offers the usual ranges and a day-by-day spreadsheet", () => {
    expect(presetRange("7d", "2026-10-21")).toEqual({ from: "2026-10-15", to: "2026-10-22" });
    expect(presetRange("month", "2026-12-05")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
    expect(presetRange("lastMonth", "2026-01-05")).toEqual({
      from: "2025-12-01",
      to: "2026-01-01",
    });
    expect(daysCsv(r).split("\n")[1]).toBe("2026-10-01,1,2,50,1,0");
  });
});
