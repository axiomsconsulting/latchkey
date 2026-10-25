import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";

/**
 * A guide whose sections open by themselves as the guest scrolls down: a
 * section opens when its heading passes the middle of the screen, and one
 * opened this way folds again once it has scrolled away above (the page
 * shifts by the height it gave up, so nothing jumps). Scrolling back up never
 * opens anything, so the page doesn't move under the guest. A section the
 * guest opens or closes by hand is left as they set it. Items carry
 * data-scroll-open="<key>".
 */
export function useScrollOpen(open: string[], setOpen: (next: string[]) => void) {
  const manual = useRef(new Set<string>());
  const auto = useRef(new Set<string>(open));
  // Folded once read: not opened again by scrolling (the guest can tap it).
  const folded = useRef(new Set<string>());
  const openedAt = useRef(0);
  const current = useRef(open);
  current.current = open;

  useEffect(() => {
    const items = () => [...document.querySelectorAll<HTMLElement>("[data-scroll-open]")];
    let frame = 0;
    let lastY = window.scrollY;
    const check = () => {
      frame = 0;
      const down = window.scrollY >= lastY;
      lastY = window.scrollY;
      const mid = window.innerHeight * 0.55;
      // Scrolling down: open the section whose heading has just passed the middle of the screen (one at a
      // time, while the last one finishes opening, so a fast scroll doesn't open several at once).
      if (down && Date.now() - openedAt.current > 350) {
        const passed = items()
          .filter((el) => {
            const key = el.dataset["scrollOpen"]!;
            const box = el.getBoundingClientRect();
            return !manual.current.has(key) && !folded.current.has(key) && !current.current.includes(key) && box.top < mid;
          })
          .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        // In reading order: the highest one still on screen; the rest get their turn once it has opened.
        const next = passed.find((el) => el.getBoundingClientRect().top >= 0) ?? passed.filter((el) => el.getBoundingClientRect().bottom > 0).at(-1) ?? null;
        // Any a fast scroll took off the top of the screen stay closed: opening one above the guest would move the page.
        for (const el of passed) if (el !== next && el.getBoundingClientRect().top < 0) folded.current.add(el.dataset["scrollOpen"]!);
        if (next) {
          const key = next.dataset["scrollOpen"]!;
          auto.current.add(key);
          openedAt.current = Date.now();
          flushSync(() => setOpen([...current.current, key]));
        }
      }
      for (const el of items()) {
        const key = el.dataset["scrollOpen"]!;
        if (manual.current.has(key)) continue;
        const box = el.getBoundingClientRect();
        const isOpen = current.current.includes(key);
        // Read and scrolled away above: fold it, and move the page up by what it gave back.
        if (isOpen && auto.current.has(key) && box.bottom < 0) {
          const before = el.offsetHeight;
          flushSync(() => setOpen(current.current.filter((k) => k !== key)));
          window.scrollBy(0, el.offsetHeight - before);
          lastY = window.scrollY;
          auto.current.delete(key);
          folded.current.add(key);
        }
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [setOpen]);

  /** The accordion's own changes: whatever the guest toggled is theirs from now on. */
  return (next: string[]) => {
    const prev = current.current;
    for (const k of next) if (!prev.includes(k)) manual.current.add(k);
    for (const k of prev) if (!next.includes(k)) manual.current.add(k);
    setOpen(next);
  };
}
