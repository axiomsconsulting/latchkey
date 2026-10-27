/**
 * Repeat direct stays: a guest who enjoyed their stay can leave their
 * details for the business to get in touch about future stays (consent kept
 * with its exact wording, withdrawn with one link), and anyone can ask about
 * dates on the property's own booking page (/book/$code; /enquire/$code redirects). The host answers
 * from their own mailbox and can turn an enquiry into a direct stay. Not a
 * booking engine, and no marketing automation: nothing is sent for the host.
 * Pure: no network or database.
 */
import { addDays } from "./dates";

export const ENQUIRY_STATUSES = ["new", "offered", "booked", "declined"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const MAX_NIGHTS = 60;
export const MAX_GUESTS = 20;

/** The words the guest agrees to, kept with their consent exactly as shown. */
export function consentText(business: string): string {
  return `I'd like ${business} to contact me by email about future stays. I can withdraw this at any time.`;
}

/** The words for an enquiry: only about this enquiry. */
export function enquiryConsentText(business: string): string {
  return `${business} may contact me by email or phone about this enquiry.`;
}

export type EnquiryInput = {
  name: string;
  email: string;
  phone?: string | null;
  checkIn: string;
  checkOut: string;
  guests: number;
  message?: string | null;
};

const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[^\s@<>"]{2,24}$/;

/** What's wrong with an enquiry, if anything (null = fine). */
export function enquiryProblem(e: EnquiryInput, today: string): string | null {
  if (!e.name.trim()) return "Please add your name.";
  if (!EMAIL.test(e.email.trim())) return "Please check your email address.";
  // A phone number in full international form (+44…), so the host can reach the guest.
  if (!e.phone || !/^\+[1-9]\d{6,14}$/.test(e.phone.trim()))
    return "Please add a phone number we can reach you on.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(e.checkOut))
    return "Please pick your dates.";
  if (e.checkIn < today) return "Your arrival date has passed.";
  if (e.checkOut <= e.checkIn) return "Your leaving date must be after your arrival.";
  if (e.checkOut > addDays(e.checkIn, MAX_NIGHTS))
    return `Please ask about up to ${MAX_NIGHTS} nights at a time.`;
  if (e.checkIn > addDays(today, 730)) return "Please ask about dates within the next two years.";
  if (!Number.isInteger(e.guests) || e.guests < 1 || e.guests > MAX_GUESTS)
    return `Please say how many guests (1 to ${MAX_GUESTS}).`;
  return null;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Someone who has stayed before or left their details: shown as "returning". */
export function isReturning(email: string, known: Iterable<string>): boolean {
  const e = normaliseEmail(email);
  for (const k of known) if (k && normaliseEmail(k) === e) return true;
  return false;
}

export function nightsBetween(a: string, b: string): number {
  return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));
}

/**
 * A reply from the host's own mailbox: the guest's address, a subject naming
 * the dates, and a line on how to stop hearing from the business.
 */
export function replyMailto(input: {
  email: string;
  business: string;
  checkIn?: string | null;
  checkOut?: string | null;
  name?: string | null;
  withdrawUrl?: string | null;
}): string {
  const dates = input.checkIn && input.checkOut ? ` (${input.checkIn} to ${input.checkOut})` : "";
  const subject = `Your stay at ${input.business}${dates}`;
  const first = (input.name ?? "").trim().split(/\s+/)[0] ?? "";
  const lines = [`${first ? `Hello ${first},` : "Hello,"}`, "", "", "", `${input.business}`];
  if (input.withdrawUrl)
    lines.push("", `Prefer not to hear from us about future stays? ${input.withdrawUrl}`);
  return `mailto:${encodeURIComponent(input.email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}
