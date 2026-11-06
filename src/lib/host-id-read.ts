/**
 * An ID photo the host added on the guest card is read like one taken at the door: what the stay
 * and the person are then marked as, and the line the host sees. Pure; tested in
 * tests/host-id-read.test.ts. The server side is addGuestPhoto in guests.functions.ts.
 */
import { compareNames } from "./name-match";

export type HostReadOutcome = {
  /** guest_ids.name_match: only the lead guest is compared with the booking's name. */
  nameMatch: "matched" | "partial" | "not_matched" | null;
  /** guest_ids.id_checked */
  idChecked: boolean;
  /** bookings.id_check_status for the lead guest; null leaves it as it is. */
  status: "matched" | "partial" | "not_matched" | "id_read" | "host_added" | null;
};

export function hostReadOutcome(o: {
  position: number;
  /** judgeId said it's a real, readable photo ID. */
  readable: boolean;
  idName: string | null;
  bookingName: string | null;
}): HostReadOutcome {
  if (!o.readable || !o.idName?.trim())
    return { nameMatch: null, idChecked: false, status: o.position === 0 ? "host_added" : null };
  if (o.position !== 0) return { nameMatch: null, idChecked: true, status: null };
  if (!o.bookingName?.trim()) return { nameMatch: null, idChecked: true, status: "id_read" };
  const match = compareNames(o.bookingName, o.idName);
  return { nameMatch: match, idChecked: true, status: match };
}
