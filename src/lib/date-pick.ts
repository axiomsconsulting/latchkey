/**
 * Picking a stay on the booking page's calendar. Taps: arrival first, then
 * leaving; tapping a new arrival keeps the number of nights (one tap moves
 * the stay), and a day before the arrival while choosing the leaving day
 * starts again from there. Drags: from inside the current stay moves it
 * whole (same nights), from anywhere else paints a new stay from the first
 * day to the last. Everything stays between `min` (today) and `max`. Pure.
 */
import { addDays, nightsBetween } from "./dates";

export type Stay = { checkIn: string; checkOut: string };
export type Focus = "in" | "out";
export type Bounds = { min: string; max: string; maxNights: number };

const clampDay = (d: string, b: Bounds) => (d < b.min ? b.min : d > b.max ? b.max : d);

/** Arrival on `checkIn` for `nights`, kept inside the bounds. */
export function stayFrom(checkIn: string, nights: number, b: Bounds): Stay {
  const n = Math.min(b.maxNights, Math.max(1, nights));
  let start = clampDay(checkIn, b);
  if (addDays(start, n) > addDays(b.max, 1)) start = addDays(b.max, 1 - n);
  return { checkIn: start, checkOut: addDays(start, n) };
}

/** A tap on a day: the new stay and which end the next tap sets. */
export function tapDay(stay: Stay, focus: Focus, day: string, b: Bounds): { stay: Stay; focus: Focus; done: boolean } {
  if (day < b.min || day > addDays(b.max, 1)) return { stay, focus, done: false };
  const nights = Math.max(1, nightsBetween(stay.checkIn, stay.checkOut) || 1);
  if (focus === "out" && day > stay.checkIn) {
    const out = day > addDays(stay.checkIn, b.maxNights) ? addDays(stay.checkIn, b.maxNights) : day;
    return { stay: { checkIn: stay.checkIn, checkOut: out }, focus: "in", done: true };
  }
  return { stay: stayFrom(day, nights, b), focus: "out", done: false };
}

/** Dragging the stay from `from` to `to`: the same nights, moved. */
export function moveStay(stay: Stay, from: string, to: string, b: Bounds): Stay {
  const shift = nightsBetweenSigned(from, to);
  return stayFrom(addDays(stay.checkIn, shift), nightsBetween(stay.checkIn, stay.checkOut), b);
}

/** Painting a new stay across days: the first day touched to the last (leaving the day after the last night). */
export function paintStay(a: string, z: string, b: Bounds): Stay | null {
  const [lo, hi] = a <= z ? [a, z] : [z, a];
  if (lo === hi) return null;
  const start = clampDay(lo, b);
  const end = hi > addDays(start, b.maxNights) ? addDays(start, b.maxNights) : hi;
  return end > start ? { checkIn: start, checkOut: end } : null;
}

/** Whether a day is one of the stay's nights (arrival up to the night before leaving). */
export const inStay = (stay: Stay, day: string) => day >= stay.checkIn && day < stay.checkOut;

function nightsBetweenSigned(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** The weeks of a month (Monday first) as ISO days, null for blanks. */
export function monthGrid(year: number, month0: number): Array<Array<string | null>> {
  const first = new Date(Date.UTC(year, month0, 1));
  const days = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: Array<string | null> = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
