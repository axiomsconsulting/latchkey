import { describe, expect, it } from "vitest";

import {
  DEFAULT_GOODBYE,
  goodbyeText,
  goodbyeWindow,
  normaliseGoodbye,
  pageNow,
  showsGoodbye,
} from "@/lib/checkout-goodbye";

const tz = "Europe/London";
const at = (t: string) => Date.parse(`2026-10-30T${t}:00Z`); // GMT on 30 Oct 2026
const stay = { status: "checked_in", check_out_date: "2026-10-30", check_out_time: null };

describe("check-out goodbye", () => {
  it("shows from two hours before check-out until it", () => {
    const show = (t: string) =>
      showsGoodbye(stay, "2026-10-30", at(t), "11:00", tz, DEFAULT_GOODBYE);
    expect(show("08:59")).toBe(false);
    expect(show("09:00")).toBe(true);
    expect(show("10:59")).toBe(true);
    expect(show("11:00")).toBe(false);
  });

  it("with a late check-out, starts just before the standard time and lasts until theirs", () => {
    const late = { ...stay, check_out_time: "14:00" };
    const w = goodbyeWindow(late, "11:00", tz, DEFAULT_GOODBYE);
    expect(w.late).toBe(true);
    expect(w.from).toBe(at("10:30"));
    expect(w.until).toBe(at("14:00"));
    expect(showsGoodbye(late, "2026-10-30", at("13:30"), "11:00", tz, DEFAULT_GOODBYE)).toBe(true);
  });

  it("goes when dismissed, checked out, on another day, or switched off", () => {
    const now = at("10:00");
    expect(
      showsGoodbye(
        { ...stay, goodbye_dismissed_at: "x" },
        "2026-10-30",
        now,
        "11:00",
        tz,
        DEFAULT_GOODBYE,
      ),
    ).toBe(false);
    expect(
      showsGoodbye(
        { ...stay, status: "checked_out" },
        "2026-10-30",
        now,
        "11:00",
        tz,
        DEFAULT_GOODBYE,
      ),
    ).toBe(false);
    expect(showsGoodbye(stay, "2026-10-29", now, "11:00", tz, DEFAULT_GOODBYE)).toBe(false);
    expect(
      showsGoodbye(stay, "2026-10-30", now, "11:00", tz, { ...DEFAULT_GOODBYE, on: false }),
    ).toBe(false);
  });

  it("pages more than ten goodbyes every five seconds", () => {
    const items = Array.from({ length: 23 }, (_, i) => i);
    expect(pageNow(items, 0)).toMatchObject({ page: 0, pages: 3, items: items.slice(0, 10) });
    expect(pageNow(items, 5000).items[0]).toBe(10);
    expect(pageNow(items, 15000).page).toBe(0);
    expect(pageNow([1, 2], 99999).pages).toBe(1);
  });

  it("reads settings safely and fills in the name", () => {
    const g = normaliseGoodbye({
      startBeforeMinutes: 7,
      lateLeadMinutes: 15,
      message: "Bye {name} !",
    });
    expect(g.startBeforeMinutes).toBe(120);
    expect(g.lateLeadMinutes).toBe(15);
    expect(goodbyeText(g, "Priya")).toBe("Bye Priya!");
  });
});
