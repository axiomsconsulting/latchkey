/**
 * Direct booking on the "Stay with us" page (properties.direct_booking,
 * migration 0053), when the host turns it on: a free room can be booked and
 * paid there, Booking.com style, at a refundable rate (free cancellation
 * until some days before arrival) or a cheaper non-refundable one (a
 * percentage or an amount a night off). Guests pay by card through the host's
 * Stripe account, by bank transfer to the host, or at the property, as the
 * host allows. Prices are in the property's currency; guests from elsewhere
 * see an approximate amount in their own. Pure.
 */
import { addDays } from "./dates";
import { quoteStay, type Quote, type SeasonalOffer } from "./direct-rates";

export type PayMethod = "card" | "bank" | "property";
export type RatePlan = "flex" | "nonref";

export type DirectBooking = {
  /** Guests can book a free room straight away (otherwise they send a request). */
  instant: boolean;
  card: boolean;
  bank: boolean;
  /** Pay at the property: only when the host allows it. */
  atProperty: boolean;
  /** The refundable rate: free cancellation until this many days before arrival. */
  freeCancelDays: number;
  /** The non-refundable rate: a percentage or an amount (hundredths) a night off. */
  nonRef: { enabled: boolean; kind: "percent" | "amount"; value: number };
  /** Bank transfers must arrive within this many days, or the host may release the room. */
  bankPayDays: number;
};

export const DEFAULT_DIRECT_BOOKING: DirectBooking = {
  instant: false,
  card: true,
  bank: false,
  atProperty: false,
  freeCancelDays: 7,
  nonRef: { enabled: true, kind: "percent", value: 10 },
  bankPayDays: 3,
};

const int = (v: unknown, lo: number, hi: number, fb: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fb);

export function normaliseDirectBooking(raw: unknown): DirectBooking {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (r["nonRef"] && typeof r["nonRef"] === "object" ? r["nonRef"] : {}) as Record<string, unknown>;
  const kind = n["kind"] === "amount" ? "amount" : "percent";
  return {
    instant: r["instant"] === true,
    card: typeof r["card"] === "boolean" ? r["card"] : DEFAULT_DIRECT_BOOKING.card,
    bank: r["bank"] === true,
    atProperty: r["atProperty"] === true,
    freeCancelDays: int(r["freeCancelDays"], 0, 60, DEFAULT_DIRECT_BOOKING.freeCancelDays),
    nonRef: {
      enabled: typeof n["enabled"] === "boolean" ? n["enabled"] : DEFAULT_DIRECT_BOOKING.nonRef.enabled,
      kind,
      value: kind === "percent" ? int(n["value"], 1, 50, 10) : int(n["value"], 0, 10_000_000, 1000),
    },
    bankPayDays: int(r["bankPayDays"], 1, 14, DEFAULT_DIRECT_BOOKING.bankPayDays),
  };
}

/** The nightly rate on each plan (the non-refundable one, when offered). */
export function planRates(ratePence: number, s: DirectBooking): { flex: number; nonref: number | null } {
  if (!s.nonRef.enabled) return { flex: ratePence, nonref: null };
  const nonref = s.nonRef.kind === "percent" ? Math.round((ratePence * (100 - s.nonRef.value)) / 100) : Math.max(0, ratePence - s.nonRef.value);
  return { flex: ratePence, nonref: nonref < ratePence ? nonref : null };
}

/** The estimated total on a plan, with each night's seasonal offer taken off as well. */
export function quotePlan(ratePence: number, plan: RatePlan, s: DirectBooking, offers: SeasonalOffer[], roomId: string, checkIn: string, checkOut: string): Quote | null {
  const r = planRates(ratePence, s);
  const nightly = plan === "flex" ? r.flex : r.nonref;
  return nightly === null ? null : quoteStay(nightly, offers, roomId, checkIn, checkOut);
}

/** The last day the refundable rate can be cancelled free, or null when that's already passed. */
export function freeCancelUntil(checkIn: string, s: DirectBooking, today: string): string | null {
  const d = addDays(checkIn, -s.freeCancelDays);
  return d >= today ? d : null;
}

/** How a guest may pay: only what the host allows and has set up. */
export function payMethods(s: DirectBooking, ready: { card: boolean; bank: boolean }): PayMethod[] {
  const out: PayMethod[] = [];
  if (s.card && ready.card) out.push("card");
  if (s.bank && ready.bank) out.push("bank");
  if (s.atProperty) out.push("property");
  return out;
}

/** Direct booking is on and there's at least one way to pay. */
export const bookable = (s: DirectBooking, ready: { card: boolean; bank: boolean }) => s.instant && payMethods(s, ready).length > 0;

/** A booking reference: 8 letters and digits, never ones easily confused (0/O, 1/I/L). */
export function newReference(random: () => number = Math.random): string {
  const ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += ABC[Math.floor(random() * ABC.length)];
  return out;
}

/** The currency most people in a country pay in (for showing an approximate amount). */
const COUNTRY_CURRENCY: Record<string, string> = {
  GB: "GBP", IE: "EUR", FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", PT: "EUR", AT: "EUR", FI: "EUR", GR: "EUR", LU: "EUR", SK: "EUR", SI: "EUR", EE: "EUR", LV: "EUR", LT: "EUR", MT: "EUR", CY: "EUR", HR: "EUR",
  US: "USD", CA: "CAD", AU: "AUD", NZ: "NZD", JP: "JPY", CN: "CNY", HK: "HKD", SG: "SGD", IN: "INR", CH: "CHF", NO: "NOK", SE: "SEK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN",
  TR: "TRY", AE: "AED", SA: "SAR", ZA: "ZAR", BR: "BRL", MX: "MXN", KR: "KRW", TH: "THB", MY: "MYR", ID: "IDR", PH: "PHP", IL: "ILS", IS: "ISK",
};
export const currencyOfCountry = (country: string | null | undefined) => (country ? (COUNTRY_CURRENCY[country.toUpperCase()] ?? null) : null);

/** The guest's country from their browser's language ("de-DE" → DE), if it says. */
export function countryOfLocale(locale: string | null | undefined): string | null {
  const m = /^[a-z]{2,3}[-_]([A-Z]{2})\b/i.exec(locale ?? "");
  return m ? m[1]!.toUpperCase() : null;
}

/** An amount in another currency at a rate (1 unit of ours = `rate` of theirs), in their hundredths. */
export const convert = (pence: number, rate: number) => Math.round(pence * rate);
