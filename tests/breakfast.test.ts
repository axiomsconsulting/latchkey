import { describe, expect, it } from "vitest";

import { stripeAmount, breakfastMenu, breakfastMornings, breakfastProblem, breakfastTimes, normaliseBreakfast, priceBasket, type ExtraItem } from "../src/lib/extras";

const item = (key: string, style: "packed" | "delivered" | "dining" | null, section = "", pricePence = 900, active = true): ExtraItem => ({
  key, name: key, pricePence, unit: "item", maxQty: 4, isFree: false, autoApprove: false, active, isLoan: false,
  ...(style ? { breakfast: section ? { style, section } : { style } } : {}),
});

describe("breakfast menu", () => {
  const items = [
    item("towel", null),
    item("full_english", "dining", "Hot", 1850),
    item("porridge", "dining", "Hot", 950),
    item("tea", "dining", "Drinks", 450),
    item("pastry_bag", "packed"),
    item("tray", "delivered", "", 2400, false),
  ];

  it("shows only styles with something on them, sections in the host's order", () => {
    const menu = breakfastMenu(items);
    expect(menu.map((m) => m.style)).toEqual(["packed", "dining"]);
    expect(menu[1]!.sections.map((s) => [s.name, s.items.map((i) => i.key)])).toEqual([["Hot", ["full_english", "porridge"]], ["Drinks", ["tea"]]]);
  });

  it("prices à la carte with the usual basket, and keeps orders to one style's menu", () => {
    expect(priceBasket(items, [{ key: "full_english", qty: 2 }, { key: "tea", qty: 2 }]).reduce((a, l) => a + l.totalPence, 0)).toBe(4600);
    expect(breakfastProblem(items, [{ key: "full_english", qty: 1 }], "dining")).toBeNull();
    expect(breakfastProblem(items, [{ key: "full_english", qty: 1 }], "packed")).toMatch(/menu/);
    expect(breakfastProblem(items, [{ key: "towel", qty: 1 }], "dining")).toMatch(/menu/);
    expect(breakfastProblem(items, [], "dining")).toMatch(/Choose/);
  });

  it("offers mornings from tomorrow (or this morning, early enough) to check-out", () => {
    expect(breakfastMornings({ today: "2026-10-21", nowTime: "14:00", checkIn: "2026-10-20", checkOut: "2026-10-23" })).toEqual(["2026-10-22", "2026-10-23"]);
    expect(breakfastMornings({ today: "2026-10-21", nowTime: "06:30", checkIn: "2026-10-20", checkOut: "2026-10-22" })).toEqual(["2026-10-21", "2026-10-22"]);
    expect(breakfastMornings({ today: "2026-10-21", nowTime: "09:00", checkIn: "2026-10-25", checkOut: "2026-10-27" })).toEqual(["2026-10-26", "2026-10-27"]);
    expect(breakfastTimes("07:00", "08:30")).toEqual(["07:00", "07:30", "08:00", "08:30"]);
  });

  it("reads the stored breakfast details safely", () => {
    expect(normaliseBreakfast({ style: "delivered", section: "  Hot   dishes " })).toEqual({ style: "delivered", section: "Hot dishes" });
    expect(normaliseBreakfast({ style: "buffet" })).toBeUndefined();
    expect(normaliseBreakfast(null)).toBeUndefined();
  });
});

describe("regional pricing", () => {
  it("charges zero-decimal currencies in whole units", () => {
    expect(stripeAmount(120000, "JPY")).toBe(1200);
    expect(stripeAmount(1850, "gbp")).toBe(1850);
    expect(stripeAmount(1450, "EUR")).toBe(1450);
  });
});

