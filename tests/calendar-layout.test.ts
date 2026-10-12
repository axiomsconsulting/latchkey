import { describe, expect, it } from "vitest";

import { lanes, roomHue, spanFor, stayColours } from "../src/lib/calendar-layout";

const days = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"];

describe("spanFor", () => {
  it("covers each night from check-in to the day before check-out", () => {
    expect(spanFor(days, "2026-10-13", "2026-10-15")).toEqual({ start: 1, length: 2, before: false, after: false });
  });
  it("clips stays that start before or run past the days shown", () => {
    expect(spanFor(days, "2026-10-10", "2026-10-13")).toEqual({ start: 0, length: 1, before: true, after: false });
    expect(spanFor(days, "2026-10-15", "2026-10-20")).toEqual({ start: 3, length: 1, before: false, after: true });
  });
  it("ignores stays outside the range", () => {
    expect(spanFor(days, "2026-10-01", "2026-10-12")).toBeNull();
    expect(spanFor(days, "2026-10-16", "2026-10-18")).toBeNull();
  });
});

describe("lanes", () => {
  it("keeps back-to-back stays on one line and splits overlaps", () => {
    const r = lanes([
      { id: "a", span: { start: 0, length: 2, before: false, after: false } },
      { id: "b", span: { start: 2, length: 1, before: false, after: false } },
      { id: "c", span: { start: 1, length: 2, before: false, after: false } },
    ]);
    expect(r).toEqual({ lane: { a: 0, c: 1, b: 0 }, count: 2 });
  });
});

describe("colours", () => {
  it("gives neighbouring rooms different hues and guests different shades", () => {
    expect(new Set([0, 1, 2, 3, 4, 5].map(roomHue)).size).toBe(6);
    expect(stayColours(250, 0).background).not.toBe(stayColours(250, 1).background);
    expect(stayColours(250, 0).borderColor).toBe(stayColours(250, 2).borderColor);
  });
});
