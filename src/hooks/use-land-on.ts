import { useEffect } from "react";

/**
 * Brings the element with this id into view once it exists and has content
 * (data may still be loading), keeps it there while the page above it
 * settles, and makes it glow briefly, so a deep link lands on exactly what
 * was clicked. Stops following as soon as the person scrolls themselves.
 */
export function useLandOn(id: string | null | undefined, ready = true) {
  useEffect(() => {
    if (!id || !ready) return;
    let stopped = false;
    let found: HTMLElement | null = null;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const stop = () => {
      stopped = true;
    };
    const opts = { passive: true, once: true } as const;
    window.addEventListener("wheel", stop, opts);
    window.addEventListener("touchmove", stop, opts);
    window.addEventListener("keydown", stop, opts);

    const bring = (smooth: boolean) => {
      if (!found || stopped) return;
      const r = found.getBoundingClientRect();
      const fits = r.height < window.innerHeight * 0.8;
      const visible = fits
        ? r.top >= 72 && r.bottom <= window.innerHeight - 16
        : r.top >= 72 && r.top <= window.innerHeight * 0.3;
      if (!visible)
        found.scrollIntoView({
          behavior: smooth ? "smooth" : "auto",
          block: fits ? "center" : "start",
        });
    };

    let tries = 0;
    const look = () => {
      if (stopped) return;
      const el = document.getElementById(id);
      // Wait for real content: an empty wrapper moves once its data arrives.
      if (el && el.getBoundingClientRect().height > 24) {
        found = el;
        bring(true);
        el.classList.remove("land-on");
        void el.offsetWidth; // restart the glow if it's already there
        el.classList.add("land-on");
        timers.push(setTimeout(() => el.classList.remove("land-on"), 2700));
        // Sections above may still be loading and push it down: follow it for a moment.
        for (const ms of [350, 800, 1400, 2200]) timers.push(setTimeout(() => bring(false), ms));
        return;
      }
      if (++tries < 80) timers.push(setTimeout(look, 100));
    };
    look();
    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [id, ready]);
}
