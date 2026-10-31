import { useEffect, useRef, useState } from "react";
import { Maximize, Minimize, RefreshCw } from "lucide-react";

import { guest as copy } from "@/content/copy";
import { reloadToUpdate } from "@/hooks/use-app-update";
import { enterFullscreen, setFullscreenWanted } from "@/lib/kiosk-fullscreen";
import { cn } from "@/lib/utils";

/** Hold for this long to act: guests brushing the corner never trigger anything. */
export const HOLD_MS = 3_000;

/**
 * Press and hold: `done` runs on letting go after HOLD_MS (inside the
 * gesture, so the browser allows full screen), and `progress` (0-1) fills
 * while held. Letting go early, or sliding off, cancels.
 */
function useHold(done: () => void) {
  const [progress, setProgress] = useState(0);
  const start = useRef<number | null>(null);
  const frame = useRef(0);
  const tick = () => {
    if (start.current === null) return;
    setProgress(Math.min(1, (Date.now() - start.current) / HOLD_MS));
    frame.current = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(frame.current);
    start.current = null;
    setProgress(0);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return {
    progress,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        e.stopPropagation();
        start.current = Date.now();
        frame.current = requestAnimationFrame(tick);
      },
      onPointerUp: (e: React.PointerEvent) => {
        e.stopPropagation();
        const held = start.current !== null && Date.now() - start.current >= HOLD_MS;
        stop();
        if (held) done();
      },
      onPointerLeave: stop,
      onPointerCancel: stop,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  };
}

/** A ring that fills while held. */
function Ring({ progress }: { progress: number }) {
  if (!progress) return null;
  const c = 2 * Math.PI * 18;
  return (
    <svg
      viewBox="0 0 40 40"
      className="pointer-events-none absolute inset-0 size-full -rotate-90"
      aria-hidden
    >
      <circle
        cx="20"
        cy="20"
        r="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - progress)}
      />
    </svg>
  );
}

/**
 * The door tablet's bottom-left corner: the full screen switch (hold for 3
 * seconds), which tablet this is (or its setup code), and the app version.
 * When a newer version is published it says so, and holding the version for
 * 3 seconds shows a big Update button.
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
  const fs = useHold(() => {
    if (document.fullscreenElement) {
      setFullscreenWanted(false);
      void document.exitFullscreen?.().catch(() => {});
    } else {
      setFullscreenWanted(true);
      enterFullscreen();
    }
  });
  const upd = useHold(() => setOffer(true));
  // The big button goes away again by itself if nobody taps it.
  useEffect(() => {
    if (!offer) return;
    const id = window.setTimeout(() => setOffer(false), 20_000);
    return () => window.clearTimeout(id);
  }, [offer]);

  return (
    <div className="fixed bottom-1.5 left-2 z-[96] flex select-none items-center gap-2 text-[13px] leading-tight text-muted-foreground">
      <button
        type="button"
        aria-label={full ? copy.fullscreenOff : copy.fullscreenOn}
        title={copy.holdHint}
        className="relative grid size-9 place-items-center rounded-full text-muted-foreground"
        {...fs.handlers}
      >
        {full ? (
          <Minimize className="size-4" aria-hidden />
        ) : (
          <Maximize className="size-4" aria-hidden />
        )}
        <Ring progress={fs.progress} />
      </button>
      <button
        type="button"
        className={cn(
          "relative rounded-full px-2 py-1 text-left",
          available && "bg-primary font-semibold text-primary-foreground",
        )}
        title={available ? copy.holdToUpdate : undefined}
        {...(available ? upd.handlers : {})}
      >
        {label}v{version}
        {available && latest ? ` · ${copy.newVersion(latest)}` : null}
        {available && upd.progress ? (
          <span
            aria-hidden
            className="absolute inset-x-1 bottom-0 h-0.5 origin-left bg-primary-foreground"
            style={{ transform: `scaleX(${upd.progress})` }}
          />
        ) : null}
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
