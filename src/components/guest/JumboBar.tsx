import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { useNow } from "@/components/guest/KioskClocks";
import { JumboName } from "@/components/guest/JumboName";
import { jumboBarLayout, type BarLayout } from "@/lib/jumbo-bar";
import { kioskNow } from "@/lib/kiosk-clock";

/** "14:05 Wed 11 Nov", and "14:05" for when the name needs the room (null until in the browser). */
function useJumboClock(tz: string): { full: string; short: string } | null {
  const now = useNow(15_000);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const { shortDate, time } = kioskNow(now, tz);
  return { full: `${time} ${shortDate}`, short: time };
}

/**
 * Jumbo's top bar (rules in src/lib/jumbo-bar.ts): the logo and name on the left, the time and
 * date roughly in the middle, the tablet's icons on the right. Everything is measured on the
 * screen, so the clock never sits under an icon, whatever icons appear (mute, voice, bell).
 */
export function JumboBar({
  logo,
  name,
  tz,
  icons,
}: {
  logo: ReactNode;
  name: string;
  /** The property's time zone, for the clock. */
  tz: string;
  icons: ReactNode;
}) {
  const clock = useJumboClock(tz);
  const bar = useRef<HTMLElement>(null);
  const logoBox = useRef<HTMLSpanElement>(null);
  const nameBox = useRef<HTMLParagraphElement>(null);
  const iconBox = useRef<HTMLDivElement>(null);
  const nameText = useRef<HTMLSpanElement>(null);
  const clockFull = useRef<HTMLSpanElement>(null);
  const clockShort = useRef<HTMLSpanElement>(null);
  const [layout, setLayout] = useState<BarLayout | null>(null);

  const measure = () => {
    const b = bar.current;
    const icons = iconBox.current;
    if (!b || !icons) return;
    const box = b.getBoundingClientRect();
    // The icons can spill out of their fixed box to the left: the leftmost one counts.
    let iconsLeft = box.right;
    for (const el of icons.querySelectorAll<HTMLElement>("*")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.left < iconsLeft) iconsLeft = r.left;
    }
    const gap = parseFloat(getComputedStyle(b).columnGap) || 0;
    const inner = parseFloat(getComputedStyle(nameBox.current!).columnGap) || 0;
    setLayout(
      jumboBarLayout({
        width: box.width,
        icons: Math.max(0, box.right - iconsLeft),
        clock: clockFull.current?.offsetWidth ?? 0,
        clockShort: clockShort.current?.offsetWidth ?? 0,
        name: (logoBox.current?.offsetWidth ?? 0) + inner + (nameText.current?.offsetWidth ?? 0),
        gap,
      }),
    );
  };
  const measureRef = useRef(measure);
  measureRef.current = measure;

  useLayoutEffect(() => measureRef.current(), [name, clock?.full, clock?.short]);
  useEffect(() => {
    const again = () => measureRef.current();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(again);
    if (bar.current) ro?.observe(bar.current);
    // Icons come and go (the mute button before a check-in, the concierge's orb during one).
    const mo = new MutationObserver(again);
    if (iconBox.current) mo.observe(iconBox.current, { childList: true, subtree: true });
    void document.fonts?.ready.then(again);
    return () => {
      ro?.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <header ref={bar} data-jumbo-bar className="relative flex items-center gap-[2cqmin]">
      <p
        ref={nameBox}
        className="flex min-w-0 shrink-0 items-center gap-[0.4em] font-display font-bold"
        data-jumbo-name
        style={layout ? { width: layout.nameWidth } : { maxWidth: "45%" }}
      >
        <span ref={logoBox} className="flex shrink-0">
          {logo}
        </span>
        <JumboName name={name} scroll={!!layout?.scroll} />
      </p>
      {clock ? (
        <p
          className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-display font-bold tabular-nums"
          data-jumbo-clock
          aria-live="off"
          style={
            layout
              ? { left: layout.clockLeft }
              : { left: "50%", transform: "translate(-50%, -50%)", visibility: "hidden" }
          }
        >
          {layout?.compact ? clock.short : clock.full}
        </p>
      ) : null}
      <div ref={iconBox} className="ml-auto flex shrink-0 items-center justify-end gap-[1cqmin]">
        {icons}
      </div>
      {/* Natural widths, in the bar's own fonts, for the layout above. */}
      <span aria-hidden className="pointer-events-none invisible absolute left-0 top-0 flex">
        <span ref={nameText} className="whitespace-nowrap font-display font-bold">
          {name}
        </span>
        {clock ? (
          <>
            <span
              ref={clockFull}
              data-jumbo-clock
              className="whitespace-nowrap font-display font-bold tabular-nums"
            >
              {clock.full}
            </span>
            <span
              ref={clockShort}
              data-jumbo-clock
              className="whitespace-nowrap font-display font-bold tabular-nums"
            >
              {clock.short}
            </span>
          </>
        ) : null}
      </span>
    </header>
  );
}
