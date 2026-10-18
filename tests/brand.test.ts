import { afterEach, describe, expect, it } from "vitest";

import { branded, brandName, DEFAULT_BRAND, footerText, normaliseBrand, rebrand, setBrand } from "../src/lib/brand";

afterEach(() => setBrand(DEFAULT_BRAND));

describe("white label", () => {
  it("keeps the default when nothing usable is stored", () => {
    expect(normaliseBrand(null)).toEqual(DEFAULT_BRAND);
    expect(normaliseBrand({ name: "   " }).name).toBe("Latchkey");
    expect(normaliseBrand({ name: "  Stay   Easy " }).name).toBe("Stay Easy");
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
