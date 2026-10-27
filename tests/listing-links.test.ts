import { describe, expect, it } from "vitest";

import { mergeListingLinks, normaliseListingLinks } from "../src/lib/listing-links";

describe("listing links", () => {
  it("keeps each link once, tidied, with the site it's on", () => {
    expect(
      normaliseListingLinks([
        "https://www.airbnb.co.uk/rooms/123?source_impression_id=x",
        "http://www.airbnb.co.uk/rooms/123",
        "https://www.booking.com/hotel/gb/trinity.html?aid=9",
        "https://example.com/our-rooms#top",
        "javascript:alert(1)",
        42,
      ]),
    ).toEqual([
      { site: "airbnb", url: "https://www.airbnb.co.uk/rooms/123" },
      { site: "booking_com", url: "https://www.booking.com/hotel/gb/trinity.html" },
      { site: "other", url: "https://example.com/our-rooms" },
    ]);
  });
  it("reads links out of pasted text and stored objects", () => {
    expect(
      normaliseListingLinks("Mine: https://www.vrbo.com/1234567, thanks").map((l) => l.site),
    ).toEqual(["vrbo"]);
    expect(
      normaliseListingLinks([{ site: "airbnb", url: "https://www.airbnb.com/rooms/1" }]),
    ).toEqual([{ site: "airbnb", url: "https://www.airbnb.com/rooms/1" }]);
    expect(normaliseListingLinks(null)).toEqual([]);
  });
  it("adds without repeating", () => {
    expect(
      mergeListingLinks(
        [{ url: "https://www.airbnb.com/rooms/1" }],
        ["https://www.airbnb.com/rooms/1?x=1", "https://www.agoda.com/x/hotel/y.html"],
      ).length,
    ).toBe(2);
  });
});
