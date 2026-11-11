import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { MARQUEE, marqueeStops } from "@/lib/name-marquee";

/**
 * The property's name in Jumbo's top bar, whole. It tells the bar when it doesn't fit
 * (`onFits`), so the clock can shrink to the time alone; if it still doesn't fit, it waits two
 * seconds, then moves along a step at a time (a second moving, two seconds still) to its
 * last letter, rests, and starts again.
 */
export function JumboName({
  name,
  scroll,
  onFits,
}: {
  name: string;
  /** Allowed to scroll: the clock is already as small as it goes (jumbo-bar.ts). */
  scroll: boolean;
  /** Told whether the whole name fits in its space. */
  onFits?: (fits: boolean) => void;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [room, setRoom] = useState<{ overflow: number; view: number }>({ overflow: 0, view: 0 });
  const fitsRef = useRef(onFits);
  fitsRef.current = onFits;

  useLayoutEffect(() => {
    const b = box.current;
    const t = text.current;
    if (!b || !t) return;
    const measure = () => {
      const overflow = t.scrollWidth - b.clientWidth;
      setRoom({ overflow, view: b.clientWidth });
      fitsRef.current?.(overflow <= 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    ro.observe(t);
    return () => ro.disconnect();
  }, [name]);

  const [at, setAt] = useState(0);
  const stops = scroll ? marqueeStops(room.overflow - 1, room.view) : [0];
  const key = stops.join();
  useEffect(() => {
    setAt(0);
    if (stops.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    let timer = 0;
    const next = () => {
      // At the end: rest, then back to the start (at once) and read it again.
      i = i + 1 < stops.length ? i + 1 : 0;
      setAt(i);
      timer = window.setTimeout(next, i === 0 ? MARQUEE.firstPause : MARQUEE.move + MARQUEE.pause);
    };
    timer = window.setTimeout(next, MARQUEE.firstPause);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const offset = stops[at] ?? 0;
  return (
    <span ref={box} className="block min-w-0 flex-1 overflow-hidden" title={name}>
      <span
        ref={text}
        className="inline-block whitespace-nowrap"
        style={{
          transform: `translateX(${-offset}px)`,
          transition: offset === 0 ? "none" : `transform ${MARQUEE.move}ms ease-in-out`,
        }}
      >
        {name}
      </span>
    </span>
  );
}
