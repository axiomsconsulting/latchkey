/**
 * Launch offers: a host who opens an account while a campaign runs pays the
 * offer price for their first paid month (after the free trial), then the
 * standard price. The super admin sets the campaign; the database locks it
 * in on the account (hosts.offer_pence). Pure, tested.
 */

export type Offer = {
  enabled: boolean;
  pricePence: number;
  label: string;
  /** UK days, both inclusive (YYYY-MM-DD). */
  startsOn: string;
  endsOn: string;
};

export const DEFAULT_OFFER: Offer = {
  enabled: true,
  pricePence: 100,
  label: "Launch offer",
  startsOn: "2026-10-14",
  endsOn: "2026-12-31",
};

const day = /^\d{4}-\d{2}-\d{2}$/;

export function normaliseOffer(raw: unknown): Offer {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Offer>;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : false,
    pricePence:
      typeof r.pricePence === "number" && Number.isInteger(r.pricePence) && r.pricePence >= 0
        ? r.pricePence
        : DEFAULT_OFFER.pricePence,
    label:
      typeof r.label === "string" && r.label.trim()
        ? r.label.trim().slice(0, 60)
        : DEFAULT_OFFER.label,
    startsOn:
      typeof r.startsOn === "string" && day.test(r.startsOn) ? r.startsOn : DEFAULT_OFFER.startsOn,
    endsOn: typeof r.endsOn === "string" && day.test(r.endsOn) ? r.endsOn : DEFAULT_OFFER.endsOn,
  };
}

/** Today in the UK, as YYYY-MM-DD. */
export function ukToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

/** Whether a new account opened today gets the offer. */
export function offerRunning(o: Offer, today: string): boolean {
  return o.enabled && today >= o.startsOn && today <= o.endsOn;
}

/** The offer price still to come for this account, or null (none, or already used). */
export function pendingOffer(host: {
  offer_pence?: number | null;
  offer_used_at?: string | null;
}): number | null {
  return typeof host.offer_pence === "number" && !host.offer_used_at ? host.offer_pence : null;
}

/** What the next paid month costs: the offer while it's pending (never more than standard). */
export function nextMonthPence(standardPence: number, pending: number | null): number {
  return pending === null ? standardPence : Math.min(standardPence, pending);
}

/** The offer is used up once Stripe starts the first paid month. */
export function offerNowUsed(pending: number | null, stripeStatus: string): boolean {
  return pending !== null && stripeStatus === "active";
}
