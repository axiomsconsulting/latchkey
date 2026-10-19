import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A run of menu items that scrolls when there isn't room, with no scrollbar:
 * a small arrow appears at whichever end has more, and tapping it scrolls
 * that way (the mouse wheel, touch and keyboard focus still scroll too).
 * The page you're on is scrolled into view.
 */
export function MenuStrip({
  direction,
  label,
  className,
  children,
}: {
  direction: "vertical" | "horizontal";
  /** What the arrows scroll, for screen readers ("More menu items"). */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState({ before: false, after: false });
  const vertical = direction === "vertical";

  const measure = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const pos = vertical ? el.scrollTop : el.scrollLeft;
    const size = vertical ? el.clientHeight : el.clientWidth;
    const total = vertical ? el.scrollHeight : el.scrollWidth;
    setMore((m) => {
      const next = { before: pos > 2, after: pos + size < total - 2 };
      return m.before === next.before && m.after === next.after ? m : next;
    });
  }, [vertical]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    el.addEventListener("scroll", measure, { passive: true });
    // The page you're on, in view.
    el.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure, children]);

  const scroll = (sign: 1 | -1) => {
    const el = box.current;
    if (!el) return;
    const by = (vertical ? el.clientHeight : el.clientWidth) * 0.7 * sign;
    el.scrollBy({ [vertical ? "top" : "left"]: by, behavior: "smooth" });
  };

  const Before = vertical ? ChevronUp : ChevronLeft;
  const After = vertical ? ChevronDown : ChevronRight;
  const arrow = cn(
    "grid shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    vertical ? "h-6 w-full" : "h-full w-6",
  );

  return (
    <div className={cn("flex min-h-0 min-w-0", vertical ? "flex-col" : "flex-row items-center", className)}>
      {more.before ? (
        <button type="button" className={arrow} aria-label={`${label}: ${vertical ? "scroll up" : "scroll left"}`} onClick={() => scroll(-1)}>
          <Before className="size-4" />
        </button>
      ) : null}
      <div ref={box} className={cn("no-scrollbar flex min-h-0 min-w-0 flex-1 gap-1 overscroll-contain", vertical ? "flex-col overflow-y-auto" : "flex-row items-center overflow-x-auto")}>
        {children}
      </div>
      {more.after ? (
        <button type="button" className={arrow} aria-label={`${label}: ${vertical ? "scroll down" : "scroll right"}`} onClick={() => scroll(1)}>
          <After className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
