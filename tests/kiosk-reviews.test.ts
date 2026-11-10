import { describe, expect, it } from "vitest";

import {
  dateLabel,
  firstNameOf,
  fromScraped,
  isTopRating,
  ratingLabel,
  reviewDate,
  reviewKey,
  reviewPace,
  reviewPages,
  shuffled,
  verbatimQuote,
} from "../src/lib/kiosk-reviews";

const text =
  "The room was spotless and the bed so comfortable. Check-in on the tablet took a minute. Parking was tricky though.";

describe("which reviews the door tablet shows", () => {
  it("only the top ratings", () => {
    expect(isTopRating(5, 5)).toBe(true);
    expect(isTopRating(4.8, 5)).toBe(true);
    expect(isTopRating(4.5, 5)).toBe(false);
    expect(isTopRating(9.2, 10)).toBe(true);
    expect(isTopRating(8.8, 10)).toBe(false);
  });

  it("quotes only words that are really in the review", () => {
    expect(verbatimQuote(text, "The room was spotless and the bed so comfortable.")).toBe(
      "The room was spotless and the bed so comfortable.",
    );
    // Reworded or made up: never shown.
    expect(
      verbatimQuote(text, "The room was spotless and the bed was very comfortable."),
    ).toBeNull();
    expect(verbatimQuote(text, "Great!")).toBeNull();
    expect(verbatimQuote(text, null)).toBeNull();
  });

  it("first names only", () => {
    expect(firstNameOf("Maria José G.")).toBe("Maria");
    expect(firstNameOf("anonymous")).toBeNull();
    expect(firstNameOf("")).toBeNull();
  });

  it("reads the dates sites show", () => {
    expect(reviewDate("2026-03-14")).toBe("2026-03-14");
    expect(reviewDate("March 2026")).toBe("2026-03");
    expect(reviewDate("14 Mar 2026")).toBe("2026-03-14");
    expect(reviewDate("2 weeks ago")).toBeNull();
    expect(dateLabel("2026-03")).toBe("March 2026");
    expect(dateLabel("2026-03-14")).toBe("14 Mar 2026");
  });

  it("keeps a top review with a positive quote, and nothing else", () => {
    const good = fromScraped(
      {
        reviewer: "Anna Smith",
        rating: 5,
        out_of: 5,
        date: "October 2026",
        text,
        positive_quote: "Check-in on the tablet took a minute.",
      },
      "airbnb",
    );
    expect(good).toEqual({
      site: "airbnb",
      firstName: "Anna",
      rating: 5,
      outOf: 5,
      date: "2026-10",
      text: "Check-in on the tablet took a minute.",
    });
    expect(
      fromScraped({ reviewer: "Anna", rating: 4, out_of: 5, text, positive_quote: text }, "x"),
    ).toBeNull();
    expect(
      fromScraped({ reviewer: "Anna", rating: 5, out_of: 5, text, positive_quote: null }, "x"),
    ).toBeNull();
    expect(
      fromScraped({ reviewer: "Anna", rating: 11, out_of: 10, text, positive_quote: text }, "x"),
    ).toBeNull();
  });

  it("the same review from two pages is one", () => {
    expect(reviewKey({ firstName: "Anna", text: "Lovely  stay" })).toBe(
      reviewKey({ firstName: "anna", text: "Lovely stay" }),
    );
  });
});

describe("how they move", () => {
  it("quick with plenty, slower with a few, still with one", () => {
    expect(reviewPace(10)).toBe(1700);
    expect(reviewPace(3)).toBeGreaterThan(reviewPace(10)!);
    expect(reviewPace(2)).toBeGreaterThan(reviewPace(3)!);
    expect(reviewPace(1)).toBeNull();
  });
  it("in a fresh order each time, every review once", () => {
    const a = shuffled([1, 2, 3, 4, 5], 7);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(shuffled([1, 2, 3, 4, 5], 7)).toEqual(a);
  });
  it("shows the rating the way the site gives it", () => {
    expect(ratingLabel(5, 5)).toBe("★★★★★");
    expect(ratingLabel(4.9, 5)).toBe("4.9 ★");
    expect(ratingLabel(9.6, 10)).toBe("9.6/10");
  });
  it("reads an Airbnb listing's reviews page too", () => {
    expect(reviewPages("https://www.airbnb.co.uk/rooms/123?x=1")).toEqual([
      "https://www.airbnb.co.uk/rooms/123?x=1",
      "https://www.airbnb.co.uk/rooms/123/reviews",
    ]);
    expect(reviewPages("https://www.booking.com/hotel/gb/x.html")).toHaveLength(1);
    expect(reviewPages("not a link")).toEqual([]);
  });
});

describe("reading reviews again", () => {
  const day = 86_400_000;
  it("is due when never read, or once the admin's days have passed", async () => {
    const { reviewsDue } = await import("../src/lib/kiosk-reviews");
    const now = Date.parse("2026-11-10T09:00:00Z");
    expect(reviewsDue(null, 7, now)).toBe(true);
    expect(reviewsDue(new Date(now - 6 * day).toISOString(), 7, now)).toBe(false);
    expect(reviewsDue(new Date(now - 7 * day).toISOString(), 7, now)).toBe(true);
    expect(reviewsDue(new Date(now - 2 * day).toISOString(), 1, now)).toBe(true);
  });
});
