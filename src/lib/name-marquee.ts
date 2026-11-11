/**
 * Where a name too long for its space stops as it scrolls (Jumbo's top bar): from the start,
 * a step at a time (each step about half the space, so the next words come in), ending
 * exactly at its last letter. Each stop is held for a while, then it goes back to the start.
 * Pure, so it can be tested.
 */
export function marqueeStops(overflow: number, view: number): number[] {
  if (overflow <= 0 || view <= 0) return [0];
  const step = Math.max(view * 0.45, 24);
  const stops = [0];
  for (let x = step; x < overflow; x += step) stops.push(Math.round(x));
  stops.push(Math.ceil(overflow));
  return stops;
}

/** How long each part takes (ms): read first, move for a second, hold for two. */
export const MARQUEE = { firstPause: 2000, move: 1000, pause: 2000 } as const;
