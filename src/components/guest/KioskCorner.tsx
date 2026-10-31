import { useEffect, useRef, useState } from "react";
import { Maximize, Minimize, RefreshCw } from "lucide-react";

import { guest as copy } from "@/content/copy";
import { reloadToUpdate } from "@/hooks/use-app-update";
import { enterFullscreen, setFullscreenWanted } from "@/lib/kiosk-fullscreen";
import { TAPS, TAP_WINDOW_MS, countTap } from "@/lib/kiosk-taps";
import { cn } from "@/lib/utils";

/**
 * Three taps in quick succession: guests brushing the corner never trigger
 * anything, and there's no press-and-hold (that brings up the browser's own
 * menu on tablets). `done` runs inside the third tap, so the browser allows
 * full screen. `count` (0-2) shows how many taps so far.
 */
function useTaps(done: () => void) {
  const [count, setCount] = useState(0);
  const taps = useRef<number[]>([]);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return {
    count,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      const next = countTap(taps.current, Date.now());
      window.clearTimeout(timer.current);
      if (next.fired) {
        taps.current = [];
        setCount(0);
        done();
        return;
      }
      taps.current = next.taps;
      setCount(next.taps.length);
      timer.current = window.setTimeout(() => {
        taps.current = [];
        setCount(0);
      }, TAP_WINDOW_MS);
    },
  };
}

/** Small dots under a corner button: how many of the three taps so far. */
function TapDots({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -bottom-0.5 left-1/2 flex -translate-x-1/2 gap-0.5"
    >
      {Array.from({ length: TAPS }, (_, i) => (
        <span
          key={i}
          className={cn("size-1 rounded-full", i < count ? "bg-foreground" : "bg-foreground/30")}
        />
      ))}
    </span>
  );
}

/**
 * The door tablet's bottom-left corner: the full screen switch (tap 3
 * times), which tablet this is (or its setup code), and the app version.
 * A red dot beside the version means a newer version is waiting; tapping
 * the version 3 times shows a big Update button.
 */
export function KioskCorner({
  label,
  version,
  latest,
  available,
}: {
  /** "Front door · " or the setup code, before the version. */
  label: React.ReactNode;
  version: string;
  latest: string | null;
  available: boolean;
}) {
  const [full, setFull] = useState(false);
  const [offer, setOffer] = useState(false);
  useEffect(() => {
    const sync = () => setFull(!!document.fullscreenElement);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const fs = useTaps(() => {
    if (document.fullscreenElement) {
      setFullscreenWanted(false);
      void document.exitFullscreen?.().catch(() => {});
    } else {
      setFullscreenWanted(true);
      enterFullscreen();
    }
  });
  const upd = useTaps(() => setOffer(true));
  // The big button goes away again by itself if nobody taps it.
  useEffect(() => {
    if (!offer) return;
    const id = window.setTimeout(() => setOffer(false), 20_000);
    return () => window.clearTimeout(id);
  }, [offer]);

  return (
    <div className="fixed bottom-1.5 left-2 z-[96] flex select-none items-center gap-2 text-[13px] leading-tight text-muted-foreground [-webkit-touch-callout:none]">
      <button
        type="button"
        aria-label={full ? copy.fullscreenOff : copy.fullscreenOn}
        title={copy.tapHint}
        className="relative grid size-9 place-items-center rounded-full text-muted-foreground"
        onClick={fs.onClick}
      >
        {full ? (
          <Minimize className="size-4" aria-hidden />
        ) : (
          <Maximize className="size-4" aria-hidden />
        )}
        <TapDots count={fs.count} />
      </button>
      <button
        type="button"
        className="relative inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-left"
        title={available ? copy.tapToUpdate : undefined}
        aria-label={available && latest ? `v${version} · ${copy.tapToUpdate}` : undefined}
        onClick={available ? upd.onClick : undefined}
      >
        {label}v{version}
        {/* An update is waiting. */}
        {available ? <span aria-hidden className="size-2.5 rounded-full bg-red-600" /> : null}
        <TapDots count={upd.count} />
      </button>
      {offer ? (
        <button
          type="button"
          onClick={() => void reloadToUpdate()}
          className="fixed bottom-16 left-4 z-[97] inline-flex min-h-20 items-center gap-3 rounded-full bg-primary px-10 text-2xl font-bold text-primary-foreground shadow-2xl"
        >
          <RefreshCw className="size-7" aria-hidden /> {copy.updateNow(latest ?? "")}
        </button>
      ) : null}
    </div>
  );
}
