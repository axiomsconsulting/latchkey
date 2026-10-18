import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { CheckInFlow, JoinCheckIn } from "@/components/guest/CheckInFlow";
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
import { DayIcon, KioskClock, KioskScreensaver, headerIconClass, useSaverLook } from "@/components/guest/KioskClocks";
import { KioskWelcomeOverlay, useKioskWelcome } from "@/components/guest/KioskWelcome";
import { guest as copy } from "@/content/copy";
import { FIT, fitFontSize, fitted, widthCap } from "@/lib/kiosk-fit";
import { dayProgress } from "@/lib/kiosk-clock";
import { getCheckinProperty, kioskUnlock } from "@/lib/checkin.functions";

// Press and hold the top-right corner this long for the host's exit.
const HOLD_MS = 3_000;

export const Route = createFileRoute("/kiosk/$code")({
  // ?guest=1: a guest's own phone (from a QR code or link), not the shared door tablet.
  // ?resume=<token>: carry on a check-in started on the door tablet.
  // ?join=<share>: another guest on the same booking fills in their own details.
  validateSearch: (search: Record<string, unknown>): { guest?: boolean; resume?: string; join?: string } => ({
    ...(typeof search["join"] === "string" ? { join: search["join"] } : {}),
    ...(search["guest"] === true || search["guest"] === "1" || search["guest"] === 1 ? { guest: true } : {}),
    ...(typeof search["resume"] === "string" ? { resume: search["resume"] } : {}),
  }),
  loader: async ({ params }) => {
    const p = await getCheckinProperty({ data: { code: params.code } });
    if (!p.found) throw notFound({ data: { paused: "paused" in p && p.paused === true } });
    return p;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Checking in — ${loaderData?.name ?? "Latchkey"}` },
      { name: "description", content: `Check yourself in at ${loaderData?.name ?? "your stay"}. No app, no sign-up, about a minute.` },
      { property: "og:title", content: `Checking in — ${loaderData?.name ?? "Latchkey"}` },
      { property: "og:description", content: `Check yourself in at ${loaderData?.name ?? "your stay"}.` },
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

/** A phone held upright is someone's own device; anything wider is a shared screen. */
function usePortraitPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const update = () => setPhone(window.innerWidth < 768 && window.innerHeight >= window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return phone;
}

/**
 * Every check-in screen fits the display, so nothing runs past the bottom.
 * Wider than tall, the welcome sets the scale: the base font size is chosen
 * so it just fills the height (every size here is in rem, so it all scales
 * together). Each later screen uses that scale, or shrinks until it fits
 * if it would run past the bottom. Upright (phones, tablets held tall), the
 * page is as designed and only ever shrinks to fit.
 */
function useScreenFit(content: React.RefObject<HTMLDivElement | null>, atWelcome: boolean, stepKey: string) {
  const welcome = useRef(atWelcome);
  welcome.current = atWelcome;
  const refit = useRef<{ schedule: () => void; reset: () => void }>({ schedule: () => {}, reset: () => {} });
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.fontSize;
    // Font size per pixel of screen height, from the last landscape welcome.
    let ratio: number | null = null;
    // A size that turned out too tall (text wrapped): never grow back past it on this screen.
    let ceiling: number = FIT.max;
    let frame = 0;
    const set = (px: number) => {
      html.style.fontSize = px === FIT.base && ratio === null ? before : `${px}px`;
    };
    const apply = () => {
      const el = content.current;
      if (!el) return;
      const h = window.innerHeight;
      const landscape = window.innerWidth > h;
      const current = Number.parseFloat(window.getComputedStyle(html).fontSize) || FIT.base;
      const tall = el.offsetHeight;
      if (tall > h && !fitted(tall, h)) ceiling = Math.min(ceiling, current);
      if (landscape && welcome.current) {
        const max = Math.min(ceiling, widthCap(window.innerWidth));
        // Never past the bottom; a near fit with room to spare is left alone.
        const next = tall <= h && fitted(tall, h) && current <= max ? current : fitFontSize(current, tall, tall > h ? h * 0.99 : h, { min: FIT.min, max });
        ratio = next / h;
        if (next !== current) set(next);
        return;
      }
      if (!landscape) ratio = null;
      // The screen's own scale: the welcome's in landscape, the page's own upright.
      const base = ratio !== null ? Math.min(FIT.max, Math.max(FIT.min, ratio * h)) : FIT.base;
      const max = Math.min(base, ceiling);
      const min = landscape ? FIT.min : FIT.min_upright;
      const fits = tall <= h;
      // Too tall: shrink until it fits (a hair under, so rounding never leaves it over). Room to spare below its scale: grow back, never past it.
      let next = current;
      if (!fits) next = fitFontSize(current, tall, h * 0.99, { min, max });
      else if (current < max && !fitted(tall, h)) next = fitFontSize(current, tall, h * 0.99, { min, max });
      else if (current > max) next = max;
      if (Math.abs(next - current) > 0.05) set(next);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    const reset = () => {
      ceiling = FIT.max;
      schedule();
    };
    refit.current = { schedule, reset };
    schedule();
    // Content that changes size (a new screen, images loading, the font applied) settles the fit in a step or two.
    const observer = new ResizeObserver(schedule);
    if (content.current) observer.observe(content.current);
    window.addEventListener("resize", reset);
    window.addEventListener("orientationchange", reset);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", reset);
      window.removeEventListener("orientationchange", reset);
      html.style.fontSize = before;
    };
  }, [content]);
  // A new screen starts from its scale again.
  useEffect(() => {
    refit.current.reset();
  }, [atWelcome, stepKey]);
}

function Kiosk() {
  const p = Route.useLoaderData();
  const { guest, resume, join } = Route.useSearch();
  // On a guest's own phone: the same screen, without the shared-tablet extras
  // (idle reset, screensaver, welcome overlay, hidden exit, kiosk install).
  const personal = guest === true || !!resume || !!join || usePortraitPhone();
  const shared = !personal;
  // Installing from here installs this property's kiosk, not the host app.
  useEffect(() => {
    if (!shared) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const before = link.href;
    link.href = `/api/public/manifest/kiosk/${p.code}`;
    return () => {
      link.href = before;
    };
  }, [p.code, shared]);
  const navigate = useNavigate();
  const unlock = useServerFn(kioskUnlock);
  const [session, setSession] = useState(0);
  const [exitOpen, setExitOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saver, setSaver] = useState(false);
  const [atWelcome, setAtWelcome] = useState(true);
  // Brightness, clock size and timings: the host's own where set, else Latchkey's (super admin).
  const saverLook = useSaverLook(p.code);
  const { resetMinutes, saverMinutes, welcomeMinutes } = saverLook.defaults;
  const { welcome, dismiss } = useKioskWelcome(p.code, shared, welcomeMinutes);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const [stepKey, setStepKey] = useState("welcome:");
  useScreenFit(content, atWelcome, stepKey);

  // No touch for resetMinutes: an unfinished check-in starts again for the next
  // guest; no touch for saverMinutes (from the same last touch): rest the screen.
  const bump = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (saverTimer.current) clearTimeout(saverTimer.current);
    idleTimer.current = setTimeout(() => {
      setExitOpen(false);
      setSession((s) => s + 1);
    }, resetMinutes * 60_000);
    saverTimer.current = setTimeout(() => setSaver(true), saverMinutes * 60_000);
  }, [resetMinutes, saverMinutes]);

  useEffect(() => {
    // A guest's own phone keeps their place however long they take.
    if (!shared) return;
    bump();
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    const onAny = () => bump();
    events.forEach((e) => window.addEventListener(e, onAny, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, onAny));
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (saverTimer.current) clearTimeout(saverTimer.current);
    };
  }, [bump, shared]);

  function goFullscreen() {
    if (!shared) return;
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
    {/* Inputs stay at 16px or more however small the page is fitted, so phones don't zoom in on them. */}
    <div className="relative min-h-screen select-none bg-background px-4 sm:px-8 [&_input]:text-[max(16px,1rem)] [&_textarea]:text-[max(16px,1rem)]" onPointerDown={goFullscreen}>
      {/* Measured for the landscape fit: the page's own content, without the screen-high minimum. */}
      <div ref={content}>
      <header className="mx-auto flex max-w-4xl items-center gap-3 pt-6">
        <LogoMark theme={p.theme} name={p.name} />
        <span className="min-w-0 truncate font-display text-lg">{p.name}</span>
        <KioskClock tz={p.timezone ?? "Europe/London"} longName={p.name.length > 14} />
        {/* Beside the time: the day's progress on the welcome (tap to rest the screen); later, the phone QR (CheckInFlow puts it here). */}
        <div id="kiosk-header-action" className="flex shrink-0 items-center empty:hidden">
          {shared && atWelcome && !saver ? (
            <button
              type="button"
              onClick={() => setSaver(true)}
              aria-label={`${copy.dayPhases[dayProgress(new Date(), p.timezone ?? "Europe/London").phase] ?? ""} · ${copy.saverStart}`}
              title={copy.saverStart}
              className={headerIconClass}
            >
              <DayIcon tz={p.timezone ?? "Europe/London"} className="size-11" />
            </button>
          ) : null}
        </div>
      </header>
      {shared ? (
      <button
        type="button"
        aria-label={copy.kioskExitTitle}
        className="absolute right-0 top-0 z-10 size-16 opacity-0"
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onContextMenu={(e) => e.preventDefault()}
      />
      ) : null}
      {join ? (
        <JoinCheckIn share={join} />
      ) : (
        <CheckInFlow
          key={session}
          property={p}
          hostPhone={p.hostPhone}
          kiosk={shared}
          resumeToken={personal ? (resume ?? null) : null}
          onActivity={shared ? bump : undefined}
          onWelcome={setAtWelcome}
          onStep={setStepKey}
        />
      )}
      </div>


      {/* The host's welcome for an arriving guest: over everything, wakes the screen. */}
      {shared && welcome ? (
        <KioskWelcomeOverlay
          welcome={welcome}
          onDismiss={() => {
            dismiss();
            setSaver(false);
            setSession((s) => s + 1);
            bump();
          }}
        />
      ) : null}

      {shared && saver ? (
        <KioskScreensaver
          name={p.name}
          saver={saverLook}
          tz={p.timezone ?? "Europe/London"}
          quiet={{ start: p.quietStart, end: p.quietEnd }}
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
