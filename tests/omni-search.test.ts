import { describe, expect, it } from "vitest";

import { cleanQuery, matchScore, rankHits, stayLine, type SearchHit } from "../src/lib/omni-search";

const hit = (title: string, extra: Partial<SearchHit> = {}): SearchHit => ({ kind: "page", id: title, title, href: "/", ...extra });

describe("omni search", () => {
  it("keeps queries safe for a database filter", () => {
    expect(cleanQuery("  smith, (jane)%_*  ")).toBe("smith jane");
    expect(cleanQuery("o'brien@mail.com")).toBe("o'brien@mail.com");
    expect(cleanQuery("x".repeat(100))).toHaveLength(60);
  });

  it("needs every word, and ranks a title that starts with the query first", () => {
    expect(matchScore("wifi pass", hit("Wi-Fi", { keywords: "wifi password network" }))).toBeGreaterThan(0);
    expect(matchScore("wifi lasers", hit("Wi-Fi", { keywords: "wifi password" }))).toBe(0);
    const ranked = rankHits("book", [hit("Guest register", { keywords: "book" }), hit("Booking sites"), hit("My bookings"), hit("Bookings")]);
    expect(ranked.map((h) => h.title)).toEqual(["Booking sites", "Bookings", "My bookings", "Guest register"]);
  });

  it("shows a stay's dates briefly", () => {
    expect(stayLine("2026-10-12", "2026-10-14")).toBe("12 Oct – 14 Oct 2026");
  });
});
