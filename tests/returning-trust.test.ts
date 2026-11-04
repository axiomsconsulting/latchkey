import { describe, expect, it } from "vitest";

import { homeDestination } from "@/lib/hotel-register";
import {
  isMaskedDocument,
  maskDocument,
  passHolds,
  worthRemembering,
  type IdPass,
} from "@/lib/returning-trust";

const pass = (o: Partial<IdPass> = {}): IdPass => ({
  booking_id: "old",
  full_name: "Anna Nowak",
  document_expiry: "2030-01-01",
  keep_until: "2027-03-01",
  ...o,
});
const stay = { id: "new", guest_full_name: "Anna Nowak", check_in_date: "2026-11-04" };
const today = "2026-11-04";

describe("when an earlier ID check still holds", () => {
  it("holds for the same name, inside 12 months, with a valid ID", () => {
    expect(passHolds(pass(), stay, today)).toBe(true);
  });
  it("not past its keep date", () => {
    expect(passHolds(pass({ keep_until: "2026-11-03" }), stay, today)).toBe(false);
  });
  it("not if the ID has expired by arrival, even if it was valid today", () => {
    expect(passHolds(pass({ document_expiry: "2026-11-03" }), stay, today)).toBe(false);
    expect(
      passHolds(
        pass({ document_expiry: "2026-12-01" }),
        { ...stay, check_in_date: "2027-01-01" },
        today,
      ),
    ).toBe(false);
  });
  it("not for a different or missing name on the booking", () => {
    expect(passHolds(pass(), { ...stay, guest_full_name: "Piotr Nowak" }, today)).toBe(false);
    expect(passHolds(pass(), { ...stay, guest_full_name: null }, today)).toBe(false);
  });
  it("not from this stay's own check", () => {
    expect(passHolds(pass({ booking_id: "new" }), stay, today)).toBe(false);
  });
  it("only remembers a matched ID with time left", () => {
    expect(worthRemembering("matched", "2030-01-01", today)).toBe(true);
    expect(worthRemembering("partial", "2030-01-01", today)).toBe(false);
    expect(worthRemembering("matched", "2020-01-01", today)).toBe(false);
    expect(worthRemembering("matched", null, today)).toBe(false);
  });
});

describe("on a shared screen", () => {
  it("shows only the end of a document number", () => {
    expect(maskDocument("AB1234567")).toBe("••••4567");
    expect(isMaskedDocument(maskDocument("AB1234567"))).toBe(true);
    expect(isMaskedDocument("AB1234567")).toBe(false);
    expect(maskDocument("12")).toBeNull();
  });
});

describe("going home", () => {
  it("fills in their country", () => {
    expect(homeDestination("PL")).toBe("Home (Poland)");
  });
  it("still works without one", () => {
    expect(homeDestination(null)).toBe("Home");
    expect(homeDestination("XX")).toBe("Home");
  });
});
