import { describe, expect, it } from "vitest";

import {
  allocateArrival,
  normaliseRoomCheck,
  rankStays,
  type AllocatableStay,
} from "../src/lib/room-allocation";

const T = "2026-11-03";
const stay = (id: string, name: string | null, over: Partial<AllocatableStay> = {}) =>
  ({
    id,
    status: name ? "upcoming" : "needs_details",
    check_in_date: T,
    check_out_date: "2026-11-05",
    guest_full_name: name,
    mirror_of: null,
    ...over,
  }) as AllocatableStay;
const place = (stays: AllocatableStay[], name = "Mark Smith", hour = 15) =>
  allocateArrival(stays, name, T, hour);

describe("allocateArrival", () => {
  it("is sure of a clear name match, whatever else arrives", () => {
    expect(place([stay("a", "Mark Smith"), stay("b", null), stay("c", "Sarah Jones")])).toEqual({
      kind: "stay",
      stayId: "a",
      nameMatch: "matched",
      returning: false,
      check: null,
    });
  });

  it("places the same name on two stays on the first, and flags it", () => {
    const r = place([stay("a", "Mark Smith"), stay("b", "Mark Smith")]);
    expect(r).toMatchObject({ kind: "stay", stayId: "a", check: "same_name" });
  });

  it("flags a partial name", () => {
    const r = place([stay("a", "Mark Anderson"), stay("b", "Sarah Jones")], "Mark Smith");
    expect(r).toMatchObject({
      kind: "stay",
      stayId: "a",
      nameMatch: "partial",
      check: "name_close",
    });
  });

  it("recognises someone already here", () => {
    const r = place([
      stay("a", "Mark Smith", { status: "checked_in", check_in_date: "2026-11-02" }),
    ]);
    expect(r).toMatchObject({ kind: "stay", stayId: "a", returning: true, check: null });
  });

  it("the only stay of the day, nameless, takes the guest and is flagged", () => {
    expect(place([stay("a", null)])).toMatchObject({
      kind: "stay",
      stayId: "a",
      nameMatch: null,
      check: "only_stay",
    });
  });

  it("one nameless beside named stays takes the guest, flagged differently", () => {
    expect(place([stay("a", null), stay("b", "Sarah Jones")])).toMatchObject({
      stayId: "a",
      check: "only_nameless",
    });
  });

  it("someone else turns up for the only booked stay: placed and flagged", () => {
    expect(place([stay("a", "Sarah Jones")])).toMatchObject({
      kind: "stay",
      stayId: "a",
      nameMatch: "not_matched",
      check: "someone_else",
    });
  });

  it("holds when it can't tell, never guessing", () => {
    expect(place([stay("a", null), stay("b", null)])).toEqual({
      kind: "held",
      reason: "several_nameless",
    });
    expect(place([stay("a", "Sarah Jones"), stay("b", "Ann Lee")])).toEqual({
      kind: "held",
      reason: "several_named",
    });
    expect(place([])).toEqual({ kind: "held", reason: "no_stay" });
  });

  it("holds the booker rather than overwrite someone else's check-in on their stay", () => {
    const r = place([
      stay("a", "Mark Smith", {
        status: "checked_in",
        room_check: { reason: "someone_else", held: false, idName: "Ann Lee", at: "" },
      }),
    ]);
    expect(r).toEqual({ kind: "held", reason: "booker_after_other" });
  });

  it("the same guest scanning again goes back to their stay", () => {
    const flagged = (reason: "only_stay" | "someone_else", name: string) =>
      stay("a", name, {
        status: "checked_in",
        room_check: { reason, held: false, idName: "Mark Smith", at: "" },
      });
    expect(place([flagged("only_stay", "Mark Smith")])).toMatchObject({
      kind: "stay",
      stayId: "a",
      returning: true,
    });
    expect(place([flagged("someone_else", "Sarah Jones")])).toMatchObject({
      kind: "stay",
      stayId: "a",
      returning: true,
    });
  });

  it("never places anyone on a held row or a mirror", () => {
    expect(
      place([
        stay("a", null, { room_check: { reason: "no_stay", held: true, idName: "x", at: "" } }),
        stay("b", null, { mirror_of: "z" }),
      ]),
    ).toEqual({ kind: "held", reason: "no_stay" });
  });

  it("yesterday's nameless stay only counts in the small hours", () => {
    const late = stay("a", null, { check_in_date: "2026-11-02" });
    expect(place([late], "Mark Smith", 2)).toMatchObject({ kind: "stay", stayId: "a" });
    expect(place([late], "Mark Smith", 15)).toEqual({ kind: "held", reason: "no_stay" });
  });
});

describe("rankStays", () => {
  it("puts their name first, then the nameless, today before other days", () => {
    const ranked = rankStays(
      [
        stay("other", "Sarah Jones"),
        stay("old", null, { check_in_date: "2026-11-02" }),
        stay("blank", null),
        stay("mine", "Mark Smith"),
      ],
      "Mark Smith",
      T,
    );
    expect(ranked.map((s) => s.id)).toEqual(["mine", "blank", "old", "other"]);
    expect(ranked[0]!.likely).toBe(true);
    expect(ranked[3]!.likely).toBe(false);
  });
});

describe("normaliseRoomCheck", () => {
  it("reads what's stored and ignores anything else", () => {
    expect(normaliseRoomCheck(null)).toBeNull();
    expect(normaliseRoomCheck("x")).toBeNull();
    expect(normaliseRoomCheck({ reason: "no_stay", held: true, idName: "A B" })?.held).toBe(true);
  });
});
