import { describe, expect, it } from "vitest";
import {
  bufferClash,
  earlyChoices,
  lateChoices,
  normaliseBuffer,
  normaliseSlot,
} from "@/lib/stay-times";

describe("early check-in and late check-out", () => {
  it("offers whole blocks up to the latest check-out", () => {
    const c = lateChoices({
      checkOut: "11:00",
      slot: { stepHours: 2, limit: "16:00" },
      pricePence: 1800,
      maxSteps: 5,
      nextArrival: null,
      bufferMinutes: 60,
    });
    expect(c).toEqual([
      { steps: 1, hours: 2, time: "13:00", pricePence: 1800 },
      { steps: 2, hours: 4, time: "15:00", pricePence: 3600 },
    ]);
  });
  it("stops the buffer before the next guest arrives (their own early check-in included)", () => {
    const c = lateChoices({
      checkOut: "11:00",
      slot: { stepHours: 1, limit: "18:00" },
      pricePence: 1000,
      maxSteps: 9,
      nextArrival: "14:00",
      bufferMinutes: 60,
    });
    expect(c.map((x) => x.time)).toEqual(["12:00", "13:00"]);
    expect(
      lateChoices({
        checkOut: "11:00",
        slot: { stepHours: 1, limit: "18:00" },
        pricePence: 1000,
        maxSteps: 9,
        nextArrival: "12:30",
        bufferMinutes: 60,
      }),
    ).toEqual([]);
  });
  it("offers early check-in back to the earliest time, after the last guest leaves plus the buffer", () => {
    expect(
      earlyChoices({
        checkIn: "15:00",
        slot: { stepHours: 1, limit: "10:00" },
        pricePence: 1000,
        maxSteps: 9,
        prevDeparture: null,
        bufferMinutes: 60,
      }).map((x) => x.time),
    ).toEqual(["14:00", "13:00", "12:00", "11:00", "10:00"]);
    expect(
      earlyChoices({
        checkIn: "15:00",
        slot: { stepHours: 1, limit: "10:00" },
        pricePence: 1000,
        maxSteps: 9,
        prevDeparture: "12:00",
        bufferMinutes: 90,
      }).map((x) => x.time),
    ).toEqual(["14:00"]);
    expect(
      earlyChoices({
        checkIn: "15:00",
        slot: { stepHours: 2, limit: "10:00" },
        pricePence: 1500,
        maxSteps: 2,
        prevDeparture: null,
        bufferMinutes: 0,
      }),
    ).toEqual([
      { steps: 1, hours: 2, time: "13:00", pricePence: 1500 },
      { steps: 2, hours: 4, time: "11:00", pricePence: 3000 },
    ]);
  });
  it("warns when a time set by hand eats into the buffer", () => {
    expect(bufferClash({ checkOut: "14:00", nextArrival: "14:30", bufferMinutes: 60 })).toMatch(
      /30 minutes/,
    );
    expect(bufferClash({ checkIn: "12:00", prevDeparture: "11:00", bufferMinutes: 60 })).toBeNull();
  });
  it("normalises settings", () => {
    expect(normaliseSlot({ stepHours: 2, limit: "17:30" }, "late")).toEqual({
      stepHours: 2,
      limit: "17:30",
    });
    expect(normaliseSlot({ stepHours: 7, limit: "nope" }, "early")).toEqual({
      stepHours: 1,
      limit: "10:00",
    });
    expect(normaliseBuffer(45)).toBe(45);
    expect(normaliseBuffer(50)).toBe(60);
  });
});
