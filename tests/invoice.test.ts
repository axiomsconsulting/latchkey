import { describe, expect, it } from "vitest";

import {
  cleanGuestDetails,
  invoiceNumber,
  invoiceOffered,
  invoiceTotals,
  stayDescription,
  suggestPrefix,
  taxTerms,
} from "../src/lib/invoice";

describe("taxTerms", () => {
  it("uses each country's words", () => {
    expect(taxTerms("GB")).toEqual({ name: "VAT", numberLabel: "VAT number", title: "Invoice" });
    expect(taxTerms("AU")).toEqual({ name: "GST", numberLabel: "ABN", title: "Tax invoice" });
    expect(taxTerms("CA").name).toBe("GST/HST");
    expect(taxTerms("US").name).toBe("Sales tax");
    expect(taxTerms("FR").numberLabel).toBe("VAT number");
    expect(taxTerms("BR")).toEqual({ name: "Tax", numberLabel: "Tax registration number", title: "Invoice" });
  });
});

describe("invoiceTotals", () => {
  it("takes 20% VAT out of a price that includes it", () => {
    expect(invoiceTotals({ amountPence: 12000, includesTax: true, registered: true, rateBp: 2000 })).toEqual({
      net: 10000, tax: 2000, total: 12000, rateBp: 2000,
    });
  });
  it("adds tax to a price that doesn't include it", () => {
    expect(invoiceTotals({ amountPence: 10000, includesTax: false, registered: true, rateBp: 1500 })).toEqual({
      net: 10000, tax: 1500, total: 11500, rateBp: 1500,
    });
  });
  it("shows no tax for a business that isn't registered", () => {
    expect(invoiceTotals({ amountPence: 9999, includesTax: false, registered: false, rateBp: 2000 })).toEqual({
      net: 9999, tax: 0, total: 9999, rateBp: 0,
    });
  });
  it("never loses a penny to rounding", () => {
    const t = invoiceTotals({ amountPence: 10001, includesTax: true, registered: true, rateBp: 2000 });
    expect(t.net + t.tax).toBe(10001);
  });
});

describe("numbers and wording", () => {
  it("numbers invoices with the host's prefix", () => {
    expect(invoiceNumber("hill", 7)).toBe("HILL-0007");
    expect(invoiceNumber("", 12345)).toBe("INV-12345");
    expect(suggestPrefix("The Hill Rooms & Suites")).toBe("HILL");
  });
  it("describes the stay", () => {
    expect(stayDescription("Garden Room", 1, "12 Oct", "13 Oct")).toBe("Garden Room, 1 night (12 Oct to 13 Oct)");
  });
});

describe("cleanGuestDetails", () => {
  it("tidies an address and accepts a real email", () => {
    expect(cleanGuestDetails({ email: " jane@example.com ", address: " 1 High St \r\n\n Leeds " })).toEqual({
      ok: true, email: "jane@example.com", address: "1 High St\nLeeds",
    });
  });
  it("refuses a broken email", () => {
    expect(cleanGuestDetails({ email: "jane@", address: "" })).toEqual({ ok: false, problem: "email" });
  });
});

describe("invoiceOffered", () => {
  it("only for direct stays with a price, when switched on", () => {
    expect(invoiceOffered({ channel: "direct", stay_amount_pence: 12000 }, true)).toBe(true);
    expect(invoiceOffered({ channel: "airbnb", stay_amount_pence: 12000 }, true)).toBe(false);
    expect(invoiceOffered({ channel: "direct", stay_amount_pence: null }, true)).toBe(false);
    expect(invoiceOffered({ channel: "direct", stay_amount_pence: 12000 }, false)).toBe(false);
  });
});
