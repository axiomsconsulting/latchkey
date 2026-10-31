import { describe, expect, it } from "vitest";

import { normaliseArrivals, normaliseGoodbye } from "@/lib/checkout-goodbye";
import { zonedToUtc } from "@/lib/guide";
import {
  cardPatch,
  newCards,
  onTablet,
  pickKey,
  pickerChanges,
  pickerItems,
  withTablet,
  type PickerRow,
} from "@/lib/kiosk-picker";

const today = "2026-10-31";
const tz = "Europe/London";
const at = (t: string) => zonedToUtc(today, t, tz).getTime();
const row = (o: Partial<PickerRow>): PickerRow => ({
  id: "b1",
  guest_full_name: "Priya Shah",
  status: "upcoming",
  check_in_date: today,
  check_out_date: "2026-11-02",
  check_in_time: null,
  check_out_time: null,
  rooms: { display_name: "Room 1", sort_order: 1 },
  ...o,
});
const ctx = (now: number) => ({
  today,
  now,
  tz,
  standardIn: "15:00",
  standardOut: "11:00",
  arrivals: normaliseArrivals({ on: true, startBeforeMinutes: 60 }),
  goodbye: normaliseGoodbye({ on: true, startBeforeMinutes: 60 }),
});

describe("the bell's list of today's cards", () => {
  it("lists arrivals and departures with shortened names and when they come on", () => {
    const items = pickerItems(
      [
        row({}),
        row({
          id: "b2",
          guest_full_name: "Tom Jones",
          status: "checked_in",
          check_in_date: "2026-10-29",
          check_out_date: today,
          rooms: { display_name: "Room 2", sort_order: 2 },
        }),
      ],
      ctx(at("09:00")),
    );
    expect(items).toEqual([
      {
        bookingId: "b1",
        kind: "in",
        name: "Priya S.",
        room: "Room 1",
        showing: false,
        autoAt: "15:00",
      },
      {
        bookingId: "b2",
        kind: "out",
        name: "Tom J.",
        room: "Room 2",
        showing: false,
        autoAt: "10:00",
      },
    ]);
  });

  it("shows what's on screen, and no time once it's on or taken off", () => {
    const [on] = pickerItems([row({})], ctx(at("15:30")));
    expect(on).toMatchObject({ showing: true, autoAt: null });
    const [off] = pickerItems([row({ welcome_card_dismissed_at: "x" })], ctx(at("09:00")));
    expect(off).toMatchObject({ showing: false, autoAt: null });
    const [now] = pickerItems([row({ welcome_now_at: "x" })], ctx(at("09:00")));
    expect(now).toMatchObject({ showing: true });
  });

  it("leaves out checked-in arrivals, mirrors and nameless stays", () => {
    expect(
      pickerItems(
        [
          row({ status: "checked_in" }),
          row({ id: "m", mirror_of: "b1" }),
          row({ id: "n", guest_full_name: null }),
        ],
        ctx(at("09:00")),
      ),
    ).toEqual([]);
  });

  it("turns ticks into changes", () => {
    const items = [
      { bookingId: "a", kind: "in" as const, name: "", room: null, showing: false, autoAt: null },
      { bookingId: "b", kind: "out" as const, name: "", room: null, showing: true, autoAt: null },
      { bookingId: "c", kind: "in" as const, name: "", room: null, showing: true, autoAt: null },
    ];
    const chosen = new Set([pickKey(items[0]!), pickKey(items[2]!)]);
    expect(pickerChanges(items, chosen)).toEqual([
      { bookingId: "a", kind: "in", show: true },
      { bookingId: "b", kind: "out", show: false },
    ]);
    expect(cardPatch("out", true, "t")).toEqual({
      goodbye_now_at: "t",
      goodbye_dismissed_at: null,
    });
  });
});

describe("cards on chosen tablets", () => {
  it("goes to every tablet unless the host picked some", () => {
    expect(onTablet(null, "t1")).toBe(true);
    expect(onTablet([], null)).toBe(true);
    expect(onTablet(["t1"], "t1")).toBe(true);
    expect(onTablet(["t1"], "t2")).toBe(false);
    expect(onTablet(["t1"], null)).toBe(false);
  });

  it("writes the tablets only when showing, and only when given", () => {
    expect(cardPatch("in", true, "now", ["t1"])).toMatchObject({ welcome_card_devices: ["t1"] });
    expect(cardPatch("out", true, "now", null)).toMatchObject({ goodbye_card_devices: null });
    expect(cardPatch("in", true, "now")).not.toHaveProperty("welcome_card_devices");
    expect(cardPatch("in", false, "now", ["t1"])).not.toHaveProperty("welcome_card_devices");
  });

  it("adds a tablet whose own bell puts the card up", () => {
    expect(withTablet(null, "t2")).toBeNull();
    expect(withTablet(["t1"], "t2")).toEqual(["t1", "t2"]);
    expect(withTablet(["t1", "t2"], "t2")).toEqual(["t1", "t2"]);
  });

  it("notices cards that just appeared", () => {
    expect(newCards(["in:a"], ["in:a", "out:b"])).toEqual(["out:b"]);
    expect(newCards(["in:a", "out:b"], ["in:a"])).toEqual([]);
  });
});
