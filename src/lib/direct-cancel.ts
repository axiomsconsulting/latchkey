/**
 * Cancelling a direct stay, by the rate the guest agreed to (cancellationText in
 * stay-terms.ts). Refundable rate, before the free cancellation date: free, and
 * anything paid goes back. After it, or on a non-refundable rate: nothing goes back.
 * A guest can cancel for themselves until the day they arrive, unless it would leave
 * them owing money, which is for the host to sort out. Pure, tested.
 */
export type Cancellable = {
  status: string;
  method: string;
  plan: string;
  free_cancel_until: string | null;
  check_in: string;
  total_pence: number;
};

export type CancelPolicy = {
  /** Can still be cancelled at all. */
  open: boolean;
  paid: boolean;
  /** Within the free cancellation period. */
  free: boolean;
  /** What the policy gives back. */
  refundPence: number;
  /** card: automatic through Stripe. by_host: paid by bank or at the property, so the host pays it back. */
  refund: "card" | "by_host" | "none";
  /** The guest can do it themselves. */
  guestCan: boolean;
  /** The price is still due under the terms, so the guest has to talk to the host. */
  needsHost: boolean;
};

const OPEN = new Set(["pending", "confirmed", "paid"]);

export function cancelPolicy(r: Cancellable, today: string): CancelPolicy {
  const open = OPEN.has(r.status);
  const paid = r.status === "paid";
  const free = r.plan === "flex" && !!r.free_cancel_until && today <= r.free_cancel_until;
  const started = r.check_in <= today;
  const refundPence = paid && free ? r.total_pence : 0;
  const guestCan = open && !started && (free || paid);
  return {
    open,
    paid,
    free,
    refundPence,
    refund: refundMethod(r.method, refundPence),
    guestCan,
    needsHost: open && !guestCan,
  };
}

export function refundMethod(method: string, pence: number): CancelPolicy["refund"] {
  if (pence <= 0) return "none";
  return method === "card" ? "card" : "by_host";
}

/** A refund the host chose: never more than was paid, and nothing when nothing was. */
export function cleanRefund(pence: number, r: Pick<Cancellable, "status" | "total_pence">): number {
  if (r.status !== "paid" || !Number.isFinite(pence)) return 0;
  return Math.max(0, Math.min(r.total_pence, Math.round(pence)));
}

type ListedReservation = {
  status: string;
  method: string;
  check_in: string;
  check_out: string;
  refund_status?: string | null;
};

/**
 * The bookings list by what it asks of the host: something to do (a transfer to
 * look out for, a refund to pay back), coming up (soonest first), and finished
 * (kept out of the way, most recent first).
 */
export function groupReservations<T extends ListedReservation>(
  list: T[],
  today: string,
): { attention: T[]; upcoming: T[]; finished: T[] } {
  const out = { attention: [] as T[], upcoming: [] as T[], finished: [] as T[] };
  for (const r of list) {
    if (r.refund_status === "to_do" || (r.status === "pending" && r.method === "bank"))
      out.attention.push(r);
    else if (["cancelled", "expired"].includes(r.status) || r.check_out < today)
      out.finished.push(r);
    else out.upcoming.push(r);
  }
  const soonest = (a: T, b: T) => a.check_in.localeCompare(b.check_in);
  out.attention.sort(soonest);
  out.upcoming.sort(soonest);
  out.finished.sort((a, b) => b.check_in.localeCompare(a.check_in));
  return out;
}
