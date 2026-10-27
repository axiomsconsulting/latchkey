import { describe, expect, it } from "vitest";

import {
  money,
  nightsOf,
  normaliseOffers,
  offerOn,
  quoteStay,
  roomTaken,
  upcomingOffers,
} from "../src/lib/direct-rates";

const r1 = "11111111-1111-1111-1111-111111111111";
const r2 = "22222222-2222-2222-2222-222222222222";

describe("direct booking rates", () => {
  it("keeps only sensible offers, earliest first", () => {
    const offers = normaliseOffers([
      {
        id: "winter",
        label: "Winter escape",
        from: "2026-12-01",
        to: "2026-12-20",
        percent: 15,
        roomIds: null,
      },
      { from: "2026-11-10", to: "2026-11-01", percent: 10 },
      { from: "2026-11-01", to: "2026-11-30", percent: 95 },
      { from: "2026-11-01", to: "2026-11-05", percent: 10, roomIds: [r1, "not-a-room"] },
      "nonsense",
    ]);
    expect(offers.map((o) => [o.from, o.percent, o.roomIds])).toEqual([
      ["2026-11-01", 10, [r1]],
      ["2026-12-01", 15, null],
    ]);
    expect(offers[0]!.label).toBe("10% off");
  });

  it("counts the nights slept", () => {
    expect(nightsOf("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(nightsOf("2026-10-30", "2026-10-30")).toEqual([]);
  });

  it("takes each night's best offer off, for the rooms it covers", () => {
    const offers = normaliseOffers([
      {
        id: "early",
        label: "Early November",
        from: "2026-11-01",
        to: "2026-11-02",
        percent: 10,
        roomIds: null,
      },
      {
        id: "garden",
        label: "Garden Room deal",
        from: "2026-11-02",
        to: "2026-11-02",
        percent: 20,
        roomIds: [r1],
      },
    ]);
    expect(offerOn(offers, r1, "2026-11-02")?.id).toBe("garden");
    expect(offerOn(offers, r2, "2026-11-02")?.id).toBe("early");
    const q = quoteStay(10_000, offers, r1, "2026-10-31", "2026-11-03");
    // 3 nights at £100: 31 Oct full, 1 Nov 10% off, 2 Nov 20% off.
    expect(q).toMatchObject({ nights: 3, base: 30_000, discount: 3_000, total: 27_000 });
    expect(q.applied.map((o) => o.id).sort()).toEqual(["early", "garden"]);
    expect(quoteStay(10_000, offers, r2, "2026-10-31", "2026-11-03").total).toBe(28_000);
  });

  it("knows a room is taken when any night overlaps", () => {
    const stays = [{ from: "2026-10-29", to: "2026-11-01" }];
    expect(roomTaken(stays, "2026-11-01", "2026-11-03")).toBe(false);
    expect(roomTaken(stays, "2026-10-31", "2026-11-02")).toBe(true);
    expect(roomTaken(stays, "2026-10-25", "2026-10-29")).toBe(false);
  });

  it("lists offers still to come and shows money in the property's currency", () => {
    const offers = normaliseOffers([
      { from: "2026-01-01", to: "2026-01-10", percent: 10 },
      { from: "2026-12-01", to: "2026-12-10", percent: 10 },
    ]);
    expect(upcomingOffers(offers, "2026-10-24").map((o) => o.from)).toEqual(["2026-12-01"]);
    expect(money(12_000, "GBP")).toBe("£120");
    expect(money(12_050, "GBP")).toBe("£120.50");
    expect(money(1_200_000, "JPY")).toBe("JP¥12,000");
  });
});

describe("the offer to mention when inviting guests back", () => {
  it("prefers the best running offer, then the next one soon", async () => {
    const { offerToMention } = await import("../src/lib/direct-rates");
    const o = (
      id: string,
      from: string,
      to: string,
      percent: number,
      roomIds: string[] | null = null,
    ) => ({ id, label: id, from, to, percent, roomIds });
    const offers = [
      o("a", "2026-10-01", "2026-11-30", 10),
      o("b", "2026-10-20", "2026-10-31", 15, ["r1"]),
      o("c", "2026-12-20", "2027-01-05", 20),
    ];
    expect(offerToMention(offers, "2026-10-25")).toMatchObject({ id: "b", running: true });
    expect(offerToMention(offers, "2026-12-01")).toMatchObject({ id: "c", running: false });
    expect(offerToMention(offers, "2027-02-01")).toBeNull();
    expect(offerToMention([o("far", "2027-09-01", "2027-09-30", 30)], "2026-10-25")).toBeNull();
  });
});
