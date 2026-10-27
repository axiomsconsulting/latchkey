/**
 * World currencies, time zones and phone numbers for pickers and checks.
 * Currencies and time zones come from the platform's own locale data
 * (ISO 4217, the IANA time zone database); phone rules and dialling codes
 * from libphonenumber. Nothing to keep up to date by hand. Pure.
 */
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";

const supported = (key: "currency" | "timeZone"): string[] => {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  try {
    return intl.supportedValuesOf?.(key) ?? [];
  } catch {
    return [];
  }
};

/* ------------------------------- currencies ------------------------------ */

export type Currency = { code: string; name: string; symbol: string };

const FALLBACK_CURRENCIES = [
  "GBP",
  "EUR",
  "USD",
  "AUD",
  "CAD",
  "NZD",
  "CHF",
  "JPY",
  "INR",
  "SGD",
  "HKD",
  "AED",
  "ZAR",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "MXN",
  "BRL",
];

/** The symbol people write, e.g. £, €, $, ¥; the code itself when there isn't one. */
export function currencySymbol(code: string): string {
  try {
    const part = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? code;
  } catch {
    return code;
  }
}

let currencyCache: Currency[] | null = null;

/** Every current currency, the most used first, then A to Z by name. */
export function currencies(): Currency[] {
  if (currencyCache) return currencyCache;
  const codes = supported("currency");
  const list = (codes.length ? codes : FALLBACK_CURRENCIES).filter((c) => /^[A-Z]{3}$/.test(c));
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(["en-GB"], { type: "currency" });
  } catch {
    names = null;
  }
  const top = ["GBP", "EUR", "USD"];
  currencyCache = list
    .map((code) => ({ code, name: names?.of(code) ?? code, symbol: currencySymbol(code) }))
    .sort((a, b) => {
      const ta = top.indexOf(a.code);
      const tb = top.indexOf(b.code);
      if (ta !== -1 || tb !== -1) return (ta === -1 ? 99 : ta) - (tb === -1 ? 99 : tb);
      return a.name.localeCompare(b.name, "en-GB");
    });
  return currencyCache;
}

export function isCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  const codes = supported("currency");
  if (codes.length) return codes.includes(code);
  try {
    new Intl.NumberFormat("en-GB", { style: "currency", currency: code });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------- time zones ------------------------------ */

export type Zone = { id: string; offsetMinutes: number; label: string };

/** Minutes ahead of UTC for a zone on a given day (summer time included). */
export function zoneOffset(id: string, at: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: id,
      timeZoneName: "longOffset",
    }).formatToParts(at);
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
    if (!m) return 0;
    const mins = Number(m[2]) * 60 + Number(m[3] ?? 0);
    return m[1] === "-" ? -mins : mins;
  } catch {
    return 0;
  }
}

export function formatOffset(mins: number): string {
  const sign = mins < 0 ? "−" : "+";
  const a = Math.abs(mins);
  return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/** "Europe/London" → "London", "America/Argentina/Buenos_Aires" → "Buenos Aires, Argentina". */
export function zoneCity(id: string): string {
  const parts = id.split("/").map((p) => p.replace(/_/g, " "));
  if (parts.length <= 1) return parts[0] ?? id;
  const city = parts[parts.length - 1]!;
  return parts.length > 2 ? `${city}, ${parts[parts.length - 2]}` : city;
}

/** Old names some browsers still list, and the names people know now. */
const RENAMED: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Europe/Kiev": "Europe/Kyiv",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "America/Godthab": "America/Nuuk",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
  "Pacific/Enderbury": "Pacific/Kanton",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
};

/** Every time zone, west to east, labelled with today's offset. */
export function timeZones(at: Date = new Date()): Zone[] {
  const ids = supported("timeZone").map((z) =>
    RENAMED[z] && isTimeZone(RENAMED[z]) ? RENAMED[z] : z,
  );
  const list = ids.length
    ? ids
    : [
        "Europe/London",
        "Europe/Dublin",
        "Europe/Paris",
        "America/New_York",
        "America/Los_Angeles",
        "Asia/Kolkata",
        "Asia/Singapore",
        "Australia/Sydney",
      ];
  const all = [...new Set(["UTC", ...list])];
  return all
    .map((id) => {
      const offsetMinutes = id === "UTC" ? 0 : zoneOffset(id, at);
      return {
        id,
        offsetMinutes,
        label: `(${formatOffset(offsetMinutes)}) ${id === "UTC" ? "UTC" : `${zoneCity(id)} · ${id.split("/")[0]}`}`,
      };
    })
    .sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.id.localeCompare(b.id));
}

export function isTimeZone(id: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: id });
    return true;
  } catch {
    return false;
  }
}

/* --------------------------------- phones -------------------------------- */

export type PhoneCountry = { iso: CountryCode; name: string; dial: string; flag: string };

const flagOf = (iso: string) =>
  String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

let phoneCache: PhoneCountry[] | null = null;

/** Every country with a dialling code, UK first, then A to Z. */
export function phoneCountries(): PhoneCountry[] {
  if (phoneCache) return phoneCache;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(["en-GB"], { type: "region" });
  } catch {
    names = null;
  }
  phoneCache = getCountries()
    .map((iso) => ({
      iso,
      name: names?.of(iso) ?? iso,
      dial: `+${getCountryCallingCode(iso)}`,
      flag: flagOf(iso),
    }))
    .sort((a, b) =>
      a.iso === "GB" ? -1 : b.iso === "GB" ? 1 : a.name.localeCompare(b.name, "en-GB"),
    );
  return phoneCache;
}

export type PhoneCheck =
  { ok: true; e164: string; display: string } | { ok: false; problem: "empty" | "invalid" };

/** Checks a number for a country (or in +44 form); returns it as +447700900123. */
export function checkPhone(input: string, country: string): PhoneCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, problem: "empty" };
  const p = parsePhoneNumberFromString(raw, country as CountryCode);
  if (!p || !p.isValid()) return { ok: false, problem: "invalid" };
  return { ok: true, e164: p.number, display: p.formatInternational() };
}

/** Splits a stored number back into its country and the national part, for editing. */
export function splitPhone(
  stored: string | null | undefined,
  fallbackCountry = "GB",
): { country: string; national: string } {
  if (!stored) return { country: fallbackCountry, national: "" };
  const p = parsePhoneNumberFromString(stored, fallbackCountry as CountryCode);
  if (!p) return { country: fallbackCountry, national: stored };
  // Several countries share a code (+44: UK, Guernsey, Jersey, Isle of Man): keep the business's own.
  let sameCode = false;
  try {
    sameCode = getCountryCallingCode(fallbackCountry as CountryCode) === p.countryCallingCode;
  } catch {
    sameCode = false;
  }
  return {
    country: sameCode ? fallbackCountry : (p.country ?? fallbackCountry),
    national: p.formatNational(),
  };
}

/** An example number for a country, to show the expected format. */
export function phoneExample(country: string): string {
  const examples: Record<string, string> = {
    GB: "07400 123456",
    IE: "085 012 3456",
    US: "(201) 555-0123",
    FR: "06 12 34 56 78",
    DE: "01512 3456789",
    IN: "081234 56789",
    AU: "0412 345 678",
  };
  return examples[country] ?? "";
}
