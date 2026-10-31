import { describe, expect, it } from "vitest";

import {
  cardEdge,
  cardInk,
  DEFAULT_ARRIVALS,
  DEFAULT_GOODBYE,
  arrivalStart,
  arrivalText,
  normaliseArrivals,
  showsArrival,
  showsGoodbyeNow,
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

describe("check-in cards", () => {
  const arriving = { status: "upcoming", check_in_date: "2026-10-30", check_in_time: null };
  it("show from the check-in time, never earlier, until they check in", () => {
    const show = (t: string, b: object = arriving) =>
      showsArrival(b as never, "2026-10-30", at(t), "15:00", tz, DEFAULT_ARRIVALS);
    expect(show("14:59")).toBe(false);
    expect(show("15:00")).toBe(true);
    expect(show("23:00")).toBe(true);
    expect(show("16:00", { ...arriving, status: "checked_in" })).toBe(false);
    expect(show("16:00", { ...arriving, welcome_card_dismissed_at: "x" })).toBe(false);
  });

  it("follow the stay's own check-in time: early or late, as the host set it", () => {
    expect(
      arrivalStart({ ...arriving, check_in_time: "11:30:00" }, "16:00", tz, DEFAULT_ARRIVALS),
    ).toEqual({ from: at("11:30"), early: true, time: "11:30" });
    expect(
      arrivalStart({ ...arriving, check_in_time: "23:30" }, "16:00", tz, DEFAULT_ARRIVALS),
    ).toEqual({
      from: at("23:30"),
      early: false,
      time: "23:30",
    });
  });

  it("show at once when the host asks, even when switched off", () => {
    const b = { ...arriving, welcome_now_at: "x" };
    expect(
      showsArrival(b, "2026-10-30", at("08:00"), "15:00", tz, { ...DEFAULT_ARRIVALS, on: false }),
    ).toBe(true);
    expect(
      showsGoodbyeNow({ ...stay, goodbye_now_at: "x" }, "2026-10-30", at("06:00"), "11:00", tz, {
        ...DEFAULT_GOODBYE,
        on: false,
      }),
    ).toBe(true);
  });

  it("a set time of day only ever starts it later than check-in", () => {
    expect(
      arrivalStart(arriving, "15:00", tz, { ...DEFAULT_ARRIVALS, startAt: "12:00" }).from,
    ).toBe(at("15:00"));
    expect(
      arrivalStart(arriving, "15:00", tz, { ...DEFAULT_ARRIVALS, startAt: "17:00" }).from,
    ).toBe(at("17:00"));
    expect(normaliseArrivals({ startAt: "25:00" }).startAt).toBeNull();
  });

  it("fill in the name", () => {
    expect(arrivalText(normaliseArrivals({ message: "Hi {name} !" }), "Tom")).toBe("Hi Tom!");
  });
});

describe("card colours", () => {
  it("keep a chosen colour, with readable ink and a stronger outline", () => {
    expect(normaliseGoodbye({ colour: "#183b2b" }).colour).toBe("#183B2B");
    expect(normaliseArrivals({ colour: "red" }).colour).toBe(DEFAULT_ARRIVALS.colour);
    expect(cardInk("#F6E2A8")).toBe("#1B1B1B");
    expect(cardInk("#183B2B")).toBe("#FFFFFF");
    expect(cardEdge("#FFFFFF")).toBe("#8C8C8C");
    expect(cardEdge("#000000")).toBe("#595959");
  });
});
