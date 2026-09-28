/**
 * Cross-platform reconciliation for one room. Hosts without a channel manager
 * often link their calendars to each other, so a stay on Airbnb reappears on
 * Booking.com as a nameless "CLOSED" entry. This works out which entries are
 * echoes of a real booking (mirrors) and which are genuine double-bookings.
 * Pure logic, no database access, so it can be unit tested.
 */

export type RoomBooking = {
  id: string;
  channel: string;
  status: string;
  check_in_date: string;
  check_out_date: string;
  guest_full_name: string | null;
  reservation_code: string | null;
  mirror_of: string | null;
  manual_fields: string[];
};

export type RoomChange = { id: string; status?: string; mirror_of?: string | null };

const REAL = new Set(["upcoming", "checked_in", "checked_out", "flagged"]);
const MIRROR_CANDIDATE = new Set(["needs_details", "blocked"]);

function overlaps(a: RoomBooking, b: RoomBooking): boolean {
  return a.check_in_date < b.check_out_date && b.check_in_date < a.check_out_date;
}

function isNamed(b: RoomBooking): boolean {
  return Boolean(b.guest_full_name || b.reservation_code);
}

/** Overlap in nights, used to pick the best match for a mirror. */
function sharedNights(a: RoomBooking, b: RoomBooking): number {
  const start = a.check_in_date > b.check_in_date ? a.check_in_date : b.check_in_date;
  const end = a.check_out_date < b.check_out_date ? a.check_out_date : b.check_out_date;
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

export function reconcileRoom(bookings: RoomBooking[]): RoomChange[] {
  const live = bookings.filter((b) => b.status !== "cancelled");
  const real = live.filter((b) => REAL.has(b.status) && isNamed(b));
  const changes = new Map<string, RoomChange>();
  const set = (id: string, patch: Omit<RoomChange, "id">) =>
    changes.set(id, { ...(changes.get(id) ?? { id }), ...patch });

  // 1. Nameless entries that sit on a real booking from another platform.
  for (const b of live) {
    const hostSetStatus = b.manual_fields.includes("status");
    if (isNamed(b) && !b.mirror_of) continue;
    if (!MIRROR_CANDIDATE.has(b.status) && !b.mirror_of) continue;

    const match = real
      .filter((r) => r.channel !== b.channel && overlaps(r, b))
      .sort((x, y) => sharedNights(y, b) - sharedNights(x, b))[0];

    if (match) {
      if (b.mirror_of !== match.id) set(b.id, { mirror_of: match.id });
      if (b.status !== "blocked" && !hostSetStatus) set(b.id, { status: "blocked" });
    } else if (b.mirror_of) {
      // The real booking moved or was cancelled; the echo needs checking again.
      set(b.id, { mirror_of: null });
      if (!hostSetStatus && b.status === "blocked") set(b.id, { status: "needs_details" });
    }
  }

  // 2. Two named guests on the same nights from different platforms.
  const clashing = new Set<string>();
  for (let i = 0; i < real.length; i++) {
    for (let j = i + 1; j < real.length; j++) {
      const a = real[i]!;
      const b = real[j]!;
      if (a.channel !== b.channel && overlaps(a, b)) {
        clashing.add(a.id);
        clashing.add(b.id);
      }
    }
  }
  for (const b of real) {
    if (b.manual_fields.includes("status")) continue;
    if (clashing.has(b.id) && b.status === "upcoming") set(b.id, { status: "flagged" });
    if (!clashing.has(b.id) && b.status === "flagged") set(b.id, { status: "upcoming" });
  }

  return [...changes.values()];
}
