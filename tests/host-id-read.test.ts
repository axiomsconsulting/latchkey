import { describe, expect, it } from "vitest";

import { hostReadOutcome } from "@/lib/host-id-read";

describe("an ID photo the host added", () => {
  it("checks the lead guest's name against the booking", () => {
    expect(
      hostReadOutcome({
        position: 0,
        readable: true,
        idName: "ANNA NOWAK",
        bookingName: "Anna Nowak",
      }),
    ).toEqual({ nameMatch: "matched", idChecked: true, status: "matched" });
    expect(
      hostReadOutcome({
        position: 0,
        readable: true,
        idName: "Piotr Kowal",
        bookingName: "Anna Nowak",
      }),
    ).toEqual({ nameMatch: "not_matched", idChecked: true, status: "not_matched" });
  });
  it("reads a stay with no name yet as checked", () => {
    expect(
      hostReadOutcome({ position: 0, readable: true, idName: "Anna Nowak", bookingName: null }),
    ).toEqual({ nameMatch: null, idChecked: true, status: "id_read" });
  });
  it("marks other adults checked without touching the stay", () => {
    expect(
      hostReadOutcome({
        position: 2,
        readable: true,
        idName: "Jan Nowak",
        bookingName: "Anna Nowak",
      }),
    ).toEqual({ nameMatch: null, idChecked: true, status: null });
  });
  it("keeps an unreadable photo as added by the host, not checked", () => {
    expect(
      hostReadOutcome({ position: 0, readable: false, idName: null, bookingName: "Anna Nowak" }),
    ).toEqual({ nameMatch: null, idChecked: false, status: "host_added" });
    expect(
      hostReadOutcome({ position: 1, readable: false, idName: "x", bookingName: "Anna Nowak" })
        .status,
    ).toBeNull();
  });
});
