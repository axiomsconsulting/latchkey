import { describe, expect, it } from "vitest";

import { isE164, lastFour, phoneLinks } from "../src/lib/phone-links";

describe("calling and messaging a guest", () => {
  it("only takes full international numbers", () => {
    expect(isE164("+447700900123")).toBe(true);
    expect(isE164("07700900123")).toBe(false);
    expect(isE164("+44")).toBe(false);
    expect(isE164(null)).toBe(false);
  });
  it("keeps the last 4 digits for check-in", () => {
    expect(lastFour("+447700900123")).toBe("0123");
  });
  it("makes links every device understands", () => {
    expect(phoneLinks("+447700900123")).toEqual({
      call: "tel:+447700900123",
      text: "sms:+447700900123",
      whatsapp: "https://wa.me/447700900123",
    });
  });
});
