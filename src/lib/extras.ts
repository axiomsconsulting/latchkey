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
  /** A line under the name (a breakfast dish, what's in a pack). */
  description?: string;
  /** On the breakfast menu: how it's served and which part of the menu (options.breakfast). */
  breakfast?: BreakfastInfo;
  /** Early check-in / late check-out: blocks of hours and the latest (or earliest) time (options.slot, src/lib/stay-times.ts). */
  slot?: { stepHours: number; limit: string };
};

/* ------------------------------- breakfast ------------------------------- */

/** How breakfast reaches the guest: a light or packed breakfast, delivered to the room, or served in the dining room. */
export const BREAKFAST_STYLES = ["packed", "delivered", "dining"] as const;
export type BreakfastStyle = (typeof BREAKFAST_STYLES)[number];
export type BreakfastInfo = { style: BreakfastStyle; section?: string };

export function isBreakfast(i: Pick<ExtraItem, "breakfast">): boolean {
  return !!i.breakfast && (BREAKFAST_STYLES as readonly string[]).includes(i.breakfast.style);
}

/** options.breakfast from the database, made safe. */
export function normaliseBreakfast(raw: unknown): BreakfastInfo | undefined {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!(BREAKFAST_STYLES as readonly string[]).includes(r["style"] as string)) return undefined;
  const section =
    typeof r["section"] === "string" ? r["section"].replace(/\s+/g, " ").trim().slice(0, 40) : "";
  return section
    ? { style: r["style"] as BreakfastStyle, section }
    : { style: r["style"] as BreakfastStyle };
}

export type BreakfastMenu = Array<{
  style: BreakfastStyle;
  sections: Array<{ name: string; items: ExtraItem[] }>;
}>;

/** The guest's breakfast menu: only styles with something on them, sections in the host's order. */
export function breakfastMenu(items: ExtraItem[]): BreakfastMenu {
  const out: BreakfastMenu = [];
  for (const style of BREAKFAST_STYLES) {
    const list = items.filter((i) => i.active && i.breakfast?.style === style);
    if (!list.length) continue;
    const sections: Array<{ name: string; items: ExtraItem[] }> = [];
    for (const it of list) {
      const name = it.breakfast?.section ?? "";
      const sec = sections.find((x) => x.name === name);
      if (sec) sec.items.push(it);
      else sections.push({ name, items: [it] });
    }
    out.push({ style, sections });
  }
  return out;
}

/** Mornings breakfast can be ordered for: from tomorrow (or today, before the cut-off) to the check-out morning. */
export function breakfastMornings(opts: {
  today: string;
  nowTime: string;
  checkIn: string;
  checkOut: string;
  cutoff?: string;
}): string[] {
  const out: string[] = [];
  const first =
    opts.checkIn > opts.today
      ? addDay(opts.checkIn, 1)
      : opts.nowTime < (opts.cutoff ?? "07:00")
        ? opts.today
        : addDay(opts.today, 1);
  for (let d = first; d <= opts.checkOut && out.length < 30; d = addDay(d, 1)) out.push(d);
  return out;
}

/** Times to choose from, every half hour (07:00 to 10:30 by default). */
export function breakfastTimes(start = "07:00", end = "10:30"): string[] {
  const out: string[] = [];
  const [sh, sm] = start.split(":").map(Number) as [number, number];
  const [eh, em] = end.split(":").map(Number) as [number, number];
  for (let m = sh * 60 + sm; m <= eh * 60 + em; m += 30)
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  return out;
}

/** Every line of a breakfast order must be on that style's menu. */
export function breakfastProblem(
  items: ExtraItem[],
  lines: BasketLine[],
  style: BreakfastStyle,
): string | null {
  if (!lines.length) return "Choose something from the menu.";
  for (const l of lines) {
    const it = items.find((i) => i.key === l.key);
    if (!it || !it.active || it.breakfast?.style !== style)
      return "Something in your order isn't on that menu.";
  }
  return null;
}

function addDay(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const DEFAULT_EXTRAS: ExtraItem[] = [
  {
    key: "bath_towel",
    name: "Extra bath towel",
    pricePence: 300,
    unit: "item",
    maxQty: 4,
    isFree: false,
    autoApprove: true,
    active: true,
    isLoan: false,
  },
  {
    key: "hand_towel",
    name: "Hand towel",
    pricePence: 150,
    unit: "item",
    maxQty: 4,
    isFree: false,
    autoApprove: true,
    active: true,
    isLoan: false,
  },
  {
    key: "linen_change",
    name: "Full bed linen change",
    pricePence: 1000,
    unit: "item",
    maxQty: 1,
    isFree: false,
    autoApprove: false,
    active: true,
    isLoan: false,
  },
  {
    key: "duvet_cover",
    name: "Duvet cover",
    pricePence: 500,
    unit: "item",
    maxQty: 1,
    isFree: false,
    autoApprove: false,
    active: true,
    isLoan: false,
  },
  {
    key: "pillowcase",
    name: "Pillowcase",
    pricePence: 150,
    unit: "item",
    maxQty: 4,
    isFree: false,
    autoApprove: true,
    active: true,
    isLoan: false,
  },
  {
    key: "late_checkout",
    name: "Late check-out",
    pricePence: 1000,
    unit: "hour",
    maxQty: 2,
    isFree: false,
    autoApprove: true,
    active: true,
    isLoan: false,
  },
  {
    key: "early_checkin",
    name: "Early check-in",
    pricePence: 1000,
    unit: "hour",
    maxQty: 3,
    isFree: false,
    autoApprove: false,
    active: true,
    isLoan: false,
  },
  {
    key: "luggage",
    name: "Luggage storage",
    pricePence: 500,
    unit: "bag_day",
    maxQty: 4,
    isFree: false,
    autoApprove: true,
    active: true,
    isLoan: false,
    sizes: [
      { key: "small", label: "Small bag / backpack", pricePence: 400 },
      { key: "medium", label: "Cabin suitcase", pricePence: 500 },
      { key: "large", label: "Large suitcase", pricePence: 700 },
    ],
  },
  {
    key: "breakfast",
    name: "Continental breakfast pack",
    pricePence: 800,
    unit: "pack",
    maxQty: 4,
    isFree: false,
    autoApprove: false,
    active: false,
    isLoan: false,
  },
  {
    key: "kettle",
    name: "Kettle",
    pricePence: 0,
    unit: "item",
    maxQty: 1,
    isFree: true,
    autoApprove: true,
    active: true,
    isLoan: true,
  },
  {
    key: "hair_dryer",
    name: "Hair dryer",
    pricePence: 0,
    unit: "item",
    maxQty: 1,
    isFree: true,
    autoApprove: true,
    active: true,
    isLoan: true,
  },
  {
    key: "iron",
    name: "Iron and board",
    pricePence: 0,
    unit: "item",
    maxQty: 1,
    isFree: true,
    autoApprove: true,
    active: true,
    isLoan: true,
  },
  {
    key: "toilet_roll",
    name: "Toilet roll",
    pricePence: 0,
    unit: "item",
    maxQty: 4,
    isFree: true,
    autoApprove: true,
    active: true,
    isLoan: false,
  },
  {
    key: "toiletries",
    name: "Toiletries",
    pricePence: 0,
    unit: "item",
    maxQty: 2,
    isFree: true,
    autoApprove: true,
    active: true,
    isLoan: false,
  },
];

export type BasketLine = { key: string; qty: number; size?: string | null };

export type PricedLine = {
  key: string;
  name: string;
  qty: number;
  unitPence: number;
  totalPence: number;
  size: string | null;
};

export function priceBasket(items: ExtraItem[], lines: BasketLine[]): PricedLine[] {
  const out: PricedLine[] = [];
  for (const l of lines) {
    const it = items.find((i) => i.key === l.key && i.active);
    if (!it) throw new Error(`Unknown item: ${l.key}`);
    const qty = Math.floor(l.qty);
    if (qty < 1 || qty > it.maxQty)
      throw new Error(`${it.name}: choose between 1 and ${it.maxQty}.`);
    const size = it.sizes?.find((s) => s.key === l.size) ?? null;
    if (it.sizes?.length && !size) throw new Error(`${it.name}: choose a bag size.`);
    const unitPence = it.isFree ? 0 : (size?.pricePence ?? it.pricePence);
    out.push({
      key: it.key,
      name: size ? `${it.name} (${size.label})` : it.name,
      qty,
      unitPence,
      totalPence: unitPence * qty,
      size: size?.key ?? null,
    });
  }
  return out;
}

/** A basket auto-approves only if every line's item does. */
export function basketAutoApproves(items: ExtraItem[], lines: BasketLine[]): boolean {
  return (
    lines.length > 0 && lines.every((l) => items.find((i) => i.key === l.key)?.autoApprove === true)
  );
}

export type TaxSettings = {
  registered: boolean;
  label: string;
  rateBp: number;
  pricesInclude: boolean;
};

/** Tax split for receipts. Prices shown to guests are always the final amount. */
export function taxBreakdown(subtotalPence: number, t: TaxSettings) {
  if (!t.registered || t.rateBp <= 0)
    return { netPence: subtotalPence, taxPence: 0, totalPence: subtotalPence };
  if (t.pricesInclude) {
    const net = Math.round((subtotalPence * 10000) / (10000 + t.rateBp));
    return { netPence: net, taxPence: subtotalPence - net, totalPence: subtotalPence };
  }
  const tax = Math.round((subtotalPence * t.rateBp) / 10000);
  return { netPence: subtotalPence, taxPence: tax, totalPence: subtotalPence + tax };
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export type WindowKey = "asap" | "evening" | "morning" | "door";

export const WINDOWS: { key: WindowKey; start?: string; end?: string }[] = [
  { key: "asap" },
  { key: "evening", start: "18:00", end: "21:00" },
  { key: "morning", start: "08:00", end: "10:00" },
  { key: "door" },
];

/** Delivery windows that don't overlap quiet hours (which may wrap midnight) or blocked times. */
export function availableWindows(
  quietStart: string,
  quietEnd: string,
  blocked: { start: string; end: string }[],
): WindowKey[] {
  const qs = toMin(quietStart);
  const qe = toMin(quietEnd);
  const inQuiet = (s: number, e: number) => (qs > qe ? s < qe || e > qs : s < qe && e > qs);
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

/**
 * Amounts are kept in hundredths of the currency's main unit everywhere
 * (pence, cents, and for yen 120000 = ¥1,200). Stripe wants zero-decimal
 * currencies (yen, won…) in whole units instead.
 */
const ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);
export function stripeAmount(hundredths: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? Math.round(hundredths / 100) : hundredths;
}
