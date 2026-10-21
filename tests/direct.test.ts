import { describe, expect, it } from "vitest";

import { consentText, enquiryProblem, isReturning, nightsBetween, replyMailto } from "../src/lib/direct";

const ok = { name: "Priya Shah", email: "priya@example.com", checkIn: "2026-11-02", checkOut: "2026-11-05", guests: 2 };
const TODAY = "2026-10-21";

describe("repeat direct stays", () => {
  it("keeps consent wording plain and specific", () => {
    expect(consentText("The Hill Suites")).toContain("The Hill Suites to contact me by email about future stays");
    expect(consentText("The Hill Suites")).toContain("withdraw");
  });

  it("checks an enquiry before it reaches the host", () => {
    expect(enquiryProblem(ok, TODAY)).toBeNull();
    expect(enquiryProblem({ ...ok, name: " " }, TODAY)).toMatch(/name/);
    expect(enquiryProblem({ ...ok, email: "not-an-email" }, TODAY)).toMatch(/email/);
    expect(enquiryProblem({ ...ok, checkIn: "2026-10-01" }, TODAY)).toMatch(/passed/);
    expect(enquiryProblem({ ...ok, checkOut: "2026-11-02" }, TODAY)).toMatch(/after/);
    expect(enquiryProblem({ ...ok, checkOut: "2027-02-01" }, TODAY)).toMatch(/60 nights/);
    expect(enquiryProblem({ ...ok, guests: 0 }, TODAY)).toMatch(/guests/);
    expect(nightsBetween(ok.checkIn, ok.checkOut)).toBe(3);
  });

  it("recognises a returning guest by email, whatever the case", () => {
    expect(isReturning(" Priya@Example.com ", ["priya@example.com"])).toBe(true);
    expect(isReturning("new@example.com", ["priya@example.com", ""])).toBe(false);
  });

  it("writes a reply from the host's own mailbox, with a way to stop hearing from them", () => {
    const link = replyMailto({ email: "priya@example.com", business: "The Hill Suites", checkIn: "2026-11-02", checkOut: "2026-11-05", name: "Priya Shah", withdrawUrl: "https://x/stay-again/withdraw/abc" });
    expect(link.startsWith("mailto:priya%40example.com?subject=")).toBe(true);
    const body = decodeURIComponent(link.split("&body=")[1]!);
    expect(body.startsWith("Hello Priya,")).toBe(true);
    expect(body).toContain("https://x/stay-again/withdraw/abc");
  });
});
