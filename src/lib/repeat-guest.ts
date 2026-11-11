/**
 * Has this guest stayed with the business before? Only used to greet them
 * ("Welcome back"), never to decide anything about security or ID, so a close
 * name is good enough: their own email or phone, or the same full name.
 * Booking sites usually hide both, which leaves the name. Pure, so it can be tested.
 */

import { realEmail } from "./guest-messages";

export type GuestStay = {
  id: string;
  status: string;
  guest_full_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  check_in_date: string;
  check_out_date: string;
  mirror_of?: string | null;
  archived_at?: string | null;
};

/** Lower case, no accents, in any order: "José García" = "garcia jose". */
export function nameKey(name: string | null | undefined): string[] {
  return (name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length > 1)
    .sort();
}

type Who = Pick<GuestStay, "guest_full_name" | "guest_email" | "guest_phone">;

export function sameGuest(a: Who, b: Who): boolean {
  const ae = a.guest_email?.trim().toLowerCase();
  if (ae && realEmail(ae) && ae === b.guest_email?.trim().toLowerCase()) return true;
  if (a.guest_phone && a.guest_phone === b.guest_phone) return true;
  // A first name alone is too common to welcome anyone back on.
  const an = nameKey(a.guest_full_name);
  return an.length >= 2 && an.join(" ") === nameKey(b.guest_full_name).join(" ");
}

/**
 * True when an earlier real stay is theirs. It must have ended before this one
 * starts, with a night away: back-to-back dates are an extension, not a return.
 */
export function stayedBefore(
  stay: Who & Pick<GuestStay, "id" | "check_in_date">,
  others: GuestStay[],
) {
  return others.some(
    (o) =>
      o.id !== stay.id &&
      o.check_out_date < stay.check_in_date &&
      o.status !== "cancelled" &&
      o.status !== "blocked" &&
      !o.mirror_of &&
      !o.archived_at &&
      sameGuest(stay, o),
  );
}

/** A stay that counts for recognising a guest: not cancelled, closed, hidden or a mirror. */
function realStay(o: GuestStay): boolean {
  return o.status !== "cancelled" && o.status !== "blocked" && !o.mirror_of && !o.archived_at;
}

export type RoomStay = GuestStay & { room_id: string | null };

/**
 * The same guest staying on in the same room on a new booking (another night booked
 * directly or on another site): the earlier stay ends the day the next begins. Neither
 * is really a departure or an arrival, so the earlier one gets no goodbye and the
 * later one no welcome (cards on the door tablet, texts and emails).
 */
export function continuingStays(stays: RoomStay[]): {
  noGoodbye: Set<string>;
  noWelcome: Set<string>;
} {
  const noGoodbye = new Set<string>();
  const noWelcome = new Set<string>();
  const live = stays.filter(realStay);
  for (const a of live)
    for (const b of live)
      if (
        a.id !== b.id &&
        a.room_id &&
        a.room_id === b.room_id &&
        a.check_out_date === b.check_in_date &&
        sameGuest(a, b)
      ) {
        noGoodbye.add(a.id);
        noWelcome.add(b.id);
      }
  return { noGoodbye, noWelcome };
}

export type EarlierCheck = {
  /** The earlier stay whose ID check this guest's stay shows. */
  bookingId: string;
  /** When that stay began. */
  date: string;
  /** Straight on from it (an extension, in any room), rather than a return. */
  continued: boolean;
};

/**
 * For a stay with no ID check of its own: the latest earlier stay of the same guest
 * that has one (`checked`), however that check came out, so the host sees the face
 * and result they already have. Only for showing the host: it never skips anything.
 */
export function earlierCheck(
  stay: RoomStay,
  others: RoomStay[],
  checked: Set<string>,
): EarlierCheck | null {
  const found = others
    .filter(
      (o) =>
        o.id !== stay.id &&
        checked.has(o.id) &&
        o.check_out_date <= stay.check_in_date &&
        o.status !== "cancelled" &&
        !o.mirror_of &&
        sameGuest(stay, o),
    )
    .sort((x, y) => y.check_out_date.localeCompare(x.check_out_date))[0];
  if (!found) return null;
  return {
    bookingId: found.id,
    date: found.check_in_date,
    continued: found.check_out_date === stay.check_in_date,
  };
}

/** The little mark beside a guest's name: back again, or staying on from the stay before. */
export function guestAgain(stay: RoomStay, others: RoomStay[]): "continued" | "returning" | null {
  const live = others.filter((o) => realStay(o) && o.id !== stay.id && sameGuest(stay, o));
  if (live.some((o) => o.check_out_date === stay.check_in_date)) return "continued";
  return stayedBefore(stay, live) ? "returning" : null;
}
