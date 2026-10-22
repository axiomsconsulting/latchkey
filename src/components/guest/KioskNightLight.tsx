import { useEffect, useRef } from "react";
import { Palette, Sun } from "lucide-react";

import { SaverBand, useNow, type useSaverLook } from "@/components/guest/KioskClocks";
import { guest as copy } from "@/content/copy";
import { quietNow } from "@/lib/kiosk-clock";
import { BLACK_BAND, NIGHT_LOOK, blackBand, nightFrame, restNow, type KioskRest } from "@/lib/kiosk-rest";
import { cn } from "@/lib/utils";

/**
 * The night light's moving colours (nightFrame, tested) with the dark band
 * that sweeps every pixel through black. Drawn straight onto two layers about
 * 15 times a second, so React doesn't re-render. `speedUp` runs it faster
 * for the host's preview.
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
  const band = useRef<HTMLDivElement | null>(null);
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
      if (band.current) band.current.style.left = `${((blackBand(t) - BLACK_BAND.width / 2) * 100).toFixed(2)}%`;
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className={cn("absolute inset-0 overflow-hidden bg-black", className)} aria-hidden>
      <div ref={glow} className="absolute inset-0" style={{ opacity: 0 }} />
      <div
        ref={band}
        className="absolute inset-y-0"
        style={{
          width: `${BLACK_BAND.width * 100}%`,
          left: `${(BLACK_BAND.from - BLACK_BAND.width / 2) * 100}%`,
          background: `linear-gradient(90deg, transparent 0%, #000 ${BLACK_BAND.solid[0] * 100}%, #000 ${BLACK_BAND.solid[1] * 100}%, transparent 100%)`,
        }}
      />
    </div>
  );
}

/** The whole screen as a night light. Any touch wakes the kiosk, except the bands: brightness on the left, colour depth on the right. */
export function KioskNightLight({ saver, onWake }: { saver: ReturnType<typeof useSaverLook>; onWake: () => void }) {
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

/** Screen off: black until touched. */
export function KioskBlank({ onWake }: { onWake: () => void }) {
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
    />
  );
}

/** Which of the three shows at rest right now: the night light (always, or in quiet hours), the clocks, or nothing. */
export function useRestShowing(rest: KioskRest, tz: string, quiet: { start: string; end: string }) {
  const now = useNow(30_000);
  return restNow(rest, quietNow(now, tz, quiet.start, quiet.end).active);
}
