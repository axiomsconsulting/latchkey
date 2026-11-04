/**
 * What a room's calendar link shares. There are two views of the same room:
 * "direct" (the link for booking sites): only what's entered in Latchkey, so no
 * site ever gets another site's stays back, or its own, which is what makes two
 * linked calendars echo and leave ghost closures. "all" (the link for the host's own
 * calendar, or a cleaner's): every stay, whichever site it came from. Never a guest's
 * name in either. Pure, tested.
 */
export type FeedBooking = {
  id: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
  channel: string;
  mirror_of: string | null;
  connection_id?: string | null;
};

export type FeedView = "direct" | "all";

const SHARED = new Set([
  "upcoming",
  "flagged",
  "checked_in",
  "checked_out",
  "blocked",
  "needs_details",
]);

export function feedBookings(rows: FeedBooking[], view: FeedView): FeedBooking[] {
  return rows.filter((b) => {
    if (b.mirror_of || !SHARED.has(b.status)) return false;
    if (view === "all") return true;
    // Anything that came in from a calendar link is that site's to tell.
    return !b.connection_id && (b.channel === "direct" || b.channel === "other");
  });
}

export function feedSummary(
  b: FeedBooking,
  view: FeedView,
  siteLabel: (b: FeedBooking) => string,
): string {
  if (b.status === "blocked") return "Not available";
  return view === "all" ? `Booked: ${siteLabel(b)}` : "Booked";
}
