import { describe, expect, it } from "vitest";

import { feedBookings, feedSummary, type FeedBooking } from "../src/lib/calendar-feed";

const b = (o: Partial<FeedBooking>): FeedBooking => ({
  id: "x",
  check_in_date: "2026-11-05",
  check_out_date: "2026-11-07",
  status: "upcoming",
  channel: "direct",
  mirror_of: null,
  connection_id: null,
  ...o,
});
const ids = (rows: FeedBooking[]) => rows.map((r) => r.id);

describe("what a room's calendar link shares", () => {
  const rows = [
    b({ id: "direct" }),
    b({ id: "by-hand", channel: "other" }),
    b({ id: "closed", status: "blocked" }),
    b({ id: "flagged", status: "flagged" }),
    b({ id: "airbnb", channel: "airbnb", connection_id: "c" }),
    b({ id: "added-site", channel: "other", connection_id: "c" }),
    b({ id: "typed-airbnb", channel: "airbnb" }),
    b({ id: "mirror", mirror_of: "direct", status: "blocked" }),
    b({ id: "gone", status: "cancelled" }),
  ];
  it("the booking-site link never echoes a site's stays back", () => {
    expect(ids(feedBookings(rows, "direct"))).toEqual(["direct", "by-hand", "closed", "flagged"]);
  });
  it("your own calendar shows every stay, without mirrors or cancellations", () => {
    expect(ids(feedBookings(rows, "all"))).toEqual([
      "direct",
      "by-hand",
      "closed",
      "flagged",
      "airbnb",
      "added-site",
      "typed-airbnb",
    ]);
  });
  it("never names a guest, and says the site only on your own", () => {
    const label = () => "Airbnb";
    expect(feedSummary(b({}), "direct", label)).toBe("Booked");
    expect(feedSummary(b({}), "all", label)).toBe("Booked: Airbnb");
    expect(feedSummary(b({ status: "blocked" }), "all", label)).toBe("Not available");
  });
});
