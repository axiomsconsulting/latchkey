/**
 * Loyalty discount vouchers for direct stays: a code the host makes for one
 * named guest, for chosen rooms and dates (days, ranges or whole months),
 * worth a percentage off or a set price per night. On the nights it covers
 * it replaces every other discount (seasonal offers, the non-refundable
 * rate); other nights are priced as usual. One use; the host sends it from
 * their own phone or email (Latchkey sends nothing). Pure; tested in
 * tests/vouchers.test.ts.
 */
import { addDays } from "./dates";
import { planRates, type DirectBooking, type RatePlan } from "./direct-booking";
import { nightsOf, offerOn, type SeasonalOffer } from "./direct-rates";
import { compareNames } from "./name-match";

export type VoucherPeriod = { from: string; to: string };
export type VoucherKind = "percent" | "price";

export type Voucher = {
  code: string;
  guestName: string;
  roomIds: string[];
  periods: VoucherPeriod[];
  kind: VoucherKind;
  /** Percent off (1-100), or the price per night in hundredths. */
  value: number;
  status: "active" | "used" | "cancelled";
};

export const MAX_PERIODS = 12;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A code that's easy to read out and type: no 0/O, 1/I/L. */
export function newVoucherCode(random: () => number = Math.random): string {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += abc[Math.floor(random() * abc.length)];
  return `STAY-${s}`;
}

/** What a guest typed, as stored: capitals, no spaces. */
export const normaliseCode = (v: string) =>
  v
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 24);

/** A whole month ("2027-03") as a period. */
export function monthPeriod(month: string): VoucherPeriod {
  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from, to: addDays(next, -1) };
}

/** Valid periods, sorted, merged where they touch or overlap. */
export function normalisePeriods(raw: unknown): VoucherPeriod[] {
  const list = (Array.isArray(raw) ? raw : [])
    .map((p) => p as Partial<VoucherPeriod>)
    .filter((p): p is VoucherPeriod => ISO.test(p.from ?? "") && ISO.test(p.to ?? ""))
    .map((p) => (p.from <= p.to ? p : { from: p.to, to: p.from }))
    .sort((a, b) => a.from.localeCompare(b.from));
  const out: VoucherPeriod[] = [];
  for (const p of list) {
    const last = out[out.length - 1];
    if (last && p.from <= addDays(last.to, 1)) last.to = p.to > last.to ? p.to : last.to;
    else out.push({ ...p });
  }
  return out.slice(0, MAX_PERIODS);
}

export const coversNight = (v: Pick<Voucher, "periods">, night: string) =>
  v.periods.some((p) => night >= p.from && night <= p.to);

/** The voucher's price for a night, from the room's usual rate (before any discount). */
export function voucherNight(v: Pick<Voucher, "kind" | "value">, ratePence: number): number {
  return v.kind === "price"
    ? v.value
    : Math.max(0, Math.round((ratePence * (100 - Math.min(100, v.value))) / 100));
}

export type NightPrice = { date: string; price: number; voucher: boolean };
export type VoucherQuote = {
  nights: NightPrice[];
  /** Before any discount: the usual rate every night. */
  base: number;
  total: number;
  discount: number;
  voucherNights: number;
};

/**
 * Each night's price for a room with a voucher: the voucher's price on the
 * nights it covers (instead of every other discount), the plan's rate less
 * the night's seasonal offer on the rest. Null when the plan isn't offered
 * and the voucher doesn't cover every night.
 */
export function quoteWithVoucher(
  ratePence: number,
  plan: RatePlan,
  s: DirectBooking,
  offers: SeasonalOffer[],
  roomId: string,
  checkIn: string,
  checkOut: string,
  v: Pick<Voucher, "kind" | "value" | "periods" | "roomIds"> | null,
): VoucherQuote | null {
  const r = planRates(ratePence, s);
  const usual = plan === "flex" ? r.flex : r.nonref;
  const applies = !!v && v.roomIds.includes(roomId);
  const nights: NightPrice[] = [];
  for (const date of nightsOf(checkIn, checkOut)) {
    if (applies && coversNight(v!, date)) {
      nights.push({ date, price: voucherNight(v!, ratePence), voucher: true });
      continue;
    }
    if (usual === null) return null;
    const o = offerOn(offers, roomId, date);
    nights.push({
      date,
      price: o ? usual - Math.round((usual * o.percent) / 100) : usual,
      voucher: false,
    });
  }
  const base = ratePence * nights.length;
  const total = nights.reduce((a, n) => a + n.price, 0);
  return {
    nights,
    base,
    total,
    discount: Math.max(0, base - total),
    voucherNights: nights.filter((n) => n.voucher).length,
  };
}

/**
 * Why this voucher can't be used for this booking, or null. The booker's
 * name must match the name it was made for (same rules as ID checks).
 */
export function voucherProblem(
  v: Voucher,
  b: { roomIds: string[]; checkIn: string; checkOut: string; name: string; today: string },
): string | null {
  if (v.status === "used") return "This code has already been used.";
  if (v.status === "cancelled") return "This code is no longer valid.";
  if (!v.periods.some((p) => p.to >= b.today)) return "This code's dates have passed.";
  if (compareNames(v.guestName, b.name) === "not_matched")
    return "This code is for a named guest. Please book in the name it was given to.";
  if (!b.roomIds.some((r) => v.roomIds.includes(r)))
    return "This code isn't for the room you've chosen.";
  if (!nightsOf(b.checkIn, b.checkOut).some((n) => coversNight(v, n)))
    return "This code isn't for these dates. Check when it applies.";
  return null;
}

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const MONTH_NAMES =
  "January February March April May June July August September October November December".split(
    " ",
  );
const day = (iso: string, year: boolean) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]}${year ? ` ${y}` : ""}`;
};

/** "March 2027, 14 Apr 2027, 1 to 5 May 2027" */
export function periodsText(periods: VoucherPeriod[]): string {
  return periods
    .map((p) => {
      const month = p.from.slice(0, 7);
      if (p.from.endsWith("-01") && p.to === monthPeriod(month).to && p.to.startsWith(month))
        return `${MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
      if (p.from === p.to) return day(p.from, true);
      const sameYear = p.from.slice(0, 4) === p.to.slice(0, 4);
      return `${day(p.from, !sameYear)} to ${day(p.to, true)}`;
    })
    .join(", ");
}

/** What the voucher is worth, in words. */
export function voucherValueText(v: Pick<Voucher, "kind" | "value">, money: (p: number) => string) {
  return v.kind === "percent" ? `${v.value}% off` : `${money(v.value)} a night`;
}

/** The short message the host sends: who it's for, the code, when and where it applies, and the link. */
export function voucherMessage(o: {
  firstName: string;
  property: string;
  code: string;
  value: string;
  rooms: string[];
  periods: VoucherPeriod[];
  link: string;
  note?: string | null;
}): string {
  const lines = [
    `Hi ${o.firstName}, thank you for staying with us at ${o.property}.`,
    o.note?.trim() || "",
    `Your code ${o.code} gives you ${o.value} on ${o.rooms.join(" or ")} for ${periodsText(o.periods)}.`,
    `Book at ${o.link} (one use, in your name).`,
  ];
  return lines.filter(Boolean).join("\n");
}

/** Where the host sends it from their own device: WhatsApp, a text, an email. */
export function shareLinks(
  msg: string,
  to: { phone?: string | null; email?: string | null; subject: string },
): { whatsapp: string | null; sms: string | null; email: string | null } {
  const phone = to.phone && /^\+[1-9]\d{6,14}$/.test(to.phone) ? to.phone : null;
  return {
    whatsapp: phone ? `https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(msg)}` : null,
    sms: phone ? `sms:${phone}?&body=${encodeURIComponent(msg)}` : null,
    email: to.email
      ? `mailto:${to.email}?subject=${encodeURIComponent(to.subject)}&body=${encodeURIComponent(msg)}`
      : null,
  };
}

/** Kept a year after the last date it could be used, then removed by the daily clean-up. */
export function voucherExpired(periods: unknown, today: string): boolean {
  const list = normalisePeriods(periods);
  const last = list[list.length - 1]?.to;
  return !last || addDays(last, 365) < today;
}
