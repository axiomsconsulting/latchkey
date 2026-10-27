/**
 * Lays stays out on the stay calendar: one continuous block per stay across
 * the nights it covers, extra lines when stays overlap, and a colour per
 * room with a different shade per guest. Pure, so it can be unit tested.
 */

export type Span = {
  /** First visible night, 0-based column. */
  start: number;
  /** Columns covered (at least 1). */
  length: number;
  /** The stay began before the first day shown. */
  before: boolean;
  /** The stay carries on after the last day shown. */
  after: boolean;
};

/**
 * Which columns a stay covers. Nights run from check-in up to the day before
 * check-out; days are consecutive ISO dates. Null when nothing is visible.
 */
export function spanFor(days: string[], checkIn: string, checkOut: string): Span | null {
  if (days.length === 0) return null;
  const first = days[0]!;
  const last = days[days.length - 1]!;
  if (checkOut <= first || checkIn > last) return null;
  const start = checkIn <= first ? 0 : days.indexOf(checkIn);
  const end = checkOut > last ? days.length : days.indexOf(checkOut);
  if (start < 0 || end < 0 || end <= start) return null;
  return { start, length: end - start, before: checkIn < first, after: checkOut > last };
}

/** Puts overlapping stays on separate lines, earliest first. Returns the line per id. */
export function lanes<T extends { id: string; span: Span }>(
  items: T[],
): { lane: Record<string, number>; count: number } {
  const ends: number[] = [];
  const lane: Record<string, number> = {};
  for (const it of [...items].sort(
    (a, b) => a.span.start - b.span.start || b.span.length - a.span.length,
  )) {
    let l = ends.findIndex((end) => end <= it.span.start);
    if (l < 0) l = ends.length;
    ends[l] = it.span.start + it.span.length;
    lane[it.id] = l;
  }
  return { lane, count: Math.max(1, ends.length) };
}

/** Well-spaced hues so neighbouring rooms never look alike. */
const HUES = [250, 25, 155, 300, 75, 200, 340, 120, 45, 275, 180, 0];

export function roomHue(index: number): number {
  return HUES[index % HUES.length]! + 7 * Math.floor(index / HUES.length);
}

/**
 * The room's colour, shaded per guest. Translucent fills sit on the card in
 * light and dark mode alike, so the text keeps its normal colour.
 */
export function stayColours(hue: number, shade: number) {
  const alpha = [0.22, 0.36, 0.5][shade % 3]!;
  return {
    background: `oklch(0.68 0.14 ${hue} / ${alpha})`,
    borderColor: `oklch(0.58 0.16 ${hue})`,
  };
}

export function roomSwatch(hue: number): string {
  return `oklch(0.62 0.15 ${hue})`;
}
