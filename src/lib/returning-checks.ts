/**
 * Guests who come back: whether they show their ID (and take a selfie) again.
 * properties.returning_checks is the host's choice:
 *  - "lenient" (the start): anyone with an ID check from an earlier stay at this
 *    business isn't asked again, whatever that check found;
 *  - "overseas": as lenient for British guests, but anyone else (or anyone whose
 *    nationality isn't known) shows their ID again on a new stay;
 *  - "always": every stay asks for the ID again.
 * A guest staying on in the same room on a new booking (continuingStays) is never asked:
 * they never left. Pure, so it can be tested; the server side is returning-checks.server.ts.
 */

import { BRITISH_STATUSES, nationalityFromId } from "./hotel-register";

export type ReturningMode = "lenient" | "overseas" | "always";
export const RETURNING_MODES: readonly ReturningMode[] = ["lenient", "overseas", "always"];

export function normaliseReturningMode(v: unknown): ReturningMode {
  return RETURNING_MODES.includes(v as ReturningMode) ? (v as ReturningMode) : "lenient";
}

/** British (citizen or another British status) from the register's code or what the ID said. */
export function isBritish(
  nationality: string | null | undefined,
  issuingCountry?: string | null,
): boolean {
  const code = nationality?.trim() || nationalityFromId(issuingCountry ?? null);
  return !!code && code in BRITISH_STATUSES;
}

export type EarlierId = {
  /** The earlier stay whose ID check this one relies on. */
  bookingId: string;
  /** Straight on from it in the same room. */
  continued: boolean;
  british: boolean;
};

export function skipsIdAgain(mode: ReturningMode, earlier: EarlierId | null): boolean {
  if (!earlier) return false;
  if (earlier.continued) return true;
  if (mode === "lenient") return true;
  if (mode === "overseas") return earlier.british;
  return false;
}
