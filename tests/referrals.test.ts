/**
 * Identity keys for Commission Partner referrals: the same person, business,
 * address or listing matches however it was typed, and partners only ever
 * see a business as initials and town.
 */
import { describe, expect, it } from "vitest";

import {
  businessDomain,
  hostLabel,
  identityValues,
  normaliseAddress,
  normaliseCompanyNumber,
  normaliseEmail,
  normaliseName,
  normalisePhone,
  normaliseUrl,
} from "../src/lib/partner-identity";

describe("identity normalisation", () => {
  it("matches emails however they're typed", () => {
    expect(normaliseEmail(" Pat.Smith+latchkey@GoogleMail.com ")).toBe("patsmith@gmail.com");
    expect(normaliseEmail("pat.smith@oms.co.uk")).toBe("pat.smith@oms.co.uk");
    expect(normaliseEmail("nope")).toBeNull();
    expect(businessDomain("pat@gmail.com")).toBeNull();
    expect(businessDomain("pat@omsestates.uk")).toBe("omsestates.uk");
  });

  it("matches phones, names, company numbers, addresses and listings", () => {
    expect(normalisePhone("+44 (0)7700 900123")).toBe("+4407700900123");
    expect(normaliseName("The Hill Suites Ltd.")).toBe(normaliseName("hill suites limited"));
    expect(normaliseName("Café Rouge")).toBe("cafe rouge");
    expect(normaliseCompanyNumber("1234 567")).toBe("01234567");
    expect(normaliseCompanyNumber("sc123456")).toBe("SC123456");
    expect(normaliseAddress("12, High Street", "hp6 5aa")).toBe(
      normaliseAddress("12 High St", "HP65AA"),
    );
    expect(normaliseUrl("https://www.airbnb.co.uk/rooms/123/?check_in=2026-11-01")).toBe(
      "airbnb.co.uk/rooms/123",
    );
    expect(normaliseUrl("javascript:alert(1)")).toBeNull();
  });

  it("builds de-duplicated identity values", () => {
    const v = identityValues({
      emails: ["pat@oms.uk", "PAT@oms.uk", null],
      phones: ["+447700900123"],
      businessNames: ["Hill Suites"],
      ipHash: "ip",
      deviceHash: null,
    });
    expect(v).toEqual([
      { kind: "email", value: "pat@oms.uk" },
      { kind: "email_domain", value: "oms.uk" },
      { kind: "phone", value: "+447700900123" },
      { kind: "business_name", value: "hill suites" },
      { kind: "ip_hash", value: "ip" },
    ]);
  });

  it("shows partners initials and town only", () => {
    expect(hostLabel("The Hill Suites", "Amersham")).toBe("H.S. · Amersham");
    expect(hostLabel("", null)).toBe("Host");
  });
});
