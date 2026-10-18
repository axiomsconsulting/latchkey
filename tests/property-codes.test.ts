import { describe, expect, it } from "vitest";

import { areaCode, cleanLink, distinctiveWords, linkAlternatives, linkCandidates, linkProblem, randomPin, townFrom, weakPin } from "../src/lib/property-codes";

describe("guest links", () => {
  it("keeps the word that names the place, not the kind of place", () => {
    expect(distinctiveWords("The Grange Guest House")).toEqual(["grange"]);
    expect(distinctiveWords("Hill Suites")).toEqual(["hill"]);
    expect(distinctiveWords("Seaview B&B")).toEqual(["seaview"]);
    expect(distinctiveWords("The Old Rectory Serviced Apartments Ltd")).toEqual(["old", "rectory"]);
    expect(distinctiveWords("Hôtel Le Café de Flore")).toEqual(["cafe", "flore"]);
    expect(distinctiveWords("Mary's Cottage")).toEqual(["marys"]);
  });

  it("still makes a link from a name that is only descriptors", () => {
    expect(distinctiveWords("The Guest House")).toEqual(["guest-house"]);
    expect(linkCandidates({ name: "The Guest House" })[0]).toBe("guest-house");
  });

  it("tries the best link first, then more words, the town, the area and numbers", () => {
    const c = linkCandidates({ name: "The Old Rectory Guest House", address: "4 Church Lane, Bath", postcode: "BA1 2AB" });
    expect(c.slice(0, 3)).toEqual(["old-rectory", "old-rectory-bath", "old-rectory-ba1"]);
    expect(c).toContain("old-rectory-2");
    expect(linkCandidates({ name: "Grange Manor Farm Seaview", address: "Bath" }).slice(0, 3)).toEqual(["grange", "grange-seaview", "grange-bath"]);
    expect(linkCandidates({ name: "St Ives Inn" })[0]).toBe("st-ives");
  });

  it("never offers app paths or broken links", () => {
    expect(linkProblem("kiosk")).toBe("reserved");
    expect(linkProblem("ab")).toBe("too_short");
    expect(linkProblem("bad--link")).toBe("characters");
    expect(linkProblem("grange-bath")).toBeNull();
    expect(cleanLink("  Grange  Bath!! ")).toBe("grange-bath");
  });

  it("suggests at most three free alternatives for a taken link", () => {
    const taken = new Set(["grange", "grange-bath", "grange-2026"]);
    const alt = linkAlternatives("grange", { name: "The Grange Manor Farm", address: "Bath", postcode: "BA1 2AB" }, (c) => !taken.has(c), 3, 2026);
    expect(alt).toEqual(["grange-ba1", "grange-2", "grange-3"]);
    expect(alt.every((a) => !taken.has(a))).toBe(true);
  });

  it("reads the postcode area and town", () => {
    expect(areaCode("BA1 2AB")).toBe("ba1");
    expect(areaCode("sw1a1aa")).toBe("sw1a");
    expect(areaCode("")).toBe("");
    expect(townFrom("4 Church Lane, Bath, BA1 2AB")).toBe("bath");
  });
});

describe("door PINs", () => {
  it("spots easy guesses", () => {
    for (const p of ["111111", "123456", "987654", "890123", "121212", "123123", "112211"]) expect(weakPin(p)).toBe(true);
    for (const p of ["409271", "582916"]) expect(weakPin(p)).toBe(false);
  });

  it("makes random six-digit PINs that aren't easy guesses", () => {
    let i = 0;
    const seq = [0.123456, 0.111111, 0.582916];
    expect(randomPin(() => seq[i++]!)).toBe("582916");
    expect(randomPin(() => 0.0004)).toMatch(/^\d{6}$/);
  });
});
