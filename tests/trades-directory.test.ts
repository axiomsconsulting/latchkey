import { describe, expect, it } from "vitest";

import { LOCAL_SITES, localSites, mapsLink, mapsSearch, tradeTerm } from "../src/lib/trades";

describe("local tradespeople", () => {
  it("searches Google Maps for the job near the area", () => {
    const url = mapsSearch("plumber", "HP13 5AA");
    expect(url.startsWith("https://www.google.com/maps/search/")).toBe(true);
    expect(decodeURIComponent(url)).toContain("plumber near HP13 5AA");
    expect(decodeURIComponent(mapsLink("heating", "Amersham").url)).toContain(
      `${tradeTerm("heating")} near Amersham`,
    );
  });

  it("lists researched sites for every supported country, all https, each saying what it's best for", () => {
    for (const c of ["GB", "IE", "US", "CA", "AU", "NZ"]) {
      const sites = LOCAL_SITES[c]!;
      expect(sites.length).toBeGreaterThanOrEqual(3);
      for (const s of sites) {
        expect(s.url.startsWith("https://")).toBe(true);
        expect(s.bestFor.length).toBeGreaterThan(10);
      }
      expect(new Set(sites.map((s) => s.id)).size).toBe(sites.length);
    }
  });

  it("puts official gas and electrical registers first where the law requires them", () => {
    expect(LOCAL_SITES["GB"]!.slice(0, 2).every((s) => s.official)).toBe(true);
    expect(LOCAL_SITES["IE"]!.slice(0, 2).every((s) => s.official)).toBe(true);
  });

  it("falls back to international sites elsewhere", () => {
    expect(localSites("FR").map((s) => s.name)).toEqual(["Bark", "Taskrabbit"]);
    expect(localSites(null)).toBe(LOCAL_SITES["GB"]);
  });
});
