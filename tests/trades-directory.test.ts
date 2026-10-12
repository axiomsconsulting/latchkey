import { describe, expect, it } from "vitest";

import { DIRECTORIES, directoryLinks } from "../src/lib/trades";
import { region } from "../src/lib/regions";

describe("local tradespeople directory", () => {
  it("every search link is https and carries the job and the area", () => {
    for (const d of DIRECTORIES) {
      const url = d.search("plumber", "HP13 5AA");
      expect(url.startsWith("https://")).toBe(true);
      expect(decodeURIComponent(url)).toContain("plumber");
      expect(decodeURIComponent(url)).toContain("HP13 5AA");
      expect(d.site.startsWith("https://")).toBe(true);
    }
  });

  it("every country lists only directories that exist", () => {
    const ids = new Set(DIRECTORIES.map((d) => d.id));
    for (const c of ["GB", "IE", "US", "CA", "AU", "NZ"]) {
      for (const id of region(c).directoryIds) expect(ids.has(id)).toBe(true);
      expect(directoryLinks("plumbing", "Somewhere", c).length).toBe(region(c).directoryIds.length);
    }
  });
});
