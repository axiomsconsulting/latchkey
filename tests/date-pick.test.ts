import { describe, expect, it } from "vitest";
import { inStay, monthGrid, moveStay, paintStay, stayFrom, tapDay } from "@/lib/date-pick";

const b = { min: "2026-10-24", max: "2028-10-23", maxNights: 60 };
const stay = { checkIn: "2026-10-25", checkOut: "2026-10-27" };

describe("picking a stay", () => {
  it("moves the stay on a new arrival, keeping the nights, then sets leaving", () => {
    const one = tapDay(stay, "in", "2026-11-03", b);
    expect(one.stay).toEqual({ checkIn: "2026-11-03", checkOut: "2026-11-05" });
    expect(one.focus).toBe("out");
    const two = tapDay(one.stay, one.focus, "2026-11-08", b);
    expect(two.stay).toEqual({ checkIn: "2026-11-03", checkOut: "2026-11-08" });
    expect(two.done).toBe(true);
    expect(two.focus).toBe("in");
  });
  it("starts again from a day before the arrival when choosing leaving", () => {
    const r = tapDay(stay, "out", "2026-10-24", b);
    expect(r.stay).toEqual({ checkIn: "2026-10-24", checkOut: "2026-10-26" });
    expect(r.focus).toBe("out");
  });
  it("ignores past days and caps the length", () => {
    expect(tapDay(stay, "in", "2026-10-01", b).stay).toEqual(stay);
    expect(tapDay(stay, "out", "2027-06-01", b).stay.checkOut).toBe("2026-12-24");
  });
  it("drags the whole stay", () => {
    expect(moveStay(stay, "2026-10-25", "2026-10-30", b)).toEqual({ checkIn: "2026-10-30", checkOut: "2026-11-01" });
    expect(moveStay(stay, "2026-10-26", "2026-10-20", b)).toEqual({ checkIn: "2026-10-24", checkOut: "2026-10-26" });
  });
  it("paints a new stay either way", () => {
    expect(paintStay("2026-11-05", "2026-11-02", b)).toEqual({ checkIn: "2026-11-02", checkOut: "2026-11-05" });
    expect(paintStay("2026-11-05", "2026-11-05", b)).toBeNull();
  });
  it("keeps stays inside the bounds", () => {
    expect(stayFrom("2028-10-23", 3, b)).toEqual({ checkIn: "2028-10-21", checkOut: "2028-10-24" });
    expect(inStay(stay, "2026-10-26")).toBe(true);
    expect(inStay(stay, "2026-10-27")).toBe(false);
  });
  it("lays out months Monday first", () => {
    const oct = monthGrid(2026, 9);
    expect(oct[0]!.slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(oct.flat().filter(Boolean)).toHaveLength(31);
  });
});
