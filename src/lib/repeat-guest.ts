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
