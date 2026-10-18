import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { guest as copy } from "@/content/copy";
import { Moon, Sun, Sunrise, Sunset, Type } from "lucide-react";

import { burnDrift, clockHands, dayProgress, kioskNow, quietNow, worldClocksFor } from "@/lib/kiosk-clock";
import { zoneCity } from "@/lib/world";
import { kioskSaverLook, saveKioskSaverLook } from "@/lib/kiosk.functions";
import {
  BRIGHTNESS,
  DEFAULT_SAVER,
  SIZE,
  bandFraction,
  bandValue,
  glow,
  lookFor,
  normaliseDefaults,
  type SaverDefaults,
  type SaverLook,
} from "@/lib/kiosk-saver";

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
export function KioskClock({ tz, longName = false }: { tz: string; /** The property's name is long: on phones, "Sat 17 Oct" instead. */ longName?: boolean }) {
  const now = useNow();
  // Shown once running in the browser, so the server's time never mismatches the tablet's.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="shrink-0" />;
  const { date, shortDate, time } = kioskNow(now, tz);
  return (
    <p className="shrink-0 text-right font-display leading-tight" aria-live="off">
      <span className="block text-[1.125em] tabular-nums">{time}</span>
      {longName ? (
        <span className="block whitespace-nowrap text-[0.875em] text-muted-foreground">
          <span className="sm:hidden">{shortDate}</span>
          <span className="hidden sm:inline">{date}</span>
        </span>
      ) : (
        <span className="block whitespace-nowrap text-[0.875em] text-muted-foreground">{date}</span>
      )}
    </p>
  );
}

/** The square button beside the clock: as tall as its two rows, and see-through. */
export const headerIconClass =
  "grid size-[3em] shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The part of the day at the property, as one simple icon: sunrise in the
 * morning, the sun through the day, sunset in the evening, the moon at
 * night. Worked out from the time zone (dayProgress), no service.
 */
export function DayIcon({ tz, className }: { tz: string; className?: string }) {
  const now = useNow(60_000);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className={className} />;
  const Icon = DAY_ICONS[dayProgress(now, tz).phase];
  return <Icon className={className} strokeWidth={1.5} aria-hidden />;
}

const DAY_ICONS = {
  dawn: Sunrise,
  morning: Sunrise,
  midday: Sun,
  afternoon: Sun,
  dusk: Sunset,
  evening: Sunset,
  night: Moon,
} as const;

function Dial({ city, tz, home, now, here, look }: { city: string; tz: string; home: string; now: Date; here: boolean; look: SaverLook }) {
  const h = clockHands(now, tz, home);
  const b = look.brightness;
  const w = look.size;
  return (
    <figure className="flex flex-col items-center gap-3" style={{ opacity: here ? 1 : 0.8 }}>
      <svg viewBox="0 0 100 100" className={here ? "size-32 sm:size-44 lg:size-52" : "size-24 sm:size-32 lg:size-36"} aria-hidden>
        <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeOpacity={glow(0.22, b)} strokeWidth={0.8 * w} />
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            x1="50"
            y1={i % 3 === 0 ? 7 : 9}
            x2="50"
            y2="12"
            stroke="currentColor"
            strokeOpacity={glow(i % 3 === 0 ? 0.4 : 0.22, b)}
            strokeWidth={(i % 3 === 0 ? 1.2 : 0.7) * w}
            transform={`rotate(${i * 30} 50 50)`}
          />
        ))}
        <line x1="50" y1="50" x2="50" y2="27" stroke="currentColor" strokeOpacity={glow(0.55, b)} strokeWidth={2.2 * w} strokeLinecap="round" transform={`rotate(${h.hourDeg} 50 50)`} />
        <line x1="50" y1="50" x2="50" y2="15" stroke="currentColor" strokeOpacity={glow(0.45, b)} strokeWidth={1.2 * w} strokeLinecap="round" transform={`rotate(${h.minuteDeg} 50 50)`} />
        <circle cx="50" cy="50" r={1.6 * w} fill="currentColor" fillOpacity={glow(0.5, b)} />
      </svg>
      <figcaption className="text-center">
        {/* Wider letters close up as the text grows, so long city names keep to their clock. */}
        <span className="block whitespace-nowrap font-medium uppercase" style={{ ...text(0.7, 0.7 * 0.4, look), letterSpacing: `${0.3 / Math.max(1, look.size)}em` }}>
          {city}
        </span>
        {here ? (
          <span className="block uppercase tracking-[0.3em]" style={text(0.6, 0.4 * 0.4, look)}>
            {copy.saverHere}
          </span>
        ) : null}
        <span className="mt-1 block tabular-nums" style={text(0.75, 0.45 * 0.4, look)}>
          {h.time}
          {h.dayShift === 1 ? ` · ${copy.tomorrow}` : h.dayShift === -1 ? ` · ${copy.yesterday}` : ""}
        </span>
      </figcaption>
    </figure>
  );
}

/** Text on the screensaver: size in rem at the original look, and how strongly its white shows. */
const text = (rem: number, alpha: number, look: SaverLook): React.CSSProperties => ({
  fontSize: `${rem * look.size}rem`,
  color: `rgb(255 255 255 / ${glow(alpha, look.brightness)})`,
});

/**
 * A full-height strip along one edge of the screensaver, wide enough for a
 * finger. It can't be seen until touched (or the mouse comes near), then
 * slides in; drag up or down (or scroll, or use the arrow keys) to change
 * the value. Touching it never wakes the kiosk.
 */
function SaverBand({
  side,
  label,
  icon: Icon,
  value,
  lo,
  hi,
  step,
  brightness,
  onChange,
  onCommit,
}: {
  side: "left" | "right";
  label: string;
  icon: typeof Sun;
  value: number;
  lo: number;
  hi: number;
  step: number;
  brightness: number;
  onChange: (v: number) => void;
  onCommit: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [dragging, setDragging] = useState(false);
  const track = useRef<HTMLDivElement | null>(null);
  const start = useRef<{ y: number; v: number } | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  latest.current = value;

  const keep = () => {
    setShown(true);
    if (hide.current) clearTimeout(hide.current);
    hide.current = setTimeout(() => setShown(false), 3_000);
  };
  useEffect(() => () => {
    if (hide.current) clearTimeout(hide.current);
  }, []);
  const nudge = (dir: 1 | -1) => {
    keep();
    onChange(bandValue(bandFraction(latest.current + dir * step, lo, hi), lo, hi, step));
    onCommit();
  };
  const fill = bandFraction(value, lo, hi);
  // The band itself is always readable, whatever the brightness.
  const ink = Math.max(0.55, glow(0.5, brightness));

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={lo}
      aria-valuemax={hi}
      aria-valuenow={value}
      aria-valuetext={`${Math.round(value * 100)}%`}
      className={`fixed inset-y-0 z-[95] flex w-24 touch-none items-center justify-center outline-none ${side === "left" ? "left-0" : "right-0"}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { y: e.clientY, v: latest.current };
        setDragging(true);
        keep();
      }}
      onPointerMove={(e) => {
        if (e.pointerType === "mouse" && !start.current) keep();
        if (!start.current || !track.current) return;
        keep();
        const height = track.current.getBoundingClientRect().height || 1;
        const at = bandFraction(start.current.v, lo, hi) + (start.current.y - e.clientY) / height;
        onChange(bandValue(at, lo, hi, step));
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        if (start.current) onCommit();
        start.current = null;
        setDragging(false);
        keep();
      }}
      onPointerCancel={() => {
        if (start.current) onCommit();
        start.current = null;
        setDragging(false);
      }}
      onWheel={(e) => {
        e.stopPropagation();
        nudge(e.deltaY < 0 ? 1 : -1);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "ArrowUp" || e.key === "ArrowRight") nudge(1);
        else if (e.key === "ArrowDown" || e.key === "ArrowLeft") nudge(-1);
      }}
      onFocus={keep}
    >
      <div
        className="flex h-[72vh] w-14 flex-col items-center gap-3 rounded-full border px-2 py-4 transition-all duration-300 ease-out"
        style={{
          opacity: shown || dragging ? 1 : 0,
          transform: `translateX(${shown || dragging ? 0 : side === "left" ? -24 : 24}px)`,
          borderColor: `rgb(255 255 255 / ${ink * 0.5})`,
          color: `rgb(255 255 255 / ${ink})`,
          background: "rgb(255 255 255 / 0.06)",
        }}
      >
        <span className="text-xs tabular-nums">{Math.round(value * 100)}%</span>
        <div ref={track} className="relative w-3 flex-1 overflow-hidden rounded-full" style={{ background: "rgb(255 255 255 / 0.12)" }}>
          <div className="absolute inset-x-0 bottom-0 rounded-full" style={{ height: `${fill * 100}%`, background: `rgb(255 255 255 / ${ink})` }} />
        </div>
        <Icon className="size-5" aria-hidden />
        <span className="sr-only">{copy.saverBandHint}</span>
      </div>
    </div>
  );
}

const lookKey = (code: string) => `latchkey.saverLook.${code}`;

/**
 * This kiosk's screensaver look: shown at once from the last copy on this
 * tablet, then from the server (the host's choice, or Latchkey's starting
 * point); changes are saved for the host when a slide ends.
 */
export function useSaverLook(code: string) {
  const fetchLook = useServerFn(kioskSaverLook);
  const saveLook = useServerFn(saveKioskSaverLook);
  const [defaults, setDefaults] = useState<SaverDefaults>(DEFAULT_SAVER);
  const [look, setLook] = useState<SaverLook>({ brightness: DEFAULT_SAVER.brightness, size: DEFAULT_SAVER.size });
  const current = useRef(look);
  current.current = look;
  const sliding = useRef(false);
  useEffect(() => {
    try {
      const kept = JSON.parse(window.localStorage.getItem(lookKey(code)) ?? "null") as { defaults?: unknown; look?: unknown } | null;
      if (kept) {
        const d = normaliseDefaults(kept.defaults);
        setDefaults(d);
        setLook(lookFor(d, kept.look));
      }
    } catch {
      // Nothing kept on this tablet yet.
    }
    const load = () =>
      void fetchLook({ data: { code } })
        .then((r) => {
          setDefaults(r.defaults);
          // Never undo a slide the host is making right now.
          if (!sliding.current) setLook(r.look);
          try {
            window.localStorage.setItem(lookKey(code), JSON.stringify(r));
          } catch {
            // Private mode: fine, the server has it.
          }
        })
        .catch(() => {});
    load();
    // Latchkey admin's timings and the host's look reach a running kiosk within two minutes.
    const id = window.setInterval(load, 120_000);
    return () => window.clearInterval(id);
  }, [code, fetchLook]);
  const commit = useCallback(() => {
    sliding.current = false;
    const l = current.current;
    try {
      window.localStorage.setItem(lookKey(code), JSON.stringify({ defaults, look: l }));
    } catch {
      // Not kept on this tablet.
    }
    void saveLook({ data: { code, ...l } }).catch(() => {});
  }, [code, defaults, saveLook]);
  const change = useCallback((next: SaverLook | ((l: SaverLook) => SaverLook)) => {
    sliding.current = true;
    setLook(next);
  }, []);
  return { defaults, look, setLook: change, commit };
}

/**
 * The kiosk at rest: black, dim, with a reception-style row of world clocks.
 * The whole display wanders a little, slowly, so nothing burns into the
 * screen; it never scales or stretches. Any touch wakes it, except on the
 * edge bands: brightness on the left, clock size on the right.
 */
export function KioskScreensaver({
  name,
  tz,
  onWake,
  quiet,
  saver,
}: {
  name: string;
  tz: string;
  onWake: () => void;
  quiet?: { start: string; end: string } | undefined;
  /** From useSaverLook, which the kiosk also reads its timings from. */
  saver: ReturnType<typeof useSaverLook>;
}) {
  const now = useNow(20_000);
  const [started] = useState(() => Date.now());
  const drift = burnDrift(now.getTime() - started + 1);
  const local = kioskNow(now, tz);
  const q = quiet ? quietNow(now, tz, quiet.start, quiet.end) : null;
  const { defaults, look, setLook, commit } = saver;
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
        className="flex flex-col items-center gap-12 transition-transform duration-[19000ms] ease-in-out"
        style={{ transform: `translate(${drift.x}px, ${drift.y}px)`, color: `rgb(255 255 255 / ${glow(0.4, look.brightness)})` }}
      >
        {/* Here in the middle; two cities behind on the left, two ahead on the right. */}
        <div className="flex items-center justify-center gap-6 sm:gap-10 lg:gap-14">
          {worldClocksFor(tz, zoneCity(tz), now).map((c) => (
            <Dial key={c.city} city={c.city} tz={c.tz} home={tz} now={now} here={c.home} look={look} />
          ))}
        </div>
        <div className="text-center">
          <p className="font-display tracking-wide" style={text(1.5, 0.35, look)}>
            {name}
          </p>
          <p className="mt-2 tracking-[0.2em]" style={text(0.875, 0.25, look)}>
            {local.date} · {local.time}
          </p>
          {q?.active ? (
            <div className="mx-auto mt-8 max-w-xl">
              <p className="flex items-center justify-center gap-2 tracking-wide" style={text(1, 0.4, look)}>
                <Moon className="size-[1em]" aria-hidden /> {copy.quietTitle(q.until)}
              </p>
              <p className="mt-2 leading-relaxed" style={text(0.875, 0.3, look)}>
                {copy.quietBody}
              </p>
            </div>
          ) : null}
          <p className="mt-8 uppercase tracking-[0.3em]" style={text(0.75, 0.2, look)}>
            {copy.saverTouch}
          </p>
        </div>
      </div>

      <SaverBand
        side="left"
        label={copy.saverBrightness}
        icon={Sun}
        value={look.brightness}
        lo={BRIGHTNESS.min}
        hi={BRIGHTNESS.max}
        step={BRIGHTNESS.step}
        brightness={look.brightness}
        onChange={(brightness) => setLook((l) => ({ ...l, brightness }))}
        onCommit={commit}
      />
      <SaverBand
        side="right"
        label={copy.saverSize}
        icon={Type}
        value={look.size}
        lo={defaults.sizeMin}
        hi={defaults.sizeMax}
        step={SIZE.step}
        brightness={look.brightness}
        onChange={(size) => setLook((l) => ({ ...l, size }))}
        onCommit={commit}
      />
    </div>
  );
}
