import { describe, expect, it } from "vitest";

import { normaliseDirectBooking, quotePlan } from "@/lib/direct-booking";
import { quoteStay, type SeasonalOffer } from "@/lib/direct-rates";
import {
  DEFAULT_SMART_PRICING,
  aimFor,
  dropOutliers,
  floorsForPage,
  matchRoomType,
  nightFloor,
  nightlyFrom,
  normaliseSmartPricing,
  paymentFee,
  priceForNet,
  priceSiteForUrl,
  priceUrl,
  pricingPicture,
  readDue,
  sampleStays,
  siteChange,
  siteNet,
  stackedDiscount,
  suggestDirect,
  suggestSite,
  type Reading,
  type SmartPricing,
} from "@/lib/smart-pricing";
import { quoteWithVoucher } from "@/lib/vouchers";

const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";
const sp = (o: Partial<SmartPricing> = {}): SmartPricing => ({ ...DEFAULT_SMART_PRICING, ...o });
const reading = (o: Partial<Reading>): Reading => ({
  site: "booking_com",
  kind: "own",
  roomId: R1,
  checkIn: "2027-03-05",
  nights: 2,
  nightly: 10000,
  seenAt: "2027-03-01T08:00:00Z",
  ...o,
});

describe("how site discounts combine", () => {
  it("Booking.com: one deal, Genius on top for members, mobile on top for phones", () => {
    const run = { deal: 10, genius: 10, mobile: 10 };
    expect(stackedDiscount("booking_com", run)).toBe(0.1);
    expect(stackedDiscount("booking_com", run, ["members"])).toBe(0.19);
    expect(stackedDiscount("booking_com", run, ["members", "mobile"])).toBe(0.271);
  });

  it("Booking.com: the mobile and country rates never combine (the bigger one stays)", () => {
    const run = { mobile: 10, country: 15 };
    expect(stackedDiscount("booking_com", run, ["mobile", "country"])).toBe(0.15);
  });

  it("Airbnb: the new listing promotion replaces everything; otherwise one promotion", () => {
    expect(stackedDiscount("airbnb", { new_listing: 20, early_bird: 10 })).toBe(0.2);
    expect(stackedDiscount("airbnb", { length_of_stay: 10, early_bird: 15 })).toBe(0.15);
  });

  it("ignores offers that aren't running", () => {
    expect(stackedDiscount("booking_com", {})).toBe(0);
    expect(stackedDiscount("booking_com", { genius: 0 }, ["members"])).toBe(0);
  });
});

describe("what's kept", () => {
  it("Stripe's UK prices: standard 1.5% + 20p, Pay by Bank 0.5% + 20p capped at £5, transfers free", () => {
    expect(paymentFee(10000, "card_standard")).toBe(170);
    expect(paymentFee(10000, "card_premium")).toBe(300);
    expect(paymentFee(10000, "pay_by_bank")).toBe(70);
    expect(paymentFee(500000, "pay_by_bank")).toBe(500);
    expect(paymentFee(10000, "bank_transfer")).toBe(0);
    expect(paymentFee(10000, "card_eea", { converted: true })).toBe(470);
  });

  it("doesn't guess other countries' Stripe prices", () => {
    expect(paymentFee(10000, "card_standard", { country: "US" })).toBeNull();
  });

  it("site keeps: the guest's fee comes off first, then the host's commission", () => {
    expect(siteNet(10000, { host: 15, guest: 0 })).toBe(8500);
    expect(Math.round(siteNet(11400, { host: 3, guest: 14 }))).toBe(9700);
  });

  it("finds the direct price that keeps a given amount after Stripe", () => {
    const p = priceForNet(8500, "card_standard");
    expect(Math.round(p - paymentFee(Math.round(p), "card_standard")!)).toBe(8500);
  });
});

describe("where the direct price sits", () => {
  it("under, matching, over and earning the same", () => {
    expect(aimFor(10000, "booking_com", sp())).toBe(9500);
    expect(
      aimFor(10000, "booking_com", sp({ position: { mode: "match", by: "percent", value: 0 } })),
    ).toBe(10000);
    expect(
      aimFor(10000, "booking_com", sp({ position: { mode: "above", by: "amount", value: 500 } })),
    ).toBe(10500);
    // £100 on Booking.com keeps £85; direct needs ~£86.50 to keep the same after a standard card.
    const same = aimFor(
      10000,
      "booking_com",
      sp({ position: { mode: "same_earnings", by: "percent", value: 0 } }),
    );
    expect(Math.round(same)).toBe(8650);
  });

  it("leaves out readings far from the rest", () => {
    const { kept, dropped } = dropOutliers([
      { seen: 100 },
      { seen: 110 },
      { seen: 900 },
      { seen: 105 },
    ]);
    expect(dropped).toBe(1);
    expect(kept).toHaveLength(3);
  });
});

describe("direct suggestions", () => {
  const room = { id: R1, name: "Garden Room", rate: 10000 };

  it("aims under the site's price and rounds to a whole pound", () => {
    const s = suggestDirect(
      room,
      [reading({ nightly: 10000 }), reading({ checkIn: "2027-03-09", nightly: 10400 })],
      sp({ compareTo: "public" }),
      [],
      { today: "2027-03-01" },
    );
    expect(s.suggested).toBe(9700);
    expect(s.basis).toBe("own");
    expect(s.keepDirect).toBe(9700 - paymentFee(9700, "card_standard")!);
  });

  it("compares with the lowest a guest can get there (Genius and mobile) when asked", () => {
    const s = suggestDirect(
      room,
      [reading({ nightly: 10000 })],
      sp({
        compareTo: "lowest",
        position: { mode: "match", by: "percent", value: 0 },
        offers: { booking_com: { genius: 10 } },
      }),
      [],
      { today: "2027-03-01" },
    );
    expect(s.suggested).toBe(9000);
  });

  it("grosses up for a seasonal offer on that night, so the price after it lands on the aim", () => {
    const offers: SeasonalOffer[] = [
      {
        id: "o1",
        label: "Spring",
        from: "2027-03-01",
        to: "2027-03-31",
        percent: 10,
        roomIds: null,
      },
    ];
    const s = suggestDirect(
      room,
      [reading({ nightly: 10000 })],
      sp({ compareTo: "public", position: { mode: "match", by: "percent", value: 0 } }),
      offers,
      { today: "2027-03-01" },
    );
    expect(s.suggested).toBe(11100);
  });

  it("never goes under the room's lowest price, and warns about offers that would", () => {
    const offers: SeasonalOffer[] = [
      {
        id: "o1",
        label: "Winter",
        from: "2027-12-01",
        to: "2027-12-31",
        percent: 30,
        roomIds: null,
      },
    ];
    const s = suggestDirect(
      room,
      [reading({ nightly: 8000 })],
      sp({ compareTo: "public", floors: { [R1]: 8500 } }),
      offers,
      { today: "2027-03-01" },
    );
    expect(s.suggested).toBe(8500);
    expect(s.floored).toBe(true);
    expect(s.offerWarnings).toEqual([{ offer: "Winter", price: 5950 }]);
  });

  it("moves at most the step limit in one go", () => {
    const s = suggestDirect(
      room,
      [reading({ nightly: 20000 })],
      sp({ compareTo: "public", maxStepPct: 20 }),
      [],
      { today: "2027-03-01" },
    );
    expect(s.suggested).toBe(12000);
    expect(s.stepped).toBe(true);
  });

  it("uses other properties when the room has no own listing read", () => {
    const s = suggestDirect(
      room,
      [reading({ kind: "market", roomId: null, nightly: 10000 })],
      sp(),
      [],
      { today: "2027-03-01" },
    );
    expect(s.basis).toBe("market");
    expect(s.suggested).toBe(9500);
  });

  it("gives nothing without readings", () => {
    expect(suggestDirect(room, [], sp(), [], { today: "2027-03-01" }).suggested).toBeNull();
  });
});

describe("site suggestions", () => {
  it("prices a site so a booking there keeps what a direct one does, after commission and the deepest discounts", () => {
    const s = sp({ offers: { booking_com: { deal: 10, genius: 10 } } });
    const sug = suggestSite("booking_com", R1, 10000, s);
    const keepDirect = 10000 - paymentFee(10000, "card_standard")!;
    expect(sug.keep).toBeGreaterThanOrEqual(keepDirect);
    expect(sug.keep - keepDirect).toBeLessThan(100);
    expect(sug.suggested % 100).toBe(0);
  });

  it("notices the host's own change on a site and pauses its suggestion", () => {
    const rs = [
      reading({ seenAt: "2027-03-01T08:00:00Z", checkIn: "2027-03-12", nightly: 10000 }),
      reading({ seenAt: "2027-03-08T08:00:00Z", checkIn: "2027-03-12", nightly: 11000 }),
    ];
    expect(siteChange(rs)).toMatchObject({ changed: true, seenOn: "2027-03-08", ratio: 1.1 });
    const pic = pricingPicture(
      [{ id: R1, name: "Garden Room", rate: 10000 }],
      rs.map((r) => ({ ...r, url: "https://www.booking.com/hotel/gb/x.html" })),
      sp({ compareTo: "public" }),
      [],
      { today: "2027-03-09" },
    );
    expect(pic[0]!.sites[0]!.pausedUntil).toBe("2027-03-22");
    expect(pic[0]!.sites[0]!.changedOn).toBe("2027-03-08");
    // The direct suggestion follows the new price (only the latest read counts).
    expect(pic[0]!.direct.suggested).toBe(10500);
  });

  it("doesn't call a small wobble a change", () => {
    expect(
      siteChange([
        reading({ seenAt: "2027-03-01T08:00:00Z", nightly: 10000 }),
        reading({ seenAt: "2027-03-08T08:00:00Z", nightly: 10200 }),
      ]).changed,
    ).toBe(false);
  });
});

describe("booking page guards", () => {
  const db = normaliseDirectBooking({ nonRef: { enabled: true, kind: "percent", value: 20 } });
  const deep: SeasonalOffer[] = [
    { id: "o1", label: "Sale", from: "2027-01-01", to: "2027-12-31", percent: 50, roomIds: null },
  ];

  it("an offer never takes a night under the room's lowest price", () => {
    expect(quoteStay(10000, deep, R1, "2027-03-01", "2027-03-03", 8000).total).toBe(16000);
    expect(quoteStay(10000, deep, R1, "2027-03-01", "2027-03-03").total).toBe(10000);
  });

  it("the non-refundable rate and offers stop at the lowest price too", () => {
    expect(quotePlan(10000, "nonref", db, deep, R1, "2027-03-01", "2027-03-02", 7000)!.total).toBe(
      7000,
    );
    expect(quotePlan(10000, "nonref", db, [], R1, "2027-03-01", "2027-03-02", 9000)!.total).toBe(
      9000,
    );
  });

  it("a percentage voucher is held to it; a set-price voucher is the host's choice", () => {
    const v = {
      kind: "percent" as const,
      value: 50,
      periods: [{ from: "2027-03-01", to: "2027-03-31" }],
      roomIds: [R1],
    };
    expect(
      quoteWithVoucher(10000, "flex", db, deep, R1, "2027-03-01", "2027-03-02", v, 8000)!.total,
    ).toBe(8000);
    const fixed = { ...v, kind: "price" as const, value: 6000 };
    expect(
      quoteWithVoucher(10000, "flex", db, deep, R1, "2027-03-01", "2027-03-02", fixed, 8000)!.total,
    ).toBe(6000);
  });

  it("a voucher still replaces every other discount on its nights", () => {
    const v = {
      kind: "percent" as const,
      value: 10,
      periods: [{ from: "2027-03-01", to: "2027-03-31" }],
      roomIds: [R1],
    };
    expect(
      quoteWithVoucher(10000, "nonref", db, deep, R1, "2027-03-01", "2027-03-02", v)!.total,
    ).toBe(9000);
  });

  it("the lowest night is the room's floor or the most a discount may take, whichever is higher", () => {
    expect(nightFloor(10000, R1, { floors: { [R1]: 7000 }, maxDiscountPct: 40 })).toBe(7000);
    expect(nightFloor(10000, R1, { floors: {}, maxDiscountPct: 20 })).toBe(8000);
    expect(nightFloor(10000, R1, { floors: {}, maxDiscountPct: 90 })).toBe(0);
    expect(
      floorsForPage(
        [
          { id: R1, ratePence: 10000 },
          { id: R2, ratePence: null },
        ],
        sp({ floors: { [R1]: 7000 } }),
      ),
    ).toEqual({ [R1]: 7000 });
  });
});

describe("schedule and samples", () => {
  it("daily, weekdays, weekends, chosen days, every few days, monthly; once a day at most", () => {
    // 2027-03-01 is a Monday.
    expect(readDue({ kind: "daily" }, null, "2027-03-01")).toBe(true);
    expect(readDue({ kind: "daily" }, "2027-03-01", "2027-03-01")).toBe(false);
    expect(readDue({ kind: "weekdays" }, null, "2027-03-06")).toBe(false);
    expect(readDue({ kind: "weekends" }, null, "2027-03-06")).toBe(true);
    expect(readDue({ kind: "weekly", days: [3] }, "2027-02-24", "2027-03-01")).toBe(false);
    expect(readDue({ kind: "weekly", days: [3] }, "2027-02-24", "2027-03-03")).toBe(true);
    expect(readDue({ kind: "every", days: 3 }, "2027-02-27", "2027-03-01")).toBe(false);
    expect(readDue({ kind: "every", days: 3 }, "2027-02-26", "2027-03-01")).toBe(true);
    expect(readDue({ kind: "monthly", day: 1 }, "2027-02-01", "2027-03-01")).toBe(true);
    expect(readDue({ kind: "monthly", day: 15 }, "2027-02-15", "2027-03-01")).toBe(false);
  });

  it("samples weekdays and weekends inside the horizon", () => {
    const s = sampleStays("2027-03-01", { horizon: 60, count: 4, nights: 2 });
    expect(s.map((x) => x.checkIn)).toEqual([
      "2027-03-02",
      "2027-03-05",
      "2027-03-20",
      "2027-03-31",
    ]);
    expect(s[0]!.checkOut).toBe("2027-03-04");
    expect(sampleStays("2027-03-01", { horizon: 7, count: 6, nights: 1 })).toHaveLength(2);
  });
});

describe("reading pages", () => {
  it("knows the sites and puts the dates and currency in the link", () => {
    expect(
      priceSiteForUrl("https://www.expedia.co.uk/London-Hotels-X.h123.Hotel-Information"),
    ).toBe("expedia");
    expect(priceSiteForUrl("https://example.com")).toBeNull();
    const u = priceUrl(
      "https://www.booking.com/hotel/gb/x.html?aid=1#map",
      "booking_com",
      { checkIn: "2027-03-05", checkOut: "2027-03-07" },
      "GBP",
    );
    expect(u).toBe(
      "https://www.booking.com/hotel/gb/x.html?checkin=2027-03-05&checkout=2027-03-07&group_adults=2&no_rooms=1&selected_currency=GBP",
    );
  });

  it("turns a page's total into a night's price, refusing another currency or a nonsense number", () => {
    expect(
      nightlyFrom({ total: 240, nights: 2, currency: "GBP" }, { nights: 2, currency: "GBP" })
        .nightly,
    ).toBe(12000);
    expect(
      nightlyFrom({ total: 240, currency: "USD" }, { nights: 2, currency: "GBP" }),
    ).toMatchObject({ nightly: null, note: "Shown in USD" });
    expect(nightlyFrom({ total: 0, available: false }, { nights: 2, currency: "GBP" }).note).toBe(
      "Not available",
    );
  });

  it("matches a property page's room type by name", () => {
    const types = [{ name: "Deluxe Double Room with Garden View" }, { name: "Twin Room" }];
    expect(matchRoomType("Garden Double", types)?.name).toBe("Deluxe Double Room with Garden View");
    expect(matchRoomType("Penthouse", types)).toBeNull();
  });
});

describe("settings", () => {
  it("starts quiet: off, weekly on Monday, no booking-page limit until the host sets one", () => {
    const s = normaliseSmartPricing(null);
    expect(s.on).toBe(false);
    expect(s.schedule).toEqual({ kind: "weekly", days: [1] });
    expect(s.maxDiscountPct).toBe(90);
  });

  it("keeps only safe values", () => {
    const s = normaliseSmartPricing({
      on: true,
      position: { mode: "nonsense", value: 500 },
      fees: { booking_com: { host: 99 }, nope: { host: 1 } },
      offers: { airbnb: { new_listing: 20, fake: 50 } },
      floors: { [R1]: 9000, "not-an-id": 5 },
      market: [
        { url: "https://www.airbnb.co.uk/rooms/123", site: "airbnb", label: "<b>Rival</b>" },
        { url: "http://x", site: "airbnb" },
      ],
    });
    expect(s.position).toEqual({ mode: "below", by: "percent", value: 50 });
    expect(s.fees).toEqual({ booking_com: { host: 40, guest: 0 } });
    expect(s.offers).toEqual({ airbnb: { new_listing: 20 } });
    expect(s.floors).toEqual({ [R1]: 9000 });
    expect(s.market).toEqual([
      {
        url: "https://www.airbnb.co.uk/rooms/123",
        site: "airbnb",
        label: "bRival/b",
        roomId: null,
      },
    ]);
  });
});

describe("Pay by Bank on the card page", () => {
  it("only when the card is on, the host asked for it, and the currency is pounds or euros", async () => {
    const { offersPayByBank } = await import("@/lib/direct-booking");
    const on = normaliseDirectBooking({ card: true, payByBank: true });
    expect(offersPayByBank(on, "GBP")).toBe(true);
    expect(offersPayByBank(on, "eur")).toBe(true);
    expect(offersPayByBank(on, "USD")).toBe(false);
    expect(offersPayByBank(normaliseDirectBooking({ card: false, payByBank: true }), "GBP")).toBe(
      false,
    );
    expect(normaliseDirectBooking(null).payByBank).toBe(false);
  });
});
