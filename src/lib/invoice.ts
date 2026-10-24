/**
 * Invoices for direct stays: what the tax is called where the property is,
 * how the totals split, and what a guest or host may change. Pure, so it can
 * be unit tested.
 */

export type TaxTerms = {
  /** The tax itself: "VAT", "GST", "Sales tax". */
  name: string;
  /** The registration number's usual name: "VAT number", "ABN", "GSTIN". */
  numberLabel: string;
  /** What the document must be called where that's set out in law. */
  title: string;
};

const EU_VAT = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU",
  "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

/**
 * The words for the property's country. Australia and New Zealand require a
 * "Tax invoice"; elsewhere "Invoice" is right. Anywhere not listed gets
 * neutral wording the host can rename in Settings.
 */
export function taxTerms(country: string | null | undefined): TaxTerms {
  const c = (country ?? "GB").toUpperCase();
  if (c === "GB" || EU_VAT.includes(c) || c === "NO" || c === "CH") return { name: "VAT", numberLabel: "VAT number", title: "Invoice" };
  if (c === "AU") return { name: "GST", numberLabel: "ABN", title: "Tax invoice" };
  if (c === "NZ") return { name: "GST", numberLabel: "GST number", title: "Tax invoice" };
  if (c === "CA") return { name: "GST/HST", numberLabel: "GST/HST number", title: "Invoice" };
  if (c === "IN") return { name: "GST", numberLabel: "GSTIN", title: "Tax invoice" };
  if (c === "SG" || c === "MY") return { name: c === "SG" ? "GST" : "SST", numberLabel: c === "SG" ? "GST reg. no." : "SST reg. no.", title: "Tax invoice" };
  if (c === "ZA") return { name: "VAT", numberLabel: "VAT number", title: "Tax invoice" };
  if (c === "AE" || c === "SA") return { name: "VAT", numberLabel: "TRN", title: "Tax invoice" };
  if (c === "US") return { name: "Sales tax", numberLabel: "Tax ID", title: "Invoice" };
  if (c === "JP") return { name: "Consumption tax", numberLabel: "Registration number", title: "Invoice" };
  return { name: "Tax", numberLabel: "Tax registration number", title: "Invoice" };
}

/** A country's standard rate for accommodation-type sales tax, in basis points, as a starting point the host can change. */
const STANDARD_RATES: Record<string, number> = {
  GB: 2000, IE: 2300, FR: 2000, DE: 1900, ES: 2100, IT: 2200, NL: 2100, BE: 2100, PT: 2300, AT: 2000, SE: 2500, DK: 2500, FI: 2550, NO: 2500, CH: 810,
  PL: 2300, CZ: 2100, GR: 2400, HU: 2700, RO: 1900, HR: 2500, SI: 2200, SK: 2300, LU: 1700, MT: 1800, CY: 1900, EE: 2200, LV: 2100, LT: 2100, BG: 2000,
  AU: 1000, NZ: 1500, CA: 500, IN: 1200, SG: 900, MY: 800, ZA: 1500, AE: 500, SA: 1500, JP: 1000, US: 0,
};
export const standardTaxRate = (country: string | null | undefined): number | null => STANDARD_RATES[(country ?? "").toUpperCase()] ?? null;

export type Totals = { net: number; tax: number; total: number; rateBp: number };

/**
 * Splits what the guest paid into net and tax. Only a registered business
 * shows tax; otherwise the whole amount is the total with no tax line.
 */
export function invoiceTotals(input: {
  amountPence: number;
  includesTax: boolean;
  registered: boolean;
  rateBp: number;
}): Totals {
  const amount = Math.max(0, Math.round(input.amountPence));
  if (!input.registered || input.rateBp <= 0) return { net: amount, tax: 0, total: amount, rateBp: 0 };
  if (input.includesTax) {
    const net = Math.round((amount * 10000) / (10000 + input.rateBp));
    return { net, tax: amount - net, total: amount, rateBp: input.rateBp };
  }
  const tax = Math.round((amount * input.rateBp) / 10000);
  return { net: amount, tax, total: amount + tax, rateBp: input.rateBp };
}

/** "HILL-0007": the host's prefix and a running number, never reused. */
export function invoiceNumber(prefix: string, n: number): string {
  const clean = prefix.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12) || "INV";
  return `${clean}-${String(n).padStart(4, "0")}`;
}

/** A sensible starting prefix from the business name: "The Hill Suites" → "HILL". */
export function suggestPrefix(name: string | null | undefined): string {
  const words = (name ?? "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((w) => w && w !== "THE");
  return (words[0] ?? "INV").slice(0, 8) || "INV";
}

export function formatMoney(pence: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(pence / 100);
}

/** The line on the invoice: "Garden Room, 3 nights (12 to 15 Oct 2026)". */
export function stayDescription(room: string | null, nights: number, from: string, to: string): string {
  const what = room ? `${room}, ` : "Accommodation, ";
  return `${what}${nights} ${nights === 1 ? "night" : "nights"} (${from} to ${to})`;
}

/** What a guest may change before creating their invoice: email and postal address. */
export function cleanGuestDetails(input: { email?: string | null; address?: string | null }):
  | { ok: true; email: string | null; address: string | null }
  | { ok: false; problem: "email" | "address" } {
  const email = (input.email ?? "").trim();
  const address = (input.address ?? "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { ok: false, problem: "email" };
  if (address.length > 400) return { ok: false, problem: "address" };
  return { ok: true, email: email || null, address: address || null };
}

/** An invoice is only offered on a direct stay, when the host has it on and has entered a price. */
export function invoiceOffered(b: { channel: string; stay_amount_pence: number | null }, enabled: boolean): boolean {
  return enabled && b.channel === "direct" && b.stay_amount_pence !== null && b.stay_amount_pence > 0;
}

export type InvoiceLine = { date: string; description: string; amount_pence: number };

/**
 * One line per night with the amount shared equally; any pennies that don't
 * divide go to the earliest nights, so the lines always add up exactly.
 */
export function nightlyLines(
  amountPence: number,
  checkIn: string,
  checkOut: string,
  room: string | null,
  formatDate: (iso: string) => string,
): InvoiceLine[] {
  const nights: string[] = [];
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  for (let t = start; t < end && nights.length < 366; t += 86_400_000) nights.push(new Date(t).toISOString().slice(0, 10));
  if (nights.length === 0) return [];
  const total = Math.max(0, Math.round(amountPence));
  const each = Math.floor(total / nights.length);
  const extra = total - each * nights.length;
  const what = room ? `${room}, night of` : "Night of";
  return nights.map((date, i) => ({
    date,
    description: `${what} ${formatDate(date)}`,
    amount_pence: each + (i < extra ? 1 : 0),
  }));
}
