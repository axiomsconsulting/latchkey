import { describe, expect, it } from "vitest";

import {
  isBritish,
  normaliseReturningMode,
  skipsIdAgain,
  type EarlierId,
} from "../src/lib/returning-checks";

const pawel: EarlierId = { bookingId: "p1", continued: false, british: false };
const mahamoud: EarlierId = { bookingId: "m1", continued: true, british: false };
const sarah: EarlierId = { bookingId: "s1", continued: false, british: true };

describe("returning guests and their ID", () => {
  it("starts lenient: anyone with an earlier check isn't asked again", () => {
    expect(normaliseReturningMode(undefined)).toBe("lenient");
    expect(normaliseReturningMode("nonsense")).toBe("lenient");
    expect(skipsIdAgain("lenient", pawel)).toBe(true);
    expect(skipsIdAgain("lenient", sarah)).toBe(true);
  });
  it("overseas: guests from abroad show their ID again on a new stay", () => {
    expect(skipsIdAgain("overseas", pawel)).toBe(false);
    expect(skipsIdAgain("overseas", sarah)).toBe(true);
  });
  it("always asks, except someone staying on in the same room", () => {
    expect(skipsIdAgain("always", sarah)).toBe(false);
    expect(skipsIdAgain("always", mahamoud)).toBe(true);
    expect(skipsIdAgain("overseas", mahamoud)).toBe(true);
  });
  it("never without an earlier check", () => {
    expect(skipsIdAgain("lenient", null)).toBe(false);
  });
  it("knows British guests from the register or the ID", () => {
    expect(isBritish("GB")).toBe(true);
    expect(isBritish("GB-BNO")).toBe(true);
    expect(isBritish("PL")).toBe(false);
    expect(isBritish(null, "United Kingdom")).toBe(true);
    expect(isBritish(null, "Poland")).toBe(false);
    expect(isBritish(null, null)).toBe(false);
  });
});
