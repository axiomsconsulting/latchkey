import { describe, expect, it } from "vitest";
import { artFor, DEFAULT_HOME_GLASS, glassVars, normaliseHomeGlass, DEFAULT_HOME_ART, DEFAULT_HOME_ART_STYLE, normaliseHomeArt, normaliseHomeArtConfig, normaliseHomeArtStyle } from "@/lib/home-art";

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
  it("reads the faintness settings, and older saved lists", () => {
    expect(normaliseHomeArtStyle({ opacity: 2, dim: -1, tint: "#AABBCC", tintStrength: 0.5, grey: 0.25 })).toEqual({ opacity: 0.6, dim: 0, tint: "#aabbcc", tintStrength: 0.5, grey: 0.25 });
    expect(normaliseHomeArtStyle({ tint: null }).tint).toBeNull();
    expect(normaliseHomeArtStyle({ tint: "red" }).tint).toBe(DEFAULT_HOME_ART_STYLE.tint);
    expect(normaliseHomeArtConfig([]).style).toEqual(DEFAULT_HOME_ART_STYLE);
    const both = normaliseHomeArtConfig({ items: [{ src: "/home/guest-house.jpg", slot: "why" }], style: { opacity: 0.1 } });
    expect(both.items[0]!.slot).toBe("why");
    expect(both.style.opacity).toBe(0.1);
    expect(normaliseHomeArt({ items: [] })).toEqual([]);
  });
  it("reads the glass settings and turns them into CSS variables", () => {
    expect(normaliseHomeGlass(null)).toEqual(DEFAULT_HOME_GLASS);
    expect(normaliseHomeGlass({ on: false, clear: 2, blur: 99.4, saturate: 0 })).toEqual({ on: false, clear: 0.85, blur: 40, saturate: 1 });
    expect(glassVars({ on: true, clear: 0.4, blur: 18, saturate: 1.6 })).toEqual({ "--glass-fill": "60%", "--glass-blur": "18px", "--glass-sat": "1.6" });
    expect(normaliseHomeArtConfig({ items: [], glass: { on: false } }).glass.on).toBe(false);
  });
  it("shows one picture in each place", () => {
    const many = normaliseHomeArt(Array.from({ length: 4 }, () => ({ src: "/home/guest-house.jpg", slot: "hero" })));
    expect(artFor(many, "hero")).toHaveLength(1);
    expect(artFor(DEFAULT_HOME_ART, "journey")).toHaveLength(1);
  });
});
