import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { CheckInFlow } from "@/components/guest/CheckInFlow";
import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { LogoMark } from "@/components/theme/LogoMark";
import { ThemeScope } from "@/components/theme/ThemeScope";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PinPad } from "@/components/guest/PinPad";
import { InstallApp } from "@/components/InstallApp";
import { KioskClock, KioskScreensaver } from "@/components/guest/KioskClocks";
import { KIOSK_RESET_MS, KIOSK_SAVER_MS } from "@/lib/kiosk-clock";
import { guest as copy } from "@/content/copy";
import { getCheckinProperty, kioskUnlock } from "@/lib/checkin.functions";

// No tap for 5 minutes: cancel the check-in on this tablet; 5 more: screensaver.
const HOLD_MS = 3_000;

export const Route = createFileRoute("/kiosk/$code")({
  loader: async ({ params }) => {
    const p = await getCheckinProperty({ data: { code: params.code } });
    if (!p.found) throw notFound({ data: { paused: "paused" in p && p.paused === true } });
    return p;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Checking in — ${loaderData?.name ?? "Latchkey"}` },
      { name: "description", content: "Front-door tablet for guest self check-in." },
      { property: "og:title", content: "Checking in" },
      { property: "og:description", content: "Front-door tablet for guest self check-in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  notFoundComponent: ({ data }) => (
    <GuestFrame>
      <GuestMessage text={(data as { paused?: boolean } | undefined)?.paused ? copy.checkinPaused : copy.notFound} />
    </GuestFrame>
  ),
  errorComponent: () => (
    <GuestFrame>
      <GuestMessage text={copy.error} />
    </GuestFrame>
  ),
  component: Kiosk,
});

function Kiosk() {
  const p = Route.useLoaderData();
  // Installing from here installs this property's kiosk, not the host app.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const before = link.href;
    link.href = `/api/public/manifest/kiosk/${p.code}`;
    return () => {
      link.href = before;
    };
  }, [p.code]);
  const navigate = useNavigate();
  const unlock = useServerFn(kioskUnlock);
  const [session, setSession] = useState(0);
  const [exitOpen, setExitOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saver, setSaver] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bump = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (saverTimer.current) clearTimeout(saverTimer.current);
    idleTimer.current = setTimeout(() => {
      // Nobody's here: start again for the next guest, then rest the screen.
      setExitOpen(false);
      setSession((s) => s + 1);
      saverTimer.current = setTimeout(() => setSaver(true), KIOSK_SAVER_MS);
    }, KIOSK_RESET_MS);
  }, []);

  useEffect(() => {
    bump();
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    const onAny = () => bump();
    events.forEach((e) => window.addEventListener(e, onAny, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, onAny));
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (saverTimer.current) clearTimeout(saverTimer.current);
    };
  }, [bump]);

  function goFullscreen() {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function startHold() {
    holdTimer.current = setTimeout(() => {
      setPin("");
      setPinError(false);
      setExitOpen(true);
    }, HOLD_MS);
  }
  function endHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  }

  async function tryUnlock(e: React.FormEvent) {
    e.preventDefault();
    const res = await unlock({ data: { code: p.code, pin } }).catch(() => ({ ok: false }));
    if (!res.ok) return setPinError(true);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    await navigate({ to: "/app/today" });
  }

  return (
    <ThemeScope theme={p.theme} global>
    <div className="relative min-h-screen select-none bg-background px-4 sm:px-8" onPointerDown={goFullscreen}>
      <header className="mx-auto flex max-w-4xl items-center gap-3 pt-6">
        <LogoMark theme={p.theme} name={p.name} />
        <span className="font-display text-lg">{p.name}</span>
        <KioskClock tz={p.timezone ?? "Europe/London"} />
      </header>
      <button
        type="button"
        aria-label={copy.kioskExitTitle}
        className="absolute right-0 top-0 z-10 size-16 opacity-0"
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onContextMenu={(e) => e.preventDefault()}
      />
      <CheckInFlow key={session} property={p} hostPhone={p.hostPhone} kiosk onActivity={bump} />

      {saver ? (
        <KioskScreensaver
          name={p.name}
          tz={p.timezone ?? "Europe/London"}
          onWake={() => {
            setSaver(false);
            bump();
          }}
        />
      ) : null}

      <Dialog open={exitOpen} onOpenChange={setExitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.kioskExitTitle}</DialogTitle>
            <DialogDescription>{copy.kioskExitBody}</DialogDescription>
          </DialogHeader>
          <form onSubmit={tryUnlock} className="space-y-4">
            <PinPad value={pin} onChange={setPin} length={8} />
            {pinError ? <p role="alert" className="text-destructive">{copy.kioskWrongPin}</p> : null}
            <Button type="submit" size="touch" className="w-full" disabled={pin.length < 4}>
              {copy.kioskExitCta}
            </Button>
          </form>
          <div className="flex justify-center border-t border-border pt-3">
            <InstallApp kiosk size="sm" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </ThemeScope>
  );
}
