/**
 * Terms for stays booked direct: the booking terms every guest accepts, and
 * for longer stays a licence to occupy the guest signs, declaring their
 * permanent home and the purpose of the stay. Written so a stay stays a
 * short-term licence (serviced accommodation with the host keeping access),
 * not a tenancy, and recorded word for word (stay_agreements). Pure; tested
 * in tests/stay-terms.test.ts.
 *
 * Not legal advice: the wording is a careful starting point. Whether a stay
 * is a tenancy depends on what really happens (Street v Mountford), so hosts
 * should have it reviewed by a solicitor for their property and keep to it
 * in practice (the cleaning and access it describes).
 */
import { formatUkDate } from "./dates";

export const STAY_TERMS_VERSION = "1.0";

export type StayTerms = {
  /** The longest stay a guest can book here, in nights; longer ones are asked about. */
  maxNights: number;
  /** From this many nights the guest signs the longer-stay licence (0: every direct stay). */
  licenceFrom: number;
  /** The host's access for cleaning, linen and checks during a longer stay, every this many days. */
  serviceDays: number;
  /** The host's own house rules, shown and agreed to as written. */
  houseRules: string;
};

export const DEFAULT_STAY_TERMS: StayTerms = {
  maxNights: 28,
  licenceFrom: 28,
  serviceDays: 7,
  houseRules: "",
};

const int = (v: unknown, lo: number, hi: number, fb: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fb;

export const MAX_STAY_LIMIT = 90;

export function normaliseStayTerms(raw: unknown): StayTerms {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const maxNights = int(r["maxNights"], 1, MAX_STAY_LIMIT, DEFAULT_STAY_TERMS.maxNights);
  return {
    maxNights,
    licenceFrom: int(r["licenceFrom"], 0, MAX_STAY_LIMIT, DEFAULT_STAY_TERMS.licenceFrom),
    serviceDays: int(r["serviceDays"], 1, 14, DEFAULT_STAY_TERMS.serviceDays),
    houseRules: typeof r["houseRules"] === "string" ? r["houseRules"].trim().slice(0, 3000) : "",
  };
}

/** Whether this stay needs the signed licence. */
export const needsLicence = (t: StayTerms, nights: number) => nights >= t.licenceFrom;

/** Whether a stay can be booked here at all (longer ones go to the host as a request). */
export const tooLong = (t: StayTerms, nights: number) => nights > t.maxNights;

/**
 * Advice shown to the host by the property's country: a starting limit and
 * why. Rules change and vary locally, so it says to check, never "allowed".
 */
export function countryAdvice(country: string | null | undefined): {
  suggestedMax: number;
  note: string;
} {
  switch ((country ?? "").toUpperCase()) {
    case "GB":
      return {
        suggestedMax: 28,
        note: "In the UK, 28 nights is the usual ceiling for short stays: many holiday-let mortgages and insurers set it, HMRC's VAT rules for stays change after 28 days, and longer stays look more like a home. In Greater London, renting a whole home short-term for more than 90 nights in a calendar year needs planning permission. Check your mortgage, insurance, lease and council rules.",
      };
    case "US":
      return {
        suggestedMax: 28,
        note: "In many US states and cities (for example California and New York), a guest who stays 30 days or more can gain tenants' rights. Most hosts keep stays to 28 nights. Check your state and city rules.",
      };
    case "FR":
      return {
        suggestedMax: 90,
        note: "In France, a meublé de tourisme can't be let to the same guest for more than 90 days in a row; longer needs a bail mobilité or a lease. Check your commune's rules, which may also limit nights per year.",
      };
    case "ES":
      return {
        suggestedMax: 31,
        note: "In Spain, tourist lets are regulated by region; stays longer than about a month usually fall under seasonal letting rules instead. Check your region's rules.",
      };
    default:
      return {
        suggestedMax: 28,
        note: "Short-stay rules depend on the country and often the city. Many places treat stays of about a month or more as residential. Check the rules where your property is before allowing longer stays.",
      };
  }
}

export const PURPOSES = [
  "holiday",
  "work",
  "relocation",
  "home_repairs",
  "visiting",
  "other",
] as const;
export type Purpose = (typeof PURPOSES)[number];
export const PURPOSE_LABELS: Record<Purpose, string> = {
  holiday: "Holiday or leisure",
  work: "Work or a temporary assignment",
  relocation: "While looking for a home to move to",
  home_repairs: "While my home is being repaired",
  visiting: "Visiting family or friends",
  other: "Something else",
};

export type HomeAddress = {
  line1: string;
  line2: string;
  city: string;
  postcode: string;
  country: string;
};

export function addressProblem(a: HomeAddress, propertyPostcode?: string | null): string | null {
  if (a.line1.trim().length < 3) return "Please enter the first line of your home address.";
  if (a.city.trim().length < 2) return "Please enter your town or city.";
  if (!/^[A-Z]{2}$/.test(a.country)) return "Please choose your country.";
  if (a.country === "GB" && a.postcode.trim().length < 5) return "Please enter your postcode.";
  // The stay's own address can't be the permanent home.
  if (
    propertyPostcode &&
    a.postcode.replace(/\s/g, "").toUpperCase() ===
      propertyPostcode.replace(/\s/g, "").toUpperCase() &&
    a.postcode.trim()
  )
    return "Please give the address of your permanent home, not this property's.";
  return null;
}

export const addressLine = (a: HomeAddress) =>
  [a.line1, a.line2, a.city, a.postcode, a.country]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(", ");

/** What a guest ticks: the booking terms for every stay, the declarations for a longer one. */
export const STANDARD_TICKS = ["terms"] as const;
export const LICENCE_TICKS = ["home", "licence", "access", "leave"] as const;
export type Tick = (typeof STANDARD_TICKS)[number] | (typeof LICENCE_TICKS)[number];

export const TICK_TEXT: Record<Tick, string> = {
  terms: "I have read and agree to the booking terms and house rules.",
  home: "The address I have given is my permanent home, where I live and pay local taxes. This stay will not be my only or main home.",
  licence:
    "I understand this is a licence to stay in serviced accommodation for a fixed short period, not a tenancy, and that it doesn't give me exclusive possession.",
  access:
    "I agree the host and their staff may enter the room to clean, change linen, carry out checks and repairs, as set out in the agreement.",
  leave:
    "I will leave by the check-out date and time, unless the host agrees in writing to extend.",
};

export const ticksFor = (licence: boolean): Tick[] =>
  licence ? [...STANDARD_TICKS, ...LICENCE_TICKS] : [...STANDARD_TICKS];

/** Every tick needed was given. */
export const allTicked = (licence: boolean, given: readonly string[]) =>
  ticksFor(licence).every((t) => given.includes(t));

export type TermsContext = {
  /** Who provides the accommodation: the host's business name. */
  host: string;
  property: string;
  propertyAddress: string | null;
  country: string | null;
  rooms: string[];
  guestName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  checkInFrom: string;
  checkOutBy: string;
  quietHours: string | null;
  /** The rate's cancellation terms, in words. */
  cancellation: string;
  /** The total, formatted (blank when the host prices it later). */
  total: string;
  terms: StayTerms;
  /** Longer stays: the guest's declarations. */
  homeAddress?: HomeAddress | null;
  purpose?: Purpose | null;
};

const lawOf = (country: string | null) =>
  (country ?? "").toUpperCase() === "GB"
    ? "the law of the part of the United Kingdom where the property is, and its courts"
    : "the law of the country where the property is, and its courts";

/** The booking terms every direct guest accepts (Markdown, as shown and as kept). */
export function bookingTermsText(c: TermsContext): string {
  const rules = c.terms.houseRules.trim();
  return [
    `# Booking terms: ${c.property}`,
    `Version ${STAY_TERMS_VERSION}. Between ${c.host} ("we") and ${c.guestName} ("you").`,
    "## Your stay",
    `- ${c.rooms.join(", ")} at ${c.property}${c.propertyAddress ? `, ${c.propertyAddress}` : ""}.`,
    `- From ${formatUkDate(c.checkIn, { withYear: true })} (from ${c.checkInFrom}) to ${formatUkDate(c.checkOut, { withYear: true })} (by ${c.checkOutBy}): ${c.nights} ${c.nights === 1 ? "night" : "nights"}, for ${c.guests} ${c.guests === 1 ? "guest" : "guests"}.`,
    c.total ? `- Price: ${c.total}.` : "",
    "## Paying and cancelling",
    c.cancellation,
    "## During your stay",
    `- Only the guests named in the booking may stay, up to ${c.guests}. Visitors may not stay overnight without our agreement.`,
    `- Please leave by ${c.checkOutBy} on your last day. Staying longer needs our agreement in writing, and is charged.`,
    c.quietHours ? `- Quiet hours are ${c.quietHours}.` : "",
    "- No smoking or vaping indoors, no parties or events, and no running a business from the property (working remotely is fine).",
    "- You are responsible for damage caused by you or your visitors beyond normal wear, and for any extra cleaning it needs.",
    "- We, or people working for us, may enter the room to clean, change linen, check on safety or make repairs. We will knock first and choose sensible times, except in an emergency.",
    "- We may end the stay early, without refund for the remaining nights, if you seriously or repeatedly break these terms or the house rules, or put people or the property at risk.",
    rules ? "## House rules" : "",
    rules,
    "## Your details",
    "We keep your booking details, and the record of you accepting these terms, to run your stay and in case of a dispute. For how long and your rights, see the privacy information on the booking page.",
    "## Law",
    `These terms are governed by ${lawOf(c.country)}. Nothing in them affects your rights as a consumer.`,
  ]
    .filter((x) => x !== "")
    .join("\n\n");
}

/** The licence a guest signs for a longer stay (Markdown, as shown, signed and kept). */
export function licenceText(c: TermsContext): string {
  const home = c.homeAddress ? addressLine(c.homeAddress) : "(to be given by the guest)";
  const purpose = c.purpose ? PURPOSE_LABELS[c.purpose] : "(to be given by the guest)";
  return [
    `# Licence to occupy serviced accommodation: ${c.property}`,
    `Version ${STAY_TERMS_VERSION}. Between ${c.host} (the "provider") and ${c.guestName} (the "guest").`,
    "## 1. What this is",
    "1.1 The provider gives the guest permission (a licence) to stay in serviced accommodation for the period below. It is not a tenancy or a lease, and the guest does not have exclusive possession of any part of the property.",
    "1.2 The provider keeps control of the property and provides the services in section 4 throughout the stay.",
    "## 2. The stay",
    `2.1 Accommodation: ${c.rooms.join(", ")} at ${c.property}${c.propertyAddress ? `, ${c.propertyAddress}` : ""}, or another room of a similar standard the provider offers under 4.3.`,
    `2.2 From ${formatUkDate(c.checkIn, { withYear: true })} to ${formatUkDate(c.checkOut, { withYear: true })} (${c.nights} nights), ending at ${c.checkOutBy} on the last day. The licence ends then without any notice being needed.`,
    `2.3 Purpose of the stay, as the guest has declared: ${purpose}.`,
    "## 3. The guest's permanent home",
    `3.1 The guest declares that their permanent home is: ${home}.`,
    "3.2 The guest confirms that this accommodation will not be their only or main home, and that they will not use its address to register to vote, for a business, for benefits, for credit or as a correspondence address.",
    "3.3 The guest will tell the provider straight away if 3.1 or 3.2 stops being true.",
    "## 4. Services and access",
    `4.1 The provider (or people working for them) will enter the room at least every ${c.terms.serviceDays} ${c.terms.serviceDays === 1 ? "day" : "days"} to clean, change bedding and towels and check the room, at reasonable times.`,
    "4.2 The provider may also enter at any reasonable time to check on safety, make repairs or show the room, and at any time in an emergency.",
    "4.3 The provider may move the guest to another room of a similar standard in the same property if needed for repairs, cleaning or the running of the property.",
    "4.4 The guest may not change the locks, add locks or bolts, or stop the provider getting in.",
    "## 5. Staying and leaving",
    `5.1 Only the guests named in the booking (up to ${c.guests}) may stay. No sub-letting, sharing or letting anyone else stay.`,
    "5.2 Any extension must be agreed in writing by the provider. Without that, the guest must leave by the end of the stay, taking their belongings.",
    "5.3 The provider may end the licence early, with notice reasonable in the circumstances, if the guest seriously or repeatedly breaks this licence, the booking terms or the house rules, does not pay, or puts people or the property at risk. Payment for nights already stayed remains due.",
    "## 6. The booking terms",
    "The booking terms and house rules the guest accepted also apply. If they differ from this licence, this licence applies.",
    "## 7. Law",
    `This licence is governed by ${lawOf(c.country)}.`,
  ].join("\n\n");
}

/** Hex SHA-256 of the exact text, so the record shows nothing was changed. */
export async function textSha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cancellation terms in words, from the rate. */
export function cancellationText(o: {
  plan: "flex" | "nonref" | null;
  freeUntil: string | null;
}): string {
  if (o.plan === "nonref")
    return "This is a non-refundable rate: if you cancel, change or don't arrive, the full price is still due.";
  if (o.plan === "flex" && o.freeUntil)
    return `You can cancel free of charge until ${formatUkDate(o.freeUntil, { withYear: true })}. After that the full price is due.`;
  return "Payment and cancellation are as agreed with us for this booking.";
}

/** What a guest fills in on StayTermsForm. */
export type TermsAnswers = {
  ticks: string[];
  homeAddress: HomeAddress;
  purpose: Purpose | null;
  typedName: string;
  signature: string | null;
};

export const emptyAnswers = (country: string): TermsAnswers => ({
  ticks: [],
  homeAddress: { line1: "", line2: "", city: "", postcode: "", country },
  purpose: null,
  typedName: "",
  signature: null,
});
