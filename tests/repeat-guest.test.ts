import { describe, expect, it } from "vitest";

import { arrivalText, normaliseArrivals } from "@/lib/checkout-goodbye";
import { nameKey, sameGuest, stayedBefore, type GuestStay } from "@/lib/repeat-guest";

const past = (o: Partial<GuestStay> = {}): GuestStay => ({
  id: "old",
  status: "checked_out",
  guest_full_name: "Anna Nowak",
  guest_email: null,
  guest_phone: null,
  check_in_date: "2026-03-01",
  check_out_date: "2026-03-04",
  ...o,
});
const now = {
  id: "new",
  guest_full_name: "Anna Nowak",
  guest_email: null,
  guest_phone: null,
  check_in_date: "2026-11-04",
};

describe("who counts as returning", () => {
  it("reads names in any order, without accents or case", () => {
    expect(nameKey("José  GARCÍA")).toEqual(nameKey("garcia jose"));
  });
  it("needs a full name, a real email or the same phone", () => {
    const blank = { guest_full_name: null, guest_email: null, guest_phone: null };
    expect(
      sameGuest({ ...blank, guest_full_name: "Anna" }, { ...blank, guest_full_name: "Anna" }),
    ).toBe(false);
    expect(
      sameGuest({ ...blank, guest_email: "A@x.com" }, { ...blank, guest_email: "a@x.com" }),
    ).toBe(true);
    expect(
      sameGuest(
        { ...blank, guest_phone: "+447700900000" },
        { ...blank, guest_phone: "+447700900000" },
      ),
    ).toBe(true);
    expect(
      sameGuest(
        { ...blank, guest_full_name: "Anna Nowak" },
        { ...blank, guest_full_name: "Anna Kowal" },
      ),
    ).toBe(false);
  });
  it("doesn't match on a booking site's relay address", () => {
    const relay = { guest_full_name: null, guest_phone: null, guest_email: "x@guest.airbnb.com" };
    expect(sameGuest(relay, relay)).toBe(false);
  });
  it("counts an earlier real stay", () => {
    expect(stayedBefore(now, [past()])).toBe(true);
  });
  it("ignores cancelled, closed, hidden and mirrored stays, and the stay itself", () => {
    expect(stayedBefore(now, [past({ status: "cancelled" })])).toBe(false);
    expect(stayedBefore(now, [past({ status: "blocked" })])).toBe(false);
    expect(stayedBefore(now, [past({ archived_at: "2026-04-01" })])).toBe(false);
    expect(stayedBefore(now, [past({ mirror_of: "other" })])).toBe(false);
    expect(stayedBefore(now, [past({ id: "new" })])).toBe(false);
  });
  it("treats back-to-back dates as an extension, not a return", () => {
    expect(stayedBefore(now, [past({ check_out_date: "2026-11-04" })])).toBe(false);
  });
});

describe("check-in card wording", () => {
  it("uses the returning words only for someone returning", () => {
    const a = normaliseArrivals(null);
    expect(arrivalText(a, "Anna")).toMatch(/^Welcome, Anna/);
    expect(arrivalText(a, "Anna", true)).toMatch(/^Welcome back, Anna/);
  });
  it("keeps saved cards and adds the default words", () => {
    const a = normaliseArrivals({ message: "Hello {name}" });
    expect(a.message).toBe("Hello {name}");
    expect(a.messageAgain).toMatch(/Welcome back/);
  });
});
