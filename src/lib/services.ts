/**
 * Service catalogue and provider recommendation. Pure and tested.
 * Guests pick a category; the host approves; Latchkey ranks providers by
 * earliest arrival, rating and price, then tells the guest the ETA.
 */

export type ServiceKind = "issue" | "extra" | "maintenance";

export type ServiceCategory = {
  id: string;
  kind: ServiceKind;
  label: string;
  icon: string; // lucide icon name, mapped in the UI
  guestPricePence: number | null; // what the guest pays for extras
  defaultUrgency: "low" | "normal" | "urgent";
};

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  { id: "cleaning", kind: "issue", label: "Room cleaning", icon: "sparkles", guestPricePence: null, defaultUrgency: "normal" },
  { id: "linen", kind: "issue", label: "Towels & linen", icon: "bed", guestPricePence: null, defaultUrgency: "normal" },
  { id: "bathroom", kind: "issue", label: "Bathroom", icon: "bath", guestPricePence: null, defaultUrgency: "normal" },
  { id: "plumbing", kind: "issue", label: "Plumbing / leak", icon: "droplets", guestPricePence: null, defaultUrgency: "urgent" },
  { id: "heating", kind: "issue", label: "Heating / hot water", icon: "flame", guestPricePence: null, defaultUrgency: "urgent" },
  { id: "aircon", kind: "issue", label: "Air conditioning / fan", icon: "fan", guestPricePence: null, defaultUrgency: "normal" },
  { id: "kitchenette", kind: "issue", label: "Kitchenette", icon: "utensils", guestPricePence: null, defaultUrgency: "normal" },
  { id: "appliance", kind: "issue", label: "Appliance not working", icon: "plug", guestPricePence: null, defaultUrgency: "normal" },
  { id: "electrical", kind: "issue", label: "Lights / electrics", icon: "zap", guestPricePence: null, defaultUrgency: "urgent" },
  { id: "breakfast", kind: "extra", label: "Breakfast basket", icon: "coffee", guestPricePence: 1200, defaultUrgency: "normal" },
  { id: "cycle", kind: "extra", label: "Cycle hire (day)", icon: "bike", guestPricePence: 1800, defaultUrgency: "low" },
  { id: "taxi", kind: "extra", label: "Taxi booking", icon: "car", guestPricePence: null, defaultUrgency: "normal" },
  { id: "luggage", kind: "extra", label: "Luggage storage / transfer", icon: "luggage", guestPricePence: 800, defaultUrgency: "low" },
  { id: "late_checkout", kind: "extra", label: "Late check-out", icon: "clock", guestPricePence: 1500, defaultUrgency: "low" },
  { id: "boiler_service", kind: "maintenance", label: "Boiler service", icon: "flame", guestPricePence: null, defaultUrgency: "low" },
  { id: "pat_testing", kind: "maintenance", label: "PAT testing", icon: "plug", guestPricePence: null, defaultUrgency: "low" },
  { id: "deep_clean", kind: "maintenance", label: "Deep clean", icon: "sparkles", guestPricePence: null, defaultUrgency: "low" },
  { id: "handyman", kind: "maintenance", label: "Handyman jobs", icon: "wrench", guestPricePence: null, defaultUrgency: "low" },
];

export function categoryById(id: string): ServiceCategory | undefined {
  return SERVICE_CATEGORIES.find((c) => c.id === id);
}

export type Provider = {
  id: string;
  name: string;
  headline: string;
  contraUrl: string;
  categories: string[];
  rating: number; // 0-5
  reviews: number;
  ratePence: number;
  rateUnit: "hour" | "job" | "callout";
  responseMinutes: number; // typical time to arrive once booked
  workDays: number[]; // 0 = Sun
  startHour: number; // local
  endHour: number;
  verified: boolean;
};

export type Recommendation = {
  provider: Provider;
  etaIso: string;
  score: number;
  reasons: string[];
};

/** Local hour and weekday for an instant in a timezone. */
function localParts(d: Date, tz: string): { day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { day: days.indexOf(get("weekday")), hour: Number(get("hour")), minute: Number(get("minute")) };
}

/**
 * Earliest time the provider can arrive, starting from `from` (or the
 * requested slot). Walks forward in 30-minute steps up to 8 days.
 */
export function earliestArrival(p: Provider, from: Date, tz: string): Date | null {
  const start = new Date(from.getTime() + p.responseMinutes * 60_000);
  for (let i = 0; i < 8 * 48; i++) {
    const t = new Date(start.getTime() + i * 30 * 60_000);
    const { day, hour } = localParts(t, tz);
    if (p.workDays.includes(day) && hour >= p.startHour && hour < p.endHour) return t;
  }
  return null;
}

/** Comparable price in pence for about an hour's work. */
export function comparablePrice(p: Provider): number {
  return p.rateUnit === "hour" ? p.ratePence : p.ratePence;
}

export function recommendProviders(
  providers: Provider[],
  categoryId: string,
  opts: { now: Date; tz: string; wantedAt?: Date | null; urgency?: "low" | "normal" | "urgent" },
): Recommendation[] {
  const from = opts.wantedAt && opts.wantedAt > opts.now ? opts.wantedAt : opts.now;
  const fits = providers.filter((p) => p.categories.includes(categoryId));
  const withEta = fits
    .map((p) => ({ p, eta: earliestArrival(p, from, opts.tz) }))
    .filter((x): x is { p: Provider; eta: Date } => x.eta !== null);
  if (withEta.length === 0) return [];

  const prices = withEta.map((x) => comparablePrice(x.p));
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const waits = withEta.map((x) => x.eta.getTime() - from.getTime());
  const minW = Math.min(...waits);
  const maxW = Math.max(...waits);

  // Urgent jobs weigh speed heavily; routine jobs weigh price more.
  const w =
    opts.urgency === "urgent"
      ? { speed: 0.55, rating: 0.3, price: 0.15 }
      : opts.urgency === "low"
        ? { speed: 0.15, rating: 0.4, price: 0.45 }
        : { speed: 0.35, rating: 0.4, price: 0.25 };

  const norm = (v: number, lo: number, hi: number) => (hi === lo ? 1 : 1 - (v - lo) / (hi - lo));

  const scored = withEta.map(({ p, eta }) => {
    const speed = norm(eta.getTime() - from.getTime(), minW, maxW);
    const price = norm(comparablePrice(p), minP, maxP);
    const trust = Math.min(1, p.reviews / 40);
    const rating = (p.rating / 5) * (0.7 + 0.3 * trust);
    const score = w.speed * speed + w.rating * rating + w.price * price;
    const reasons: string[] = [];
    if (eta.getTime() - from.getTime() === minW) reasons.push("Soonest");
    if (comparablePrice(p) === minP) reasons.push("Best price");
    if (p.rating >= 4.8) reasons.push("Top rated");
    if (p.verified) reasons.push("Contra verified");
    return { provider: p, etaIso: eta.toISOString(), score: Math.round(score * 100) / 100, reasons };
  });

  return scored.sort((a, b) => b.score - a.score);
}

export function formatPence(pence: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, minimumFractionDigits: pence % 100 ? 2 : 0 }).format(pence / 100);
}

export function rateLabel(p: Pick<Provider, "ratePence" | "rateUnit">, currency = "GBP"): string {
  const unit = p.rateUnit === "hour" ? "/hr" : p.rateUnit === "callout" ? " call-out" : " per job";
  return `${formatPence(p.ratePence, currency)}${unit}`;
}
