import { useEffect, useState } from "react";

import { guest as copy } from "@/content/copy";
import { burnDrift, clockHands, kioskNow, worldClocksFor } from "@/lib/kiosk-clock";
import { zoneCity } from "@/lib/world";

/** Ticks on the minute (and when the tab comes back), so the clocks never lag. */
function useNow(stepMs = 15_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, stepMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [stepMs]);
  return now;
}

/** Today's date and time at the top of the kiosk, in the property's time zone. */
export function KioskClock({ tz }: { tz: string }) {
  const now = useNow();
  // Shown once running in the browser, so the server's time never mismatches the tablet's.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="ml-auto" />;
  const { date, time } = kioskNow(now, tz);
  return (
    <p className="ml-auto text-right font-display leading-tight" aria-live="off">
      <span className="block text-lg tabular-nums">{time}</span>
      <span className="block text-sm text-muted-foreground">{date}</span>
    </p>
  );
}

function Dial({ city, tz, home, now, here }: { city: string; tz: string; home: string; now: Date; here: boolean }) {
  const h = clockHands(now, tz, home);
  return (
    <figure className={`flex flex-col items-center gap-3 ${here ? "opacity-100" : "opacity-80"}`}>
      <svg viewBox="0 0 100 100" className={here ? "size-32 sm:size-44 lg:size-52" : "size-24 sm:size-32 lg:size-36"} aria-hidden>
        <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="0.8" />
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            x1="50"
            y1={i % 3 === 0 ? 7 : 9}
            x2="50"
            y2="12"
            stroke="currentColor"
            strokeOpacity={i % 3 === 0 ? 0.4 : 0.22}
            strokeWidth={i % 3 === 0 ? 1.2 : 0.7}
            transform={`rotate(${i * 30} 50 50)`}
          />
        ))}
        <line x1="50" y1="50" x2="50" y2="27" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2.2" strokeLinecap="round" transform={`rotate(${h.hourDeg} 50 50)`} />
        <line x1="50" y1="50" x2="50" y2="15" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.2" strokeLinecap="round" transform={`rotate(${h.minuteDeg} 50 50)`} />
        <circle cx="50" cy="50" r="1.6" fill="currentColor" fillOpacity="0.5" />
      </svg>
      <figcaption className="text-center">
        <span className="block text-[0.7rem] font-medium uppercase tracking-[0.3em] opacity-70">{city}</span>
        {here ? <span className="block text-[0.6rem] uppercase tracking-[0.3em] opacity-40">{copy.saverHere}</span> : null}
        <span className="mt-1 block text-xs tabular-nums opacity-45">
          {h.time}
          {h.dayShift === 1 ? ` · ${copy.tomorrow}` : h.dayShift === -1 ? ` · ${copy.yesterday}` : ""}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * The kiosk at rest: black, very dim, with a reception-style row of world
 * clocks. The whole display wanders a little, slowly, so nothing burns into
 * the screen; it never scales or stretches. Any touch wakes it.
 */
export function KioskScreensaver({ name, tz, onWake }: { name: string; tz: string; onWake: () => void }) {
  const now = useNow(20_000);
  const [started] = useState(() => Date.now());
  const drift = burnDrift(now.getTime() - started + 1);
  const local = kioskNow(now, tz);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={copy.saverWake}
      className="fixed inset-0 z-[90] flex cursor-pointer select-none items-center justify-center overflow-hidden bg-black text-white"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onWake();
      }}
      onKeyDown={onWake}
    >
      <div
        className="flex flex-col items-center gap-12 text-white/40 transition-transform duration-[19000ms] ease-in-out"
        style={{ transform: `translate(${drift.x}px, ${drift.y}px)` }}
      >
        {/* Here in the middle; two cities behind on the left, two ahead on the right. */}
        <div className="flex items-center justify-center gap-6 sm:gap-10 lg:gap-14">
          {worldClocksFor(tz, zoneCity(tz), now).map((c) => (
            <Dial key={c.city} city={c.city} tz={c.tz} home={tz} now={now} here={c.home} />
          ))}
        </div>
        <div className="text-center">
          <p className="font-display text-2xl tracking-wide text-white/35">{name}</p>
          <p className="mt-2 text-sm tracking-[0.2em] text-white/25">
            {local.date} · {local.time}
          </p>
          <p className="mt-8 text-xs uppercase tracking-[0.3em] text-white/20">{copy.saverTouch}</p>
        </div>
      </div>
    </div>
  );
}
