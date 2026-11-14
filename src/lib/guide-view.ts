/**
 * How guests read the guide's sections (GuideSections): a list of cards that
 * open on a tap, or a gallery of whole cards to swipe through. Remembered on
 * the guest's device. Pure helpers; tested in tests/guide-view.test.ts.
 */

export type GuideView = "list" | "gallery";
export const GUIDE_VIEW_KEY = "latchkey.guideView";

/** The gallery of picture cards unless the guest chose the list. */
export function readGuideView(raw: string | null | undefined): GuideView {
  return raw === "list" ? "list" : "gallery";
}

/** A sideways swipe big and level enough to mean "next" (1) or "previous" (-1); otherwise 0. */
export function swipeStep(dx: number, dy: number, min = 50): -1 | 0 | 1 {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.2) return 0;
  return dx < 0 ? 1 : -1;
}

/** Moves round a set of n: past the last comes the first. */
export function wrapIndex(i: number, n: number): number {
  return n <= 0 ? 0 : ((i % n) + n) % n;
}

/** Whether a folded card has more than its top line to show (so it gets the "…"). */
export function hasMore(s: { rest: string; steps: number; attachments: number }): boolean {
  return !!s.rest.trim() || s.steps > 0 || s.attachments > 0;
}

/* ----------------------- gallery cards sized to their content ----------------------- */

/**
 * Roughly how much of a gallery column a card fills (1 = a whole column): its text, steps,
 * photos and attachments. Only used to decide which cards share a column.
 */
export function cardSize(c: {
  text: number;
  steps?: number;
  images?: number;
  attachments?: number;
}): number {
  return (
    0.14 +
    c.text / 650 +
    (c.steps ?? 0) * 0.12 +
    (c.images ?? 0) * 0.45 +
    ((c.attachments ?? 0) > 0 ? 0.35 : 0)
  );
}

/** A card this size or smaller can share a column. */
export const STACKS_UP_TO = 0.55;

/**
 * Cards in order, grouped into columns: small cards stacked while they fit in one column,
 * bigger cards each on their own.
 */
export function packColumns(sizes: number[], room = 1, most = Infinity): number[][] {
  const out: number[][] = [];
  let col: number[] = [];
  let used = 0;
  sizes.forEach((size, i) => {
    if (size > STACKS_UP_TO) {
      if (col.length) out.push(col);
      out.push([i]);
      col = [];
      used = 0;
      return;
    }
    if (col.length && (used + size > room || col.length >= most)) {
      out.push(col);
      col = [];
      used = 0;
    }
    col.push(i);
    used += size;
  });
  if (col.length) out.push(col);
  return out;
}
