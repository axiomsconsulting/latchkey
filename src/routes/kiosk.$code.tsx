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
 * Every check-in screen fits the display, so nothing runs past the bottom,
 * and nothing shakes. Everything below the header is in rem, so the page's
 * base font size scales it all together.
 *
 * - Wider than tall, the welcome sets the scale: it grows or shrinks to just
 *   fill the height. Upright, the scale is the page as designed (16px).
 * - Each new screen starts at that scale and then only ever shrinks, until
 *   it fits. Never growing back is what keeps it steady: text that unwraps
 *   as it shrinks can't push it into growing and overflowing again.
 * - The header (--kiosk-header) is sized once per display, from the scale,
 *   so it stays exactly where it is from screen to screen.
 * - A phone's address bar showing or hiding only re-checks; turning the
 *   screen or a real resize starts again.
 */
function useScreenFit(content: React.RefObject<HTMLDivElement | null>, atWelcome: boolean, stepKey: string) {
  const welcome = useRef(atWelcome);
  welcome.current = atWelcome;
  const refit = useRef<{ reset: () => void }>({ reset: () => {} });
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.fontSize;
    // Font size per pixel of screen height, from the last landscape welcome.
    let ratio: number | null = null;
    // Since the last reset: may this screen still grow (only the landscape welcome, until it first shrinks)?
    let mayGrow = false;
    let frame = 0;
    let lastW = window.innerWidth;
    let lastH = window.innerHeight;
    const px = () => Number.parseFloat(window.getComputedStyle(html).fontSize) || FIT.base;
    const set = (v: number) => {
      html.style.fontSize = v === FIT.base ? before : `${v}px`;
    };
    const scale = () => {
      const h = window.innerHeight;
      if (window.innerWidth <= h) return FIT.base;
      return ratio !== null ? Math.min(FIT.max, Math.max(FIT.min, ratio * h)) : FIT.base;
    };
    const header = (v: number) => html.style.setProperty("--kiosk-header", `${v}px`);

    const check = () => {
      const el = content.current;
      if (!el) return;
      const h = window.innerHeight;
      const landscape = window.innerWidth > h;
      const current = px();
      const tall = el.offsetHeight;
      const min = landscape ? FIT.min : FIT.min_upright;
      if (tall > h) {
        // Too tall: shrink until it fits, a hair under so rounding never leaves it over.
        mayGrow = false;
        const next = fitFontSize(current, tall, h * 0.99, { min, max: current });
        if (next < current - 0.05) set(next);
      } else if (mayGrow && !fitted(tall, h)) {
        const next = fitFontSize(current, tall, h * 0.99, { min, max: Math.min(FIT.max, widthCap(window.innerWidth)) });
        if (next > current + 0.05) set(next);
        else mayGrow = false;
      } else {
        mayGrow = false;
      }
      if (landscape && welcome.current) {
        ratio = px() / h;
        header(px());
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    };
    const reset = () => {
      const landscape = window.innerWidth > window.innerHeight;
      if (!landscape) ratio = null;
      const start = scale();
      set(start);
      header(start);
      mayGrow = landscape && welcome.current;
      schedule();
    };
    const resized = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const real = w !== lastW || Math.abs(h - lastH) > 150;
      lastW = w;
      lastH = h;
      if (real) reset();
      else schedule();
    };
    refit.current = { reset };
    reset();
    // A screen that changes size (a message, images loading) is checked again; it can only shrink.
    const observer = new ResizeObserver(schedule);
    if (content.current) observer.observe(content.current);
    window.addEventListener("resize", resized);
    window.addEventListener("orientationchange", reset);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resized);
      window.removeEventListener("orientationchange", reset);
      html.style.fontSize = before;
      html.style.removeProperty("--kiosk-header");
    };
  }, [content]);
  // A new screen starts from the scale again.
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
  // The public guest tour is this same screen. Its only differences are hooks here
  // (and isTour() on the server): it never takes over the visitor's browser,
  // and the hidden host corner just leaves the tour.
  const tour = p.tour === true;
  // Installing from here installs this property's kiosk, not the host app.
  useEffect(() => {
    if (!shared || tour) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const before = link.href;
    link.href = `/api/public/manifest/kiosk/${p.code}`;
    return () => {
      link.href = before;
    };
  }, [p.code, shared, tour]);
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
    if (!shared || tour) return;
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function startHold() {
    holdTimer.current = setTimeout(() => {
      // Tour: there's no host PIN; the corner just leaves the tour.
      if (tour) return void navigate({ to: "/", search: { home: true } });
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
    <div className="relative min-h-screen select-none bg-background px-[var(--kiosk-header,16px)] sm:px-[calc(var(--kiosk-header,16px)*2)] [&_input]:text-[max(16px,1rem)] [&_textarea]:text-[max(16px,1rem)]" onPointerDown={goFullscreen}>
      {/* Measured for the landscape fit: the page's own content, without the screen-high minimum. */}
      <div ref={content}>
      {/* Sized once per display (--kiosk-header, in em below), so it never moves between screens. */}
      <header className="mx-auto flex max-w-[56em] items-center gap-[0.75em] pt-[1.5em]" style={{ fontSize: "var(--kiosk-header, 16px)" }}>
        <LogoMark theme={p.theme} name={p.name} className="size-[2.5em] shrink-0 text-[1.125em]" />
        <span className="min-w-0 flex-1 truncate font-display text-[1.125em]">{p.name}</span>
        <KioskClock tz={p.timezone ?? "Europe/London"} longName={p.name.length > 14} />
        {/* Beside the time: the day's progress on the welcome (tap to rest the screen); later, the phone QR (CheckInFlow puts it here). */}
        {/* Always the same box, whichever icon is in it (or none), so nothing beside it shifts. */}
        <div id="kiosk-header-action" className={shared ? "flex h-[3.5em] w-[6.75em] shrink-0 items-center justify-end gap-[0.5em]" : "hidden"}>
          {shared && atWelcome && !saver ? (
            <button
              type="button"
              onClick={() => setSaver(true)}
              aria-label={`${copy.dayPhases[dayProgress(new Date(), p.timezone ?? "Europe/London").phase] ?? ""} · ${copy.saverStart}`}
              title={copy.saverStart}
              className={headerIconClass}
            >
              <DayIcon tz={p.timezone ?? "Europe/London"} className="size-[2.25em]" />
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
          qrPanel={saverLook.defaults.qrStyle === "panel"}
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
