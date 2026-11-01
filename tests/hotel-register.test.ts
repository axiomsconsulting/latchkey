import { describe, expect, it } from "vitest";

import {
  SCHEDULE_3,
  cleanRegisterEntry,
  isAlien,
  isNationality,
  nationalityFromId,
  suggestedNationality,
  nationalityName,
  nationalityOptions,
  registerApplies,
  registerCsv,
  registerFromRead,
  registerKeepUntil,
  registerPositions,
} from "../src/lib/hotel-register";

describe("who the Order treats as an alien", () => {
  it("lists all 56 Schedule 3 countries, each once", () => {
    expect(SCHEDULE_3).toHaveLength(56);
    expect(new Set(SCHEDULE_3).size).toBe(56);
    for (const c of SCHEDULE_3) expect(isNationality(c)).toBe(true);
  });

  it("is not British, Irish or Commonwealth", () => {
    for (const c of [
      "GB",
      "GB-OTC",
      "GB-BNO",
      "GB-BPP",
      "IE",
      "IN",
      "AU",
      "CA",
      "NG",
      "LK",
      "ZW",
      "GA",
      "TG",
    ]) {
      expect(isAlien(c)).toBe(false);
    }
    for (const c of ["FR", "DE", "US", "CN", "BR", "HK", "XX"]) expect(isAlien(c)).toBe(true);
  });
});

describe("nationalities", () => {
  it("names countries and British statuses in plain English", () => {
    expect(nationalityName("FR")).toBe("France");
    expect(nationalityName("GB-BNO")).toBe("British National (Overseas)");
  });

  it("puts British and Irish first and every option is valid", () => {
    const list = nationalityOptions();
    expect(list.slice(0, 2).map((o) => o.code)).toEqual(["GB", "IE"]);
    expect(new Set(list.map((o) => o.code)).size).toBe(list.length);
    for (const o of list) expect(isNationality(o.code)).toBe(true);
  });

  it("reads what passports print", () => {
    expect(nationalityFromId("GBR")).toBe("GB");
    expect(nationalityFromId("British Citizen")).toBe("GB");
    expect(nationalityFromId("U.K.")).toBe("GB");
    expect(nationalityFromId("Great Britain")).toBe("GB");
    expect(nationalityFromId("PK")).toBe("PK");
    expect(nationalityFromId("D")).toBe("DE");
    expect(nationalityFromId("FRA")).toBe("FR");
    expect(nationalityFromId("France")).toBe("FR");
    expect(nationalityFromId("Atlantis")).toBeNull();
  });
});

describe("who is registered", () => {
  it("is every adult and children from 16", () => {
    expect(registerPositions(2, [4, 16, 17, 15])).toEqual([0, 1, 3, 4]);
  });

  it("applies to UK properties only", () => {
    expect(registerApplies("GB")).toBe(true);
    expect(registerApplies(null)).toBe(true);
    expect(registerApplies("US")).toBe(false);
  });

  it("keeps entries for 12 months from arrival", () => {
    expect(registerKeepUntil("2026-10-12")).toBe("2027-10-12");
    expect(registerKeepUntil("2028-02-29")).toBe("2029-03-01");
  });
});

describe("cleanRegisterEntry", () => {
  it("needs only name and nationality from British, Irish and Commonwealth guests", () => {
    const r = cleanRegisterEntry({
      fullName: " Priya  Shah ",
      nationality: "in",
      documentNumber: "X123",
      nextDestination: "Leeds",
    });
    expect(r).toEqual({
      ok: true,
      entry: {
        fullName: "Priya Shah",
        nationality: "IN",
        alien: false,
        documentNumber: null,
        placeOfIssue: null,
        nextDestination: null,
        nextAddress: null,
      },
    });
  });

  it("needs document details and next destination from everyone else", () => {
    expect(cleanRegisterEntry({ fullName: "Jean Dupont", nationality: "FR" })).toEqual({
      ok: false,
      missing: ["document", "place", "destination"],
    });
    const r = cleanRegisterEntry({
      fullName: "Jean Dupont",
      nationality: "FR",
      documentNumber: "18ab12345",
      placeOfIssue: "Paris",
      nextDestination: "Edinburgh",
    });
    expect(r.ok && r.entry).toMatchObject({
      alien: true,
      documentNumber: "18AB12345",
      nextAddress: null,
    });
  });

  it("refuses a single name or an unknown nationality", () => {
    expect(cleanRegisterEntry({ fullName: "Priya", nationality: "ZZ" })).toEqual({
      ok: false,
      missing: ["name", "nationality"],
    });
  });
});

describe("registerCsv", () => {
  it("writes one safe line per guest", () => {
    const csv = registerCsv([
      {
        arrival_date: "2026-10-12",
        full_name: "=Jean, Dupont",
        nationality: "FR",
        document_number: "18AB12345",
        place_of_issue: "Paris",
        next_destination: "Edinburgh",
        next_address: null,
        property_name: "Hill",
        room_name: "Garden",
      },
    ]);
    expect(csv.split("\r\n")[1]).toBe(
      `2026-10-12,"'=Jean, Dupont",France,18AB12345,Paris,Edinburgh,,Hill,Garden`,
    );
  });
});

describe("the register from a guest's ID", () => {
  it("keeps a British or Irish guest's entry without asking anything", () => {
    const plan = registerFromRead({
      fullName: "Priya Shah",
      nationality: "GBR",
      documentNumber: "123456789",
      placeOfIssue: null,
    });
    expect(plan).toEqual({
      kind: "saved",
      entry: {
        fullName: "Priya Shah",
        nationality: "GB",
        alien: false,
        documentNumber: null,
        placeOfIssue: null,
        nextDestination: null,
        nextAddress: null,
      },
    });
  });

  it("asks only for nationality when the ID doesn't print it (a UK driving licence)", () => {
    expect(
      registerFromRead({
        fullName: "Sam Jones",
        nationality: null,
        documentNumber: "JONES801234SJ9AB",
        placeOfIssue: "DVLA",
      }),
    ).toMatchObject({ kind: "ask", missing: ["nationality"] });
  });

  it("asks a guest from outside the Commonwealth only where they go next", () => {
    const plan = registerFromRead({
      fullName: "Jean Dupont",
      nationality: "FRA",
      documentNumber: "18AB12345",
      placeOfIssue: null,
      issuingCountry: "France",
    });
    expect(plan).toMatchObject({
      kind: "ask",
      missing: ["destination"],
      input: { nationality: "FR", placeOfIssue: "France" },
    });
  });

  it("asks nothing when the ID couldn't be read: the host adds them from the photo", () => {
    expect(registerFromRead(null)).toEqual({ kind: "later" });
    expect(
      registerFromRead({
        fullName: "X",
        nationality: "GBR",
        documentNumber: null,
        placeOfIssue: null,
      }),
    ).toEqual({ kind: "later" });
  });
});

describe("suggestedNationality", () => {
  it("prefers the printed nationality, else the issuing country to confirm", () => {
    expect(suggestedNationality({ nationality: "FRA", issuingCountryCode: "GB" })).toBe("FR");
    // A UK driving licence prints no nationality.
    expect(suggestedNationality({ nationality: null, issuingCountryCode: "GB" })).toBe("GB");
    expect(suggestedNationality({ nationality: null, issuingCountry: "United Kingdom" })).toBe(
      "GB",
    );
    expect(suggestedNationality({ nationality: null })).toBeNull();
  });
});
