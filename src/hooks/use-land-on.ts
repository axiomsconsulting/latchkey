import { useEffect } from "react";

/**
 * Scrolls to the element with this id once it exists (data may still be
 * loading), and makes it glow briefly, so a deep link lands on exactly
 * what was clicked.
 */
export function useLandOn(id: string | null | undefined, ready = true) {
  useEffect(() => {
    if (!id || !ready) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.remove("land-on");
        void el.offsetWidth; // restart the glow if it's already there
        el.classList.add("land-on");
        timer = setTimeout(() => el.classList.remove("land-on"), 2700);
        return;
      }
      if (++tries < 50) timer = setTimeout(tick, 100);
    };
    tick();
    return () => clearTimeout(timer);
  }, [id, ready]);
}
