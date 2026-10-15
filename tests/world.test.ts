import { describe, expect, it } from "vitest";

import { checkPhone, currencies, currencySymbol, formatOffset, isCurrency, isTimeZone, phoneCountries, splitPhone, timeZones, zoneCity, zoneOffset } from "../src/lib/world";

describe("currencies", () => {
  it("lists every current currency with a symbol, the usual three first", () => {
    const list = currencies();
    expect(list.length).toBeGreaterThan(100);
    expect(list.slice(0, 3).map((c) => c.code)).toEqual(["GBP", "EUR", "USD"]);
    expect(list.find((c) => c.code === "JPY")).toMatchObject({ name: "Japanese Yen", symbol: "¥" });
    expect(currencySymbol("GBP")).toBe("£");
    expect(currencySymbol("EUR")).toBe("€");
    expect(currencySymbol("INR")).toBe("₹");
    expect(isCurrency("GBP")).toBe(true);
    expect(isCurrency("XYZ")).toBe(false);
    expect(isCurrency("gbp")).toBe(false);
  });
});

describe("time zones", () => {
  it("lists the world's zones west to east with today's offset", () => {
    const zones = timeZones(new Date("2026-01-15T12:00:00Z"));
    expect(zones.length).toBeGreaterThan(300);
    expect(zones.find((z) => z.id === "Europe/London")?.offsetMinutes).toBe(0);
    expect(zones.find((z) => z.id === "Asia/Kolkata")?.label).toBe("(UTC+05:30) Kolkata · Asia");
    for (let i = 1; i < zones.length; i++) expect(zones[i]!.offsetMinutes).toBeGreaterThanOrEqual(zones[i - 1]!.offsetMinutes);
  });

  it("follows summer time and names cities plainly", () => {
    expect(zoneOffset("Europe/London", new Date("2026-07-01T12:00:00Z"))).toBe(60);
    expect(zoneOffset("America/New_York", new Date("2026-01-15T12:00:00Z"))).toBe(-300);
    expect(formatOffset(-300)).toBe("UTC−05:00");
    expect(zoneCity("America/Argentina/Buenos_Aires")).toBe("Buenos Aires, Argentina");
    expect(isTimeZone("Europe/London")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("phone numbers", () => {
  it("knows every country's dialling code, UK first", () => {
    const list = phoneCountries();
    expect(list[0]).toMatchObject({ iso: "GB", dial: "+44", flag: "🇬🇧" });
    expect(list.find((c) => c.iso === "IN")?.dial).toBe("+91");
  });

  it("checks numbers against the country's format and stores them in full", () => {
    expect(checkPhone("07400 123456", "GB")).toEqual({ ok: true, e164: "+447400123456", display: "+44 7400 123456" });
    expect(checkPhone("+44 7400 123456", "US")).toMatchObject({ ok: true, e164: "+447400123456" });
    expect(checkPhone("12345", "GB")).toEqual({ ok: false, problem: "invalid" });
    expect(checkPhone("  ", "GB")).toEqual({ ok: false, problem: "empty" });
    expect(checkPhone("(201) 555-0123", "US")).toMatchObject({ ok: true, e164: "+12015550123" });
  });

  it("splits a stored number back for editing", () => {
    expect(splitPhone("+447400123456")).toEqual({ country: "GB", national: "07400 123456" });
    expect(splitPhone(null, "IE")).toEqual({ country: "IE", national: "" });
  });
});
