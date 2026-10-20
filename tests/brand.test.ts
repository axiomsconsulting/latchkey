import { afterEach, describe, expect, it } from "vitest";

import { branded, brandName, DEFAULT_BRAND, footerText, normaliseBrand, rebrand, setBrand } from "../src/lib/brand";

afterEach(() => setBrand(DEFAULT_BRAND));

describe("white label", () => {
  it("keeps the default when nothing usable is stored", () => {
    expect(normaliseBrand(null)).toEqual(DEFAULT_BRAND);
    expect(normaliseBrand({ name: "   " }).name).toBe("Latchkey");
    expect(normaliseBrand({ name: "  Stay   Easy " }).name).toBe("Stay Easy");
  });

  it("keeps the site logo the super admin chose, and never shows Latchkey's key on a renamed product saved before logos", () => {
    expect(normaliseBrand(null).logoMark).toBe("key");
    expect(normaliseBrand({ logoMark: "arch" }).logoMark).toBe("arch");
    expect(normaliseBrand({ logoMark: "spaceship" }).logoMark).toBe("key");
    expect(normaliseBrand({ name: "StayEasy" }).logoMark).toBe("initial");
    expect(normaliseBrand({ name: "StayEasy", logoMark: "monogram" }).logoMark).toBe("monogram");
    expect(normaliseBrand({ logoUrl: "https://x.supabase.co/storage/v1/object/sign/branding/site/logo.png?token=a" }).logoUrl).toMatch(/^https:/);
    expect(normaliseBrand({ logoUrl: "javascript:alert(1)" }).logoUrl).toBe("");
    expect(normaliseBrand({ logoUrl: "http://plain.example/logo.png" }).logoUrl).toBe("");
  });

  it("renames the product everywhere text mentions it, and nothing else", () => {
    setBrand({ name: "StayEasy" });
    expect(brandName()).toBe("StayEasy");
    expect(rebrand("Latchkey alert: Latchkey's inbox")).toBe("StayEasy alert: StayEasy's inbox");
    expect(rebrand("latchkey.omsestates.uk")).toBe("latchkey.omsestates.uk");
  });

  it("reads copy objects through the brand, including nested ones, lists and functions", () => {
    const copy = branded({
      title: "Try Latchkey",
      nested: { line: "Open Latchkey" },
      list: ["Latchkey one", "two"],
      say: (n: number) => `Latchkey ${n}`,
    });
    expect(copy.title).toBe("Try Latchkey");
    setBrand({ name: "Hostly" });
    expect(copy.title).toBe("Try Hostly");
    expect(copy.nested.line).toBe("Open Hostly");
    expect(copy.list.map((x) => x)).toEqual(["Hostly one", "two"]);
    expect(copy.say(2)).toBe("Hostly 2");
  });

  it("uses the admin's footer, or one made from the name", () => {
    setBrand({ name: "Hostly" });
    expect(footerText("© 2026 Latchkey.")).toBe("© 2026 Hostly.");
    setBrand({ name: "Hostly", footer: "Made in Bath" });
    expect(footerText("© 2026 Latchkey.")).toBe("Made in Bath");
  });
});
