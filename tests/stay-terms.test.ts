import { describe, expect, it } from "vitest";

import {
  addressProblem,
  allTicked,
  bookingTermsText,
  cancellationText,
  countryAdvice,
  emptyAnswers,
  keyPoints,
  licenceText,
  needsLicence,
  normaliseStayTerms,
  stayLengthAdvice,
  termsProblem,
  textSha256,
  tooLong,
  type TermsContext,
} from "@/lib/stay-terms";

const terms = normaliseStayTerms(null);
const ctx: TermsContext = {
  host: "Trinity Suites Ltd",
  property: "The Trinity Suites",
  propertyAddress: "1 High St, HP11 1AA",
  country: "GB",
  rooms: ["Room 2"],
  guestName: "Alex Doe",
  checkIn: "2026-12-01",
  checkOut: "2026-12-29",
  nights: 28,
  guests: 1,
  checkInFrom: "15:00",
  checkOutBy: "11:00",
  quietHours: "22:00 to 07:00",
  cancellation: cancellationText({ plan: "flex", freeUntil: "2026-11-24" }),
  total: "£2,240.00",
  terms,
  homeAddress: {
    line1: "5 Oak Road",
    line2: "",
    city: "Leeds",
    postcode: "LS1 1AA",
    country: "GB",
  },
  purpose: "work",
};

describe("terms for direct stays", () => {
  it("starts at 28 nights for both the limit and the licence, and keeps choices in range", () => {
    expect(terms).toMatchObject({ maxNights: 28, licenceFrom: 28, serviceDays: 7 });
    const t = normaliseStayTerms({
      maxNights: 400,
      licenceFrom: -3,
      serviceDays: 30,
      houseRules: " x ",
    });
    expect(t).toEqual({
      maxNights: 365,
      licenceFrom: 0,
      serviceDays: 14,
      houseRules: "x",
      insurance: null,
      policyMaxNights: null,
    });
    // A licence can't start later than four weeks; past that every stay signs.
    const late = normaliseStayTerms({ maxNights: 120, licenceFrom: 60 });
    expect(late.licenceFrom).toBe(28);
    expect(needsLicence({ ...late, licenceFrom: 90 }, 29)).toBe(true);
    expect(needsLicence(terms, 27)).toBe(false);
    expect(needsLicence(terms, 28)).toBe(true);
    expect(tooLong(terms, 29)).toBe(true);
    expect(needsLicence({ ...terms, licenceFrom: 0 }, 1)).toBe(true);
  });

  it("writes the booking terms with the stay's details and the host's rules", () => {
    const text = bookingTermsText({ ...ctx, terms: { ...terms, houseRules: "No pets." } });
    expect(text).toContain("Between Trinity Suites Ltd");
    expect(text).toContain("28 nights, for 1 guest");
    expect(text).toContain("You can cancel free of charge until");
    expect(text).toContain("## House rules\n\nNo pets.");
    expect(text).toContain("part of the United Kingdom");
  });

  it("writes the licence with the declared home, purpose and access", () => {
    const text = licenceText(ctx);
    expect(text).toContain("not a tenancy or a lease");
    expect(text).toContain("5 Oak Road, Leeds, LS1 1AA, GB");
    expect(text).toContain("Work or a temporary assignment");
    expect(text).toContain("at least every 7 days");
  });

  it("fingerprints the exact text", async () => {
    const a = await textSha256(licenceText(ctx));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await textSha256(licenceText({ ...ctx, guestName: "Alex Doe " }))).not.toBe(a);
  });

  it("asks for a real permanent home, not the property", () => {
    const a = { line1: "5 Oak Road", line2: "", city: "Leeds", postcode: "LS1 1AA", country: "GB" };
    expect(addressProblem(a)).toBeNull();
    expect(addressProblem({ ...a, line1: "" })).not.toBeNull();
    expect(addressProblem({ ...a, postcode: "" })).not.toBeNull();
    expect(addressProblem({ ...a, postcode: "hp11 1aa" }, "HP11 1AA")).toContain("permanent home");
    expect(addressProblem({ ...a, country: "FR", postcode: "" })).toBeNull();
  });

  it("asks one confirmation for a licence, still taking older pages' separate ticks", () => {
    expect(allTicked(false, ["terms"])).toBe(true);
    expect(allTicked(false, ["agree_all"])).toBe(false);
    expect(allTicked(true, ["terms"])).toBe(false);
    expect(allTicked(true, ["agree_all"])).toBe(true);
    expect(allTicked(true, ["terms", "home", "licence", "access"])).toBe(false);
    expect(allTicked(true, ["terms", "home", "licence", "access", "leave"])).toBe(true);
  });

  it("puts the key points the guest confirms at the top of the kept licence", () => {
    const points = keyPoints(ctx);
    expect(points).toHaveLength(4);
    expect(points.join(" ")).toContain("not a tenancy");
    expect(points.join(" ")).toContain("every 7 days");
    expect(points.join(" ")).toContain("29 Dec 2026");
    const text = licenceText(ctx);
    for (const k of points) expect(text).toContain(`- ${k}`);
    expect(text.indexOf("## Key points")).toBeLessThan(text.indexOf("## 1. What this is"));
  });

  it("says what's missing before booking, in order", () => {
    const a = emptyAnswers("GB");
    expect(termsProblem(false, a)?.kind).toBe("ticks");
    expect(termsProblem(false, { ...a, ticks: ["terms"] })).toBeNull();
    expect(termsProblem(true, a)?.kind).toBe("home");
    const home = { ...a, homeAddress: ctx.homeAddress! };
    expect(termsProblem(true, home)?.kind).toBe("purpose");
    const why = { ...home, purpose: "work" as const };
    expect(termsProblem(true, why)?.kind).toBe("ticks");
    const ticked = { ...why, ticks: ["agree_all"] };
    expect(termsProblem(true, ticked)?.kind).toBe("sign");
    expect(
      termsProblem(true, { ...ticked, typedName: "Alex Doe", signature: "data:x" }),
    ).toBeNull();
    expect(termsProblem(true, ticked, "LS1 1AA")?.message).toContain("permanent home");
  });

  it("lets the policy's own longest stay lead the advice, with warnings past it", () => {
    const base = { maxNights: 28, insurance: null, policyMaxNights: null };
    expect(stayLengthAdvice("GB", base)).toMatchObject({ suggestedMax: 28, warnings: [] });
    expect(stayLengthAdvice("GB", { ...base, maxNights: 120 }).warnings[0]).toContain("insurance");
    const covered = { maxNights: 120, insurance: "str_host" as const, policyMaxNights: 365 };
    const ok = stayLengthAdvice("GB", covered);
    expect(ok.suggestedMax).toBe(365);
    expect(ok.warnings).toEqual([]);
    expect(ok.insuranceNote).toContain("policy wording");
    expect(stayLengthAdvice("GB", { ...covered, policyMaxNights: 90 }).warnings[0]).toContain(
      "up to 90",
    );
    expect(stayLengthAdvice("GB", { ...base, insurance: "home" }).warnings[0]).toContain(
      "home insurer",
    );
  });

  it("gives country advice that says to check, never that something is allowed", () => {
    for (const c of ["GB", "US", "FR", "ES", "DE", null]) {
      const a = countryAdvice(c);
      expect(a.note.toLowerCase()).toContain("check");
      expect(a.suggestedMax).toBeLessThanOrEqual(90);
    }
    expect(countryAdvice("FR").suggestedMax).toBe(90);
  });
});

describe("the kept PDF", () => {
  it("holds the text and the signing record", async () => {
    const { stayAgreementPdf } = await import("@/lib/stay-terms-pdf.server");
    const text = licenceText(ctx);
    const bytes = await stayAgreementPdf(text, {
      id: "rec-1",
      kind: "licence",
      version: "1.0",
      property: "The Trinity Suites",
      reference: "TS-123",
      guestName: "Alex Doe",
      guestEmail: "alex@example.com",
      guestPhone: "+447700900123",
      renderedSha256: await textSha256(text),
      ticks: ["agree_all"],
      homeAddress: "5 Oak Road, Leeds, LS1 1AA, GB",
      purpose: "Work or a temporary assignment",
      typedName: "Alex Doe",
      signedAt: "2026-11-02T12:00:00Z",
      ip: "203.0.113.5",
      userAgent: "Test",
      signaturePng: null,
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(3000);
  });
});
