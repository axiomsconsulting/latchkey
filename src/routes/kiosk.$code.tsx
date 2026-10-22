import { useCallback, useEffect, useRef, useState } from "react";
import { GuestDemoDock } from "@/components/DemoDock";
import { trackEvent } from "@/lib/track";
import { pickUtm, type Utm } from "@/lib/attribution";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { CheckInFlow, JoinCheckIn } from "@/components/guest/CheckInFlow";
import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { LogoMark } from "@/components/theme/LogoMark";
import { ThemeScope } from "@/components/theme/ThemeScope";
import { ThemeBackdrop, ThemeFooter, ThemeSideNotes } from "@/components/theme/ThemeDecor";
import { cn } from "@/lib/utils";
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
import { KioskBlank, KioskNightLight, useRestShowing } from "@/components/guest/KioskNightLight";
import { idleActions } from "@/lib/kiosk-saver";
import { guest as copy } from "@/content/copy";
import { FIT, displayChanged, fitFontSize, fitted, personalPhone, widthCap, type Display, type Orientation } from "@/lib/kiosk-fit";
import { dayProgress } from "@/lib/kiosk-clock";
import { getCheckinProperty, kioskUnlock } from "@/lib/checkin.functions";
import { rebrand } from "@/lib/brand";

// Press and hold the top-right corner this long for the host's exit.
const HOLD_MS = 3_000;
// How far into the corner (px) the hold counts.
const HOLD_CORNER = 64;

export const Route = createFileRoute("/kiosk/$code")({
  // ?guest=1: a guest's own phone (from a QR code or link), not the shared door tablet.
  // ?resume=<token>: carry on a check-in started on the door tablet.
  // ?join=<share>: another guest on the same booking fills in their own details.
  validateSearch: (search: Record<string, unknown>): { guest?: boolean; resume?: string; join?: string } & Utm => ({
    // A shared link's source stays on the URL (the tour from /tour or a post).
    ...pickUtm(search),
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
      { title: rebrand(`Checking in — ${loaderData?.name ?? "Latchkey"}`) },
      { name: "description", content: `Check yourself in at ${loaderData?.name ?? "your stay"}. No app, no sign-up, about a minute.` },
      { property: "og:title", content: rebrand(`Checking in — ${loaderData?.name ?? "Latchkey"}`) },
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

/**
 * A phone held upright is someone's own device; anything else is a shared
 * screen, including a door tablet stood upright (judged by the device's
 * screen, personalPhone, tested).
 */
function usePortraitPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const update = () =>
      setPhone(personalPhone({ w: window.screen.width, h: window.screen.height }, { w: window.innerWidth, h: window.innerHeight }));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return phone;
}

/** The device's own orientation. Not the page's shape, which an on-screen keyboard can flip. */
function deviceOrientation(): Orientation {
  const type = window.screen.orientation?.type;
  if (type) return type.startsWith("landscape") ? "landscape" : "portrait";
  const legacy = (window as { orientation?: number }).orientation;
  if (typeof legacy === "number") return Math.abs(legacy) === 90 ? "landscape" : "portrait";
  return window.screen.width > window.screen.height ? "landscape" : "portrait";
}

/** A text box (or similar) has focus, so an on-screen keyboard may be up. */
function typing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return el.tagName === "INPUT" && !/^(button|checkbox|radio|range|submit|reset|file|color|image)$/i.test((el as HTMLInputElement).type);
}

/**
 * Every check-in screen fits the display, so nothing runs past the bottom,
 * and nothing shakes. Everything below the header is in rem, so the page's
 * base font size scales it all together.
 *
 * - The display is measured once and taken as fixed. It's measured again
 *   only when the device turns (its own orientation, not the page's shape)
 *   or the width changes (a desktop window, a foldable opening), or a
 *   desktop window gets much shorter. An on-screen keyboard, or a phone's
 *   address bar, never counts (displayChanged, tested).
 * - Wider than tall, the welcome sets the scale: it grows or shrinks to just
 *   fill the height. Upright, the scale is the page as designed (16px).
 * - Each new screen starts at that scale and then only ever shrinks, until
 *   it fits. Never growing back is what keeps it steady.
 * - The header (--kiosk-header) is sized once per display, from the scale,
 *   so it stays exactly where it is from screen to screen.
 * - Typing: the box being typed in is brought into view above the keyboard;
 *   when typing ends the page goes back to filling the screen.
 * - Expanded buttons: the page is measured at its natural height (the
 *   stretching rules in styles.css are off while <html> has
 *   data-kiosk-measure), so the scale is fitted exactly as in Standard; the
 *   keys and buttons then grow into whatever space is left.
 */
function useScreenFit(content: React.RefObject<HTMLDivElement | null>, atWelcome: boolean, stepKey: string, expanded: boolean) {
  const welcome = useRef(atWelcome);
  welcome.current = atWelcome;
  const refit = useRef<{ reset: () => void }>({ reset: () => {} });
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.fontSize;
    const measure = (): Display => ({ w: window.innerWidth, h: window.innerHeight, orientation: deviceOrientation() });
    // The display as measured: what every screen is fitted to.
    let display = measure();
    // Font size per pixel of display height, from the last landscape welcome.
    let ratio: number | null = null;
    // Since the last reset: may this screen still grow (only the landscape welcome, until it first shrinks)?
    let mayGrow = false;
    let frame = 0;
    const px = () => Number.parseFloat(window.getComputedStyle(html).fontSize) || FIT.base;
    const set = (v: number) => {
      html.style.fontSize = v === FIT.base ? before : `${v}px`;
    };
    const wide = () => display.w > display.h;
    const scale = () => (!wide() ? FIT.base : ratio !== null ? Math.min(FIT.max, Math.max(FIT.min, ratio * display.h)) : FIT.base);
    const header = (v: number) => html.style.setProperty("--kiosk-header", `${v}px`);

    const check = () => {
      const el = content.current;
      if (!el) return;
      const h = display.h;
      const landscape = wide();
      const current = px();
      // Switched off and on within this one frame, so nothing is ever painted unstretched.
      html.setAttribute("data-kiosk-measure", "");
      const tall = el.offsetHeight;
      html.removeAttribute("data-kiosk-measure");
      const min = landscape ? FIT.min : FIT.min_upright;
      if (tall > h) {
        // Too tall: shrink until it fits, a hair under so rounding never leaves it over.
        mayGrow = false;
        const next = fitFontSize(current, tall, h * 0.99, { min, max: current });
        if (next < current - 0.05) set(next);
      } else if (mayGrow && !fitted(tall, h)) {
        const next = fitFontSize(current, tall, h * 0.99, { min, max: Math.min(FIT.max, widthCap(display.w)) });
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
      if (!wide()) ratio = null;
      const start = scale();
      set(start);
      header(start);
      mayGrow = wide() && welcome.current;
      schedule();
    };
    // The keyboard takes a moment to slide away after typing ends: that counts as typing too.
    let typedAt = 0;
    const keyboardMaybeUp = () => typing() || Date.now() - typedAt < 1500;
    const resized = () => {
      const now = measure();
      if (!displayChanged(display, now, keyboardMaybeUp())) return;
      display = now;
      reset();
    };
    // Turning the device: its new size can arrive a moment after the event.
    let turnTimer = 0;
    const turned = () => {
      window.clearTimeout(turnTimer);
      turnTimer = window.setTimeout(() => {
        // Only if it really turned (or the width changed); never for the keyboard's height.
        const now = measure();
        if (now.orientation === display.orientation && Math.abs(now.w - display.w) <= 1) return;
        display = now;
        reset();
      }, 250);
    };

    // Typing: keep the box in view above the keyboard; afterwards, back to filling the screen.
    let focusTimer = 0;
    const focusIn = () => {
      if (!typing()) return;
      window.clearTimeout(focusTimer);
      // After the keyboard has slid up.
      focusTimer = window.setTimeout(() => {
        (document.activeElement as HTMLElement | null)?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 300);
    };
    const focusOut = () => {
      typedAt = Date.now();
      window.clearTimeout(focusTimer);
      // Moving to the next box keeps the keyboard up; only when typing has ended, settle back.
      focusTimer = window.setTimeout(() => {
        if (typing()) return;
        window.scrollTo({ top: 0, behavior: "smooth" });
        // A turn or a width change while typing is caught up now (the keyboard's height never is).
        const now = measure();
        if (now.orientation !== display.orientation || Math.abs(now.w - display.w) > 1) {
          display = now;
          reset();
        }
      }, 200);
    };
    const keyboardMoved = () => {
      if (typing()) (document.activeElement as HTMLElement | null)?.scrollIntoView({ block: "center" });
    };

    refit.current = { reset };
    reset();
    // A screen that changes size (a message, images loading) is checked again; it can only shrink.
    const observer = new ResizeObserver(schedule);
    if (content.current) observer.observe(content.current);
    window.addEventListener("resize", resized);
    window.screen.orientation?.addEventListener?.("change", turned);
    window.addEventListener("orientationchange", turned);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    window.visualViewport?.addEventListener("resize", keyboardMoved);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(turnTimer);
      window.clearTimeout(focusTimer);
      observer.disconnect();
      window.removeEventListener("resize", resized);
      window.screen.orientation?.removeEventListener?.("change", turned);
      window.removeEventListener("orientationchange", turned);
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
      window.visualViewport?.removeEventListener("resize", keyboardMoved);
      html.style.fontSize = before;
      html.style.removeProperty("--kiosk-header");
    };
  }, [content]);
  // A new screen (or a change of button size) starts from the scale again.
  useEffect(() => {
    refit.current.reset();
  }, [atWelcome, stepKey, expanded]);
}

/**
 * Idle kiosk, worked out from the clock (idleActions, tested), not chained
 * timers: only a real touch, tap, key or scroll counts as someone using it.
 * A reset or a new screen doesn't, so the screensaver still comes on after its
 * time; a tablet that slept or throttled its timers catches up as soon as it
 * wakes; and the timings follow Latchkey admin as they change. Returns the
 * function that marks someone using it now.
 */
function useKioskIdle(o: {
  enabled: boolean;
  atWelcome: boolean;
  saver: boolean;
  resetMinutes: number;
  saverMinutes: number;
  onReset: () => void;
  onSaver: () => void;
}) {
  const lastTouch = useRef(Date.now());
  const resetDone = useRef(false);
  const live = useRef(o);
  live.current = o;
  const bump = useCallback(() => {
    lastTouch.current = Date.now();
    resetDone.current = false;
  }, []);
  useEffect(() => {
    // A guest's own phone keeps their place however long they take.
    if (!o.enabled) return;
    bump();
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const check = () => {
      const now = live.current;
      const todo = idleActions(Date.now() - lastTouch.current, now, { atWelcome: now.atWelcome, resetDone: resetDone.current, saver: now.saver });
      if (todo.reset) {
        resetDone.current = true;
        now.onReset();
      }
      if (todo.saver) now.onSaver();
    };
    const id = window.setInterval(check, 5_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [bump, o.enabled]);
  return bump;
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
  // The launch funnel: someone opened the guest tour.
  useEffect(() => {
    if (tour) trackEvent("tour_view");
  }, [tour]);
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
  const [saver, setSaver] = useState(false);
  const [atWelcome, setAtWelcome] = useState(true);
  // Brightness, clock size and timings: the host's own where set, else Latchkey's (super admin).
  const saverLook = useSaverLook(p.code, shared);
  const { resetMinutes, saverMinutes, welcomeMinutes } = saverLook.defaults;
  const { welcome, dismiss } = useKioskWelcome(p.code, shared, welcomeMinutes);
  const content = useRef<HTMLDivElement | null>(null);
  const [stepKey, setStepKey] = useState("welcome:");
  // Door tablets only: keys, pads and buttons grow to use the whole screen (Latchkey admin → kiosk settings).
  const expanded = shared && saverLook.defaults.touch === "expanded";
  // On <html>, so dialogs (portalled outside this page) are sized to match.
  useEffect(() => {
    if (!expanded) return;
    const html = document.documentElement;
    html.setAttribute("data-kiosk-touch", "expanded");
    return () => html.removeAttribute("data-kiosk-touch");
  }, [expanded]);
  useScreenFit(content, atWelcome, stepKey, expanded);
  // The host just switched the night light on from their dashboard: an idle kiosk (on the welcome) lights up now.
  useEffect(() => {
    if (saverLook.nightOnAt && shared && atWelcome) setSaver(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saverLook.nightOnAt]);

  const bump = useKioskIdle({
    enabled: shared,
    atWelcome,
    saver,
    resetMinutes,
    saverMinutes,
    onReset: () => {
      setExitOpen(false);
      setSession((n) => n + 1);
    },
    onSaver: () => setSaver(true),
  });

  function goFullscreen() {
    if (!shared || tour) return;
    // navigationUI "hide": Android browsers that honour it also hide the bottom navigation bar.
    // Browsers that ignore full screen (some bundled ones) need the kiosk installed as an app instead.
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => {});
  }

  // The host's way out: press and hold the top-right corner. Watched on the whole page rather
  // than with a hidden button, so whatever sits in the corner (the phone QR, the day icon)
  // still answers a tap; only a hold that opened the exit swallows its click.
  const openExit = useRef(() => {});
  openExit.current = () => {
    // Tour: there's no host PIN; the corner just leaves the tour.
    if (tour) return void navigate({ to: "/", search: { home: true } });
    setPin("");
    setPinError(false);
    setExitOpen(true);
  };
  useEffect(() => {
    if (!shared) return;
    let timer = 0;
    let fired = false;
    const inCorner = (e: PointerEvent) => e.clientX >= window.innerWidth - HOLD_CORNER && e.clientY <= HOLD_CORNER;
    const stop = () => window.clearTimeout(timer);
    const down = (e: PointerEvent) => {
      fired = false;
      stop();
      if (!inCorner(e)) return;
      timer = window.setTimeout(() => {
        fired = true;
        openExit.current();
      }, HOLD_MS);
    };
    const move = (e: PointerEvent) => {
      if (!inCorner(e)) stop();
    };
    const click = (e: MouseEvent) => {
      if (!fired) return;
      fired = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const menu = (e: MouseEvent) => {
      if (e.clientX >= window.innerWidth - HOLD_CORNER && e.clientY <= HOLD_CORNER) e.preventDefault();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", stop, true);
    window.addEventListener("pointercancel", stop, true);
    window.addEventListener("click", click, true);
    window.addEventListener("contextmenu", menu, true);
    return () => {
      stop();
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", stop, true);
      window.removeEventListener("pointercancel", stop, true);
      window.removeEventListener("click", click, true);
      window.removeEventListener("contextmenu", menu, true);
    };
  }, [shared]);

  async function tryUnlock(e: React.FormEvent) {
    e.preventDefault();
    const res = await unlock({ data: { code: p.code, pin } }).catch(() => ({ ok: false }));
    if (!res.ok) return setPinError(true);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    await navigate({ to: "/app/today" });
  }

  return (
    <ThemeScope theme={p.theme} global full>
    {/* Inputs stay at 16px or more however small the page is fitted, so phones don't zoom in on them. */}
    {/* Expanded: only a thin margin at the screen's edges. */}
    <div
      className={cn(
        "relative min-h-screen select-none bg-background [&_input]:text-[max(16px,1rem)] [&_textarea]:text-[max(16px,1rem)]",
        expanded ? "px-[0.5rem]" : "px-[var(--kiosk-header,16px)] sm:px-[calc(var(--kiosk-header,16px)*2)]",
      )}
      onPointerDown={goFullscreen}
    >
      <ThemeBackdrop theme={p.theme} />
      {atWelcome ? <ThemeSideNotes theme={p.theme} /> : null}
      {/* Measured for the landscape fit: the page's own content, without the screen-high minimum. */}
      <div ref={content} data-kx="screen" className="relative">
      {/* Sized once per display (--kiosk-header, in em below), so it never moves between screens. */}
      <header className={cn("mx-auto flex items-center gap-[0.75em]", expanded ? "w-full max-w-none pt-[0.5em]" : "max-w-[56em] pt-[1.5em]")} style={{ fontSize: "var(--kiosk-header, 16px)" }}>
        <LogoMark theme={p.theme} name={p.name} className="size-[2.5em] shrink-0 text-[1.125em]" />
        <span className="min-w-0 flex-1">
          {/* A centred theme shows its name on the welcome itself; the bar keeps just the mark. */}
          <span className={cn("block truncate font-display text-[1.125em]", p.theme.layout === "centred" && atWelcome ? "invisible" : "")}>{p.name}</span>
          {p.theme.subname && !(p.theme.layout === "centred" && atWelcome) ? <span className="block truncate text-[0.7em] uppercase tracking-[0.25em] text-muted-foreground">{p.theme.subname}</span> : null}
        </span>
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
      {join ? (
        <JoinCheckIn share={join} />
      ) : (
        <CheckInFlow
          key={session}
          property={p}
          hostPhone={p.hostPhone}
          kiosk={shared}
          resumeToken={personal ? (resume ?? null) : null}
          onWelcome={setAtWelcome}
          onStep={(k: string) => {
            setStepKey(k);
            // …and got all the way to "you're checked in".
            if (tour && k.startsWith("done:")) trackEvent("tour_complete");
          }}
          qrPanel={saverLook.defaults.qrStyle === "panel"}
        />
      )}
      <ThemeFooter theme={p.theme} className={cn("mx-auto max-w-6xl", expanded ? "mt-[0.5em] w-full pb-[0.5em]" : "mt-[1.5em] pb-[1em]")} />
      </div>


      {/* The public tour: the floating demo panel (says it's a demo, switch property, start a trial, leave). */}
      {tour ? <GuestDemoDock code={p.code} /> : null}

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
        <KioskAtRest
          name={p.name}
          code={p.code}
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
        <DialogContent closeClassName="kiosk-close">
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

/**
 * The kiosk at rest, as the host chose for this property: the night light
 * (always, or in quiet hours), the clock screensaver (with the check-in QR
 * code if they chose it), or a dark screen. Any touch wakes it, ready to use.
 */
function KioskAtRest({
  name,
  code,
  saver,
  tz,
  quiet,
  onWake,
}: {
  name: string;
  code: string;
  saver: ReturnType<typeof useSaverLook>;
  tz: string;
  quiet: { start: string; end: string };
  onWake: () => void;
}) {
  const showing = useRestShowing(saver.rest, tz, quiet);
  if (showing === "night") return <KioskNightLight saver={saver} onWake={onWake} />;
  if (showing === "blank") return <KioskBlank onWake={onWake} />;
  const qrUrl = saver.rest.clockQr && typeof window !== "undefined" ? `${window.location.origin}/kiosk/${code}?guest=1` : null;
  return <KioskScreensaver name={name} saver={saver} tz={tz} quiet={quiet} qrUrl={qrUrl} onWake={onWake} />;
}
