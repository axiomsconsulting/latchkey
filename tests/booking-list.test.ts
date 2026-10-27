import { describe, expect, it } from "vitest";

import {
  DEFAULT_FILTERS,
  filterBookings,
  readFilters,
  sortBookings,
  stayGroup,
  type ListBooking,
} from "../src/lib/booking-list";

const today = "2026-10-13";
const b = (id: string, o: Partial<ListBooking>): ListBooking => ({
  id,
  status: "upcoming",
  check_in_date: "2026-10-20",
  check_out_date: "2026-10-22",
  guest_full_name: id,
  room_id: "r1",
  channel: "airbnb",
  ...o,
});
const label = { room: (id: string | null) => id ?? "", platform: (x: ListBooking) => x.channel };

const stays = [
  b("past-old", {
    status: "checked_out",
    check_in_date: "2026-09-01",
    check_out_date: "2026-09-03",
  }),
  b("later", { check_in_date: "2026-11-01", check_out_date: "2026-11-03" }),
  b("here", { status: "checked_in", check_in_date: "2026-10-12", check_out_date: "2026-10-15" }),
  b("arriving", { check_in_date: today, check_out_date: "2026-10-14" }),
  b("cancelled", { status: "cancelled" }),
  b("soon", { check_in_date: "2026-10-15", check_out_date: "2026-10-16" }),
  b("past-recent", {
    status: "checked_out",
    check_in_date: "2026-10-10",
    check_out_date: "2026-10-12",
  }),
  b("leaving", { status: "checked_in", check_in_date: "2026-10-11", check_out_date: today }),
  b("needs", {
    status: "needs_details",
    check_in_date: "2026-10-25",
    check_out_date: "2026-10-26",
  }),
];

describe("bookings list", () => {
  it("groups stays the way a host thinks of them", () => {
    expect(stayGroup(stays[2]!, today)).toBe("here");
    expect(stayGroup(stays[3]!, today)).toBe("arriving");
    expect(stayGroup(stays[7]!, today)).toBe("leaving");
    expect(stayGroup(stays[0]!, today)).toBe("past");
    expect(stayGroup(b("mirror", { mirror_of: "x" }), today)).toBe("closed");
  });

  it("puts what matters today first, upcoming soonest first, past most recent first", () => {
    expect(sortBookings(stays, "smart", "asc", today, label).map((x) => x.id)).toEqual([
      "here",
      "arriving",
      "leaving",
      "soon",
      "later",
      "needs",
      "past-recent",
      "past-old",
      "cancelled",
    ]);
  });

  it("sorts by any column, both ways", () => {
    const byGuest = sortBookings(stays, "guest", "asc", today, label).map((x) => x.id);
    expect(byGuest[0]).toBe("arriving");
    expect(sortBookings(stays, "guest", "desc", today, label)[0]!.id).toBe("soon");
    expect(sortBookings(stays, "checkIn", "desc", today, label)[0]!.id).toBe("later");
  });

  it("hides past stays by default and filters by room, platform and search", () => {
    expect(
      filterBookings(stays, DEFAULT_FILTERS, today, (x) => x.channel).some((x) =>
        x.id.startsWith("past"),
      ),
    ).toBe(false);
    const rooms = [b("a", { room_id: "r1" }), b("c", { room_id: "r2", channel: "direct" })];
    expect(
      filterBookings(rooms, { ...DEFAULT_FILTERS, hideRooms: ["r1"] }, today, (x) => x.channel).map(
        (x) => x.id,
      ),
    ).toEqual(["c"]);
    expect(
      filterBookings(
        rooms,
        { ...DEFAULT_FILTERS, hidePlatforms: ["direct"] },
        today,
        (x) => x.channel,
      ).map((x) => x.id),
    ).toEqual(["a"]);
    expect(
      filterBookings(rooms, { ...DEFAULT_FILTERS, search: "C" }, today, (x) => x.channel).map(
        (x) => x.id,
      ),
    ).toEqual(["c"]);
  });

  it("reads saved filters safely", () => {
    expect(readFilters('{"hideGroups":["past","nonsense"],"hideRooms":["r1"]}')).toEqual({
      search: "",
      hideGroups: ["past"],
      hideRooms: ["r1"],
      hidePlatforms: [],
    });
    expect(readFilters("not json")).toEqual(DEFAULT_FILTERS);
  });
});

import { closedReason } from "../src/lib/booking-list";

describe("closedReason", () => {
  const original = b("orig", { guest_full_name: "Priya Shah", channel: "airbnb" });
  const name = (x: ListBooking) =>
    ({ airbnb: "Airbnb", booking_com: "Booking.com" })[x.channel] ?? x.channel;
  it("says which booking a mirrored night belongs to", () => {
    expect(
      closedReason(b("m", { mirror_of: "orig", channel: "booking_com" }), [original], name),
    ).toBe("Booked on Airbnb · Priya Shah");
  });
  it("explains a blocked night by its note or platform", () => {
    expect(closedReason(b("x", { status: "blocked", channel: "booking_com" }), [], name)).toBe(
      "Blocked on Booking.com",
    );
    expect(
      closedReason(b("y", { status: "blocked", notes: "Decorating\nback Friday" }), [], name),
    ).toBe("Blocked: Decorating");
  });
});

describe("compact stay lines", () => {
  it("shows arrival and departure together, the year only when needed", async () => {
    const { stayDates } = await import("../src/lib/booking-list");
    expect(stayDates("2026-10-14", "2026-10-18", "2026-10-17")).toBe("Wed 14 – Sun 18 Oct");
    expect(stayDates("2026-10-28", "2026-11-02", "2026-10-17")).toBe("Wed 28 Oct – Mon 2 Nov");
    expect(stayDates("2026-12-30", "2027-01-02", "2026-10-17")).toBe(
      "Wed 30 Dec 2026 – Sat 2 Jan 2027",
    );
    expect(stayDates("2027-03-05", "2027-03-07", "2026-10-17")).toBe("Fri 5 – Sun 7 Mar 2027");
  });

  it("keeps the closed-night note short", async () => {
    const { closedNote } = await import("../src/lib/booking-list");
    const base = {
      status: "blocked",
      check_in_date: "2026-10-20",
      check_out_date: "2026-10-22",
      room_id: "r1",
      channel: "booking_com",
    } as const;
    const original = {
      ...base,
      id: "o",
      status: "upcoming",
      guest_full_name: "Jane Brown",
      channel: "airbnb",
    };
    expect(
      closedNote(
        { ...base, id: "a", guest_full_name: null, notes: "Decorating\\nsecond line" },
        [],
        () => "x",
      ),
    ).toBe("Decorating\\nsecond line".split("\n")[0]);
    expect(closedNote({ ...base, id: "b", guest_full_name: null }, [], () => "x")).toBe("");
    expect(
      closedNote(
        { ...base, id: "c", guest_full_name: null, mirror_of: "o" },
        [original],
        () => "Airbnb",
      ),
    ).toBe("Jane Brown");
  });
});
