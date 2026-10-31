/**
 * The bell on the door tablet: today's guests whose check-in or check-out
 * card can go up on the screen now, with the time each would come on by
 * itself, and the changes a set of ticks makes. Names are shortened
 * ("Priya S."): anyone at the door can open the list. Pure; tested in
 * tests/kiosk-picker.test.ts.
 */
import {
  arrivalStart,
  goodbyeWindow,
  showsArrival,
  showsGoodbyeNow,
  type ArrivalCards,
  type Goodbye,
} from "@/lib/checkout-goodbye";
import { shortName } from "@/lib/checkin-logic";
import { zonedParts } from "@/lib/dates";

export type PickerRow = {
  id: string;
  guest_full_name: string | null;
  status: string;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  /** A booked early check-in (the accepted extra), else null. */
  early_from?: string | null;
  goodbye_dismissed_at?: string | null;
  goodbye_now_at?: string | null;
  welcome_card_dismissed_at?: string | null;
  welcome_now_at?: string | null;
  mirror_of?: string | null;
  rooms?: { display_name: string | null; sort_order: number | null } | null;
};

export type PickerItem = {
  bookingId: string;
  kind: "in" | "out";
  name: string;
  room: string | null;
  /** On the screen now, or not (yet). */
  showing: boolean;
  /** When it comes on by itself today ("14:00"), if it hasn't yet and nothing stops it. */
  autoAt: string | null;
};

export type PickerContext = {
  today: string;
  now: number;
  tz: string;
  standardIn: string;
  standardOut: string;
  arrivals: ArrivalCards;
  goodbye: Goodbye;
};

const ARRIVING = new Set(["upcoming", "flagged", "needs_details"]);
const STAYING = new Set(["checked_in", "upcoming", "flagged", "needs_details"]);

const clock = (ms: number, tz: string) => zonedParts(new Date(ms), tz).time;

/** Guests arriving (not yet checked in) and leaving (not yet gone) today, arrivals first, by room. */
export function pickerItems(rows: PickerRow[], c: PickerContext): PickerItem[] {
  const byRoom = (x: PickerRow, y: PickerRow) =>
    (x.rooms?.sort_order ?? 0) - (y.rooms?.sort_order ?? 0) ||
    String(x.rooms?.display_name ?? "").localeCompare(String(y.rooms?.display_name ?? ""));
  const live = rows.filter((b) => !b.mirror_of && b.guest_full_name?.trim()).sort(byRoom);
  const items: PickerItem[] = [];
  for (const b of live) {
    if (b.check_in_date !== c.today || !ARRIVING.has(b.status)) continue;
    const showing = showsArrival(b, c.today, c.now, c.standardIn, c.tz, c.arrivals);
    const from = arrivalStart(b, c.standardIn, c.tz, c.arrivals).from;
    items.push({
      bookingId: b.id,
      kind: "in",
      name: shortName(b.guest_full_name),
      room: b.rooms?.display_name ?? null,
      showing,
      autoAt:
        !showing && c.arrivals.on && !b.welcome_card_dismissed_at && from > c.now
          ? clock(from, c.tz)
          : null,
    });
  }
  for (const b of live) {
    if (b.check_out_date !== c.today || !STAYING.has(b.status)) continue;
    const showing = showsGoodbyeNow(b, c.today, c.now, c.standardOut, c.tz, c.goodbye);
    const w = goodbyeWindow(b, c.standardOut, c.tz, c.goodbye);
    items.push({
      bookingId: b.id,
      kind: "out",
      name: shortName(b.guest_full_name),
      room: b.rooms?.display_name ?? null,
      showing,
      autoAt:
        !showing && c.goodbye.on && !b.goodbye_dismissed_at && w.from > c.now
          ? clock(w.from, c.tz)
          : null,
    });
  }
  return items;
}

export const pickKey = (i: Pick<PickerItem, "kind" | "bookingId">) => `${i.kind}:${i.bookingId}`;

/** What ticking `chosen` changes: cards to put up now, and cards on screen to take off. */
export function pickerChanges(
  items: PickerItem[],
  chosen: ReadonlySet<string>,
): Array<{ bookingId: string; kind: "in" | "out"; show: boolean }> {
  const out: Array<{ bookingId: string; kind: "in" | "out"; show: boolean }> = [];
  for (const i of items) {
    const want = chosen.has(pickKey(i));
    if (want !== i.showing) out.push({ bookingId: i.bookingId, kind: i.kind, show: want });
  }
  return out;
}

/** The booking columns a card change writes (the same as Show now / Take off on Today). */
export function cardPatch(kind: "in" | "out", show: boolean, nowIso: string) {
  return kind === "in"
    ? show
      ? { welcome_now_at: nowIso, welcome_card_dismissed_at: null }
      : { welcome_card_dismissed_at: nowIso, welcome_now_at: null }
    : show
      ? { goodbye_now_at: nowIso, goodbye_dismissed_at: null }
      : { goodbye_dismissed_at: nowIso, goodbye_now_at: null };
}
