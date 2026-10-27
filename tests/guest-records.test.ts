import { describe, expect, it } from "vitest";

import {
  DEFAULT_RECORDS,
  ageOn,
  bookedPartySize,
  checkParty,
  deleteAfter,
  judgeId,
  keepsIdPhoto,
  last4Of,
  normaliseRecords,
  takesFacePhoto,
  type IdRead,
} from "../src/lib/guest-records";

describe("normaliseRecords", () => {
  it("fills defaults and ignores junk", () => {
    expect(normaliseRecords(null)).toEqual(DEFAULT_RECORDS);
    expect(normaliseRecords({ idPhoto: "yes", keepDays: 365 })).toEqual(DEFAULT_RECORDS);
    expect(normaliseRecords({ facePhoto: true, keepDays: 14 })).toMatchObject({
      facePhoto: true,
      keepDays: 14,
    });
  });
  it("never keeps photos until the host confirms registration", () => {
    const on = normaliseRecords({ idPhoto: true, facePhoto: true });
    expect(keepsIdPhoto(on)).toBe(false);
    expect(takesFacePhoto(on)).toBe(false);
    const confirmed = normaliseRecords({
      idPhoto: true,
      facePhoto: true,
      regulatorConfirmed: true,
    });
    expect(keepsIdPhoto(confirmed)).toBe(true);
    expect(takesFacePhoto(confirmed)).toBe(true);
  });
});

describe("bookedPartySize", () => {
  it("trusts counts the host typed or imported", () => {
    expect(bookedPartySize({ guest_count: 1, source: "manual" })).toBe(1);
    expect(bookedPartySize({ guest_count: 3, source: "csv" })).toBe(3);
  });
  it("treats a calendar's default of 1 as unknown", () => {
    expect(bookedPartySize({ guest_count: 1, source: "ical" })).toBeNull();
    expect(bookedPartySize({ guest_count: 2, source: "ical" })).toBe(2);
    expect(
      bookedPartySize({ guest_count: 1, source: "ical", manual_fields: ["guest_count"] }),
    ).toBe(1);
  });
});

describe("checkParty", () => {
  const base = {
    adults: 2,
    childAges: [] as number[],
    booked: 2,
    capacity: 2,
    childrenAllowed: true,
  };
  it("passes a party that fits the booking and the room", () => {
    expect(checkParty(base)).toEqual({
      total: 2,
      overCapacity: false,
      differsFromBooking: false,
      childrenNotAllowed: false,
    });
  });
  it("flags more people than the room sleeps, and a different count", () => {
    const r = checkParty({ ...base, adults: 3 });
    expect(r.overCapacity).toBe(true);
    expect(r.differsFromBooking).toBe(true);
  });
  it("only compares with the booking when the count is known", () => {
    expect(checkParty({ ...base, booked: null, adults: 1 }).differsFromBooking).toBe(false);
  });
  it("flags children in an adults-only room", () => {
    expect(
      checkParty({ ...base, adults: 1, childAges: [6], childrenAllowed: false }).childrenNotAllowed,
    ).toBe(true);
  });
});

describe("ageOn", () => {
  it("counts whole years and handles birthdays", () => {
    expect(ageOn("2008-10-12", "2026-10-12")).toBe(18);
    expect(ageOn("2008-10-13", "2026-10-12")).toBe(17);
    expect(ageOn("not a date", "2026-10-12")).toBeNull();
  });
});

describe("judgeId", () => {
  const good: IdRead = {
    isIdDocument: true,
    hasHolderPhoto: true,
    looksHomemade: false,
    documentType: "passport",
    fullName: "Priya Shah",
    dateOfBirth: "1990-01-01",
    expiryDate: "2030-01-01",
    issuingCountry: "United Kingdom",
    numberLast4: "1234",
    nationality: "GBR",
    documentNumber: "123451234",
    placeOfIssue: "HMPO",
  };
  it("accepts a printed photo ID", () => {
    expect(judgeId(good, "2026-10-12")).toEqual({ ok: true, expired: false });
  });
  it("refuses a name on paper or a document without a photo", () => {
    expect(judgeId({ ...good, looksHomemade: true }, "2026-10-12")).toEqual({
      ok: false,
      reason: "not_photo_id",
    });
    expect(judgeId({ ...good, hasHolderPhoto: false }, "2026-10-12")).toEqual({
      ok: false,
      reason: "not_photo_id",
    });
  });
  it("asks again when the name can't be read", () => {
    expect(judgeId({ ...good, fullName: "Priya" }, "2026-10-12")).toEqual({
      ok: false,
      reason: "unreadable",
    });
  });
  it("lets an expired ID through but says so", () => {
    expect(judgeId({ ...good, expiryDate: "2020-01-01" }, "2026-10-12")).toEqual({
      ok: true,
      expired: true,
    });
  });
});

describe("small helpers", () => {
  it("keeps only the last 4 of a document number", () => {
    expect(last4Of("12 345 678a")).toBe("678A");
    expect(last4Of("12")).toBeNull();
  });
  it("deletes a set number of days after check-out", () => {
    expect(deleteAfter("2026-10-14", 30)).toBe("2026-11-13");
  });
});
