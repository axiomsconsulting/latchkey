import { describe, expect, it } from "vitest";

import { bannerPath, CONSENT_VERSION, readConsent } from "@/lib/consent";
import { missingOperator, normaliseLegal, operatorDetails, operatorName } from "@/lib/legal";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const none = { gpc: false, dnt: false, legacyNoTrack: false };
const stored = (choice: string, at = "2026-10-01T00:00:00Z", v = CONSENT_VERSION) =>
  JSON.stringify({ v, choice, at });

describe("cookie consent", () => {
  it("asks until the visitor chooses", () => {
    expect(readConsent(null, none, NOW)).toBe("unset");
    expect(readConsent("not json", none, NOW)).toBe("unset");
  });

  it("keeps a choice for 12 months of the current version", () => {
    expect(readConsent(stored("yes"), none, NOW)).toBe("yes");
    expect(readConsent(stored("no"), none, NOW)).toBe("no");
    expect(readConsent(stored("yes", "2025-10-01T00:00:00Z"), none, NOW)).toBe("unset");
    expect(readConsent(stored("yes", undefined, CONSENT_VERSION + 1), none, NOW)).toBe("unset");
  });

  it("treats Global Privacy Control, Do Not Track and the old switch as no", () => {
    expect(readConsent(stored("yes"), { ...none, gpc: true }, NOW)).toBe("no");
    expect(readConsent(stored("yes"), { ...none, dnt: true }, NOW)).toBe("no");
    expect(readConsent(null, { ...none, legacyNoTrack: true }, NOW)).toBe("no");
  });

  it("shows the banner on our own pages only", () => {
    for (const p of ["/", "/about", "/start", "/app/today", "/partners/join", "/privacy"])
      expect(bannerPath(p)).toBe(true);
    for (const p of [
      "/kiosk/abc",
      "/stay/x",
      "/room/a-b-c",
      "/book/hill",
      "/hill-suites",
      "/apple",
    ])
      expect(bannerPath(p)).toBe(false);
  });
});

describe("operator details", () => {
  it("names a sole trader with their trading name and address", () => {
    const d = normaliseLegal({
      companyName: "Jo Bloggs",
      tradingName: "OMS Estates",
      registeredAddress: "1 High Street\nTown, AB1 2CD",
    });
    expect(operatorName(d)).toBe("Jo Bloggs, trading as OMS Estates");
    expect(operatorDetails(d)).toBe(
      "Jo Bloggs, trading as OMS Estates, of 1 High Street, Town, AB1 2CD",
    );
    expect(missingOperator(d)).toEqual([]);
  });

  it("names a company with its number and registered office", () => {
    const d = normaliseLegal({
      companyName: "Example Ltd",
      companyNumber: "01234567",
      registeredAddress: "2 Road, Town",
    });
    expect(operatorDetails(d)).toBe(
      "Example Ltd, a company registered in England and Wales with company number 01234567, whose registered office is at 2 Road, Town",
    );
  });

  it("is missing until the legal name and address are set, and strips markdown", () => {
    const d = normaliseLegal({ companyName: "**Jo** {{x}}" });
    expect(operatorName(d)).toBe("Jo x");
    expect(operatorDetails(d)).toBeNull();
    expect(missingOperator(normaliseLegal({}))).toEqual(["companyName", "registeredAddress"]);
  });
});
