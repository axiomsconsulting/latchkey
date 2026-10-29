import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Hand, Moon } from "lucide-react";

import { useQrImage } from "@/components/guest/CheckInQr";
import { useNow } from "@/components/guest/KioskClocks";
import { guest as copy } from "@/content/copy";
import { burnDrift, kioskNow, quietNow } from "@/lib/kiosk-clock";
import { dismissKioskWelcome, kioskWelcome } from "@/lib/kiosk.functions";
import { onKioskPing } from "@/lib/kiosk-ping";
import { deviceToken } from "@/lib/kiosk-presence";

type Welcome = {
  headline: string;
  body: string | null;
  version: number;
  expiresAt?: string;
  /** For a stay the guest can check in to straight from it (startFromWelcome). */
  checkIn?: boolean;
  /** "device": this tablet's own welcome; "all": the one for every tablet. */
  source?: "device" | "all";
};

/**
 * The host's welcome for an arriving guest, kept up to date on the kiosk:
 * read on start, every minute, and the moment the host changes it. It stays
 * until its end time (to the second), the host takes it off, or its guest
 * has checked in (the server stops sending it then).
 */
export function useKioskWelcome(code: string, enabled = true) {
  const fetchFn = useServerFn(kioskWelcome);
  const dismissFn = useServerFn(dismissKioskWelcome);
  const [message, setMessage] = useState<Welcome | null>(null);
  const [ended, setEnded] = useState<number | null>(null);

  const load = useCallback(() => {
    const device = deviceToken(code);
    void fetchFn({ data: { code, ...(device ? { device } : {}) } })
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

  // Off at its end time exactly, not up to a minute later.
  useEffect(() => {
    if (!message?.expiresAt) return;
    const left = Date.parse(message.expiresAt) - Date.now();
    if (left <= 0) return setEnded(message.version);
    const id = window.setTimeout(() => setEnded(message.version), Math.min(left, 2 ** 31 - 1));
    return () => window.clearTimeout(id);
  }, [message?.expiresAt, message?.version]);

  /** The guest tapped it: the host sees they've seen it. */
  const dismiss = () => {
    if (!message) return;
    const device = deviceToken(code);
    void dismissFn({
      data: {
        code,
        version: message.version,
        source: message.source ?? "all",
        ...(device ? { device } : {}),
      },
    }).catch(() => undefined);
  };
  return {
    welcome: message && ended !== message.version ? message : null,
    dismiss,
    reload: load,
  };
}

/**
 * The welcome, filling the screen. Its Check in button (or a touch
 * anywhere) checks in the guest it's for, without asking anything to find
 * their stay; "Someone else?" starts the usual way for anyone else.
 */
export function KioskWelcomeOverlay({
  welcome,
  onCheckIn,
  onNotMe,
}: {
  welcome: Welcome;
  onCheckIn: () => void;
  onNotMe: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={copy.welcomeDismiss}
      className="fixed inset-0 z-[95] flex cursor-pointer select-none flex-col items-center justify-center bg-primary px-8 text-center text-primary-foreground"
      onClick={onCheckIn}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onCheckIn();
      }}
    >
      <Hand className="mb-8 size-14 opacity-80" aria-hidden />
      <h1 className="max-w-5xl font-display text-5xl leading-tight sm:text-7xl">
        {welcome.headline}
      </h1>
      {welcome.body ? (
        <p className="mt-6 max-w-3xl whitespace-pre-line text-2xl opacity-90 sm:text-3xl">
          {welcome.body}
        </p>
      ) : null}
      {/* A solid button (no see-through colours: older tablet browsers show those as plain white), with a gentle pulse every few seconds. */}
      <span className="nudge-pulse mt-14 inline-flex min-h-16 items-center gap-3 rounded-full bg-primary-foreground px-10 py-4 text-2xl font-semibold text-primary shadow-lg sm:text-3xl">
        {copy.welcomeCheckIn} <ArrowRight className="size-7" aria-hidden />
      </span>
      <button
        type="button"
        className="mt-10 min-h-12 rounded-full px-6 text-lg underline underline-offset-4 opacity-90"
        onClick={(e) => {
          e.stopPropagation();
          onNotMe();
        }}
      >
        {copy.welcomeNotMe}
      </button>
    </div>
  );
}

/**
 * The welcome at rest, once untouched for a while (Latchkey admin's
 * welcomeMinutes): dark and dim so the screen is spared, split into two
 * halves whichever way up it stands. The top keeps the welcome and its
 * Check in button; the bottom one clock, quiet hours and the square for
 * others to check in on their own phones. Both drift slowly (burnDrift) so
 * nothing sits on the same pixels. It stays until the guest checks in, the
 * host takes it off or its end time; a touch shows the full welcome again.
 */
export function KioskWelcomeRest({
  welcome,
  tz,
  quiet,
  phoneUrl,
  onCheckIn,
  onWake,
}: {
  welcome: Welcome;
  tz: string;
  quiet: { start: string; end: string };
  phoneUrl: string | null;
  onCheckIn: () => void;
  onWake: () => void;
}) {
  const now = useNow(20_000);
  const [started] = useState(() => Date.now());
  const drift = burnDrift(now.getTime() - started + 1);
  const local = kioskNow(now, tz);
  const q = quietNow(now, tz, quiet.start, quiet.end);
  const qr = useQrImage(phoneUrl ?? "", { dark: "#a3a3a3ff", light: "#00000000" });
  const move = { transform: `translate(${drift.x}px, ${drift.y}px)` };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={copy.welcomeRestTouch}
      className="fixed inset-0 z-[95] grid cursor-pointer select-none grid-rows-2 overflow-hidden bg-black text-neutral-300"
      onClick={onWake}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onWake();
      }}
    >
      <section className="flex items-center justify-center border-b border-neutral-900 px-8 text-center">
        <div
          className="flex flex-col items-center transition-transform duration-[19000ms] ease-in-out"
          style={move}
        >
          <h1 className="max-w-5xl font-display text-4xl leading-tight text-neutral-200 sm:text-6xl">
            {welcome.headline}
          </h1>
          {welcome.body ? (
            <p className="mt-4 max-w-3xl whitespace-pre-line text-xl text-neutral-400 sm:text-2xl">
              {welcome.body}
            </p>
          ) : null}
          {/* Solid dark grey, not see-through, for older tablet browsers. */}
          <button
            type="button"
            className="mt-8 inline-flex min-h-16 items-center gap-3 rounded-full border border-neutral-600 bg-neutral-900 px-10 py-4 text-2xl font-semibold text-neutral-200"
            onClick={(e) => {
              e.stopPropagation();
              onCheckIn();
            }}
          >
            {copy.welcomeCheckIn} <ArrowRight className="size-7" aria-hidden />
          </button>
        </div>
      </section>
      <section className="flex items-center justify-center px-8">
        <div
          className="flex flex-wrap items-center justify-center gap-10 transition-transform duration-[19000ms] ease-in-out sm:gap-16"
          style={{ transform: `translate(${-drift.x}px, ${-drift.y}px)` }}
        >
          <div className="text-center">
            <p className="font-display text-7xl tabular-nums text-neutral-300 sm:text-8xl">
              {local.time}
            </p>
            <p className="mt-2 text-lg tracking-[0.2em] text-neutral-500">{local.date}</p>
            {q.active ? (
              <div className="mx-auto mt-6 max-w-md">
                <p className="flex items-center justify-center gap-2 text-lg text-neutral-400">
                  <Moon className="size-[1em]" aria-hidden /> {copy.quietTitle(q.until)}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-500">{copy.quietBody}</p>
              </div>
            ) : null}
            <p className="mt-6 text-xs uppercase tracking-[0.3em] text-neutral-600">
              {copy.welcomeRestTouch}
            </p>
          </div>
          {qr ? (
            <figure className="flex flex-col items-center gap-2">
              <img src={qr} alt={copy.qrAlt} className="size-[min(10rem,22vmin)]" />
              <figcaption className="max-w-[12rem] text-center text-xs uppercase tracking-[0.2em] text-neutral-500">
                {copy.welcomeOthers}
              </figcaption>
            </figure>
          ) : null}
        </div>
      </section>
    </div>
  );
}
