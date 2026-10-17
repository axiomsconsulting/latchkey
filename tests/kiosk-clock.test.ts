import { describe, expect, it } from "vitest";

import { burnDrift, clockHands, kioskNow } from "../src/lib/kiosk-clock";

describe("kiosk clocks", () => {
  const at = new Date("2026-10-17T13:30:00Z"); // 14:30 in London (BST)

  it("points the hands right in each city", () => {
    const london = clockHands(at, "Europe/London", "Europe/London");
    expect(london).toEqual({ hourDeg: 2.5 * 30, minuteDeg: 180, time: "14:30", dayShift: 0 });
    expect(clockHands(at, "Asia/Kolkata", "Europe/London").time).toBe("19:00");
    expect(clockHands(at, "America/New_York", "Europe/London").time).toBe("09:30");
  });

  it("says when it's already tomorrow somewhere", () => {
    const late = new Date("2026-10-17T22:30:00Z"); // 23:30 London, 07:30 next day Tokyo
    expect(clockHands(late, "Asia/Tokyo", "Europe/London").dayShift).toBe(1);
    expect(clockHands(new Date("2026-10-17T01:00:00Z"), "America/New_York", "Europe/London").dayShift).toBe(-1);
  });

  it("shows the date and time in the property's zone", () => {
    expect(kioskNow(at, "Europe/London")).toEqual({ date: "Saturday 17 October", time: "14:30" });
  });

  it("drifts slowly within a small box, never jumping", () => {
    let prev = burnDrift(0);
    for (let m = 1; m < 24 * 60; m++) {
      const d = burnDrift(m * 60_000);
      expect(Math.abs(d.x)).toBeLessThanOrEqual(48);
      expect(Math.abs(d.y)).toBeLessThanOrEqual(28);
      expect(Math.abs(d.x - prev.x) + Math.abs(d.y - prev.y)).toBeLessThanOrEqual(24);
      prev = d;
    }
    // It really moves over an hour.
    const xs = Array.from({ length: 60 }, (_, m) => burnDrift(m * 60_000).x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(30);
  });
});

describe("reception clocks around the property's own time", () => {
  const oct = new Date("2026-10-17T12:00:00Z");
  const jan = new Date("2027-01-15T12:00:00Z");

  it("puts London in the middle, two behind and two ahead", async () => {
    const { worldClocksFor } = await import("../src/lib/kiosk-clock");
    const c = worldClocksFor("Europe/London", "London", oct);
    expect(c.map((x) => x.city)).toEqual(["Los Angeles", "New York", "London", "New Delhi", "Tokyo"]);
    expect(c[2]!.home).toBe(true);
  });

  it("works for properties anywhere, west to east, never two with the same time", async () => {
    const { worldClocksFor, utcOffset } = await import("../src/lib/kiosk-clock");
    for (const [tz, city] of [["America/New_York", "New York"], ["Asia/Kolkata", "New Delhi"], ["Australia/Sydney", "Sydney"], ["Europe/Dublin", "Dublin"]] as const) {
      for (const at of [oct, jan]) {
        const c = worldClocksFor(tz, city, at);
        expect(c.length).toBe(5);
        expect(c[2]).toMatchObject({ city, home: true });
        const home = utcOffset(at, tz);
        const rel = c.map((x) => {
          let r = utcOffset(at, x.tz) - home;
          if (r > 14 * 60) r -= 24 * 60;
          if (r < -12 * 60) r += 24 * 60;
          return r;
        });
        expect(rel[0]!).toBeLessThan(rel[1]!);
        expect(rel[1]!).toBeLessThan(0);
        expect(rel[3]!).toBeGreaterThan(0);
        expect(rel[4]!).toBeGreaterThan(rel[3]!);
        expect(new Set(c.map((x) => x.city)).size).toBe(5);
      }
    }
  });

  it("knows each zone's offset, summer time included", async () => {
    const { utcOffset } = await import("../src/lib/kiosk-clock");
    expect(utcOffset(oct, "Europe/London")).toBe(60);
    expect(utcOffset(jan, "Europe/London")).toBe(0);
    expect(utcOffset(oct, "Asia/Kolkata")).toBe(330);
  });
});
