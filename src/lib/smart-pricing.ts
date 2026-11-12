/**
 * Smart pricing for direct stays (properties.smart_pricing, migration 0107). Latchkey reads the
 * price guests see on the booking sites (the host's own listings, and other properties' listings
 * the host chooses) for a few sample stays on a schedule, then works out:
 *
 *  - what each room's direct nightly rate should be (match, a little under or over, or "earn the
 *    same": the direct price that leaves the host what a booking on the site would), never below the
 *    room's lowest price, taking seasonal offers into account;
 *  - what the host's price on each site should be so a booking there earns the same as a direct one,
 *    after the site's commission and the discounts the host runs there (stacked the way each site
 *    combines them);
 *  - what Stripe keeps from a direct payment (by card, by bank app or by transfer).
 *
 * Nothing changes by itself: the host accepts a suggestion (one tap) on Direct stays → Set-up.
 * Commissions and stacking rules are starting points from each site's published terms and
 * partner guides; hosts adjust them to their own contract. Pure; tested in
 * tests/smart-pricing.test.ts.
 */
import { addDays } from "./dates";
import { offerOn, type SeasonalOffer } from "./direct-rates";

/* --------------------------------- sites --------------------------------- */

export type PriceSite = "airbnb" | "booking_com" | "vrbo" | "agoda" | "expedia" | "homestay";
export const PRICE_SITES: PriceSite[] = [
  "booking_com",
  "airbnb",
  "vrbo",
  "expedia",
  "agoda",
  "homestay",
];

/** A site's fee: what it takes from the host (`host`, %) and adds on top for the guest (`guest`, %). */
export type SiteFee = { host: number; guest: number };

export type FeePreset = { key: string; label: string; fee: SiteFee };

/**
 * Each site's usual fees, as starting points (late 2026). Hosts move the slider to their own rate:
 * Booking.com's commission is 15% in the UK, more for Preferred Partner (about 3 points) or
 * Visibility Booster; Airbnb charges most hosts a single 15.5% host-only fee (the older split fee
 * was 3% from the host plus a guest service fee); Vrbo's pay-per-booking is 5% commission plus 3%
 * payment processing; Expedia and Agoda agree a rate with each property, usually 15 to 25%.
 */
export const SITE_FEES: Record<
  PriceSite,
  { label: string; min: number; max: number; presets: FeePreset[] }
> = {
  booking_com: {
    label: "Booking.com",
    min: 10,
    max: 40,
    presets: [
      { key: "standard", label: "Standard", fee: { host: 15, guest: 0 } },
      { key: "preferred", label: "Preferred Partner", fee: { host: 18, guest: 0 } },
    ],
  },
  airbnb: {
    label: "Airbnb",
    min: 3,
    max: 25,
    presets: [
      { key: "host_only", label: "Host-only fee", fee: { host: 15.5, guest: 0 } },
      { key: "split", label: "Split fee (older)", fee: { host: 3, guest: 14 } },
    ],
  },
  vrbo: {
    label: "Vrbo",
    min: 5,
    max: 20,
    presets: [{ key: "per_booking", label: "Pay per booking", fee: { host: 8, guest: 0 } }],
  },
  expedia: {
    label: "Expedia",
    min: 10,
    max: 30,
    presets: [{ key: "typical", label: "Typical", fee: { host: 18, guest: 0 } }],
  },
  agoda: {
    label: "Agoda",
    min: 10,
    max: 30,
    presets: [{ key: "typical", label: "Typical", fee: { host: 18, guest: 0 } }],
  },
  homestay: {
    label: "Homestay",
    min: 5,
    max: 30,
    presets: [{ key: "typical", label: "Typical", fee: { host: 15, guest: 0 } }],
  },
};

export const defaultFee = (site: PriceSite): SiteFee => ({ ...SITE_FEES[site].presets[0]!.fee });

/** "booking.com" links and the like → a site, or null (other sites aren't read for prices). */
export function priceSiteOf(site: string | null | undefined): PriceSite | null {
  const s = (site ?? "").toLowerCase();
  if (s === "booking_com" || s === "booking" || s === "booking.com") return "booking_com";
  return (PRICE_SITES as string[]).includes(s) ? (s as PriceSite) : null;
}

/* ------------------------------ site discounts ------------------------------ */

/**
 * Who a site discount reaches: everyone (it's in the price anyone sees), signed-in members (Genius),
 * people on a phone, or people in chosen countries. Latchkey reads prices as a signed-out visitor
 * on a computer, so only "everyone" discounts are in the prices it sees.
 */
export type Audience = "everyone" | "members" | "mobile" | "country";

export type SiteOffer = {
  key: string;
  label: string;
  audience: Audience;
  /** Offers in the same group don't combine: the guest gets the biggest (or the first by priority). */
  group: string;
  /** Replaces every other discount when it applies (Airbnb's new listing promotion). */
  exclusive?: boolean;
  /** Groups this offer never combines with (Booking.com's mobile and country rates). */
  notWith?: string[];
  /** Usual percentage, as a starting point. */
  usual: number;
};

/**
 * The discounts each site lets hosts run, and how they combine (from the sites' partner guides;
 * hosts check their own extranet). Booking.com: one deal at a time (Basic, Early Booker, Last
 * Minute, Getaway, Limited-time), Genius on top for members, the mobile rate on top for phones
 * but not with a country rate. Airbnb: the new listing promotion (20%, first three bookings)
 * replaces everything; otherwise one of length-of-stay, early bird or last-minute applies.
 */
export const SITE_OFFERS: Record<PriceSite, SiteOffer[]> = {
  booking_com: [
    {
      key: "deal",
      label: "Deal (Basic, Early Booker, Last Minute…)",
      audience: "everyone",
      group: "deal",
      usual: 10,
    },
    { key: "genius", label: "Genius (members)", audience: "members", group: "genius", usual: 10 },
    {
      key: "mobile",
      label: "Mobile rate",
      audience: "mobile",
      group: "mobile",
      notWith: ["country"],
      usual: 10,
    },
    {
      key: "country",
      label: "Country rate",
      audience: "country",
      group: "country",
      notWith: ["mobile"],
      usual: 10,
    },
  ],
  airbnb: [
    {
      key: "new_listing",
      label: "New listing promotion",
      audience: "everyone",
      group: "promo",
      exclusive: true,
      usual: 20,
    },
    {
      key: "length_of_stay",
      label: "Weekly or monthly discount",
      audience: "everyone",
      group: "promo",
      usual: 10,
    },
    { key: "early_bird", label: "Early bird", audience: "everyone", group: "promo", usual: 5 },
    { key: "last_minute", label: "Last-minute", audience: "everyone", group: "promo", usual: 5 },
  ],
  vrbo: [
    { key: "deal", label: "Discount or promotion", audience: "everyone", group: "deal", usual: 10 },
  ],
  expedia: [
    { key: "deal", label: "Promotion", audience: "everyone", group: "deal", usual: 10 },
    { key: "member", label: "Member price", audience: "members", group: "member", usual: 10 },
    { key: "mobile", label: "Mobile rate", audience: "mobile", group: "mobile", usual: 10 },
  ],
  agoda: [
    { key: "deal", label: "Promotion", audience: "everyone", group: "deal", usual: 10 },
    { key: "member", label: "Member (VIP) price", audience: "members", group: "member", usual: 5 },
    { key: "mobile", label: "Mobile rate", audience: "mobile", group: "mobile", usual: 10 },
  ],
  homestay: [{ key: "deal", label: "Discount", audience: "everyone", group: "deal", usual: 10 }],
};

/** The host's discounts on a site: offer key → percent (0 or missing = not running). */
export type RunningOffers = Record<string, number>;

/**
 * The combined discount a guest gets on a site, as a fraction (0.28 = 28% off), from the offers the
 * host runs that reach them. `reach` = which audiences this guest is in ("everyone" is always in).
 * One offer per group (the biggest); groups multiply; an exclusive offer replaces everything;
 * `notWith` pairs keep only the bigger.
 */
export function stackedDiscount(
  site: PriceSite,
  running: RunningOffers,
  reach: Audience[] = ["everyone"],
): number {
  const audiences = new Set<Audience>(["everyone", ...reach]);
  const on = SITE_OFFERS[site]
    .map((o) => ({ ...o, pct: clampPct(running[o.key]) }))
    .filter((o) => o.pct > 0 && audiences.has(o.audience));
  const exclusive = on.filter((o) => o.exclusive).sort((a, b) => b.pct - a.pct)[0];
  if (exclusive) return exclusive.pct / 100;
  const best = new Map<string, (typeof on)[number]>();
  for (const o of on) {
    const cur = best.get(o.group);
    if (!cur || o.pct > cur.pct) best.set(o.group, o);
  }
  // Pairs that never combine: keep the bigger.
  for (const o of [...best.values()]) {
    for (const g of o.notWith ?? []) {
      const other = best.get(g);
      if (other && best.has(o.group)) best.delete(other.pct > o.pct ? o.group : g);
    }
  }
  let keep = 1;
  for (const o of best.values()) keep *= 1 - o.pct / 100;
  return round4(1 - keep);
}

const clampPct = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(90, Math.max(0, v)) : 0;
const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

/** Every audience: the lowest price a guest could find there (a member, on a phone). */
export const ALL_AUDIENCES: Audience[] = ["everyone", "members", "mobile", "country"];

/* -------------------------------- money -------------------------------- */

/** How a direct guest pays, for what Stripe keeps. */
export type PayWay =
  "card_standard" | "card_premium" | "card_eea" | "card_intl" | "pay_by_bank" | "bank_transfer";

type FeeRule = { pct: number; fixed: number; cap?: number };

/**
 * Stripe's published UK prices (stripe.com/gb/pricing, late 2026), in pence: standard UK cards
 * 1.5% + 20p, premium UK cards 2.8% + 20p, EEA cards 2.5% + 20p, other cards 3.15% + 20p (plus 2%
 * when the currency is converted), Pay by Bank 0.5% + 20p capped at £5. A bank transfer to the
 * host costs nothing through Latchkey. Other countries: see Stripe's page for that country.
 */
const STRIPE_GB: Record<Exclude<PayWay, "bank_transfer">, FeeRule> = {
  card_standard: { pct: 1.5, fixed: 20 },
  card_premium: { pct: 2.8, fixed: 20 },
  card_eea: { pct: 2.5, fixed: 20 },
  card_intl: { pct: 3.15, fixed: 20 },
  pay_by_bank: { pct: 0.5, fixed: 20, cap: 500 },
};
export const STRIPE_FX_PCT = 2;

/** What Stripe keeps from a payment, in hundredths; null when Latchkey doesn't know the prices for that account's country. */
export function paymentFee(
  amount: number,
  way: PayWay,
  o: { country?: string | null | undefined; converted?: boolean } = {},
): number | null {
  if (way === "bank_transfer") return 0;
  if ((o.country ?? "GB").toUpperCase() !== "GB") return null;
  const r = STRIPE_GB[way];
  let fee = (amount * r.pct) / 100 + r.fixed;
  if (r.cap !== undefined) fee = Math.min(r.cap, fee);
  if (o.converted && way !== "pay_by_bank") fee += (amount * STRIPE_FX_PCT) / 100;
  return Math.round(fee);
}

/** What the host keeps from a direct booking paid this way (the price when fees aren't known). */
export const directNet = (price: number, way: PayWay, country?: string | null) =>
  price - (paymentFee(price, way, { country }) ?? 0);

/** What the host keeps from a price a guest sees on a site (their fee added on top is taken out first). */
export const siteNet = (guestPrice: number, fee: SiteFee) =>
  (guestPrice / (1 + fee.guest / 100)) * (1 - fee.host / 100);

/** The direct price that leaves the host `net` after Stripe, paid this way. */
export function priceForNet(net: number, way: PayWay, country?: string | null): number {
  if (way === "bank_transfer" || (country ?? "GB").toUpperCase() !== "GB") return net;
  const r = STRIPE_GB[way];
  const uncapped = (net + r.fixed) / (1 - r.pct / 100);
  if (r.cap !== undefined && (uncapped * r.pct) / 100 + r.fixed > r.cap) return net + r.cap;
  return uncapped;
}

/* ------------------------------ settings ------------------------------ */

export type Schedule =
  | { kind: "daily" }
  | { kind: "weekdays" }
  | { kind: "weekends" }
  | { kind: "weekly"; days: number[] }
  | { kind: "every"; days: number }
  | { kind: "monthly"; day: number };

/** Where the direct price sits against the price on the sites. */
export type Position = {
  mode: "below" | "match" | "above" | "same_earnings";
  by: "percent" | "amount";
  /** Percent, or hundredths a night. */
  value: number;
};

export type MarketLink = { url: string; site: PriceSite; label: string; roomId: string | null };

export type SmartPricing = {
  on: boolean;
  schedule: Schedule;
  /** How far ahead to look, and how many sample stays to read each time (each is one page read). */
  horizonDays: number;
  samples: number;
  nights: number;
  /** Compare with the host's own listings, other properties, or own first. */
  reference: "own" | "market" | "own_then_market";
  position: Position;
  /** Compare with the price anyone sees, or the lowest a guest could get (member, on a phone). */
  compareTo: "public" | "lowest";
  /** How direct guests usually pay, for what's kept after Stripe. */
  payWay: PayWay;
  /** A suggestion never moves a rate by more than this in one go (a bad read can't swing it). */
  maxStepPct: number;
  /** Each room's lowest nightly price, after any offer (hundredths). */
  floors: Record<string, number>;
  /** Highest total discount (seasonal offer and non-refundable rate together) on the booking page; 90 = no limit. */
  maxDiscountPct: number;
  fees: Partial<Record<PriceSite, SiteFee>>;
  offers: Partial<Record<PriceSite, RunningOffers>>;
  /** Extra the host wants on a site above "earns the same" (to cover their own costs there). */
  siteMarkupPct: number;
  market: MarketLink[];
  /** After the host changes their price on a site, no new suggestion for that site for this long. */
  cooldownDays: number;
  /** Suggestions the host accepted (newest first). */
  history: Array<{ at: string; roomId: string; from: number | null; to: number }>;
};

export const MAX_MARKET = 10;
export const MAX_SAMPLES = 6;
/** At most this many page reads for one property in one go, so a read can't run up the bill. */
export const MAX_READS = 24;

export const DEFAULT_SMART_PRICING: SmartPricing = {
  on: false,
  schedule: { kind: "weekly", days: [1] },
  horizonDays: 60,
  samples: 3,
  nights: 2,
  reference: "own_then_market",
  position: { mode: "below", by: "percent", value: 5 },
  compareTo: "lowest",
  payWay: "card_standard",
  maxStepPct: 20,
  floors: {},
  maxDiscountPct: 90,
  fees: {},
  offers: {},
  siteMarkupPct: 0,
  market: [],
  cooldownDays: 14,
  history: [],
};

const num = (v: unknown, lo: number, hi: number, fb: number, step = 1) => {
  if (typeof v !== "number" || !Number.isFinite(v)) return fb;
  return Math.min(hi, Math.max(lo, Math.round(v / step) * step));
};
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const UUID = /^[0-9a-f-]{36}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}/;

export function normaliseSchedule(raw: unknown): Schedule {
  const r = obj(raw);
  switch (r["kind"]) {
    case "daily":
    case "weekdays":
    case "weekends":
      return { kind: r["kind"] };
    case "weekly": {
      const days = Array.isArray(r["days"])
        ? [
            ...new Set(
              r["days"].filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6),
            ),
          ].sort()
        : [];
      return { kind: "weekly", days: days.length ? days : [1] };
    }
    case "every":
      return { kind: "every", days: num(r["days"], 2, 30, 3) };
    case "monthly":
      return { kind: "monthly", day: num(r["day"], 1, 28, 1) };
    default:
      return DEFAULT_SMART_PRICING.schedule;
  }
}

export function normaliseSmartPricing(raw: unknown): SmartPricing {
  const r = obj(raw);
  const pos = obj(r["position"]);
  const mode = ["below", "match", "above", "same_earnings"].includes(pos["mode"] as string)
    ? (pos["mode"] as Position["mode"])
    : DEFAULT_SMART_PRICING.position.mode;
  const by = pos["by"] === "amount" ? "amount" : "percent";
  const fees: SmartPricing["fees"] = {};
  for (const [k, v] of Object.entries(obj(r["fees"]))) {
    const site = priceSiteOf(k);
    if (!site) continue;
    const f = obj(v);
    const lim = SITE_FEES[site];
    fees[site] = {
      host: num(f["host"], 0, lim.max, defaultFee(site).host, 0.5),
      guest: num(f["guest"], 0, 25, 0, 0.5),
    };
  }
  const offers: SmartPricing["offers"] = {};
  for (const [k, v] of Object.entries(obj(r["offers"]))) {
    const site = priceSiteOf(k);
    if (!site) continue;
    const known = new Set(SITE_OFFERS[site].map((o) => o.key));
    const run: RunningOffers = {};
    for (const [ok, ov] of Object.entries(obj(v)))
      if (known.has(ok)) {
        const pct = num(ov, 0, 90, 0);
        if (pct > 0) run[ok] = pct;
      }
    offers[site] = run;
  }
  const floors: Record<string, number> = {};
  for (const [id, v] of Object.entries(obj(r["floors"])))
    if (UUID.test(id) && typeof v === "number" && v > 0) floors[id] = num(v, 0, 100_000_000, 0);
  const market: MarketLink[] = [];
  for (const m of Array.isArray(r["market"]) ? r["market"] : []) {
    const x = obj(m);
    const site = priceSiteOf(x["site"] as string);
    const url =
      typeof x["url"] === "string" && /^https:\/\//.test(x["url"]) ? x["url"].slice(0, 500) : null;
    if (!site || !url || market.some((y) => y.url === url)) continue;
    market.push({
      url,
      site,
      label:
        typeof x["label"] === "string"
          ? x["label"]
              // eslint-disable-next-line no-control-regex -- strips control characters from text people type
              .replace(/[\u0000-\u001f<>]/g, "")
              .trim()
              .slice(0, 60)
          : "",
      roomId: typeof x["roomId"] === "string" && UUID.test(x["roomId"]) ? x["roomId"] : null,
    });
    if (market.length >= MAX_MARKET) break;
  }
  const history = (Array.isArray(r["history"]) ? r["history"] : [])
    .map(obj)
    .filter(
      (h) =>
        typeof h["at"] === "string" &&
        ISO.test(h["at"] as string) &&
        UUID.test(String(h["roomId"])),
    )
    .map((h) => ({
      at: h["at"] as string,
      roomId: h["roomId"] as string,
      from: typeof h["from"] === "number" ? (h["from"] as number) : null,
      to: num(h["to"], 0, 100_000_000, 0),
    }))
    .slice(0, 30);
  const ways: PayWay[] = [
    "card_standard",
    "card_premium",
    "card_eea",
    "card_intl",
    "pay_by_bank",
    "bank_transfer",
  ];
  return {
    on: r["on"] === true,
    schedule: normaliseSchedule(r["schedule"]),
    horizonDays: num(r["horizonDays"], 7, 365, DEFAULT_SMART_PRICING.horizonDays),
    samples: num(r["samples"], 1, MAX_SAMPLES, DEFAULT_SMART_PRICING.samples),
    nights: num(r["nights"], 1, 7, DEFAULT_SMART_PRICING.nights),
    reference: ["own", "market", "own_then_market"].includes(r["reference"] as string)
      ? (r["reference"] as SmartPricing["reference"])
      : DEFAULT_SMART_PRICING.reference,
    position: {
      mode,
      by,
      value:
        by === "percent"
          ? num(pos["value"], 0, 50, DEFAULT_SMART_PRICING.position.value)
          : num(pos["value"], 0, 100_000, 500),
    },
    compareTo: r["compareTo"] === "public" ? "public" : "lowest",
    payWay: ways.includes(r["payWay"] as PayWay) ? (r["payWay"] as PayWay) : "card_standard",
    maxStepPct: num(r["maxStepPct"], 5, 50, DEFAULT_SMART_PRICING.maxStepPct),
    floors,
    maxDiscountPct: num(r["maxDiscountPct"], 0, 90, DEFAULT_SMART_PRICING.maxDiscountPct),
    fees,
    offers,
    siteMarkupPct: num(r["siteMarkupPct"], 0, 30, 0),
    market,
    cooldownDays: num(r["cooldownDays"], 0, 60, DEFAULT_SMART_PRICING.cooldownDays),
    history,
  };
}

export const feeFor = (s: SmartPricing, site: PriceSite): SiteFee =>
  s.fees[site] ?? defaultFee(site);

/* ------------------------------ schedule ------------------------------ */

const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Is a read due today (property time)? At most once a day. `last` = the day of the last read. */
export function readDue(s: Schedule, last: string | null, today: string): boolean {
  if (last && last.slice(0, 10) >= today) return false;
  const d = weekday(today);
  switch (s.kind) {
    case "daily":
      return true;
    case "weekdays":
      return d >= 1 && d <= 5;
    case "weekends":
      return d === 0 || d === 6;
    case "weekly":
      // A missed day (the routine was off) catches up at the next run.
      return s.days.includes(d) || (!!last && daysBetween(last.slice(0, 10), today) > 7);
    case "every":
      return !last || daysBetween(last.slice(0, 10), today) >= s.days;
    case "monthly":
      return (
        Number(today.slice(8, 10)) === s.day ||
        (!!last && daysBetween(last.slice(0, 10), today) > 31)
      );
  }
}

/**
 * Which stays to read: spread over the next `horizon` days, weekdays and weekends both (Friday soon,
 * a Tuesday soon, a Saturday a fortnight out, then a month and two out), `count` of them.
 */
export function sampleStays(
  today: string,
  o: { horizon: number; count: number; nights: number },
): Array<{ checkIn: string; checkOut: string }> {
  const next = (from: string, day: number) => {
    const gap = (day - weekday(from) + 7) % 7 || 7;
    return addDays(from, gap);
  };
  const picks = [
    next(today, 5),
    next(today, 2),
    next(addDays(today, 13), 6),
    next(addDays(today, 27), 3),
    next(addDays(today, 55), 5),
    next(addDays(today, 85), 6),
  ];
  const out: string[] = [];
  for (const d of picks)
    if (daysBetween(today, d) <= o.horizon && !out.includes(d) && out.length < o.count) out.push(d);
  return out.sort().map((checkIn) => ({ checkIn, checkOut: addDays(checkIn, o.nights) }));
}

/* ------------------------------ readings ------------------------------ */

/** One price read: the per-night price a guest saw for a stay (hundredths), on a site. */
export type Reading = {
  site: PriceSite;
  kind: "own" | "market";
  roomId: string | null;
  checkIn: string;
  nights: number;
  nightly: number | null;
  seenAt: string;
};

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** The comparison price for a reading: the price seen, less the discounts only some guests get when comparing with the lowest. */
export function comparable(r: Reading, s: SmartPricing): number | null {
  if (r.nightly === null || r.nightly <= 0) return null;
  if (s.compareTo === "public" || r.kind === "market") return r.nightly;
  // Our own listing: we know what else members or phone users get there.
  const run = s.offers[r.site] ?? {};
  const seen = stackedDiscount(r.site, run, ["everyone"]);
  const lowest = stackedDiscount(r.site, run, ALL_AUDIENCES);
  return (r.nightly * (1 - lowest)) / (1 - seen);
}

/* ---------------------------- suggestions ---------------------------- */

export type RoomInput = {
  id: string;
  name: string;
  /** Current direct nightly rate (hundredths), or null when the room has none yet. */
  rate: number | null;
};

export type DirectSuggestion = {
  roomId: string;
  current: number | null;
  /** The suggested nightly rate, before seasonal offers (whole currency units). */
  suggested: number | null;
  /** What it's based on. */
  basis: "own" | "market" | null;
  /** Per sample night: the site's comparison price and the direct price aimed for. */
  points: Array<{ checkIn: string; site: PriceSite; seen: number; aim: number; offer: number }>;
  /** Kept to the room's lowest price, or held back by the step limit. */
  floored: boolean;
  stepped: boolean;
  /** Seasonal offers that would take this room under its lowest price (they're held at it). */
  offerWarnings: Array<{ offer: string; price: number }>;
  /** Readings that looked wrong (far from the others) and were left out. */
  ignored: number;
  /** What the host keeps from a direct night at the suggestion, and from the same night on the site. */
  keepDirect: number | null;
  keepSite: number | null;
};

const roundUnit = (pence: number) => Math.max(0, Math.round(pence / 100) * 100);

/** The direct price aimed for against a comparison price on a site. */
export function aimFor(
  seen: number,
  site: PriceSite,
  s: SmartPricing,
  country?: string | null,
): number {
  const p = s.position;
  switch (p.mode) {
    case "match":
      return seen;
    case "below":
      return p.by === "percent" ? seen * (1 - p.value / 100) : seen - p.value;
    case "above":
      return p.by === "percent" ? seen * (1 + p.value / 100) : seen + p.value;
    case "same_earnings":
      return priceForNet(siteNet(seen, feeFor(s, site)), s.payWay, country);
  }
}

/** Drops readings far from the rest (a misread page): more than 2.5x or under 0.4x the middle one. */
export function dropOutliers<T extends { seen: number }>(xs: T[]): { kept: T[]; dropped: number } {
  const m = median(xs.map((x) => x.seen));
  if (m === null) return { kept: [], dropped: 0 };
  const kept = xs.filter((x) => x.seen <= m * 2.5 && x.seen >= m * 0.4);
  return { kept, dropped: xs.length - kept.length };
}

/**
 * The direct rate suggestion for one room from the latest readings: each sample night's aim,
 * grossed up for that night's seasonal offer (so the price after the offer lands on the aim), the
 * middle of those, rounded to a whole unit, kept at or above the room's lowest price, and moved
 * at most maxStepPct from the current rate in one go.
 */
export function suggestDirect(
  room: RoomInput,
  readings: Reading[],
  s: SmartPricing,
  offers: SeasonalOffer[],
  o: { country?: string | null | undefined; today: string; pausedSites?: PriceSite[] } = {
    today: "",
  },
): DirectSuggestion {
  const mine = readings.filter((r) => r.roomId === room.id || r.roomId === null);
  const own = mine.filter((r) => r.kind === "own");
  const market = mine.filter((r) => r.kind === "market");
  const pick =
    s.reference === "own"
      ? own
      : s.reference === "market"
        ? market
        : own.some((r) => r.nightly)
          ? own
          : market;
  const basis = pick === own ? "own" : "market";
  const raw = pick
    .map((r) => {
      const seen = comparable(r, s);
      if (seen === null) return null;
      const offer = offerOn(offers, room.id, r.checkIn)?.percent ?? 0;
      return {
        checkIn: r.checkIn,
        site: r.site,
        seen,
        aim: aimFor(seen, r.site, s, o.country),
        offer,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const { kept, dropped } = dropOutliers(raw);
  const floor = s.floors[room.id] ?? 0;
  const empty: DirectSuggestion = {
    roomId: room.id,
    current: room.rate,
    suggested: null,
    basis: null,
    points: [],
    floored: false,
    stepped: false,
    offerWarnings: [],
    ignored: dropped,
    keepDirect: null,
    keepSite: null,
  };
  if (!kept.length) return empty;
  const bases = kept.map((k) => k.aim / (1 - Math.min(90, k.offer) / 100));
  let suggested = roundUnit(median(bases)!);
  let stepped = false;
  if (room.rate && room.rate > 0) {
    const lo = room.rate * (1 - s.maxStepPct / 100);
    const hi = room.rate * (1 + s.maxStepPct / 100);
    if (suggested < lo || suggested > hi) {
      suggested = roundUnit(Math.min(hi, Math.max(lo, suggested)));
      stepped = true;
    }
  }
  const floored = floor > 0 && suggested < floor;
  if (floored) suggested = floor;
  const warnings = offers
    .filter((x) => (!x.roomIds || x.roomIds.includes(room.id)) && x.to >= o.today)
    .map((x) => ({ offer: x.label, price: Math.round(suggested * (1 - x.percent / 100)) }))
    .filter((w) => floor > 0 && w.price < floor);
  const mid = median(kept.map((k) => k.seen))!;
  const siteOf = kept[0]!.site;
  return {
    ...empty,
    suggested,
    basis,
    points: kept.map((k) => ({ ...k, seen: Math.round(k.seen), aim: Math.round(k.aim) })),
    floored,
    stepped,
    offerWarnings: warnings,
    keepDirect: Math.round(directNet(suggested, s.payWay, o.country)),
    keepSite: Math.round(siteNet(mid, feeFor(s, siteOf))),
  };
}

export type SiteSuggestion = {
  site: PriceSite;
  roomId: string;
  /** The nightly price to set on the site so a booking there keeps what a direct one does. */
  suggested: number;
  /** What a typical guest pays there after your discounts, and what you keep. */
  guestPays: number;
  keep: number;
  /** Your price there now (from the latest read, before discounts), if seen. */
  now: number | null;
  /** The host changed their price there lately: no new suggestion until the pause ends. */
  pausedUntil: string | null;
};

/**
 * What to charge on a site so a booking there leaves the host what a direct booking at `direct`
 * does (plus their markup), after the site's commission and the discounts they run there. The
 * discounts used are the deepest stack a guest can reach (a member on a phone), so the host never
 * earns less than direct. Rounded up to a whole unit.
 */
export function suggestSite(
  site: PriceSite,
  roomId: string,
  direct: number,
  s: SmartPricing,
  o: { country?: string | null | undefined; now?: number | null; pausedUntil?: string | null } = {},
): SiteSuggestion {
  const fee = feeFor(s, site);
  const target = directNet(direct, s.payWay, o.country) * (1 + s.siteMarkupPct / 100);
  const d = stackedDiscount(site, s.offers[site] ?? {}, ALL_AUDIENCES);
  const price = target / ((1 - d) * (1 - fee.host / 100));
  const suggested = Math.ceil(price / 100) * 100;
  const guestPays = Math.round(suggested * (1 - d) * (1 + fee.guest / 100));
  return {
    site,
    roomId,
    suggested,
    guestPays,
    keep: Math.round(siteNet(guestPays, fee)),
    now: o.now ?? null,
    pausedUntil: o.pausedUntil ?? null,
  };
}

/**
 * Has the host changed their own price on a site since the read before? Compares the same stay
 * nights in the two latest reads (dates differ between reads, so only nights read both times
 * count): a middle move of more than 3% means they changed it. Returns the day it was seen.
 */
export function siteChange(readings: Array<Pick<Reading, "checkIn" | "nightly" | "seenAt">>): {
  changed: boolean;
  seenOn: string | null;
  ratio: number | null;
} {
  const days = [...new Set(readings.map((r) => r.seenAt.slice(0, 10)))].sort().reverse();
  if (days.length < 2) return { changed: false, seenOn: null, ratio: null };
  const [latest, before] = [days[0]!, days[1]!];
  const at = (day: string) =>
    new Map(
      readings
        .filter((r) => r.seenAt.slice(0, 10) === day && r.nightly)
        .map((r) => [r.checkIn, r.nightly!] as const),
    );
  const a = at(latest);
  const b = at(before);
  const ratios = [...a.entries()].filter(([d]) => b.has(d)).map(([d, v]) => v / b.get(d)!);
  const m = median(ratios);
  if (m === null) return { changed: false, seenOn: null, ratio: null };
  return { changed: Math.abs(m - 1) > 0.03, seenOn: latest, ratio: round4(m) };
}

/** When a pause after the host's own change ends (null = no pause). */
export function pauseEnds(seenOn: string | null, s: SmartPricing): string | null {
  return seenOn && s.cooldownDays > 0 ? addDays(seenOn, s.cooldownDays) : null;
}

/* ------------------------- booking page guards ------------------------- */

/**
 * The lowest a night may sell for on the booking page: the room's lowest price, and no more than
 * maxDiscountPct off its rate when offers and the non-refundable rate stack up. A voucher at a set
 * price is the host's own choice and isn't held to it; a percentage voucher is.
 */
export function nightFloor(
  ratePence: number,
  roomId: string,
  s: Pick<SmartPricing, "floors" | "maxDiscountPct">,
): number {
  const byPct = s.maxDiscountPct < 90 ? Math.round(ratePence * (1 - s.maxDiscountPct / 100)) : 0;
  return Math.max(s.floors[roomId] ?? 0, byPct);
}

/** The guard the booking page uses: each room's lowest night (only what it needs, nothing else). */
export function floorsForPage(
  rooms: Array<{ id: string; ratePence: number | null }>,
  s: SmartPricing,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rooms) {
    if (r.ratePence === null) continue;
    const f = nightFloor(r.ratePence, r.id, s);
    if (f > 0) out[r.id] = f;
  }
  return out;
}

/* ------------------------------ reading pages ------------------------------ */

/** Which site a listing link is on (for prices), or null. */
export function priceSiteForUrl(url: string): PriceSite | null {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (/(^|\.)booking\.com$/.test(h)) return "booking_com";
    if (/(^|\.)airbnb\.[a-z.]+$/.test(h)) return "airbnb";
    if (/(^|\.)(vrbo|homeaway)\.[a-z.]+$/.test(h)) return "vrbo";
    if (/(^|\.)expedia\.[a-z.]+$/.test(h)) return "expedia";
    if (/(^|\.)agoda\.com$/.test(h)) return "agoda";
    if (/(^|\.)homestay\.com$/.test(h)) return "homestay";
    return null;
  } catch {
    return null;
  }
}

/** Sites that show a whole property with several room types on one page (the rest are one unit). */
export const PROPERTY_PAGES: PriceSite[] = ["booking_com", "expedia", "agoda"];

/**
 * The page to read for a stay: the listing with the site's own date and party parameters, and its
 * currency where the site takes one in the link (so a reader abroad still sees the host's currency).
 */
export function priceUrl(
  url: string,
  site: PriceSite,
  stay: { checkIn: string; checkOut: string },
  currency: string,
): string {
  const u = new URL(url.trim());
  u.protocol = "https:";
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) u.searchParams.delete(k);
  const set = (o: Record<string, string>) => {
    for (const [k, v] of Object.entries(o)) u.searchParams.set(k, v);
  };
  switch (site) {
    case "booking_com":
      set({
        checkin: stay.checkIn,
        checkout: stay.checkOut,
        group_adults: "2",
        no_rooms: "1",
        selected_currency: currency,
      });
      break;
    case "airbnb":
      set({ check_in: stay.checkIn, check_out: stay.checkOut, adults: "2", currency });
      break;
    case "vrbo":
      set({ startDate: stay.checkIn, endDate: stay.checkOut, adults: "2" });
      break;
    case "expedia":
      set({ chkin: stay.checkIn, chkout: stay.checkOut, rm1: "a2" });
      break;
    case "agoda":
      set({ checkIn: stay.checkIn, checkOut: stay.checkOut, adults: "2", rooms: "1" });
      break;
    case "homestay":
      set({ arrive: stay.checkIn, depart: stay.checkOut });
      break;
  }
  return u.toString();
}

/** What Firecrawl is asked to return from a listing page for the dates in its link. */
export const PRICE_SCHEMA = {
  type: "object",
  properties: {
    available: {
      type: "boolean",
      description: "Whether the listing can be booked for the dates in the page's link",
    },
    currency: { type: "string", description: "ISO currency code of the prices, e.g. GBP" },
    total: {
      type: "number",
      description:
        "The total price for the whole stay as shown to the guest, in the currency's main unit (pounds, not pence), including the site's own service fee but not taxes shown separately. 0 if not shown.",
    },
    nights: { type: "number", description: "Number of nights the price is for" },
    rooms: {
      type: "array",
      description:
        "For hotel-style pages listing several room types: each room type's cheapest total price for the stay",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          total: { type: "number" },
        },
      },
    },
  },
} as const;

export const pricePrompt = (nights: number) =>
  `Read the price a guest is shown for these dates (${nights} ${nights === 1 ? "night" : "nights"}, 2 adults). Give the stay's total in main currency units, the currency, and whether it can be booked. Leave total 0 if no price is shown. On pages listing several room types, list each room type's cheapest total.`;

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !["room", "the", "with", "and"].includes(w)),
  );

/** The room type on a property page that is this room (most words in common), or null. */
export function matchRoomType<T extends { name: string }>(room: string, types: T[]): T | null {
  const mine = words(room);
  let best: T | null = null;
  let score = 0;
  for (const t of types) {
    const theirs = words(t.name);
    const common = [...mine].filter((w) => theirs.has(w)).length;
    const s = common / Math.max(1, new Set([...mine, ...theirs]).size);
    if (s > score) {
      score = s;
      best = t;
    }
  }
  return score >= 0.34 ? best : null;
}

/**
 * A scraped page as one night's price (hundredths), or null with why. A total in pence by mistake
 * (over 100,000 a night) or a currency other than the property's is refused rather than guessed.
 */
export function nightlyFrom(
  raw: { total?: unknown; nights?: unknown; currency?: unknown; available?: unknown },
  o: { nights: number; currency: string },
): { nightly: number | null; available: boolean | null; note: string | null } {
  const available = typeof raw.available === "boolean" ? raw.available : null;
  const cur = typeof raw.currency === "string" ? raw.currency.trim().toUpperCase() : "";
  if (cur && /^[A-Z]{3}$/.test(cur) && cur !== o.currency.toUpperCase())
    return { nightly: null, available, note: `Shown in ${cur}` };
  const total = typeof raw.total === "number" && Number.isFinite(raw.total) ? raw.total : 0;
  if (!(total > 0))
    return {
      nightly: null,
      available,
      note: available === false ? "Not available" : "No price shown",
    };
  const nights =
    typeof raw.nights === "number" && raw.nights >= 1 && raw.nights <= 30
      ? Math.round(raw.nights)
      : o.nights;
  const nightly = Math.round((total * 100) / nights);
  if (nightly > 10_000_000) return { nightly: null, available, note: "Price looked wrong" };
  return { nightly, available: available ?? true, note: null };
}

/* ------------------------------ the whole picture ------------------------------ */

export type StoredReading = Reading & { url: string };

/** Each page's readings from its latest read day only (an older read of the same page is history). */
export function latestReads<T extends StoredReading>(readings: T[]): T[] {
  const last = new Map<string, string>();
  const key = (r: T) => `${r.kind}|${r.site}|${r.url}|${r.roomId ?? ""}`;
  for (const r of readings) {
    const d = r.seenAt.slice(0, 10);
    if ((last.get(key(r)) ?? "") < d) last.set(key(r), d);
  }
  return readings.filter((r) => r.seenAt.slice(0, 10) === last.get(key(r)));
}

export type RoomPicture = {
  room: RoomInput;
  direct: DirectSuggestion;
  sites: Array<SiteSuggestion & { changedOn: string | null }>;
};

/**
 * Everything the Smart pricing card shows for each room: the direct suggestion from the latest
 * reads, and for each site the room is listed on, the price to set there. A site where the host
 * changed their own price since the read before is followed (the direct suggestion uses the new
 * price) and its own suggestion pauses for cooldownDays, so Latchkey doesn't argue with the host.
 */
export function pricingPicture(
  rooms: RoomInput[],
  readings: StoredReading[],
  s: SmartPricing,
  offers: SeasonalOffer[],
  o: { country?: string | null | undefined; today: string },
): RoomPicture[] {
  const latest = latestReads(readings);
  return rooms.map((room) => {
    const direct = suggestDirect(room, latest, s, offers, o);
    const own = readings.filter((r) => r.kind === "own" && r.roomId === room.id);
    const sites = [...new Set(own.map((r) => r.site))].map((site) => {
      const mine = own.filter((r) => r.site === site);
      const change = siteChange(mine);
      const ends = change.changed ? pauseEnds(change.seenOn, s) : null;
      const now = median(
        latestReads(mine)
          .map((r) => r.nightly)
          .filter((n): n is number => !!n),
      );
      const sug = suggestSite(site, room.id, direct.suggested ?? room.rate ?? 0, s, {
        country: o.country,
        now: now === null ? null : Math.round(now),
        pausedUntil: ends && ends > o.today ? ends : null,
      });
      return { ...sug, changedOn: change.changed ? change.seenOn : null };
    });
    return { room, direct, sites };
  });
}
