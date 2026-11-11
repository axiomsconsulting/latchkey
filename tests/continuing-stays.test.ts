import { describe, expect, it } from "vitest";

import { continuingStays, earlierCheck, guestAgain, type RoomStay } from "../src/lib/repeat-guest";

const stay = (o: Partial<RoomStay> & Pick<RoomStay, "id">): RoomStay => ({
  status: "upcoming",
  guest_full_name: "Mahamoud Adan",
  guest_email: null,
  guest_phone: null,
  check_in_date: "2026-11-09",
  check_out_date: "2026-11-11",
  room_id: "trinity4",
  mirror_of: null,
  archived_at: null,
  ...o,
});

describe("staying on in the same room", () => {
  const first = stay({ id: "a", status: "checked_in" });
  const next = stay({ id: "b", check_in_date: "2026-11-11", check_out_date: "2026-11-12" });

  it("drops the goodbye and the welcome between them", () => {
    const r = continuingStays([first, next]);
    expect([...r.noGoodbye]).toEqual(["a"]);
    expect([...r.noWelcome]).toEqual(["b"]);
  });
  it("not for another room, another guest, a gap or a cancelled stay", () => {
    for (const other of [
      { ...next, room_id: "trinity1" },
      { ...next, guest_full_name: "Pawel Wierzbicki" },
      { ...next, check_in_date: "2026-11-12", check_out_date: "2026-11-13" },
      { ...next, status: "cancelled" },
    ]) {
      const r = continuingStays([first, other]);
      expect(r.noGoodbye.size + r.noWelcome.size).toBe(0);
    }
  });
  it("shows the first stay's ID check on the next, marked as staying on", () => {
    expect(earlierCheck(next, [first, next], new Set(["a"]))).toEqual({
      bookingId: "a",
      date: "2026-11-09",
      continued: true,
    });
    expect(guestAgain(next, [first, next])).toBe("continued");
  });
});

describe("a returning guest", () => {
  const before = stay({
    id: "p1",
    guest_full_name: "Pawel Wierzbicki",
    guest_phone: "+447700900123",
    status: "checked_out",
    check_in_date: "2026-11-03",
    check_out_date: "2026-11-04",
    room_id: "trinity1",
  });
  const now = stay({
    id: "p2",
    guest_full_name: "Pawel Wierzbicki",
    guest_phone: "+447700900123",
    check_in_date: "2026-11-11",
    check_out_date: "2026-11-12",
    room_id: "trinity1",
  });
  it("brings back the earlier check, whatever it found", () => {
    expect(earlierCheck(now, [before, now], new Set(["p1"]))?.bookingId).toBe("p1");
    expect(earlierCheck(now, [before, now], new Set(["p1"]))?.continued).toBe(false);
    expect(guestAgain(now, [before, now])).toBe("returning");
  });
  it("nothing without an earlier check, and never from a later stay", () => {
    expect(earlierCheck(now, [before, now], new Set())).toBeNull();
    expect(earlierCheck(before, [before, now], new Set(["p2"]))).toBeNull();
    expect(guestAgain(before, [before, now])).toBeNull();
  });
});
