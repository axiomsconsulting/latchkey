import { describe, expect, it } from "vitest";

import { normaliseDirectBooking } from "@/lib/direct-booking";
import {
  monthPeriod,
  newVoucherCode,
  normaliseCode,
  normalisePeriods,
  quoteWithVoucher,
  shareLinks,
  voucherMessage,
  voucherProblem,
  type Voucher,
} from "@/lib/vouchers";

const v: Voucher = {
  code: "STAY-7KQ2PX",
  guestName: "Alex Doe",
  roomIds: ["r1"],
  periods: [monthPeriod("2027-03")],
  kind: "percent",
  value: 20,
  status: "active",
};
const settings = normaliseDirectBooking({
  instant: true,
  nonRef: { enabled: true, kind: "percent", value: 10 },
});
const offers = [
  { id: "o", label: "Spring", from: "2027-03-01", to: "2027-04-30", percent: 30, roomIds: null },
];

describe("loyalty vouchers", () => {
  it("makes readable codes and tidies what guests type", () => {
    expect(newVoucherCode(() => 0)).toBe("STAY-AAAAAA");
    expect(newVoucherCode()).toMatch(/^STAY-[A-HJKMNP-Z2-9]{6}$/);
    expect(normaliseCode(" stay-7kq 2px ")).toBe("STAY-7KQ2PX");
  });

  it("turns months, days and ranges into clean periods", () => {
    expect(monthPeriod("2027-02")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(monthPeriod("2027-12")).toEqual({ from: "2027-12-01", to: "2027-12-31" });
    expect(
      normalisePeriods([
        { from: "2027-03-10", to: "2027-03-05" },
        { from: "2027-03-11", to: "2027-03-12" },
        { from: "2027-05-01", to: "2027-05-01" },
        { from: "bad", to: "2027-01-01" },
      ]),
    ).toEqual([
      { from: "2027-03-05", to: "2027-03-12" },
      { from: "2027-05-01", to: "2027-05-01" },
    ]);
  });

  it("prices covered nights by the voucher alone, the rest as usual", () => {
    // 30 and 31 March covered (20% off 10000 = 8000, offers and non-ref ignored); 1 April: non-ref 9000 less 30%.
    const q = quoteWithVoucher(
      10000,
      "nonref",
      settings,
      offers,
      "r1",
      "2027-03-30",
      "2027-04-02",
      v,
    )!;
    expect(q.nights.map((n) => [n.date, n.price, n.voucher])).toEqual([
      ["2027-03-30", 8000, true],
      ["2027-03-31", 8000, true],
      ["2027-04-01", 6300, false],
    ]);
    expect(q).toMatchObject({ base: 30000, total: 22300, discount: 7700, voucherNights: 2 });
    const set = quoteWithVoucher(10000, "flex", settings, [], "r1", "2027-03-01", "2027-03-03", {
      ...v,
      kind: "price",
      value: 12500,
    })!;
    expect(set.total).toBe(25000);
    expect(set.discount).toBe(0);
    // Other rooms aren't touched.
    expect(
      quoteWithVoucher(10000, "flex", settings, [], "r2", "2027-03-01", "2027-03-02", v)!.total,
    ).toBe(10000);
  });

  it("only works for the named guest, the room and the dates, once", () => {
    const b = {
      roomIds: ["r1"],
      checkIn: "2027-03-05",
      checkOut: "2027-03-07",
      name: "alex doe",
      today: "2027-01-01",
    };
    expect(voucherProblem(v, b)).toBeNull();
    expect(voucherProblem(v, { ...b, name: "Sam Smith" })).toMatch(/name/);
    expect(voucherProblem(v, { ...b, roomIds: ["r2"] })).toMatch(/room/);
    expect(voucherProblem(v, { ...b, checkIn: "2027-04-02", checkOut: "2027-04-04" })).toMatch(
      /dates/,
    );
    expect(voucherProblem({ ...v, status: "used" }, b)).toMatch(/already/);
    expect(voucherProblem(v, { ...b, today: "2027-04-01" })).toMatch(/passed/);
  });

  it("is removed a year after its last date", async () => {
    const { voucherExpired } = await import("@/lib/vouchers");
    expect(voucherExpired(v.periods, "2028-03-30")).toBe(false);
    expect(voucherExpired(v.periods, "2028-04-01")).toBe(true);
    expect(voucherExpired([], "2027-01-01")).toBe(true);
  });

  it("says the dates the short way", async () => {
    const { periodsText } = await import("@/lib/vouchers");
    expect(
      periodsText([
        monthPeriod("2027-03"),
        { from: "2027-04-14", to: "2027-04-14" },
        { from: "2027-12-30", to: "2028-01-02" },
      ]),
    ).toBe("March 2027, 14 Apr 2027, 30 Dec 2027 to 2 Jan 2028");
  });

  it("writes a short message and the host's own share links", () => {
    const msg = voucherMessage({
      firstName: "Alex",
      property: "The Trinity Rooms",
      code: v.code,
      value: "20% off",
      rooms: ["Room 2"],
      periods: v.periods,
      link: "https://x.test/book/trinity?voucher=STAY-7KQ2PX",
    });
    expect(msg).toContain("STAY-7KQ2PX gives you 20% off on Room 2 for March 2027");
    expect(msg.length).toBeLessThan(320);
    const l = shareLinks(msg, { phone: "+447700900123", email: "a@b.test", subject: "Your code" });
    expect(l.whatsapp).toMatch(/^https:\/\/wa\.me\/447700900123\?text=/);
    expect(l.sms).toMatch(/^sms:\+447700900123\?&body=/);
    expect(l.email).toMatch(/^mailto:a@b\.test\?subject=Your%20code&body=/);
    expect(shareLinks(msg, { phone: "0770", subject: "x" }).whatsapp).toBeNull();
  });
});
