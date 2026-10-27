import { describe, expect, it } from "vitest";

import {
  SPAN,
  at,
  centreDay,
  dayNumber,
  daysIn,
  isoOfDay,
  laneOf,
  loadRange,
  nowOn,
  panBy,
  place,
  rangeLabel,
  stayTimes,
  step,
  ticks,
  viewFor,
  zoomAt,
  zoomOf,
} from "../src/lib/timeline";

const day = "2026-10-20"; // a Tuesday

describe("room timeline", () => {
  it("counts days and times on the property's clock", () => {
    expect(isoOfDay(dayNumber(day))).toBe(day);
    expect(at(day, "15:00") - at(day, "11:00")).toBe(240);
    expect(at("2026-10-21", "00:00") - at(day, "00:00")).toBe(1440);
  });

  it("opens a day as the working day, longer views from the day before", () => {
    expect(viewFor("day", day)).toEqual({ from: at(day, "06:00"), span: 18 * 60 });
    expect(daysIn(viewFor("day", day))).toEqual([day]);
    expect(daysIn(viewFor("week", day))).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(zoomOf(viewFor("3days", day).span)).toBe("3days");
    expect(centreDay(viewFor("day", day))).toBe(day);
  });

  it("zooms around the finger and stays within limits", () => {
    const v = viewFor("week", day);
    const z = zoomAt(v, 0.5, 0.25);
    // The moment a quarter of the way across stays a quarter of the way across.
    expect(z.from + z.span * 0.25).toBeCloseTo(v.from + v.span * 0.25, 0);
    expect(z.span).toBe(v.span / 2);
    expect(zoomAt(v, 0.0001).span).toBe(SPAN.min);
    expect(zoomAt(v, 1000).span).toBe(SPAN.max);
  });

  it("swipes and steps through time", () => {
    const v = viewFor("day", day);
    expect(panBy(v, 0.5).from).toBe(v.from + v.span / 2);
    expect(daysIn(step(v, 1))).toEqual(["2026-10-21"]);
    expect(daysIn(step(viewFor("week", day), 1))[0]).toBe("2026-10-25");
  });

  it("places a stay across the view, cut where it runs off either side", () => {
    const v = viewFor("day", day);
    expect(place(v, at(day, "15:00"), at("2026-10-22", "11:00"))).toEqual({
      left: 0.5,
      width: 0.5,
      cutStart: false,
      cutEnd: true,
    });
    expect(place(v, at("2026-10-18", "15:00"), at(day, "10:30"))).toEqual({
      left: 0,
      width: 4.5 / 18,
      cutStart: true,
      cutEnd: false,
    });
    expect(place(v, at("2026-10-25", "15:00"), at("2026-10-26", "11:00"))).toBeNull();
  });

  it("marks hours when zoomed in and days when zoomed out, never crowded", () => {
    const hours = ticks(viewFor("day", day), 900);
    expect(hours[0]!.label).toBe("06:00");
    expect(hours.every((t, i) => i === 0 || t.at - hours[i - 1]!.at >= 60)).toBe(true);
    const daysTicks = ticks(viewFor("month", day), 360);
    expect(daysTicks.every((t) => /^[A-Z][a-z]{2} \d+$/.test(t.label))).toBe(true);
    // A phone's width over a week: no two labels closer than 56px.
    const week = ticks(viewFor("week", day), 300);
    expect(week.length).toBeLessThanOrEqual(6);
  });

  it("labels the range shown", () => {
    expect(rangeLabel(viewFor("day", day))).toBe("Tue 20 Oct");
    expect(rangeLabel(viewFor("week", day))).toBe("19–25 Oct");
    expect(rangeLabel(viewFor("month", "2026-10-28")).includes("Oct –")).toBe(true);
  });

  it("puts a stay at its own times or the property's", () => {
    const s = stayTimes(
      {
        check_in_date: day,
        check_out_date: "2026-10-22",
        check_in_time: "17:30:00",
        check_out_time: null,
      },
      { checkIn: "15:00", checkOut: "11:00" },
    );
    expect(s).toEqual({ start: at(day, "17:30"), end: at("2026-10-22", "11:00") });
  });

  it("puts overlapping stays on separate lines", () => {
    const { lane, count } = laneOf([
      { id: "a", start: 0, end: 100 },
      { id: "b", start: 50, end: 150 },
      { id: "c", start: 100, end: 200 },
    ]);
    expect(count).toBe(2);
    expect(lane).toEqual({ a: 0, b: 1, c: 0 });
  });

  it("loads padded, aligned ranges so small swipes don't reload", () => {
    const a = loadRange(viewFor("day", day));
    const b = loadRange(panBy(viewFor("day", day), 0.3));
    expect(a).toEqual(b);
    expect(a.from <= day && a.to > day).toBe(true);
  });

  it("knows now on the property's clock", () => {
    expect(nowOn("Europe/London", new Date("2026-10-20T14:30:00Z"))).toBe(at(day, "15:30"));
  });
});
