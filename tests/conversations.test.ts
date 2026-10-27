import { describe, expect, it } from "vitest";

import { byAttention, scopeOf, summarise, type Msg, type Req } from "../src/lib/conversations";

const m = (direction: "inbound" | "outbound", at: string, extra: Partial<Msg> = {}): Msg => ({
  direction,
  created_at: at,
  read_by_host_at: null,
  read_by_guest_at: null,
  body: `${direction} ${at}`,
  ...extra,
});
const r = (status: string, total = 500): Req => ({
  id: status,
  status,
  total_pence: total,
  items: [],
  created_at: "2026-10-16T09:00:00Z",
});

describe("what a stay's conversation is waiting on", () => {
  it("counts new guest messages and shows the latest", () => {
    const c = summarise(
      [
        m("outbound", "2026-10-16T08:00:00Z", { read_by_guest_at: "x" }),
        m("inbound", "2026-10-16T09:00:00Z"),
      ],
      [],
      [],
    );
    expect(c.chips).toEqual([{ key: "unread", count: 1 }]);
    expect(c.lastFromGuest).toBe(true);
    expect(c.lastBody).toBe("inbound 2026-10-16T09:00:00Z");
    expect(c.needsHost).toBe(true);
  });

  it("knows when the host has read but not answered", () => {
    const c = summarise([m("inbound", "2026-10-16T09:00:00Z", { read_by_host_at: "x" })], [], []);
    expect(c.chips).toEqual([{ key: "reply", count: 1 }]);
  });

  it("tracks requests to approve, unpaid and to deliver, and open service requests", () => {
    const c = summarise(
      [],
      [
        r("requested"),
        r("suggested"),
        r("awaiting_payment", 1200),
        r("approved"),
        r("confirmed"),
        r("delivered"),
        r("declined"),
      ],
      [
        { id: "j1", status: "new", title: "Towels", created_at: "2026-10-16T10:00:00Z" },
        { id: "j2", status: "done", title: "Tap", created_at: "2026-10-15T10:00:00Z" },
      ],
    );
    expect(c.chips).toEqual([
      { key: "approve", count: 2 },
      { key: "unpaid", count: 1 },
      { key: "deliver", count: 2 },
      { key: "jobs", count: 1 },
    ]);
    expect(c.unpaidPence).toBe(1200);
    expect(c.lastAt).toBe("2026-10-16T10:00:00Z");
  });

  it("notes messages the guest hasn't seen, and when everything is sorted", () => {
    expect(summarise([m("outbound", "2026-10-16T09:00:00Z")], [], []).chips).toEqual([
      { key: "unseen", count: 1 },
    ]);
    expect(summarise([m("outbound", "2026-10-16T09:00:00Z")], [], []).needsHost).toBe(false);
    expect(
      summarise(
        [m("outbound", "2026-10-16T09:00:00Z", { read_by_guest_at: "x" })],
        [r("delivered")],
        [],
      ).chips,
    ).toEqual([{ key: "sorted", count: 0 }]);
    expect(summarise([], [], []).chips).toEqual([]);
  });

  it("puts stays waiting on the host first", () => {
    const quiet = {
      id: "a",
      conversation: summarise(
        [m("outbound", "2026-10-16T12:00:00Z", { read_by_guest_at: "x" })],
        [],
        [],
      ),
    };
    const waiting = {
      id: "b",
      conversation: summarise([m("inbound", "2026-10-15T08:00:00Z")], [], []),
    };
    expect(byAttention([quiet, waiting]).map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("files stays under now, upcoming and past", () => {
    const T = "2026-10-16";
    expect(scopeOf({ check_in_date: "2026-10-14", check_out_date: "2026-10-18" }, T)).toBe("now");
    expect(scopeOf({ check_in_date: T, check_out_date: "2026-10-18" }, T)).toBe("now");
    expect(scopeOf({ check_in_date: "2026-10-12", check_out_date: T }, T)).toBe("now");
    expect(scopeOf({ check_in_date: "2026-10-20", check_out_date: "2026-10-22" }, T)).toBe(
      "upcoming",
    );
    expect(scopeOf({ check_in_date: "2026-10-01", check_out_date: "2026-10-03" }, T)).toBe("past");
  });
});
