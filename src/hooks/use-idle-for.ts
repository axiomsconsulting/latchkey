import { useCallback, useEffect, useRef, useState } from "react";

/** Whether nobody has touched the tablet for this long. The edge bands don't count. */
export function useIdleFor(ms: number, on: boolean) {
  const [idle, setIdle] = useState(false);
  const last = useRef(Date.now());
  const wake = useCallback(() => {
    last.current = Date.now();
    setIdle(false);
  }, []);
  useEffect(() => {
    if (!on) return;
    wake();
    const touched = (e: Event) => {
      if ((e.target as Element | null)?.closest?.("[data-saver-band]")) return;
      wake();
    };
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, touched, { passive: true, capture: true }));
    const check = () => {
      if (Date.now() - last.current >= ms) setIdle(true);
    };
    const id = window.setInterval(check, 5_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touched, { capture: true }));
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [ms, on, wake]);
  return { idle, wake };
}
