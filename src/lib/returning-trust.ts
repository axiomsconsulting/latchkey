/**
 * Returning guests who needn't photograph their ID again (a host's switch, off
 * by default, UK properties only). A pass is a record of an earlier ID check that
 * matched the booking. It only applies when this stay carries the same email or
 * phone (never a name alone), the name still matches and the ID is still valid on
 * arrival. The guest then proves it with the last digits of their phone or similar.
 * Pure, so it can be tested; the server side is returning-trust.server.ts.
 */

import { compareNames } from "./name-match";
import { registerKeepUntil } from "./hotel-register";

export type IdPass = {
  booking_id: string;
  full_name: string;
  document_expiry: string;
  keep_until: string;
};

export function passHolds(
  pass: IdPass,
  stay: { id: string; guest_full_name: string | null; check_in_date: string },
  today: string,
): boolean {
  if (pass.booking_id === stay.id) return false;
  if (pass.keep_until < today) return false;
  if (pass.document_expiry < stay.check_in_date) return false;
  return (
    !!stay.guest_full_name?.trim() &&
    compareNames(stay.guest_full_name, pass.full_name) === "matched"
  );
}

/** A check is only worth remembering if it matched and the ID has time left on it. */
export function worthRemembering(
  result: string | null,
  expiry: string | null | undefined,
  today: string,
): expiry is string {
  return result === "matched" && !!expiry && /^\d{4}-\d{2}-\d{2}$/.test(expiry) && expiry >= today;
}

export const passKeepUntil = registerKeepUntil;

/** Never shown whole on a shared screen: the guest sees the end of it, and the server fills in the rest. */
export const DOC_MASK = "••••";
export function maskDocument(number: string | null | undefined): string | null {
  const n = (number ?? "").trim();
  return n.length >= 4 ? `${DOC_MASK}${n.slice(-4)}` : null;
}
export const isMaskedDocument = (v: string | null | undefined) => !!v?.startsWith(DOC_MASK);
