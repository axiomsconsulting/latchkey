import { useEffect, useRef } from "react";
import { Palette, Sun } from "lucide-react";

import { useQrImage } from "@/components/guest/CheckInQr";
import { SaverBand, useNow, type useSaverLook } from "@/components/guest/KioskClocks";
import { guest as copy } from "@/content/copy";
import { quietNow } from "@/lib/kiosk-clock";
import {
  NIGHT_LOOK,
  carePattern,
  nightFrame,
  qrSpot,
  restNow,
  type KioskRest,
} from "@/lib/kiosk-rest";
import { cn } from "@/lib/utils";

/**
 * The night light's moving colours (nightFrame, tested) at full brightness,
 * with a fine shimmer (carePattern) turning and sliding over them so every
 * pixel keeps changing. Drawn straight onto two layers about 15 times a
 * second, so React doesn't re-render.
 */
export function NightGlow({
  rest,
  depth,
  brightness,
  speedUp = 1,
  className,
}: {
  rest: Pick<KioskRest, "mode" | "palette" | "speed">;
  depth: number;
  brightness: number;
  speedUp?: number;
  className?: string;
}) {
  const glow = useRef<HTMLDivElement | null>(null);
  const care = useRef<HTMLDivElement | null>(null);
  const live = useRef({ rest, depth, brightness, speedUp });
  live.current = { rest, depth, brightness, speedUp };
  useEffect(() => {
    const start = performance.now();
    let frame = 0;
    let last = 0;
    const draw = (at: number) => {
      frame = requestAnimationFrame(draw);
      if (at - last < 66) return;
      last = at;
      const { rest: r, depth: d, brightness: b, speedUp: k } = live.current;
      const t = ((at - start) / 1000) * k;
      const f = nightFrame(r, t, d);
      const g = glow.current;
      if (g) {
        g.style.background = f.background;
        g.style.backgroundSize = f.backgroundSize ?? "";
        g.style.backgroundPosition = f.backgroundPosition ?? "";
        g.style.opacity = String(b * f.level);
      }
      const c = care.current;
      if (c) {
        const pattern = carePattern(t, r.speed);
        c.style.background = pattern.background;
        c.style.backgroundPosition = pattern.backgroundPosition;
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className={cn("absolute inset-0 overflow-hidden bg-black", className)} aria-hidden>
      <div ref={glow} className="absolute inset-0" style={{ opacity: 0 }} />
      <div ref={care} className="absolute inset-0 mix-blend-soft-light" />
    </div>
  );
}

/** The whole screen as a night light. Any touch wakes the kiosk, except the bands: brightness on the left, colour depth on the right. */
export function KioskNightLight({
  saver,
  onWake,
  qrUrl = null,
}: {
  saver: ReturnType<typeof useSaverLook>;
  onWake: () => void;
  qrUrl?: string | null;
}) {
  const { rest, night, setNight, commitNight } = saver;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={copy.nightWake}
      className="fixed inset-0 z-[90] cursor-pointer select-none bg-black"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onWake();
      }}
      onKeyDown={onWake}
    >
      <NightGlow rest={rest} depth={night.depth} brightness={night.brightness} />
      {qrUrl ? <RestQr url={qrUrl} on="light" /> : null}
      <SaverBand
        side="left"
        label={copy.saverBrightness}
        icon={Sun}
        value={night.brightness}
        lo={NIGHT_LOOK.brightness.min}
        hi={NIGHT_LOOK.brightness.max}
        step={NIGHT_LOOK.brightness.step}
        brightness={1.6}
        onChange={(brightness) => setNight((n) => ({ ...n, brightness }))}
        onCommit={commitNight}
      />
      <SaverBand
        side="right"
        label={copy.nightDepth}
        icon={Palette}
        value={night.depth}
        lo={NIGHT_LOOK.depth.min}
        hi={NIGHT_LOOK.depth.max}
        step={NIGHT_LOOK.depth.step}
        brightness={1.6}
        onChange={(depth) => setNight((n) => ({ ...n, depth }))}
        onCommit={commitNight}
      />
    </div>
  );
}

/** Screen off: black until touched (with the QR code, moving, if the host chose it). */
export function KioskBlank({
  onWake,
  qrUrl = null,
}: {
  onWake: () => void;
  qrUrl?: string | null;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={copy.nightWake}
      className="fixed inset-0 z-[90] cursor-pointer bg-black"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onWake();
      }}
      onKeyDown={onWake}
    >
      {qrUrl ? <RestQr url={qrUrl} on="dark" /> : null}
    </div>
  );
}

/**
 * The "check in on your phone" square while the kiosk rests, moving to a new
 * spot every few minutes (qrSpot) so it never burns in. Never a white block:
 * on the night light its squares are dark with nothing behind them, so the
 * light itself is the background; on a dark screen they're a soft grey on
 * black (inverted), which phone cameras read too.
 */
export function RestQr({ url, on }: { url: string; on: "light" | "dark" }) {
  const now = useNow(30_000);
  const spot = qrSpot(now);
  const src = useQrImage(
    url,
    on === "light"
      ? { dark: "#000000e6", light: "#00000000" }
      : { dark: "#b8b8b8ff", light: "#00000000" },
  );
  if (!src) return null;
  return (
    <figure
      className={cn(
        "pointer-events-none absolute flex flex-col items-center gap-2 transition-all duration-1000",
        // Clear of the edge bands (brightness, colour depth) and the screen's edges.
        spot.x === "left"
          ? "left-28"
          : spot.x === "right"
            ? "right-28"
            : "left-1/2 -translate-x-1/2",
        spot.y === "top" ? "top-10" : "bottom-10",
      )}
      aria-label={copy.saverQr}
    >
      <img src={src} alt={copy.qrAlt} className="size-[min(11rem,30vmin)]" />
      <figcaption
        className={cn(
          "text-center text-xs uppercase tracking-[0.2em]",
          on === "light" ? "text-black/75" : "text-white/55",
        )}
      >
        {copy.saverQr}
      </figcaption>
    </figure>
  );
}

/** Which of the three shows at rest right now: the night light (always, or in quiet hours), the clocks, or nothing. */
export function useRestShowing(rest: KioskRest, tz: string, quiet: { start: string; end: string }) {
  const now = useNow(30_000);
  return restNow(rest, quietNow(now, tz, quiet.start, quiet.end).active);
}
