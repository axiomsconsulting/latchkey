import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  dateLabel,
  ratingLabel,
  reviewPace,
  shuffled,
  type KioskReview,
} from "@/lib/kiosk-reviews";

/** The door tablet's reviews (kioskReviews), when the host has them on; empty for everyone else. */
export const KioskReviewsContext = createContext<KioskReview[]>([]);

/**
 * While an ID or selfie is checked: the property's best reviews, one at a time, quick when
 * there are plenty (the wait feels shorter) and slower when there are only a few. It sits
 * where the help line was, the width of the progress bar, so it never covers a button.
 * The see-through panel is a separate layer with opacity, since older tablet browsers draw
 * translucent colours solid.
 */
export function ReviewTicker() {
  const all = useContext(KioskReviewsContext);
  const order = useMemo(() => shuffled(all, Date.now()), [all]);
  const [at, setAt] = useState(0);
  const pace = reviewPace(order.length);
  useEffect(() => {
    if (!pace) return;
    const id = window.setInterval(() => setAt((i) => (i + 1) % order.length), pace);
    return () => window.clearInterval(id);
  }, [pace, order.length]);
  const r = order[at % Math.max(1, order.length)];
  if (!r) return null;
  return (
    <figure
      data-review-ticker
      aria-live="off"
      className="relative w-full overflow-hidden rounded-xl px-3 py-2 text-left"
    >
      <span className="absolute inset-0 bg-card opacity-60" aria-hidden />
      <div key={r.id} className="relative animate-in fade-in slide-in-from-bottom-2 duration-300">
        <blockquote className="line-clamp-3 text-[1rem] leading-snug" data-review-quote>
          “{r.text}”
        </blockquote>
        <figcaption
          className="mt-1 flex flex-wrap items-center gap-x-2 text-[0.875rem] opacity-80"
          data-review-by
        >
          <span className="font-semibold">{r.firstName}</span>
          <span className="text-amber-500">{ratingLabel(r.rating, r.outOf)}</span>
          <span>{dateLabel(r.date)}</span>
        </figcaption>
      </div>
    </figure>
  );
}

export function useHasKioskReviews(): boolean {
  return useContext(KioskReviewsContext).length > 0;
}
