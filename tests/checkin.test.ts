import { describe, expect, it } from "vitest";

import { compareNames } from "../src/lib/name-match";
import {
  checkoutChoices,
  findBooking,
  last4Matches,
  lockedUntil,
  methodSequence,
  nextMethod,
  normaliseMethods,
  shortName,
  surnameInitial,
  usesListFlow,
  type MatchableBooking,
} from "../src/lib/checkin-logic";

describe("compareNames", () => {
  it("matches regardless of case, order and middle names", () => {
    expect(compareNames("Priya Shah", "SHAH PRIYA ANJALI")).toBe("matched");
    expect(compareNames("Priya Shah", "priya a. shah")).toBe("matched");
    expect(compareNames("José Álvarez", "JOSE ALVAREZ")).toBe("matched");
  });
  it("returns partial when only one name agrees", () => {
    expect(compareNames("Priya Shah", "Anita Shah")).toBe("partial");
  });
  it("returns not matched for a different person or no text", () => {
    expect(compareNames("Priya Shah", "John Smith")).toBe("not_matched");
    expect(compareNames("Priya Shah", "")).toBe("not_matched");
  });
});

const today = "2026-09-29";
const b = (o: Partial<MatchableBooking>): MatchableBooking => ({
  id: "1",
  channel: "airbnb",
  status: "upcoming",
  check_in_date: today,
  check_out_date: "2026-10-01",
  guest_full_name: "Priya Shah",
  mirror_of: null,
  ...o,
});

describe("findBooking", () => {
  it("finds exactly one match on letter, check-out and platform", () => {
    expect(findBooking([b({})], today, { letter: "s", checkOut: "2026-10-01", channel: "airbnb" })?.id).toBe("1");
  });
  it("accepts yesterday's late arrivals but not older or future stays", () => {
    expect(findBooking([b({ check_in_date: "2026-09-28" })], today, { letter: "S", checkOut: "2026-10-01", channel: "airbnb" })).not.toBeNull();
    expect(findBooking([b({ check_in_date: "2026-09-27" })], today, { letter: "S", checkOut: "2026-10-01", channel: "airbnb" })).toBeNull();
    expect(findBooking([b({ check_in_date: "2026-09-30" })], today, { letter: "S", checkOut: "2026-10-01", channel: "airbnb" })).toBeNull();
  });
  it("refuses when two bookings match, or on wrong platform, or already checked in", () => {
    expect(findBooking([b({}), b({ id: "2", guest_full_name: "Sam Smith" })], today, { letter: "S", checkOut: "2026-10-01", channel: "airbnb" })).toBeNull();
    expect(findBooking([b({})], today, { letter: "S", checkOut: "2026-10-01", channel: "booking_com" })).toBeNull();
    expect(findBooking([b({ status: "checked_in" })], today, { letter: "S", checkOut: "2026-10-01", channel: "airbnb" })).toBeNull();
  });
  it("reads the surname initial", () => {
    expect(surnameInitial("ade okafor")).toBe("O");
    expect(surnameInitial(null)).toBeNull();
    expect(shortName("Priya Anjali Shah")).toBe("Priya S.");
  });
});

describe("checkout choices", () => {
  it("starts tomorrow in the day and today in the small hours", () => {
    expect(checkoutChoices(today, 15)[0]).toBe("2026-09-30");
    expect(checkoutChoices(today, 2)[0]).toBe(today);
    expect(checkoutChoices(today, 15)).toHaveLength(7);
  });
});

describe("lockout", () => {
  const now = new Date("2026-09-29T20:00:00Z");
  const at = (min: number, ok = false) => ({ succeeded: ok, created_at: new Date(now.getTime() - min * 60_000).toISOString() });
  it("locks after 3 fails within 10 minutes, for 10 minutes from the last", () => {
    expect(lockedUntil([at(1), at(2), at(3)], now)?.toISOString()).toBe("2026-09-29T20:09:00.000Z");
  });
  it("does not lock after a success or when fails are old", () => {
    expect(lockedUntil([at(1), at(2), at(3, true), at(4)], now)).toBeNull();
    expect(lockedUntil([at(1), at(2), at(15)], now)).toBeNull();
  });
});

describe("identity method fallback", () => {
  it("follows the host's order and always ends with self-declaration", () => {
    const m = normaliseMethods({ order: ["last4", "photo_id"], enabled: { photo_id: true, last4: true, self_declare: false } });
    expect(methodSequence(m, { last4: true })).toEqual(["last4", "photo_id", "self_declare"]);
    expect(methodSequence(m, { last4: false })).toEqual(["photo_id", "self_declare"]);
    expect(nextMethod(["photo_id", "self_declare"], "photo_id")).toBe("self_declare");
  });
  it("uses the pick-your-booking list when both checks are off", () => {
    expect(usesListFlow(normaliseMethods({ enabled: { photo_id: false, last4: false, self_declare: true } }))).toBe(true);
    expect(usesListFlow(normaliseMethods(null))).toBe(false);
  });
  it("compares last 4 ignoring spaces and case", () => {
    expect(last4Matches("HMABCD1234", "1234")).toBe(true);
    expect(last4Matches("07700 900142", "0142")).toBe(true);
    expect(last4Matches("HS-55219", "5218")).toBe(false);
  });
});
