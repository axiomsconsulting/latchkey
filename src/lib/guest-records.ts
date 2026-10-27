/**
 * Who's staying, and what Latchkey keeps about them. Pure rules for the
 * per-property settings (properties.guest_records), party size checks and
 * what counts as acceptable photo ID. No network or database access.
 */

import { addDays } from "./dates";

export const ADULT_AGE = 18;
export const KEEP_DAY_CHOICES = [7, 14, 30] as const;
export type KeepDays = (typeof KEEP_DAY_CHOICES)[number];

export type GuestRecords = {
  /** Ask how many adults and children have arrived. */
  askWhoIsStaying: boolean;
  /** Every extra adult photographs their ID after the lead booker. */
  checkEveryAdult: boolean;
  /** Keep a small copy of each ID photo for the host. */
  idPhoto: boolean;
  /** Each adult takes a quick face photo. */
  facePhoto: boolean;
  /** Days after check-out before details and photos are deleted. */
  keepDays: KeepDays;
  /**
   * The host confirms they are registered with their data regulator (the ICO
   * in the UK) and their privacy notice covers ID photos. Photos are only
   * ever kept when this is true.
   */
  regulatorConfirmed: boolean;
};

export const DEFAULT_RECORDS: GuestRecords = {
  askWhoIsStaying: true,
  checkEveryAdult: true,
  idPhoto: false,
  facePhoto: false,
  keepDays: 30,
  regulatorConfirmed: false,
};

export function normaliseRecords(raw: unknown): GuestRecords {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const bool = (k: keyof GuestRecords) =>
    typeof r[k] === "boolean" ? (r[k] as boolean) : (DEFAULT_RECORDS[k] as boolean);
  const keep = KEEP_DAY_CHOICES.includes(r["keepDays"] as KeepDays)
    ? (r["keepDays"] as KeepDays)
    : DEFAULT_RECORDS.keepDays;
  return {
    askWhoIsStaying: bool("askWhoIsStaying"),
    checkEveryAdult: bool("checkEveryAdult"),
    idPhoto: bool("idPhoto"),
    facePhoto: bool("facePhoto"),
    keepDays: keep,
    regulatorConfirmed: bool("regulatorConfirmed"),
  };
}

/** Photos are kept only when switched on and the host has confirmed registration. */
export function keepsIdPhoto(r: GuestRecords): boolean {
  return r.idPhoto && r.regulatorConfirmed;
}

export function takesFacePhoto(r: GuestRecords): boolean {
  return r.facePhoto && r.regulatorConfirmed;
}

/** The day ID details and photos are removed. */
export function deleteAfter(checkOutDate: string, keepDays: number): string {
  return addDays(checkOutDate, keepDays);
}

/**
 * The guest count on a booking only means something when it came from
 * somewhere that knows it: typed by the host, imported, or read from the
 * calendar. Calendar links usually send no count, which is stored as 1.
 */
export function bookedPartySize(b: {
  guest_count: number | null;
  source: string | null;
  manual_fields?: string[] | null;
}): number | null {
  const n = b.guest_count ?? 0;
  if (n < 1) return null;
  if (b.source !== "ical") return n;
  if (b.manual_fields?.includes("guest_count")) return n;
  return n > 1 ? n : null;
}

export type PartyCheck = {
  total: number;
  /** The room sleeps fewer people than arrived. */
  overCapacity: boolean;
  /** The booking said a different number. */
  differsFromBooking: boolean;
  /** Children arrived but the room is adults only. */
  childrenNotAllowed: boolean;
};

export function checkParty(input: {
  adults: number;
  childAges: number[];
  booked: number | null;
  capacity: number | null;
  childrenAllowed: boolean;
}): PartyCheck {
  const total = input.adults + input.childAges.length;
  return {
    total,
    overCapacity: input.capacity !== null && input.capacity > 0 && total > input.capacity,
    differsFromBooking: input.booked !== null && input.booked !== total,
    childrenNotAllowed: !input.childrenAllowed && input.childAges.length > 0,
  };
}

/** Whole years between a date of birth and today, or null if unreadable. */
export function ageOn(dateOfBirth: string | null | undefined, today: string): number | null {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const [by, bm, bd] = dateOfBirth.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** What the ID reader saw, before any judgement. */
export type IdRead = {
  isIdDocument: boolean;
  /** The holder's printed photo is visible on the document. */
  hasHolderPhoto: boolean;
  /** Handwritten, a plain sheet of paper, or shown on a screen. */
  looksHomemade: boolean;
  documentType:
    "passport" | "driving_licence" | "national_id" | "residence_permit" | "other" | null;
  fullName: string | null;
  dateOfBirth: string | null;
  expiryDate: string | null;
  issuingCountry: string | null;
  numberLast4: string | null;
  /** As printed: "GBR", "FRA", "British Citizen". Used to prefill the UK register. */
  nationality: string | null;
  /** Full number, only ever kept in the register and only for non-Commonwealth guests. */
  documentNumber: string | null;
  /** Issuing authority or place, as printed. */
  placeOfIssue: string | null;
};

export type IdVerdict =
  { ok: true; expired: boolean } | { ok: false; reason: "unreadable" | "not_photo_id" };

/**
 * A real photo ID only: a printed passport, driving licence or ID card with
 * the holder's photo and a readable name. A name written on paper, or a
 * picture of a screen, never passes. An expired document still shows who
 * someone is, so it passes and the host is told.
 */
export function judgeId(read: IdRead, today: string): IdVerdict {
  if (!read.isIdDocument || read.looksHomemade || !read.hasHolderPhoto)
    return { ok: false, reason: "not_photo_id" };
  if (!read.fullName || read.fullName.trim().split(/\s+/).length < 2)
    return { ok: false, reason: "unreadable" };
  const expired =
    !!read.expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(read.expiryDate) && read.expiryDate < today;
  return { ok: true, expired };
}

/** Last 4 letters or digits of a document number, nothing more. */
export function last4Of(raw: string | null | undefined): string | null {
  const clean = (raw ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  return clean.length >= 4 ? clean.slice(-4) : null;
}
