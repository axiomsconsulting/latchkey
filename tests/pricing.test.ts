import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING, monthlyPence, money } from "../src/lib/pricing";

describe("monthlyPence", () => {
  it("is zero with no properties", () => expect(monthlyPence(DEFAULT_PRICING, [])).toBe(0));
  it("charges base for one property with one room", () => expect(monthlyPence(DEFAULT_PRICING, [1])).toBe(100));
  it("adds 50p per extra room", () => expect(monthlyPence(DEFAULT_PRICING, [3])).toBe(200));
  it("adds £1 per extra property plus its extra rooms", () => expect(monthlyPence(DEFAULT_PRICING, [3, 2])).toBe(350));
  it("treats zero rooms as one", () => expect(monthlyPence(DEFAULT_PRICING, [0])).toBe(100));
});

describe("money", () => {
  it("formats whole and part pounds", () => {
    expect(money(100)).toBe("£1");
    expect(money(50)).toBe("£0.50");
  });
});
