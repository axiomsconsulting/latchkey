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
