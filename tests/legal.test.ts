import { describe, expect, it } from "vitest";
import { LEGAL_UPDATED, missingLegal, normaliseLegal, privacyContact } from "@/lib/legal";
import { privacyPolicy, termsOfService } from "@/content/legal";

describe("legal details", () => {
  it("normalises input and keeps a governing law", () => {
    const d = normaliseLegal({ companyName: "  Latchkey Ltd <b> ", contactEmail: "Hello@Example.com", privacyEmail: "not an email", governingLaw: "" });
    expect(d.companyName).toBe("Latchkey Ltd b");
    expect(d.contactEmail).toBe("hello@example.com");
    expect(d.privacyEmail).toBe("");
    expect(d.governingLaw).toBe("England and Wales");
    expect(privacyContact(d)).toBe("hello@example.com");
    expect(missingLegal(d)).toEqual(["registeredAddress", "icoNumber"]);
  });
  it("is a valid date", () => {
    expect(Number.isNaN(Date.parse(LEGAL_UPDATED))).toBe(false);
  });
  it("writes both documents with unique section ids, filling in the operator", () => {
    const d = normaliseLegal({ companyName: "Example Ltd", companyNumber: "01234567", registeredAddress: "1 High St, London", contactEmail: "hi@example.com", icoNumber: "ZA000000" });
    for (const doc of [privacyPolicy(d), termsOfService(d)]) {
      const ids = doc.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(JSON.stringify(doc)).toContain("Example Ltd");
    }
    expect(JSON.stringify(privacyPolicy(d))).toContain("ZA000000");
    expect(privacyPolicy(d).sections.some((s) => s.id === "statistics")).toBe(true);
    expect(JSON.stringify(termsOfService(d))).toContain("England and Wales");
  });
  it("describes what's really collected: partners, profiles, cookies and Google Drive", () => {
    const d = normaliseLegal({ companyName: "Example Ltd" });
    const doc = privacyPolicy(d);
    const text = JSON.stringify(doc);
    const partners = doc.sections.find((s) => s.id === "partners");
    expect(partners).toBeDefined();
    expect(JSON.stringify(partners)).toMatch(/30 days after we approve or reject/);
    expect(JSON.stringify(partners)).toMatch(/180 days/);
    expect(text).toMatch(/Visitor profiles/);
    expect(text).toMatch(/lk_ref/);
    expect(text).not.toMatch(/no cookies/i);
    expect(text).not.toMatch(/not used to train models/);
    expect(text).toMatch(/Google Drive/);
  });
  it("never leaves an empty placeholder when details are missing", () => {
    const text = JSON.stringify([privacyPolicy(normaliseLegal({})), termsOfService(normaliseLegal({}))]);
    expect(text).not.toMatch(/undefined|null|\(\)|: \.|  /);
  });
});
