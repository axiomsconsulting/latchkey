import { describe, expect, it } from "vitest";

import {
  DEMO_BOOKINGS,
  DEMO_JOBS,
  DEMO_MESSAGES,
  DEMO_PROPERTY,
  DEMO_ROOMS,
  buildRecordingBookings,
} from "../src/lib/demo-data";

describe("demo content", () => {
  it("keeps The Hill Suites as it is", () => {
    expect(DEMO_PROPERTY.name).toBe("The Hill Suites");
    expect(DEMO_ROOMS.map((r) => r.display_name)).toEqual(["Room 1", "Room 2", "Room 3"]);
  });

  it("never double-books a room", () => {
    for (const room of DEMO_ROOMS) {
      const stays = DEMO_BOOKINGS.filter(
        (b) => b.roomKey === room.key && b.status !== "cancelled",
      ).sort((a, b) => a.check_in_offset - b.check_in_offset);
      for (let i = 1; i < stays.length; i++)
        expect(stays[i]!.check_in_offset).toBeGreaterThanOrEqual(stays[i - 1]!.check_out_offset);
    }
  });

  it("has work in every room over the coming days, from more than one site", () => {
    for (const room of DEMO_ROOMS) {
      expect(
        DEMO_BOOKINGS.some(
          (b) => b.roomKey === room.key && b.check_in_offset >= -3 && b.check_in_offset <= 10,
        ),
      ).toBe(true);
    }
    expect(new Set(DEMO_BOOKINGS.map((b) => b.channel)).size).toBeGreaterThanOrEqual(3);
    // An arrival today, so the guest tour always has someone to check in.
    expect(DEMO_BOOKINGS.some((b) => b.check_in_offset === 0)).toBe(true);
  });

  it("only links requests and messages to guests who exist", () => {
    const guests = new Set(DEMO_BOOKINGS.map((b) => b.guest_full_name));
    for (const j of DEMO_JOBS) if (j.guest) expect(guests.has(j.guest)).toBe(true);
    for (const m of DEMO_MESSAGES) expect(guests.has(m.guest)).toBe(true);
  });
});

describe("recording account bookings", () => {
  const all = buildRecordingBookings();

  it("stays relative to today, from a week ago to three weeks ahead, without double-booking a room", () => {
    for (const b of all) {
      expect(b.check_out_offset).toBeGreaterThan(-7);
      expect(b.check_in_offset).toBeLessThan(21);
      expect(b.check_out_offset).toBeGreaterThan(b.check_in_offset);
    }
    for (const room of DEMO_ROOMS) {
      const stays = all
        .filter((b) => b.roomKey === room.key)
        .sort((a, b) => a.check_in_offset - b.check_in_offset);
      for (let i = 1; i < stays.length; i++)
        expect(stays[i]!.check_in_offset).toBeGreaterThanOrEqual(stays[i - 1]!.check_out_offset);
      for (const s of stays) expect(s.guest_count).toBeLessThanOrEqual(room.max_guests);
    }
  });

  it("is about 70% full, with turnovers in the right order, late arrivals and one ID check", () => {
    const nights = all.reduce(
      (a, b) => a + (Math.min(21, b.check_out_offset) - Math.max(-7, b.check_in_offset)),
      0,
    );
    const share = nights / (DEMO_ROOMS.length * 28);
    expect(share).toBeGreaterThan(0.6);
    expect(share).toBeLessThan(0.85);
    // A same-day turnover: out at 11:00 before the next guest's 15:00 (or later) arrival.
    const turnovers = all.filter((b) =>
      all.some((o) => o.roomKey === b.roomKey && o.check_out_offset === b.check_in_offset),
    );
    expect(turnovers.length).toBeGreaterThan(2);
    for (const t of turnovers) expect(t.check_in_time >= "15:00").toBe(true);
    expect(all.some((b) => b.check_in_time === "22:30")).toBe(true);
    expect(all.filter((b) => b.status === "flagged")).toHaveLength(1);
    expect(new Set(all.map((b) => b.channel))).toEqual(
      new Set(["airbnb", "booking_com", "direct"]),
    );
  });

  it("marks stays by today: left, staying, arriving and coming", () => {
    expect(all.some((b) => b.status === "checked_out")).toBe(true);
    expect(
      all.some((b) => b.status === "checked_in" && b.check_in_offset < 0 && b.check_out_offset > 0),
    ).toBe(true);
    for (const b of all)
      if (b.status === "checked_out") expect(b.check_out_offset).toBeLessThanOrEqual(0);
  });
});
