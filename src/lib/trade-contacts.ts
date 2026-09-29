/**
 * The host's own list of tradespeople: tidying numbers, building one-tap
 * contact links, and reading a spreadsheet of contacts. All pure, so the
 * fiddly bits (international numbers, odd column headings) are tested.
 */

import { region, type CountryCode } from "./regions";

export type TradeCategory = { id: string; label: string };

/** The jobs a small host actually needs a number for. */
export const TRADE_CATEGORIES: TradeCategory[] = [
  { id: "cleaning", label: "Cleaner / changeover" },
  { id: "linen", label: "Laundry and linen" },
  { id: "plumbing", label: "Plumber" },
  { id: "heating", label: "Heating engineer" },
  { id: "electrical", label: "Electrician" },
  { id: "locksmith", label: "Locksmith" },
  { id: "appliance", label: "Appliance repair" },
  { id: "handyman", label: "Handyperson" },
  { id: "gardening", label: "Gardening / outside" },
  { id: "pest", label: "Pest control" },
  { id: "waste", label: "Waste and recycling" },
  { id: "wifi", label: "Broadband / TV" },
  { id: "safety", label: "Safety checks and testing" },
  { id: "other", label: "Something else" },
];

export function tradeCategoryLabel(id: string): string {
  return TRADE_CATEGORIES.find((c) => c.id === id)?.label ?? "Something else";
}

/* ------------------------------ phone numbers ---------------------------- */

/** Digits only, with the country's dialling code, ready for a wa.me link. */
export function internationalDigits(raw: string | null | undefined, country: string): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const dial = region(country).dialCode;
  if (value.startsWith("+")) {
    const digits = value.slice(1).replace(/\D/g, "");
    return digits.length >= 7 ? digits : null;
  }
  let digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith(dial) && digits.length > dial.length + 6) {
    // already carries the country code
  } else {
    digits = dial + digits.replace(/^0+/, "");
  }
  return digits.length >= 7 ? digits : null;
}

export type ContactLinks = {
  tel: string | null;
  sms: string | null;
  whatsapp: string | null;
  email: string | null;
};

export function contactLinks(
  trade: { phone?: string | null; whatsapp_phone?: string | null; email?: string | null },
  country: string,
  message?: string,
): ContactLinks {
  const phone = (trade.phone ?? "").trim();
  const wa = internationalDigits(trade.whatsapp_phone || trade.phone, country);
  const email = (trade.email ?? "").trim();
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return {
    tel: phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : null,
    sms: phone ? `sms:${phone.replace(/[^\d+]/g, "")}${message ? `?&body=${encodeURIComponent(message)}` : ""}` : null,
    whatsapp: wa ? `https://wa.me/${wa}${text}` : null,
    email: email ? `mailto:${email}${message ? `?subject=${encodeURIComponent(message)}` : ""}` : null,
  };
}

/* -------------------------------- importing ------------------------------ */

export const TRADE_IMPORT_FIELDS = [
  { key: "name", label: "Contact name" },
  { key: "company_name", label: "Company" },
  { key: "category", label: "Trade" },
  { key: "phone", label: "Phone" },
  { key: "whatsapp_phone", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "area", label: "Area covered" },
  { key: "notes", label: "Notes" },
] as const;

export type TradeFieldKey = (typeof TRADE_IMPORT_FIELDS)[number]["key"];

/** Guesses which spreadsheet column holds which field. */
export function guessTradeMapping(headers: string[]): Partial<Record<TradeFieldKey, number>> {
  const guess: Partial<Record<TradeFieldKey, number>> = {};
  headers.forEach((h, i) => {
    const key = h.toLowerCase().replace(/[^a-z]/g, "");
    if (/whatsapp|wa$/.test(key)) guess.whatsapp_phone ??= i;
    else if (/(company|business|firm|trading)/.test(key)) guess.company_name ??= i;
    else if (/(name|contact|person)/.test(key)) guess.name ??= i;
    else if (/(trade|category|service|type|job)/.test(key)) guess.category ??= i;
    else if (/(mobile|phone|tel|cell|number)/.test(key)) guess.phone ??= i;
    else if (/(email|mail)/.test(key)) guess.email ??= i;
    else if (/(website|web|url|site)/.test(key)) guess.website ??= i;
    else if (/(area|town|city|region|covers|postcode|zip)/.test(key)) guess.area ??= i;
    else if (/(note|comment|remark)/.test(key)) guess.notes ??= i;
  });
  return guess;
}

/** Matches a free-text trade like "Gas engineer" to one of our categories. */
export function matchCategory(input: string | null | undefined): string {
  const v = (input ?? "").toLowerCase();
  if (!v.trim()) return "other";
  const rules: Array<[RegExp, string]> = [
    [/clean|changeover|housekeep/, "cleaning"],
    [/linen|laundr|launder/, "linen"],
    [/plumb|drain|leak/, "plumbing"],
    [/heat|boiler|gas|hvac|furnace/, "heating"],
    [/electric|spark|rewir/, "electrical"],
    [/lock|key|door entry/, "locksmith"],
    [/appliance|washer|fridge|oven|dishwash/, "appliance"],
    [/handy|odd job|maintenance|repair|decorat|paint/, "handyman"],
    [/garden|lawn|hedge|landscap/, "gardening"],
    [/pest|vermin|rodent|wasp/, "pest"],
    [/waste|bin|rubbish|recycl|trash/, "waste"],
    [/wifi|broadband|internet|aerial|tv/, "wifi"],
    [/safety|pat |alarm|extinguish|test/, "safety"],
  ];
  for (const [re, id] of rules) if (re.test(v)) return id;
  return "other";
}

export type ParsedTrade = {
  name: string;
  company_name: string | null;
  category: string;
  phone: string | null;
  whatsapp_phone: string | null;
  email: string | null;
  website: string | null;
  area: string | null;
  notes: string | null;
};

/** Turns mapped spreadsheet rows into contacts, skipping anything unusable. */
export function rowsToTrades(
  rows: string[][],
  mapping: Partial<Record<TradeFieldKey, number>>,
): { trades: ParsedTrade[]; skipped: number } {
  const take = (row: string[], key: TradeFieldKey) => {
    const idx = mapping[key];
    if (idx === undefined) return null;
    const v = (row[idx] ?? "").trim();
    return v.length ? v : null;
  };
  const trades: ParsedTrade[] = [];
  let skipped = 0;
  for (const row of rows) {
    const name = take(row, "name") ?? take(row, "company_name");
    const phone = take(row, "phone");
    const email = take(row, "email");
    // A contact with no name, or no way of reaching them, is not a contact.
    if (!name || (!phone && !email)) {
      skipped += 1;
      continue;
    }
    trades.push({
      name,
      company_name: take(row, "company_name"),
      category: matchCategory(take(row, "category")),
      phone,
      whatsapp_phone: take(row, "whatsapp_phone"),
      email,
      website: take(row, "website"),
      area: take(row, "area"),
      notes: take(row, "notes"),
    });
  }
  return { trades, skipped };
}

/** Is this browser likely to be able to place a call or send a text? */
export function deviceCapabilities(ua: string): { call: boolean; sms: boolean; whatsapp: boolean } {
  const mobile = /iphone|ipad|android|mobile/i.test(ua);
  const desktopLink = /macintosh|windows/i.test(ua);
  return { call: mobile || desktopLink, sms: mobile || desktopLink, whatsapp: true };
}

export type { CountryCode };
