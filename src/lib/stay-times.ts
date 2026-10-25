/**
 * Early check-in and late check-out as paid extras (the "early_checkin" and
 * "late_checkout" items in the price list): sold in blocks of hours at a
 * price a block (options.slot), as far as the host allows (the latest
 * check-out, the earliest check-in) and never closer than the host's buffer
 * to the next guest arriving in the room, or the last one leaving it. Those
 * neighbours' own times already include any early check-in or late check-out
 * they paid for, because an approved or paid one moves the stay's times. Pure.
 */

export type Slot = { stepHours: number; limit: string };

export const SLOT_STEPS = [1, 2, 3] as const;
export const BUFFER_CHOICES = [0, 15, 30, 45, 60, 90, 120, 180] as const;
export const DEFAULT_BUFFER = 60;

export const DEFAULT_SLOT: Record<"late" | "early", Slot> = {
  late: { stepHours: 1, limit: "16:00" },
  early: { stepHours: 1, limit: "10:00" },
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function normaliseSlot(raw: unknown, kind: "late" | "early"): Slot {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const step = SLOT_STEPS.includes(r["stepHours"] as 1) ? (r["stepHours"] as number) : DEFAULT_SLOT[kind].stepHours;
  const limit = typeof r["limit"] === "string" && HHMM.test(r["limit"]) ? r["limit"] : DEFAULT_SLOT[kind].limit;
  return { stepHours: step, limit };
}

export const normaliseBuffer = (v: unknown) => (BUFFER_CHOICES.includes(v as 60) ? (v as number) : DEFAULT_BUFFER);

export type Choice = { steps: number; hours: number; time: string; pricePence: number };

/**
 * Late check-out choices: whole blocks after the usual check-out, up to the
 * latest the host allows and, when someone arrives in the room that day,
 * no later than their check-in minus the buffer.
 */
export function lateChoices(opts: { checkOut: string; slot: Slot; pricePence: number; maxSteps: number; nextArrival: string | null; bufferMinutes: number }): Choice[] {
  const base = toMin(opts.checkOut);
  let limit = toMin(opts.slot.limit);
  if (opts.nextArrival) limit = Math.min(limit, toMin(opts.nextArrival) - opts.bufferMinutes);
  const out: Choice[] = [];
  for (let k = 1; k <= Math.max(1, opts.maxSteps); k++) {
    const end = base + k * opts.slot.stepHours * 60;
    if (end > limit || end >= 24 * 60) break;
    out.push({ steps: k, hours: k * opts.slot.stepHours, time: toHhmm(end), pricePence: k * opts.pricePence });
  }
  return out;
}

/**
 * Early check-in choices: whole blocks before the usual check-in, no earlier
 * than the host allows and, when someone leaves the room that day, no
 * earlier than their check-out plus the buffer.
 */
export function earlyChoices(opts: { checkIn: string; slot: Slot; pricePence: number; maxSteps: number; prevDeparture: string | null; bufferMinutes: number }): Choice[] {
  const base = toMin(opts.checkIn);
  let limit = toMin(opts.slot.limit);
  if (opts.prevDeparture) limit = Math.max(limit, toMin(opts.prevDeparture) + opts.bufferMinutes);
  const out: Choice[] = [];
  for (let k = 1; k <= Math.max(1, opts.maxSteps); k++) {
    const start = base - k * opts.slot.stepHours * 60;
    if (start < limit || start < 0) break;
    out.push({ steps: k, hours: k * opts.slot.stepHours, time: toHhmm(start), pricePence: k * opts.pricePence });
  }
  return out;
}

/**
 * A time the host sets by hand that leaves less than the buffer before the
 * next arrival or after the last departure in the room: what to tell them.
 */
export function bufferClash(opts: { checkOut?: string | null; nextArrival?: string | null; checkIn?: string | null; prevDeparture?: string | null; bufferMinutes: number }): string | null {
  if (opts.checkOut && opts.nextArrival) {
    const gap = toMin(opts.nextArrival) - toMin(opts.checkOut);
    if (gap < opts.bufferMinutes) return `Check-out at ${opts.checkOut} leaves ${Math.max(0, gap)} minutes before the next guest arrives at ${opts.nextArrival} (your buffer is ${opts.bufferMinutes}).`;
  }
  if (opts.checkIn && opts.prevDeparture) {
    const gap = toMin(opts.checkIn) - toMin(opts.prevDeparture);
    if (gap < opts.bufferMinutes) return `Check-in at ${opts.checkIn} leaves ${Math.max(0, gap)} minutes after the last guest leaves at ${opts.prevDeparture} (your buffer is ${opts.bufferMinutes}).`;
  }
  return null;
}
