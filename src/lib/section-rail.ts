/**
 * The section rail on long pages (Settings): which section you're in and
 * which few names show around it. Pure maths; the component is
 * src/components/SectionRail.tsx.
 */

/** At most this many names show at once; the ones beyond fade out. */
export const RAIL_WINDOW = 5;
/** The rail slides away this long after scrolling stops. */
export const RAIL_HIDE_MS = 1200;

/**
 * The section being read: the last one whose top has passed the reading
 * line (a third of the way down the screen). Tops are in page order.
 */
export function activeSection(tops: number[], line: number): number {
  let active = 0;
  for (let i = 0; i < tops.length; i++) if (tops[i]! <= line) active = i;
  return active;
}

/** The first name in view, keeping the active one in the middle where the list allows. */
export function railStart(active: number, count: number, size = RAIL_WINDOW): number {
  if (count <= size) return 0;
  const half = Math.floor(size / 2);
  return Math.max(0, Math.min(count - size, active - half));
}
