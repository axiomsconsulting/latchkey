import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Hand } from "lucide-react";

import { guest as copy } from "@/content/copy";
import { dismissKioskWelcome, kioskWelcome } from "@/lib/kiosk.functions";
import { onKioskPing } from "@/lib/kiosk-ping";

type Welcome = { headline: string; body: string | null; version: number };

/**
 * The host's welcome for an arriving guest, kept up to date on the kiosk:
 * read on start, every minute, and the moment the host changes it.
 */
export function useKioskWelcome(code: string, enabled = true) {
  const fetchFn = useServerFn(kioskWelcome);
  const dismissFn = useServerFn(dismissKioskWelcome);
  const [message, setMessage] = useState<Welcome | null>(null);
  const [tapped, setTapped] = useState<number | null>(null);

  const load = useCallback(() => {
    void fetchFn({ data: { code } })
      .then((m) => setMessage(m))
      .catch(() => undefined);
  }, [code, fetchFn]);

  useEffect(() => {
    // Only the shared door screen shows welcomes; a guest's own phone doesn't listen.
    if (!enabled) return;
    load();
    const id = window.setInterval(load, 60_000);
    const stop = onKioskPing(code, load);
    return () => {
      window.clearInterval(id);
      stop();
    };
  }, [code, load, enabled]);

  const dismiss = () => {
    if (!message) return;
    setTapped(message.version);
    void dismissFn({ data: { code, version: message.version } }).catch(() => undefined);
  };
  // A new version (the host changed it) shows again even after a tap.
  return { welcome: message && tapped !== message.version ? message : null, dismiss };
}

/** The welcome, filling the screen. Any touch dismisses it and opens check-in. */
export function KioskWelcomeOverlay({ welcome, onDismiss }: { welcome: Welcome; onDismiss: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={copy.welcomeDismiss}
      className="fixed inset-0 z-[95] flex cursor-pointer select-none flex-col items-center justify-center bg-primary px-8 text-center text-primary-foreground"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }}
      onKeyDown={onDismiss}
    >
      <Hand className="mb-8 size-14 opacity-80" aria-hidden />
      <h1 className="max-w-5xl font-display text-5xl leading-tight sm:text-7xl">{welcome.headline}</h1>
      {welcome.body ? <p className="mt-6 max-w-3xl whitespace-pre-line text-2xl opacity-90 sm:text-3xl">{welcome.body}</p> : null}
      <p className="mt-14 rounded-full bg-primary-foreground/15 px-8 py-4 text-xl font-medium sm:text-2xl">{copy.welcomeTap}</p>
    </div>
  );
}
