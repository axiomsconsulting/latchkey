import { describe, expect, it } from "vitest";

import {
  LISTING_PLATFORMS,
  LISTING_SCHEMA,
  PLATFORM_PROFILES,
  cleanPhotos,
  cleanTime,
  countryCode,
  detectPlatform,
  gathered,
  listingUrl,
  looksLikeListing,
  normaliseListing,
  parseLinks,
  photoHostAllowed,
  planImport,
  promptFor,
} from "../src/lib/listing-import";

describe("listing links", () => {
  it("knows each booking site Latchkey lists", () => {
    expect(detectPlatform("https://www.airbnb.co.uk/rooms/123456?adults=2")).toBe("airbnb");
    expect(detectPlatform("https://www.booking.com/hotel/gb/hill-suites.en-gb.html")).toBe(
      "booking_com",
    );
    expect(detectPlatform("https://www.vrbo.com/1234567ha")).toBe("vrbo");
    expect(detectPlatform("https://www.agoda.com/the-hill/hotel/amersham-gb.html")).toBe("agoda");
    expect(detectPlatform("https://www.homestay.com/united-kingdom/amersham/123456-room")).toBe(
      "homestay",
    );
    expect(detectPlatform("https://evil.example/airbnb.com/rooms/1")).toBeNull();
    expect(detectPlatform("ftp://airbnb.com/rooms/1")).toBeNull();
    expect(detectPlatform("not a link")).toBeNull();
    expect(LISTING_PLATFORMS).toHaveLength(5);
  });

  it("tells a listing page from a search or home page", () => {
    expect(looksLikeListing("https://www.airbnb.com/rooms/123456")).toBe(true);
    expect(looksLikeListing("https://www.airbnb.com/s/London/homes")).toBe(false);
    expect(looksLikeListing("https://www.booking.com/hotel/gb/hill-suites.html")).toBe(true);
    expect(looksLikeListing("https://www.booking.com/searchresults.html")).toBe(false);
  });

  it("drops tracking and adds the site's own date parameters for prices", () => {
    expect(listingUrl("http://www.airbnb.co.uk/rooms/1?source_impression_id=x#photos")).toBe(
      "https://www.airbnb.co.uk/rooms/1",
    );
    expect(
      listingUrl("https://www.airbnb.com/rooms/1", {
        checkIn: "2026-11-01",
        checkOut: "2026-11-03",
      }),
    ).toBe("https://www.airbnb.com/rooms/1?check_in=2026-11-01&check_out=2026-11-03&adults=2");
    expect(
      listingUrl("https://www.booking.com/hotel/gb/x.html?aid=1", {
        checkIn: "2026-11-01",
        checkOut: "2026-11-03",
      }),
    ).toBe(
      "https://www.booking.com/hotel/gb/x.html?checkin=2026-11-01&checkout=2026-11-03&group_adults=2&no_rooms=1",
    );
    // Homestay shows its price without dates.
    expect(
      listingUrl("https://www.homestay.com/uk/x/123?ref=1", {
        checkIn: "2026-11-01",
        checkOut: "2026-11-03",
      }),
    ).toBe("https://www.homestay.com/uk/x/123");
  });

  it("finds each link once in whatever the host pasted", () => {
    const text =
      "Mine: https://www.airbnb.com/rooms/1?x=1, and https://www.airbnb.com/rooms/1 again\nhttps://www.booking.com/hotel/gb/x.html.";
    expect(parseLinks(text)).toEqual([
      "https://www.airbnb.com/rooms/1?x=1",
      "https://www.booking.com/hotel/gb/x.html",
    ]);
  });

  it("explains every site and asks Firecrawl for the app's fields", () => {
    for (const p of LISTING_PLATFORMS) {
      expect(PLATFORM_PROFILES[p].tip.length).toBeGreaterThan(20);
      expect(promptFor(p)).toContain(PLATFORM_PROFILES[p].label);
    }
    expect(Object.keys(LISTING_SCHEMA.properties)).toEqual(
      expect.arrayContaining(["propertyName", "rooms", "photos", "checkInFrom", "price"]),
    );
  });
});

describe("cleaning what comes back", () => {
  it("reads times however the site writes them", () => {
    expect(cleanTime("3pm")).toBe("15:00");
    expect(cleanTime("From 14:00")).toBe("14:00");
    expect(cleanTime("11.30 am")).toBe("11:30");
    expect(cleanTime("12am")).toBe("00:00");
    expect(cleanTime("noon-ish")).toBeNull();
    expect(cleanTime(15)).toBeNull();
  });

  it("keeps real photos once, larger, and skips icons and maps", () => {
    expect(
      cleanPhotos([
        "https://a0.muscache.com/im/pictures/abc.jpg?im_w=320",
        "https://a0.muscache.com/im/pictures/abc.jpg?im_w=720",
        "https://cf.bstatic.com/xdata/images/hotel/max300/1.jpg",
        "https://example.com/static/images/map.png",
        "https://example.com/logo.svg",
        "http://insecure.example/x.jpg",
        42,
      ]),
    ).toEqual([
      "https://a0.muscache.com/im/pictures/abc.jpg?im_w=1200",
      "https://cf.bstatic.com/xdata/images/hotel/max1024x768/1.jpg",
    ]);
  });

  it("makes anything Firecrawl returns safe", () => {
    const l = normaliseListing(
      {
        propertyName: "  The Hill   Suites ",
        address: "12 High Street",
        city: "Amersham",
        checkInFrom: "3pm",
        photos: ["https://cf.bstatic.com/xdata/images/hotel/max300/1.jpg"],
        price: { amount: "£120", currency: "gbp", per: "night" },
        rooms: [
          { name: "Garden Room", maxGuests: 2, ensuite: true, beds: "1 double" },
          { name: "" },
          { maxGuests: 99 },
        ],
      },
      "booking_com",
      "https://www.booking.com/hotel/gb/x.html",
    );
    expect(l.propertyName).toBe("The Hill Suites");
    expect(l.address).toBe("12 High Street, Amersham");
    expect(l.checkInFrom).toBe("15:00");
    expect(l.price).toEqual({ amount: 120, currency: "GBP", per: "night" });
    expect(l.rooms).toHaveLength(1);
    expect(gathered(l).map((g) => g.key)).toEqual([
      "name",
      "address",
      "photos",
      "rooms",
      "sleeps",
      "times",
      "price",
    ]);
    expect(normaliseListing(null, "airbnb", "u").rooms).toEqual([]);
  });

  it("copies photos only from the booking sites' own image servers", () => {
    expect(photoHostAllowed("https://a0.muscache.com/im/pictures/x.jpg")).toBe(true);
    expect(photoHostAllowed("https://cf.bstatic.com/xdata/images/hotel/max1024x768/1.jpg")).toBe(
      true,
    );
    expect(photoHostAllowed("https://muscache.com.evil.example/x.jpg")).toBe(false);
    expect(photoHostAllowed("http://a0.muscache.com/x.jpg")).toBe(false);
    expect(photoHostAllowed("https://169.254.169.254/latest")).toBe(false);
  });

  it("matches countries by name or code", () => {
    const known = [
      { code: "GB", country: "United Kingdom" },
      { code: "FR", country: "France" },
    ];
    expect(countryCode("England", known)).toBe("GB");
    expect(countryCode("france", known)).toBe("FR");
    expect(countryCode("fr", known)).toBe("FR");
    expect(countryCode("Atlantis", known)).toBeNull();
  });
});

describe("planning the import", () => {
  const booking = normaliseListing(
    {
      propertyName: "The Hill Suites",
      address: "12 High Street, Amersham",
      postcode: "HP6 5AA",
      checkInFrom: "15:00",
      checkOutBy: "11:00",
      photos: ["https://cf.bstatic.com/a.jpg"],
      rooms: [
        { name: "Garden Room", maxGuests: 2, ensuite: true },
        { name: "Loft Suite", maxGuests: 4, beds: "1 king, 1 sofa bed" },
      ],
    },
    "booking_com",
    "b",
  );
  const airbnb = normaliseListing(
    {
      propertyName: "Cosy loft suite",
      description: "Under the eaves",
      photos: ["https://a0.muscache.com/x.jpg"],
      price: { amount: 140, currency: "GBP", per: "night" },
    },
    "airbnb",
    "a",
  );

  it("takes the property from the whole-property page and each room once", () => {
    const plan = planImport([airbnb, booking], [{ id: "r1", display_name: "Garden room" }]);
    expect(plan.property.name).toBe("The Hill Suites");
    expect(plan.property.postcode).toBe("HP6 5AA");
    expect(plan.rooms.map((r) => [r.name, r.existingId, r.maxGuests])).toEqual([
      // A single Airbnb unit with no room list becomes a room named after it.
      ["Cosy loft suite", null, 2],
      ["Garden Room", "r1", 2],
      ["Loft Suite", null, 4],
    ]);
    expect(plan.rooms[2]!.description).toBe("1 king, 1 sofa bed");
    expect(plan.photos).toHaveLength(2);
    expect(plan.prices).toEqual([
      { platform: "airbnb", amount: 140, currency: "GBP", per: "night" },
    ]);
  });

  it("never adds the same room twice", () => {
    const plan = planImport([booking, booking], []);
    expect(plan.rooms).toHaveLength(2);
  });
});
