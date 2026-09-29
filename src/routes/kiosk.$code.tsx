import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { CheckInFlow } from "@/components/guest/CheckInFlow";
import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { guest as copy } from "@/content/copy";
import { getCheckinProperty, kioskUnlock } from "@/lib/checkin.functions";

const IDLE_MS = 60_000;
const HOLD_MS = 3_000;

export const Route = createFileRoute("/kiosk/$code")({
  loader: async ({ params }) => {
    const p = await getCheckinProperty({ data: { code: params.code } });
    if (!p.found) throw notFound();
    return p;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Front door check-in — ${loaderData?.name ?? "Latchkey"}` },
      { name: "description", content: "Front-door tablet for guest self check-in." },
      { property: "og:title", content: "Front door check-in" },
      { property: "og:description", content: "Front-door tablet for guest self check-in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  notFoundComponent: () => (
    <GuestFrame>
      <GuestMessage text={copy.notFound} />
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
  const navigate = useNavigate();
  const unlock = useServerFn(kioskUnlock);
  const [session, setSession] = useState(0);
  const [exitOpen, setExitOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bump = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      setExitOpen(false);
      setSession((s) => s + 1);
    }, IDLE_MS);
  }, []);

  useEffect(() => {
    bump();
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    const onAny = () => bump();
    events.forEach((e) => window.addEventListener(e, onAny, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, onAny));
      if (idleTimer.current) clearTimeout(idleTimer.current);
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
    <div className="relative min-h-screen select-none bg-background px-4 sm:px-8" onPointerDown={goFullscreen}>
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

      <Dialog open={exitOpen} onOpenChange={setExitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.kioskExitTitle}</DialogTitle>
            <DialogDescription>{copy.kioskExitBody}</DialogDescription>
          </DialogHeader>
          <form onSubmit={tryUnlock} className="space-y-4">
            <Input
              aria-label={copy.kioskExitBody}
              inputMode="numeric"
              type="password"
              autoComplete="off"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="h-16 text-center text-3xl tracking-[0.4em]"
            />
            {pinError ? <p role="alert" className="text-destructive">{copy.kioskWrongPin}</p> : null}
            <Button type="submit" size="touch" className="w-full" disabled={pin.length < 4}>
              {copy.kioskExitCta}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
