import { describe, expect, it } from "vitest";

import {
  contactLinks,
  guessTradeMapping,
  internationalDigits,
  matchCategory,
  rowsToTrades,
} from "@/lib/trade-contacts";

describe("internationalDigits", () => {
  it("adds the UK dialling code and drops the leading zero", () => {
    expect(internationalDigits("07700 900123", "GB")).toBe("447700900123");
  });

  it("keeps a number that already carries a plus prefix", () => {
    expect(internationalDigits("+353 86 123 4567", "IE")).toBe("353861234567");
  });

  it("handles a 00 international prefix", () => {
    expect(internationalDigits("0044 7700 900123", "GB")).toBe("447700900123");
  });

  it("uses the US code for a US property", () => {
    expect(internationalDigits("(415) 555-0132", "US")).toBe("14155550132");
  });

  it("rejects something too short to be a number", () => {
    expect(internationalDigits("123", "GB")).toBeNull();
    expect(internationalDigits("", "GB")).toBeNull();
  });
});

describe("contactLinks", () => {
  it("builds call, text, WhatsApp and email links", () => {
    const links = contactLinks(
      { phone: "07700 900123", email: "sam@example.com" },
      "GB",
    );
    expect(links.tel).toBe("tel:07700900123");
    expect(links.whatsapp).toBe("https://wa.me/447700900123");
    expect(links.email).toBe("mailto:sam@example.com");
    expect(links.sms).toBe("sms:07700900123");
  });

  it("prefers a separate WhatsApp number when given one", () => {
    const links = contactLinks({ phone: "01494 555000", whatsapp_phone: "07700 900999" }, "GB");
    expect(links.whatsapp).toBe("https://wa.me/447700900999");
  });

  it("returns nothing where there is no detail", () => {
    expect(contactLinks({}, "GB")).toEqual({ tel: null, sms: null, whatsapp: null, email: null });
  });
});

describe("matchCategory", () => {
  it("maps everyday wording to a category", () => {
    expect(matchCategory("Gas Safe engineer")).toBe("heating");
    expect(matchCategory("End of tenancy cleaning")).toBe("cleaning");
    expect(matchCategory("Emergency locksmith")).toBe("locksmith");
    expect(matchCategory("Sparky")).toBe("electrical");
    expect(matchCategory("")).toBe("other");
  });
});

describe("guessTradeMapping", () => {
  it("recognises common spreadsheet headings", () => {
    const m = guessTradeMapping(["Name", "Company", "Trade", "Mobile", "WhatsApp", "Email", "Notes"]);
    expect(m.name).toBe(0);
    expect(m.company_name).toBe(1);
    expect(m.category).toBe(2);
    expect(m.phone).toBe(3);
    expect(m.whatsapp_phone).toBe(4);
    expect(m.email).toBe(5);
    expect(m.notes).toBe(6);
  });
});

describe("rowsToTrades", () => {
  const mapping = { name: 0, category: 1, phone: 2, email: 3 };

  it("keeps rows that have a name and a way to reach them", () => {
    const { trades, skipped } = rowsToTrades(
      [
        ["Ade Plumbing", "Plumber", "07700 900001", ""],
        ["", "Cleaner", "07700 900002", ""],
        ["No Contact Ltd", "Handyman", "", ""],
      ],
      mapping,
    );
    expect(trades).toHaveLength(1);
    expect(trades[0]!.name).toBe("Ade Plumbing");
    expect(trades[0]!.category).toBe("plumbing");
    expect(skipped).toBe(2);
  });

  it("accepts an email-only contact", () => {
    const { trades } = rowsToTrades([["Linen Co", "Laundry", "", "hello@linen.example"]], mapping);
    expect(trades[0]!.email).toBe("hello@linen.example");
    expect(trades[0]!.category).toBe("linen");
  });
});
