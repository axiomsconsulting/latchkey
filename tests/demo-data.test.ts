import { describe, expect, it } from "vitest";

import { DEMO_BOOKINGS, DEMO_JOBS, DEMO_MESSAGES, DEMO_PROPERTY, DEMO_ROOMS } from "../src/lib/demo-data";

describe("demo content", () => {
  it("keeps The Hill Suites as it is", () => {
    expect(DEMO_PROPERTY.name).toBe("The Hill Suites");
    expect(DEMO_ROOMS.map((r) => r.display_name)).toEqual(["Room 1", "Room 2", "Room 3"]);
  });

  it("never double-books a room", () => {
    for (const room of DEMO_ROOMS) {
      const stays = DEMO_BOOKINGS.filter((b) => b.roomKey === room.key && b.status !== "cancelled").sort((a, b) => a.check_in_offset - b.check_in_offset);
      for (let i = 1; i < stays.length; i++) expect(stays[i]!.check_in_offset).toBeGreaterThanOrEqual(stays[i - 1]!.check_out_offset);
    }
  });

  it("has work in every room over the coming days, from more than one site", () => {
    for (const room of DEMO_ROOMS) {
      expect(DEMO_BOOKINGS.some((b) => b.roomKey === room.key && b.check_in_offset >= -3 && b.check_in_offset <= 10)).toBe(true);
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
