/**
 * Extras price list, basket pricing, tax, late check-out / early check-in
 * availability and delivery windows. Pure and tested.
 */

export type ExtraUnit = "item" | "hour" | "bag_day" | "pack";

export type ExtraItem = {
  key: string;
  name: string;
  pricePence: number;
  unit: ExtraUnit;
  maxQty: number;
  isFree: boolean;
  autoApprove: boolean;
  active: boolean;
  isLoan: boolean;
  /** Bag size multipliers for luggage (Bounce-style). */
  sizes?: { key: string; label: string; pricePence: number }[];
};

export const DEFAULT_EXTRAS: ExtraItem[] = [
  { key: "bath_towel", name: "Extra bath towel", pricePence: 300, unit: "item", maxQty: 4, isFree: false, autoApprove: true, active: true, isLoan: false },
  { key: "hand_towel", name: "Hand towel", pricePence: 150, unit: "item", maxQty: 4, isFree: false, autoApprove: true, active: true, isLoan: false },
  { key: "linen_change", name: "Full bed linen change", pricePence: 1000, unit: "item", maxQty: 1, isFree: false, autoApprove: false, active: true, isLoan: false },
  { key: "duvet_cover", name: "Duvet cover", pricePence: 500, unit: "item", maxQty: 1, isFree: false, autoApprove: false, active: true, isLoan: false },
  { key: "pillowcase", name: "Pillowcase", pricePence: 150, unit: "item", maxQty: 4, isFree: false, autoApprove: true, active: true, isLoan: false },
  { key: "late_checkout", name: "Late check-out", pricePence: 1000, unit: "hour", maxQty: 2, isFree: false, autoApprove: true, active: true, isLoan: false },
  { key: "early_checkin", name: "Early check-in", pricePence: 1000, unit: "hour", maxQty: 3, isFree: false, autoApprove: false, active: true, isLoan: false },
  {
    key: "luggage", name: "Luggage storage", pricePence: 500, unit: "bag_day", maxQty: 4, isFree: false, autoApprove: true, active: true, isLoan: false,
    sizes: [
      { key: "small", label: "Small bag / backpack", pricePence: 400 },
      { key: "medium", label: "Cabin suitcase", pricePence: 500 },
      { key: "large", label: "Large suitcase", pricePence: 700 },
    ],
  },
  { key: "breakfast", name: "Continental breakfast pack", pricePence: 800, unit: "pack", maxQty: 4, isFree: false, autoApprove: false, active: false, isLoan: false },
  { key: "kettle", name: "Kettle", pricePence: 0, unit: "item", maxQty: 1, isFree: true, autoApprove: true, active: true, isLoan: true },
  { key: "hair_dryer", name: "Hair dryer", pricePence: 0, unit: "item", maxQty: 1, isFree: true, autoApprove: true, active: true, isLoan: true },
  { key: "iron", name: "Iron and board", pricePence: 0, unit: "item", maxQty: 1, isFree: true, autoApprove: true, active: true, isLoan: true },
  { key: "toilet_roll", name: "Toilet roll", pricePence: 0, unit: "item", maxQty: 4, isFree: true, autoApprove: true, active: true, isLoan: false },
  { key: "toiletries", name: "Toiletries", pricePence: 0, unit: "item", maxQty: 2, isFree: true, autoApprove: true, active: true, isLoan: false },
];

export type BasketLine = { key: string; qty: number; size?: string | null };

export type PricedLine = { key: string; name: string; qty: number; unitPence: number; totalPence: number; size: string | null };

export function priceBasket(items: ExtraItem[], lines: BasketLine[]): PricedLine[] {
  const out: PricedLine[] = [];
  for (const l of lines) {
    const it = items.find((i) => i.key === l.key && i.active);
    if (!it) throw new Error(`Unknown item: ${l.key}`);
    const qty = Math.floor(l.qty);
    if (qty < 1 || qty > it.maxQty) throw new Error(`${it.name}: choose between 1 and ${it.maxQty}.`);
    const size = it.sizes?.find((s) => s.key === l.size) ?? null;
    if (it.sizes?.length && !size) throw new Error(`${it.name}: choose a bag size.`);
    const unitPence = it.isFree ? 0 : (size?.pricePence ?? it.pricePence);
    out.push({ key: it.key, name: size ? `${it.name} (${size.label})` : it.name, qty, unitPence, totalPence: unitPence * qty, size: size?.key ?? null });
  }
  return out;
}

/** A basket auto-approves only if every line's item does. */
export function basketAutoApproves(items: ExtraItem[], lines: BasketLine[]): boolean {
  return lines.length > 0 && lines.every((l) => items.find((i) => i.key === l.key)?.autoApprove === true);
}

export type TaxSettings = { registered: boolean; label: string; rateBp: number; pricesInclude: boolean };

/** Tax split for receipts. Prices shown to guests are always the final amount. */
export function taxBreakdown(subtotalPence: number, t: TaxSettings) {
  if (!t.registered || t.rateBp <= 0) return { netPence: subtotalPence, taxPence: 0, totalPence: subtotalPence };
  if (t.pricesInclude) {
    const net = Math.round((subtotalPence * 10000) / (10000 + t.rateBp));
    return { netPence: net, taxPence: subtotalPence - net, totalPence: subtotalPence };
  }
  const tax = Math.round((subtotalPence * t.rateBp) / 10000);
  return { netPence: subtotalPence, taxPence: tax, totalPence: subtotalPence + tax };
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Late check-out hours on offer: none if another stay arrives in the room that
 * day; otherwise 1..maxHours, skipping any that run into an unavailability window.
 */
export function lateCheckoutOptions(opts: {
  checkOutTime: string;
  maxHours: number;
  sameDayArrival: boolean;
  blocked: { start: string; end: string }[];
}): { hours: number; until: string }[] {
  if (opts.sameDayArrival) return [];
  const base = toMin(opts.checkOutTime);
  const out: { hours: number; until: string }[] = [];
  for (let h = 1; h <= opts.maxHours; h++) {
    const end = base + h * 60;
    if (opts.blocked.some((b) => toMin(b.start) < end && toMin(b.end) > base)) break;
    out.push({ hours: h, until: toHhmm(end) });
  }
  return out;
}

/** Early check-in hours: none if the room has a guest leaving that day. */
export function earlyCheckinOptions(opts: {
  checkInTime: string;
  maxHours: number;
  sameDayDeparture: boolean;
  blocked: { start: string; end: string }[];
}): { hours: number; from: string }[] {
  if (opts.sameDayDeparture) return [];
  const base = toMin(opts.checkInTime);
  const out: { hours: number; from: string }[] = [];
  for (let h = 1; h <= opts.maxHours; h++) {
    const start = base - h * 60;
    if (start < 8 * 60) break;
    if (opts.blocked.some((b) => toMin(b.start) < base && toMin(b.end) > start)) break;
    out.push({ hours: h, from: toHhmm(start) });
  }
  return out;
}

export type WindowKey = "asap" | "evening" | "morning" | "door";

export const WINDOWS: { key: WindowKey; start?: string; end?: string }[] = [
  { key: "asap" },
  { key: "evening", start: "18:00", end: "21:00" },
  { key: "morning", start: "08:00", end: "10:00" },
  { key: "door" },
];

/** Delivery windows that don't overlap quiet hours (which may wrap midnight) or blocked times. */
export function availableWindows(quietStart: string, quietEnd: string, blocked: { start: string; end: string }[]): WindowKey[] {
  const qs = toMin(quietStart);
  const qe = toMin(quietEnd);
  const inQuiet = (s: number, e: number) =>
    qs > qe ? s < qe || e > qs : s < qe && e > qs;
  return WINDOWS.filter((w) => {
    if (!w.start || !w.end) return true;
    const s = toMin(w.start);
    const e = toMin(w.end);
    if (inQuiet(s, e)) return false;
    return !blocked.some((b) => toMin(b.start) < e && toMin(b.end) > s);
  }).map((w) => w.key);
}

/** Minutes of cleaning time left between a (possibly late) check-out and the next arrival. */
export function cleaningGapMinutes(checkOut: string, nextCheckIn: string): number {
  return toMin(nextCheckIn) - toMin(checkOut);
}
