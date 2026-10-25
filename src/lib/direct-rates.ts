/**
 * Rates on the property's "Stay with us" page: each room's base nightly rate
 * and the host's seasonal offers (a percentage off the nights from one date to
 * another, for every room or some), and the estimated total for a stay. The
 * page only quotes: the guest requests, the host confirms, nothing is paid
 * there. Amounts are hundredths of the property's currency. Pure.
 */
import { addDays } from "./dates";

export type SeasonalOffer = {
  id: string;
  label: string;
  /** First and last night the offer covers (inclusive). */
  from: string;
  to: string;
  /** 1 to 90 percent off. */
  percent: number;
  /** Rooms it applies to; null = every room. */
  roomIds: string[] | null;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_OFFERS = 20;

/** The host's offers from storage, made safe: valid dates (from ≤ to), 1–90%, a label, earliest first. */
export function normaliseOffers(raw: unknown): SeasonalOffer[] {
  if (!Array.isArray(raw)) return [];
  const out: SeasonalOffer[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const from = typeof o["from"] === "string" && ISO.test(o["from"]) ? o["from"] : null;
    const to = typeof o["to"] === "string" && ISO.test(o["to"]) ? o["to"] : null;
    const percent = typeof o["percent"] === "number" ? Math.round(o["percent"]) : NaN;
    if (!from || !to || to < from || !(percent >= 1 && percent <= 90)) continue;
    const label = typeof o["label"] === "string" ? o["label"].replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60) : "";
    const ids = Array.isArray(o["roomIds"]) ? o["roomIds"].filter((r): r is string => typeof r === "string" && /^[0-9a-f-]{36}$/i.test(r)).slice(0, 100) : null;
    out.push({
      id: typeof o["id"] === "string" && /^[a-z0-9-]{4,40}$/i.test(o["id"]) ? o["id"] : `offer-${from}-${to}-${percent}`,
      label: label || `${percent}% off`,
      from,
      to,
      percent,
      roomIds: ids && ids.length ? ids : null,
    });
    if (out.length >= MAX_OFFERS) break;
  }
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

/** The nights of a stay: each date slept, check-in up to the night before check-out. */
export function nightsOf(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  for (let d = checkIn; d < checkOut && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The best offer for a room on one night, if any. */
export function offerOn(offers: SeasonalOffer[], roomId: string, night: string): SeasonalOffer | null {
  let best: SeasonalOffer | null = null;
  for (const o of offers) {
    if (night < o.from || night > o.to) continue;
    if (o.roomIds && !o.roomIds.includes(roomId)) continue;
    if (!best || o.percent > best.percent) best = o;
  }
  return best;
}

export type Quote = {
  nights: number;
  /** Before offers. */
  base: number;
  discount: number;
  total: number;
  /** The offers that took something off, each once. */
  applied: SeasonalOffer[];
};

/** The estimated total for a room over a stay, with each night's best offer taken off. */
export function quoteStay(ratePence: number, offers: SeasonalOffer[], roomId: string, checkIn: string, checkOut: string): Quote {
  const nights = nightsOf(checkIn, checkOut);
  let discount = 0;
  const applied = new Map<string, SeasonalOffer>();
  for (const n of nights) {
    const o = offerOn(offers, roomId, n);
    if (!o) continue;
    discount += Math.round((ratePence * o.percent) / 100);
    applied.set(o.id, o);
  }
  const base = ratePence * nights.length;
  return { nights: nights.length, base, discount, total: base - discount, applied: [...applied.values()] };
}

/** Is any night of the stay already taken in this room? (Stays as [checkIn, checkOut) date ranges.) */
export function roomTaken(stays: Array<{ from: string; to: string }>, checkIn: string, checkOut: string): boolean {
  return stays.some((s) => s.from < checkOut && checkIn < s.to);
}

/** Offers still to come (or running), for the page's "seasonal offers" list. */
export const upcomingOffers = (offers: SeasonalOffer[], today: string) => offers.filter((o) => o.to >= today);

/** "£120" / "¥12,000" from hundredths. */
export function money(pence: number, currency: string): string {
  const zero = ["JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD", "UGX", "XAF", "XOF"].includes(currency);
  // Whole amounts without ".00"; any pence with both digits.
  const digits = zero || pence % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(pence / 100);
}

/**
 * The offer to mention when inviting a guest back to book direct: the best
 * one running today (whole-property offers first), else the next one to
 * start within six months; null when there's none.
 */
export function offerToMention(offers: SeasonalOffer[], today: string): (SeasonalOffer & { running: boolean }) | null {
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + 183 * 86_400_000).toISOString().slice(0, 10);
  const rank = (o: SeasonalOffer) => o.percent + (o.roomIds ? 0 : 0.5);
  const running = offers.filter((o) => o.from <= today && o.to >= today).sort((a, b) => rank(b) - rank(a))[0];
  if (running) return { ...running, running: true };
  const next = offers.filter((o) => o.from > today && o.from <= horizon).sort((a, b) => a.from.localeCompare(b.from) || rank(b) - rank(a))[0];
  return next ? { ...next, running: false } : null;
}
