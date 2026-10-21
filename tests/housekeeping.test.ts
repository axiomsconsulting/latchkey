import { describe, expect, it } from "vitest";

import { boardOrder, boardTotals, buildBoard, nextStatus, occupancyFor, suggestedStatus, type BoardStay } from "../src/lib/housekeeping";

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
