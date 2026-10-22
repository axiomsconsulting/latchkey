import { describe, expect, it } from "vitest";

import { boardOrder, boardTotals, buildBoard, dayAxis, nextOnWeekday, nextStatus, occupancyFor, roomLane, roomWindows, suggestedStatus, weekGrid, windowsForDay, type BoardStay } from "../src/lib/housekeeping";

const stay = (id: string, room: string, inD: string, outD: string, extra: Partial<BoardStay> = {}): BoardStay => ({
  id, room_id: room, guest_full_name: id, check_in_date: inD, check_out_date: outD, status: "upcoming", ...extra,
});
const DAY = "2026-10-21";

describe("housekeeping board", () => {
  it("works out what the day means for each room", () => {
    expect(occupancyFor(DAY, [stay("a", "r", "2026-10-19", DAY), stay("b", "r", DAY, "2026-10-23")], false).occupancy).toBe("turnover");
    expect(occupancyFor(DAY, [stay("a", "r", "2026-10-19", DAY)], false).occupancy).toBe("leaving");
    expect(occupancyFor(DAY, [stay("b", "r", DAY, "2026-10-23")], false).occupancy).toBe("arriving");
    expect(occupancyFor(DAY, [stay("c", "r", "2026-10-20", "2026-10-24")], false).occupancy).toBe("staying");
    expect(occupancyFor(DAY, [], false).occupancy).toBe("empty");
    expect(occupancyFor(DAY, [], true).occupancy).toBe("closed");
    expect(occupancyFor(DAY, [stay("x", "r", "2026-10-20", "2026-10-25", { status: "blocked" })], false).occupancy).toBe("closed");
    // A cancelled stay doesn't make work.
    expect(occupancyFor(DAY, [stay("a", "r", "2026-10-19", DAY, { status: "cancelled" })], false).occupancy).toBe("empty");
  });

  it("starts turnovers and departures at 'to clean', arrivals at 'clean' waiting for 'ready'", () => {
    expect(suggestedStatus("turnover")).toBe("to_clean");
    expect(suggestedStatus("arriving")).toBe("clean");
    expect(suggestedStatus("staying")).toBeNull();
    expect(nextStatus("to_clean")).toBe("cleaning");
    expect(nextStatus("clean")).toBe("ready");
    expect(nextStatus("ready")).toBe("ready");
    expect(nextStatus("out_of_service")).toBe("to_clean");
  });

  it("uses saved progress, due by the arrival's check-in, and puts late rooms first", () => {
    const cards = buildBoard({
      day: DAY,
      rooms: [{ id: "r1", display_name: "Room 1" }, { id: "r2", display_name: "Room 2" }, { id: "r3", display_name: "Room 3" }],
      stays: [stay("a", "r1", "2026-10-19", DAY), stay("b", "r1", DAY, "2026-10-23", { check_in_time: "14:00:00" }), stay("c", "r2", DAY, "2026-10-22")],
      readiness: [{ room_id: "r2", status: "ready", assignee: "Ana", due_time: null, note: null, updated_at: "x" }],
      openJobs: { r3: 2 },
      defaultCheckIn: "15:00",
    });
    expect(cards[0]).toMatchObject({ occupancy: "turnover", status: "to_clean", dueBy: "14:00", saved: false });
    expect(cards[1]).toMatchObject({ status: "ready", assignee: "Ana", dueBy: "15:00", saved: true });
    expect(cards[2]).toMatchObject({ occupancy: "empty", status: null, openJobs: 2 });
    expect(boardTotals(cards)).toMatchObject({ toClean: 1, ready: 1, arrivingNotReady: 1 });
    expect(boardOrder(cards).map((c) => c.roomName)).toEqual(["Room 1", "Room 2", "Room 3"]);
  });
});


describe("housekeeping schedule", () => {
  const windows = [
    { id: "w1", room_id: null, day_of_week: 2, start_time: "10:00:00", end_time: "15:00:00", reason: "Cleaning" },
    { id: "w2", room_id: "r1", day_of_week: 2, start_time: "09:00:00", end_time: "10:00:00", reason: "Laundry" },
    { id: "w3", room_id: "r2", day_of_week: 4, start_time: "11:00:00", end_time: "12:00:00", reason: null },
    { id: "w4", room_id: "r1", day_of_week: null, start_time: null, end_time: null, starts_at: "2026-10-20T13:00:00Z", ends_at: "2026-10-21T09:00:00Z", reason: "Painting" },
  ];

  it("finds the windows that fall on a day, weekly and one-off, in the property's time", () => {
    // 2026-10-20 is a Tuesday; London is on summer time (UTC+1) until 25 October.
    expect(windowsForDay(windows, "2026-10-20", "Europe/London").map((w) => [w.id, w.start, w.end])).toEqual([
      ["w2", "09:00", "10:00"],
      ["w1", "10:00", "15:00"],
      ["w4", "14:00", "24:00"],
    ]);
    expect(windowsForDay(windows, "2026-10-21", "Europe/London").map((w) => [w.id, w.start, w.end])).toEqual([["w4", "00:00", "10:00"]]);
    expect(windowsForDay(windows, "2026-10-22", "Europe/London").map((w) => w.id)).toEqual(["w3"]);
  });

  it("gives each room its own windows and the whole property's", () => {
    const day = windowsForDay(windows, "2026-10-20", "Europe/London");
    expect(roomWindows(day, "r2").map((w) => w.id)).toEqual(["w1"]);
    expect(roomWindows(day, "r1").map((w) => w.id)).toEqual(["w2", "w1", "w4"]);
  });

  const card = (o: Partial<Parameters<typeof roomLane>[0]>) =>
    ({ roomId: "r1", roomName: "One", occupancy: "turnover", leaving: null, arriving: null, staying: null, status: "to_clean", saved: false, assignee: null, dueBy: null, note: null, openJobs: 0, updatedAt: null, ...o }) as Parameters<typeof roomLane>[0];
  const stay = (o: Record<string, unknown>) => ({ id: "b", room_id: "r1", guest_full_name: "A B", check_in_date: "2026-10-20", check_out_date: "2026-10-20", status: "confirmed", ...o });

  it("spans the day's timeline over everything that happens, at least 08:00 to 20:00", () => {
    expect(dayAxis({ cards: [], windows: [], checkOut: "11:00", checkIn: "15:00" })).toEqual({ from: 7 * 60, to: 21 * 60 });
    const late = card({ arriving: stay({ check_in_time: "22:30" }) as never, dueBy: "22:30" });
    expect(dayAxis({ cards: [late], windows: [], checkOut: "11:00", checkIn: "15:00" }).to).toBe(24 * 60);
  });

  it("lays out a turnover: leaving guest, free time with the windows, arriving guest", () => {
    const axis = { from: 7 * 60, to: 21 * 60 };
    const c = card({ leaving: stay({ check_out_time: "10:30" }) as never, arriving: stay({}) as never, dueBy: "16:00" });
    const lane = roomLane(c, [{ id: "w1", roomId: null, start: "11:00", end: "13:00", reason: "Cleaning", weekly: true }], { checkOut: "11:00", checkIn: "15:00", axis });
    expect(lane.out).toBe(10 * 60 + 30);
    expect(lane.due).toBe(16 * 60);
    expect(lane.segments.map((s) => [s.kind, s.from, s.to])).toEqual([
      ["guest_out", 420, 630],
      ["free", 630, 960],
      ["guest_in", 960, 1260],
      ["window", 660, 780],
    ]);
    const staying = roomLane(card({ occupancy: "staying" }), [], { checkOut: "11:00", checkIn: "15:00", axis });
    expect(staying.segments.map((s) => s.kind)).toEqual(["staying"]);
  });

  it("shows the week Monday first and finds the next of a weekday", () => {
    const grid = weekGrid(windows);
    expect(grid.map((d) => d.dow)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(grid[1]!.windows.map((w) => w.id)).toEqual(["w2", "w1"]);
    expect(nextOnWeekday("2026-10-20", 2)).toBe("2026-10-20");
    expect(nextOnWeekday("2026-10-20", 1)).toBe("2026-10-26");
  });
});
