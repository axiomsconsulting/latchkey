import { describe, expect, it } from "vitest";

import { WORLD_CLOCKS, burnDrift, clockHands, kioskNow } from "../src/lib/kiosk-clock";

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

  it("lists five cities and shows the date and time in the property's zone", () => {
    expect(WORLD_CLOCKS.map((c) => c.city)).toEqual(["New York", "London", "New Delhi", "Singapore", "Tokyo"]);
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
