import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXTRAS, availableWindows, basketAutoApproves, cleaningGapMinutes, earlyCheckinOptions,
  lateCheckoutOptions, priceBasket, taxBreakdown,
} from "../src/lib/extras";

describe("priceBasket", () => {
  it("prices towels and luggage by size", () => {
    const p = priceBasket(DEFAULT_EXTRAS, [{ key: "bath_towel", qty: 2 }, { key: "luggage", qty: 1, size: "large" }]);
    expect(p.map((l) => l.totalPence)).toEqual([600, 700]);
  });
  it("rejects over max and inactive items", () => {
    expect(() => priceBasket(DEFAULT_EXTRAS, [{ key: "bath_towel", qty: 5 }])).toThrow();
    expect(() => priceBasket(DEFAULT_EXTRAS, [{ key: "breakfast", qty: 1 }])).toThrow();
  });
  it("free items cost nothing", () => {
    expect(priceBasket(DEFAULT_EXTRAS, [{ key: "kettle", qty: 1 }])[0]!.totalPence).toBe(0);
  });
});

describe("auto-approve", () => {
  it("needs every line to auto-approve", () => {
    expect(basketAutoApproves(DEFAULT_EXTRAS, [{ key: "bath_towel", qty: 1 }])).toBe(true);
    expect(basketAutoApproves(DEFAULT_EXTRAS, [{ key: "bath_towel", qty: 1 }, { key: "linen_change", qty: 1 }])).toBe(false);
  });
});

describe("taxBreakdown", () => {
  it("no tax when not registered", () => {
    expect(taxBreakdown(1000, { registered: false, label: "VAT", rateBp: 2000, pricesInclude: true }).taxPence).toBe(0);
  });
  it("inclusive 20%", () => {
    expect(taxBreakdown(1200, { registered: true, label: "VAT", rateBp: 2000, pricesInclude: true })).toEqual({ netPence: 1000, taxPence: 200, totalPence: 1200 });
  });
  it("exclusive 20%", () => {
    expect(taxBreakdown(1000, { registered: true, label: "VAT", rateBp: 2000, pricesInclude: false }).totalPence).toBe(1200);
  });
});

describe("late check-out", () => {
  it("offers up to 2 hours when free", () => {
    expect(lateCheckoutOptions({ checkOutTime: "11:00", maxHours: 2, sameDayArrival: false, blocked: [] })).toEqual([
      { hours: 1, until: "12:00" }, { hours: 2, until: "13:00" },
    ]);
  });
  it("none with same-day arrival", () => {
    expect(lateCheckoutOptions({ checkOutTime: "11:00", maxHours: 2, sameDayArrival: true, blocked: [] })).toEqual([]);
  });
  it("stops at an unavailability window", () => {
    expect(lateCheckoutOptions({ checkOutTime: "11:00", maxHours: 2, sameDayArrival: false, blocked: [{ start: "12:00", end: "14:00" }] })).toHaveLength(1);
  });
});

describe("early check-in", () => {
  it("offers hours before check-in, not before 08:00", () => {
    expect(earlyCheckinOptions({ checkInTime: "10:00", maxHours: 3, sameDayDeparture: false, blocked: [] }).map((o) => o.from)).toEqual(["09:00", "08:00"]);
  });
});

describe("windows", () => {
  it("drops evening when quiet hours start at 20:00", () => {
    expect(availableWindows("20:00", "07:00", [])).toEqual(["asap", "morning", "door"]);
  });
  it("keeps all with 22:00-07:00", () => {
    expect(availableWindows("22:00", "07:00", [])).toEqual(["asap", "evening", "morning", "door"]);
  });
  it("cleaning gap", () => {
    expect(cleaningGapMinutes("13:00", "15:00")).toBe(120);
  });
});
