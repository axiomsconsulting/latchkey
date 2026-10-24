import { describe, expect, it } from "vitest";

import { DEFAULT_DIRECT_BOOKING, bookable, convert, countryOfLocale, currencyOfCountry, freeCancelUntil, newReference, normaliseDirectBooking, payMethods, planRates, quotePlan } from "../src/lib/direct-booking";
import { normaliseOffers } from "../src/lib/direct-rates";

const room = "11111111-1111-1111-1111-111111111111";

describe("direct booking", () => {
  it("is off until the host turns it on; pay at property only when allowed", () => {
    const s = normaliseDirectBooking(null);
    expect(s).toEqual(DEFAULT_DIRECT_BOOKING);
    expect(s.instant).toBe(false);
    expect(s.atProperty).toBe(false);
    expect(normaliseDirectBooking({ instant: true, freeCancelDays: 400, nonRef: { kind: "percent", value: 90 } })).toMatchObject({ instant: true, freeCancelDays: 60, nonRef: { kind: "percent", value: 50 } });
  });

  it("offers a cheaper non-refundable rate by percentage or amount", () => {
    const pct = normaliseDirectBooking({ nonRef: { enabled: true, kind: "percent", value: 10 } });
    expect(planRates(10_000, pct)).toEqual({ flex: 10_000, nonref: 9_000 });
    const amt = normaliseDirectBooking({ nonRef: { enabled: true, kind: "amount", value: 1_500 } });
    expect(planRates(10_000, amt)).toEqual({ flex: 10_000, nonref: 8_500 });
    expect(planRates(10_000, normaliseDirectBooking({ nonRef: { enabled: false } })).nonref).toBeNull();
    // Never "cheaper" at the same price or above.
    expect(planRates(1_000, normaliseDirectBooking({ nonRef: { enabled: true, kind: "amount", value: 0 } })).nonref).toBeNull();
  });

  it("takes seasonal offers off the plan's rate too", () => {
    const s = normaliseDirectBooking({ nonRef: { enabled: true, kind: "percent", value: 10 } });
    const offers = normaliseOffers([{ from: "2026-11-01", to: "2026-11-30", percent: 20 }]);
    expect(quotePlan(10_000, "flex", s, offers, room, "2026-11-01", "2026-11-03")!.total).toBe(16_000);
    expect(quotePlan(10_000, "nonref", s, offers, room, "2026-11-01", "2026-11-03")!.total).toBe(14_400);
  });

  it("says until when the refundable rate cancels free", () => {
    const s = normaliseDirectBooking({ freeCancelDays: 7 });
    expect(freeCancelUntil("2026-11-10", s, "2026-10-24")).toBe("2026-11-03");
    expect(freeCancelUntil("2026-10-27", s, "2026-10-24")).toBeNull();
  });

  it("only offers ways to pay that are switched on and set up", () => {
    const s = normaliseDirectBooking({ instant: true, card: true, bank: true, atProperty: true });
    expect(payMethods(s, { card: false, bank: true })).toEqual(["bank", "property"]);
    expect(bookable(normaliseDirectBooking({ instant: true, card: true }), { card: false, bank: false })).toBe(false);
    expect(bookable(s, { card: true, bank: false })).toBe(true);
  });

  it("makes clear references and knows the guest's currency", () => {
    const r = newReference();
    expect(r).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(countryOfLocale("de-DE")).toBe("DE");
    expect(countryOfLocale("en")).toBeNull();
    expect(currencyOfCountry("DE")).toBe("EUR");
    expect(currencyOfCountry("XX")).toBeNull();
    expect(convert(16_000, 1.1576)).toBe(18_522);
  });
});
