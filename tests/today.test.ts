import { describe, expect, it } from "vitest";

import { guideProgress, maintenanceAhead, openGuestRequests, tightTurnarounds, todayBoard, windowsToday, type Job, type TodayBooking } from "../src/lib/today";

const T = "2026-10-14"; // a Wednesday
const stay = (id: string, inDate: string, outDate: string, extra: Partial<TodayBooking> = {}): TodayBooking => ({
  id,
  room_id: "r1",
  channel: "airbnb",
  guest_full_name: id,
  guest_count: 1,
  reservation_code: null,
  check_in_date: inDate,
  check_out_date: outDate,
  check_in_time: null,
  check_out_time: null,
  status: "upcoming",
  ...extra,
});

describe("today's board", () => {
  const bookings = [
    stay("late", T, "2026-10-16", { check_in_time: "18:00", room_id: "r2" }),
    stay("early", T, "2026-10-15", { check_in_time: "14:00" }),
    stay("here", "2026-10-12", "2026-10-17", { status: "checked_in", room_id: "r3" }),
    stay("off", "2026-10-11", T, { check_out_time: "10:00" }),
    stay("noname", T, "2026-10-18", { status: "needs_details", guest_full_name: null, room_id: "r4" }),
    stay("clash", "2026-10-20", "2026-10-22", { status: "flagged" }),
    stay("blocked", T, "2026-10-15", { status: "blocked" }),
    stay("mirror", T, "2026-10-15", { mirror_of: "early" }),
    stay("gone", T, "2026-10-15", { status: "cancelled" }),
    stay("tidied", T, "2026-10-15", { archived_at: "2026-10-01T00:00:00Z" }),
    stay("oldname", "2026-10-01", "2026-10-03", { status: "needs_details" }),
  ];
  const b = todayBoard(bookings, T);

  it("puts arrivals in time order, including stays that still need a name", () => {
    expect(b.arriving.map((x) => x.id)).toEqual(["early", "noname", "late"]);
  });

  it("lists who's staying, leaving and what needs the host", () => {
    expect(b.staying.map((x) => x.id)).toEqual(["here"]);
    expect(b.leaving.map((x) => x.id)).toEqual(["off"]);
    expect(b.needsDetails.map((x) => x.id)).toEqual(["noname"]);
    expect(b.doubleBooked.map((x) => x.id)).toEqual(["clash"]);
  });

  it("warns about tight changeovers in the same room", () => {
    // 10:00 out, 14:00 in: four hours is enough.
    expect(tightTurnarounds(b)).toEqual([]);
    const tight = todayBoard([stay("a", "2026-10-10", T, { check_out_time: "11:00" }), stay("b", T, "2026-10-16", { check_in_time: "12:30" })], T);
    expect(tightTurnarounds(tight)).toEqual([{ roomId: "r1", leavingId: "a", arrivingId: "b", gapMinutes: 90 }]);
  });
});

describe("cleaning, requests and maintenance", () => {
  it("shows only today's closed times, earliest first", () => {
    const w = (id: string, dow: number | null, start: string) => ({ id, room_id: null, day_of_week: dow, start_time: start, end_time: null, reason: null });
    expect(windowsToday([w("b", 3, "14:00"), w("a", 3, "10:00"), w("x", 4, "09:00"), w("y", null, "09:00")], T).map((x) => x.id)).toEqual(["a", "b"]);
  });

  const job = (id: string, extra: Partial<Job>): Job => ({ id, source: "guest", status: "new", category: "other", title: id, scheduled_at: null, created_at: "2026-10-13T10:00:00Z", ...extra });

  it("lists open guest requests, new ones first", () => {
    const jobs = [
      job("seen", { status: "acknowledged", created_at: "2026-10-12T10:00:00Z" }),
      job("new-later", { created_at: "2026-10-14T08:00:00Z" }),
      job("new-earlier", { created_at: "2026-10-13T08:00:00Z" }),
      job("done", { status: "done" }),
      job("host", { source: "host" }),
      job("archived", { archived_at: "2026-10-14T00:00:00Z" }),
    ];
    expect(openGuestRequests(jobs).map((j) => j.id)).toEqual(["new-earlier", "new-later", "seen"]);
  });

  it("lists maintenance booked from today for the next week", () => {
    const now = new Date("2026-10-14T09:00:00Z");
    const jobs = [
      job("boiler", { source: "host", status: "booked", scheduled_at: "2026-10-14T13:00:00Z" }),
      job("earlier-today", { source: "host", status: "booked", scheduled_at: "2026-10-14T07:00:00Z" }),
      job("next-week", { source: "host", status: "booked", scheduled_at: "2026-10-22T09:00:00Z" }),
      job("yesterday", { source: "host", status: "booked", scheduled_at: "2026-10-13T09:00:00Z" }),
      job("finished", { source: "host", status: "done", scheduled_at: "2026-10-15T09:00:00Z" }),
      job("guest", { source: "guest", scheduled_at: "2026-10-15T09:00:00Z" }),
    ];
    expect(maintenanceAhead(jobs, now).map((j) => j.id)).toEqual(["earlier-today", "boiler"]);
  });

  it("counts the house guide's written sections", () => {
    const p = guideProgress(["getting_in", "parking", "rules"], [
      { roomId: null, sectionKey: "getting_in" },
      { roomId: "r1", sectionKey: "parking" },
    ]);
    expect(p).toEqual({ done: ["getting_in"], missing: ["parking", "rules"] });
  });
});
