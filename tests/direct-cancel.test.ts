import { describe, expect, it } from "vitest";

import {
  cancelPolicy,
  cleanRefund,
  groupReservations,
  refundMethod,
} from "../src/lib/direct-cancel";

const r = (o: Record<string, unknown> = {}) =>
  ({
    status: "paid",
    method: "card",
    plan: "flex",
    free_cancel_until: "2026-12-01",
    check_in: "2026-12-05",
    total_pence: 20000,
    ...o,
  }) as never;

describe("cancelPolicy", () => {
  it("refundable rate, paid by card, before the date: free, all back by card", () => {
    expect(cancelPolicy(r(), "2026-12-01")).toMatchObject({
      guestCan: true,
      free: true,
      refundPence: 20000,
      refund: "card",
      needsHost: false,
    });
  });
  it("paid by bank: the host pays it back", () => {
    expect(cancelPolicy(r({ method: "bank" }), "2026-11-20")).toMatchObject({
      refundPence: 20000,
      refund: "by_host",
    });
  });
  it("not paid yet and still free: nothing to give back", () => {
    expect(
      cancelPolicy(r({ status: "confirmed", method: "property" }), "2026-11-20"),
    ).toMatchObject({ guestCan: true, refundPence: 0, refund: "none" });
  });
  it("past the date, paid: they can release the room, with nothing back", () => {
    expect(cancelPolicy(r(), "2026-12-02")).toMatchObject({
      guestCan: true,
      free: false,
      refundPence: 0,
      refund: "none",
    });
  });
  it("non-refundable, paid: the same", () => {
    expect(
      cancelPolicy(r({ plan: "nonref", free_cancel_until: null }), "2026-11-20"),
    ).toMatchObject({ guestCan: true, refundPence: 0 });
  });
  it("still owing under the terms: only the host can cancel", () => {
    expect(
      cancelPolicy(
        r({ plan: "nonref", free_cancel_until: null, status: "confirmed", method: "property" }),
        "2026-11-20",
      ),
    ).toMatchObject({ guestCan: false, needsHost: true, open: true });
    expect(cancelPolicy(r({ status: "pending", method: "bank" }), "2026-12-02")).toMatchObject({
      guestCan: false,
      needsHost: true,
    });
  });
  it("from arrival day it's for the host", () => {
    expect(cancelPolicy(r({ free_cancel_until: "2026-12-05" }), "2026-12-05")).toMatchObject({
      guestCan: false,
      needsHost: true,
    });
  });
  it("already over: nothing to do", () => {
    for (const status of ["cancelled", "expired"])
      expect(cancelPolicy(r({ status }), "2026-11-20")).toMatchObject({
        open: false,
        guestCan: false,
        needsHost: false,
      });
  });
});

describe("refunds the host chooses", () => {
  it("are never more than was paid", () => {
    expect(cleanRefund(30000, { status: "paid", total_pence: 20000 })).toBe(20000);
    expect(cleanRefund(5000, { status: "paid", total_pence: 20000 })).toBe(5000);
    expect(cleanRefund(-1, { status: "paid", total_pence: 20000 })).toBe(0);
    expect(cleanRefund(5000, { status: "confirmed", total_pence: 20000 })).toBe(0);
  });
  it("go by card only for a card payment", () => {
    expect(refundMethod("card", 1)).toBe("card");
    expect(refundMethod("bank", 1)).toBe("by_host");
    expect(refundMethod("card", 0)).toBe("none");
  });
});

describe("the bookings list", () => {
  const row = (id: string, o: Record<string, unknown>) => ({
    id,
    status: "paid",
    method: "card",
    check_in: "2026-12-05",
    check_out: "2026-12-07",
    refund_status: null,
    ...o,
  });
  it("puts what needs the host first, then what's coming, then what's over", () => {
    const g = groupReservations(
      [
        row("old", { check_in: "2026-01-01", check_out: "2026-01-03" }),
        row("later", { check_in: "2027-01-01", check_out: "2027-01-02" }),
        row("soon", {}),
        row("transfer", { status: "pending", method: "bank" }),
        row("refund", { status: "cancelled", method: "bank", refund_status: "to_do" }),
        row("gone", { status: "cancelled" }),
        row("expired", { status: "expired" }),
      ],
      "2026-11-04",
    );
    expect(g.attention.map((r) => r.id).sort()).toEqual(["refund", "transfer"]);
    expect(g.upcoming.map((r) => r.id)).toEqual(["soon", "later"]);
    expect(g.finished.map((r) => r.id)[2]).toBe("old");
    expect(g.finished).toHaveLength(3);
  });
});
