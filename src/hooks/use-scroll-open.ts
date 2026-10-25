import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

/**
 * A guide that follows the guest as they scroll, either way: the section in
 * the middle of the screen is the current one, open and highlighted. When
 * another takes its place, the one it opened folds: if it was above, the
 * page shifts by the height it gave up, so the line being read never moves.
 * A section the guest opens or closes by hand stays as they set it. Items
 * carry data-scroll-open="<key>"; their content shouldn't animate, so the
 * page can be measured straight away.
 */
export function useScrollOpen(open: string[], setOpen: (next: string[]) => void) {
  const manual = useRef(new Set<string>());
  const opened = useRef<string | null>(open[0] ?? null);
  const current = useRef(open);
  current.current = open;
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    // We keep the reading position ourselves; the browser's own adjustment would add to ours.
    const html = document.documentElement;
    const before = html.style.overflowAnchor;
    html.style.overflowAnchor = "none";
    let frame = 0;
    let last: string | null = null;
    let lastY = window.scrollY;
    const height = (el: HTMLElement | undefined) => el?.offsetHeight ?? 0;
    const check = () => {
      frame = 0;
      const down = window.scrollY >= lastY;
      lastY = window.scrollY;
      const items = [...document.querySelectorAll<HTMLElement>("[data-scroll-open]")];
      if (!items.length) return;
      const keys = items.map((el) => el.dataset["scrollOpen"]!);
      const mid = window.innerHeight * 0.45;
      const boxes = items.map((el) => el.getBoundingClientRect());
      let at = boxes.findIndex((b) => b.top <= mid && b.bottom > mid);
      if (at < 0) {
        // Between two sections: keep the current one. Before the first: none. Past the last: the last while on screen.
        if (boxes[0]!.top > mid) at = -1;
        else if (boxes[boxes.length - 1]!.bottom <= mid) at = boxes[boxes.length - 1]!.bottom > 0 ? items.length - 1 : -1;
        else at = last ? keys.indexOf(last) : -1;
      }
      // One section at a time in the direction of travel, so a quick scroll never skips one.
      const from = last ? keys.indexOf(last) : -1;
      if (from >= 0 && at >= 0) {
        if (down && at > from + 1) at = from + 1;
        if (!down && at < from - 1) at = from - 1;
      }
      const key = at >= 0 ? keys[at]! : null;
      if (key === last) return;
      last = key;
      setActive(key);
      const nextEl = at >= 0 ? items[at] : undefined;
      // Fold the one opened for the last section (unless the guest opened it themselves).
      const prev = opened.current;
      if (prev && prev !== key && !manual.current.has(prev) && current.current.includes(prev)) {
        const el = items[keys.indexOf(prev)];
        const above = !!el && !!nextEl && el.getBoundingClientRect().top < nextEl.getBoundingClientRect().top;
        const h = height(el);
        flushSync(() => setOpen(current.current.filter((k) => k !== prev)));
        // Folded above what they're reading: move the page up by the height it gave back.
        if (above) window.scrollBy(0, height(el) - h);
        opened.current = null;
      }
      if (key && !manual.current.has(key)) {
        if (!current.current.includes(key)) {
          const h = height(nextEl);
          flushSync(() => setOpen([...current.current, key]));
          // Going back up: it opens upwards, so what they were reading stays where it was.
          if (!down) window.scrollBy(0, height(nextEl) - h);
        }
        opened.current = key;
      }
      lastY = window.scrollY;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      html.style.overflowAnchor = before;
    };
  }, [setOpen]);

  /** The accordion's own changes: whatever the guest toggled is theirs from now on. */
  const onOpenChange = (next: string[]) => {
    const prev = current.current;
    for (const k of next) if (!prev.includes(k)) manual.current.add(k);
    for (const k of prev) if (!next.includes(k)) manual.current.add(k);
    setOpen(next);
  };
  return { onOpenChange, active };
}
