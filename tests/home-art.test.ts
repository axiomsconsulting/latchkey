import { describe, expect, it } from "vitest";
import { artFor, DEFAULT_HOME_ART, normaliseHomeArt } from "@/lib/home-art";

describe("home page pictures", () => {
  it("uses the defaults until the admin saves a list (an empty list means none)", () => {
    expect(normaliseHomeArt(null)).toBe(DEFAULT_HOME_ART);
    expect(normaliseHomeArt([])).toEqual([]);
  });
  it("keeps only safe sources and sensible values", () => {
    const out = normaliseHomeArt([
      { id: "x", src: "/home/settled-in.jpg", alt: "<b>Hi</b>", slot: "pricing", side: "left", opacity: 5 },
      { src: "javascript:alert(1)" },
      { src: "http://example.com/a.png" },
      { src: "https://cdn.example.com/a.png", slot: "nowhere", opacity: 0.01 },
      { src: "/home/../secret.svg" },
      { src: "/home/old-art.svg" },
    ]);
    expect(out).toEqual([
      { id: "x", src: "/home/settled-in.jpg", alt: "bHi/b", slot: "pricing", side: "left", opacity: 1 },
      { id: "a2", src: "https://cdn.example.com/a.png", alt: "", slot: "hero", side: "right", opacity: 0.1 },
    ]);
  });
  it("shows one picture by the headline and up to two by a section", () => {
    const many = normaliseHomeArt(Array.from({ length: 4 }, () => ({ src: "/home/guest-house.jpg", slot: "hero" })));
    expect(artFor(many, "hero")).toHaveLength(1);
    expect(artFor(DEFAULT_HOME_ART, "journey")).toHaveLength(1);
  });
});
