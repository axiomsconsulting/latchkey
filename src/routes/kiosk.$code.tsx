import { DEFAULT_ARRIVALS, cardEdge, cardInk } from "@/lib/checkout-goodbye";
import { useJumboFit } from "@/hooks/use-kiosk-stage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Mic } from "lucide-react";
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
import {
  DayIcon,
  KioskClock,
  KioskScreensaver,
  headerIconClass,
  useSaverLook,
} from "@/components/guest/KioskClocks";
import { KioskGoodbyeScreen, useKioskGoodbyes } from "@/components/guest/KioskGoodbye";
import {
  KioskWelcomeOverlay,
  KioskWelcomeRest,
  useKioskWelcome,
} from "@/components/guest/KioskWelcome";
import { KioskBlank, KioskNightLight, useRestShowing } from "@/components/guest/KioskNightLight";
import { idleActions } from "@/lib/kiosk-saver";
import { guest as copy } from "@/content/copy";
import {
  FIT,
  KIOSK_FIT_SCRIPT,
  calibrationKey,
  fitFontSize,
  fitted,
  keyboardLikely,
  orientedScreen,
  personalPhone,
  settleDisplay,
  widthCap,
  type Display,
} from "@/lib/kiosk-fit";
import { deviceOrientation, isTouchDevice } from "@/hooks/use-display";
import { areaFor, type Area, type Calibrations } from "@/lib/kiosk-calibration";
import {
  kioskScreenReport,
  kioskSnapshotUpload,
  kioskTablet,
  type TabletState,
} from "@/lib/kiosk-devices.functions";
import { useCameraPermission } from "@/hooks/use-camera-permission";
import { screenFrom } from "@/lib/kiosk-screen";
import { LowPowerLayer } from "@/components/guest/KioskLowPower";
import { useIdleFor } from "@/hooks/use-idle-for";
import { useMotionWake } from "@/hooks/use-motion-wake";
import { lowPowerNow, restNow, type RestShowing } from "@/lib/kiosk-rest";
import { deviceSignature } from "@/lib/kiosk-devices";
import { APP_VERSION } from "@/lib/app-version";
import { AppVersion } from "@/components/AppVersion";
import { KioskCorner } from "@/components/guest/KioskCorner";
import { KioskCardBell } from "@/components/guest/KioskCardBell";
import { newCards } from "@/lib/kiosk-picker";
import { expressCards, xlCss } from "@/lib/kiosk-xl";
import {
  KIOSK_COMPAT_SCRIPT,
  browserLabel,
  compatKey,
  detectMode,
  modeKey,
} from "@/lib/kiosk-compat";
import { enterFullscreen, fullscreenWanted } from "@/lib/kiosk-fullscreen";
import { useAppUpdate } from "@/hooks/use-app-update";
import { showPairCode, tabletName } from "@/lib/kiosk-devices";
import { onKioskPing } from "@/lib/kiosk-ping";
import { dayProgress } from "@/lib/kiosk-clock";
import { getCheckinProperty, kioskUnlock } from "@/lib/checkin.functions";
import { claimArmedSamples, getTestSamples } from "@/lib/test-stay.functions";
import { kioskReviews } from "@/lib/kiosk-reviews.functions";
import { KioskReviewsContext } from "@/components/guest/KioskReviews";
import { JumboBar } from "@/components/guest/JumboBar";
import { unlockAudio, voiceSupported, warmVoice } from "@/lib/voice-engine";
import { VoiceConcierge, VoiceMuteDefault } from "@/components/guest/VoiceConcierge";
import type { KioskReview } from "@/lib/kiosk-reviews";
import { TestSamplesContext, type TestSamples } from "@/components/guest/TestSamples";
import { listenForKioskSounds, setKioskFlash, setKioskSounds } from "@/lib/kiosk-sound";
import { deviceToken, keepDeviceToken, readFix } from "@/lib/kiosk-presence";
import { kioskHere } from "@/lib/stay-access.functions";
import { rebrand } from "@/lib/brand";
import { countTap } from "@/lib/kiosk-taps";

// Press and hold the top-right corner this long for the host's exit.
const HOLD_MS = 3_000;
// On a tablet (shorter side at least this many px), a screen never shrinks below this share of the
// display's scale, so text sizes stay consistent from step to step.
const TABLET_SHORT_SIDE = 600;
const TABLET_KEEP = 0.85;
// How far into the corner (px) the hold counts.
const HOLD_CORNER = 64;

export const Route = createFileRoute("/kiosk/$code")({
  // ?guest=1: a guest's own phone (from a QR code or link), not the shared door tablet.
  // ?resume=<token>: carry on a check-in started on the door tablet.
  // ?join=<share>: another guest on the same booking fills in their own details.
  validateSearch: (
    search: Record<string, unknown>,
  ): { guest?: boolean; resume?: string; join?: string; test?: string } & Utm => ({
    // A shared link's source stays on the URL (the tour from /tour or a post).
    ...pickUtm(search),
    ...(typeof search["join"] === "string" ? { join: search["join"] } : {}),
    ...(search["guest"] === true || search["guest"] === "1" || search["guest"] === 1
      ? { guest: true }
      : {}),
    ...(typeof search["resume"] === "string" ? { resume: search["resume"] } : {}),
    // ?test=<signed link>: the host's own test check-in with their sample photos (TestStayCard).
    ...(typeof search["test"] === "string" ? { test: search["test"] } : {}),
  }),
  loader: async ({ params }) => {
    const p = await getCheckinProperty({ data: { code: params.code } });
    if (!p.found) throw notFound({ data: { paused: "paused" in p && p.paused === true } });
    return p;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: rebrand(`Checking in — ${loaderData?.name ?? "Latchkey"}`) },
      {
        name: "description",
        content: `Check yourself in at ${loaderData?.name ?? "your stay"}. No app, no sign-up, about a minute.`,
      },
      { property: "og:title", content: rebrand(`Checking in — ${loaderData?.name ?? "Latchkey"}`) },
      {
        property: "og:description",
        content: `Check yourself in at ${loaderData?.name ?? "your stay"}.`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
      // The on-screen keyboard floats over the page instead of shrinking it.
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, interactive-widget=overlays-content",
      },
    ],
    // Before anything is drawn: this tablet's remembered size and text scale, so nothing jumps.
    // First of all: an older tablet that can't run this page goes to the compatible kiosk (/lite/<code>).
    scripts: [
      { children: KIOSK_COMPAT_SCRIPT },
      { children: KIOSK_FIT_SCRIPT },
      // Express or expanded buttons from the very first paint on a door tablet, so a screen never
      // draws at the standard size and then jumps (guests' own phones keep the standard size).
      ...(loaderData?.theme?.kioskTouch === "expanded" ||
      loaderData?.kioskLook?.look === "xl" ||
      loaderData?.kioskLook?.look === "jumbo"
        ? [{ children: EXPANDED_FIRST_SCRIPT }]
        : []),
    ],
  }),
  notFoundComponent: ({ data }) => (
    <GuestFrame>
      <GuestMessage
        text={
          (data as { paused?: boolean } | undefined)?.paused ? copy.checkinPaused : copy.notFound
        }
      />
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
/** The logo on screens in the property's colour (cards, welcome): a light tile so it always shows. */
const tileLogo = (size: string) =>
  cn(size, "shrink-0 rounded-[0.2em] bg-white p-[0.1em] text-primary ring-0 ring-offset-0");

/**
 * A door tablet starting up: the property's logo and name while the screen is lined up (the
 * tablet's calibration arrives with its first report, and fonts load), saying exactly that,
 * then "Ready" as it fades. It adds no wait: it goes as soon as the tablet is ready, and
 * taps pass through while it fades.
 */
function KioskSplash({
  theme,
  name,
  settled,
}: {
  theme: Parameters<typeof LogoMark>[0]["theme"];
  name: string;
  settled: boolean;
}) {
  const [fonts, setFonts] = useState(false);
  const [late, setLate] = useState(false);
  const [phase, setPhase] = useState<"calibrating" | "ready" | "gone">("calibrating");
  useEffect(() => {
    let live = true;
    const ready = document.fonts?.ready ?? Promise.resolve();
    void ready.then(() => live && setFonts(true));
    // Never longer than this, whatever the network does.
    const t = window.setTimeout(() => setLate(true), 2500);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, []);
  const done = (fonts && settled) || late;
  useEffect(() => {
    if (!done || phase !== "calibrating") return;
    // Two frames so the fitted layout has been drawn underneath.
    let a = 0;
    let b = 0;
    a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setPhase("ready"));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [done, phase]);
  useEffect(() => {
    if (phase !== "ready") return;
    const t = window.setTimeout(() => setPhase("gone"), 700);
    return () => window.clearTimeout(t);
  }, [phase]);
  if (phase === "gone") return null;
  return (
    <div
      data-kiosk-splash
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-0 z-[70] grid place-items-center bg-background transition-opacity duration-700",
        phase === "ready" ? "pointer-events-none opacity-0" : "opacity-100",
      )}
    >
      <div className="flex flex-col items-center gap-[2vmin] px-6 text-center">
        <LogoMark theme={theme} name={name} className="size-[18vmin] text-[7vmin]" />
        <p className="font-display text-[6vmin] leading-tight">{name}</p>
        <p className="text-[3vmin] text-muted-foreground">
          {phase === "ready" ? copy.splashReady : copy.splashCalibrating}
        </p>
      </div>
    </div>
  );
}

function usePortraitPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const update = () =>
      setPhone(
        personalPhone({ w: window.screen.width, h: window.screen.height }, deviceOrientation()),
      );
    update();
    window.addEventListener("resize", update);
    window.screen.orientation?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("resize", update);
      window.screen.orientation?.removeEventListener?.("change", update);
    };
  }, []);
  return phone;
}

/** The largest page this device has had, the way it's held, with no keyboard up (settleDisplay). */
const DISPLAY_KEY = "latchkey.display";
function remembered(key: string): { w: number; h: number } | null {
  try {
    const v = (
      JSON.parse(window.localStorage.getItem(DISPLAY_KEY) ?? "{}") as Record<string, unknown>
    )[key];
    // Older visits kept the height alone.
    if (typeof v === "number" && v > 0) return { w: 0, h: v };
    const o = v as { w?: unknown; h?: unknown } | undefined;
    return o && typeof o.w === "number" && typeof o.h === "number" && o.h > 0
      ? { w: o.w, h: o.h }
      : null;
  } catch {
    return null;
  }
}
function remember(key: string, w: number, h: number) {
  try {
    const all = JSON.parse(window.localStorage.getItem(DISPLAY_KEY) ?? "{}") as Record<
      string,
      unknown
    >;
    const was = remembered(key);
    if (was && was.w >= w && was.h >= h) return;
    all[key] = { w: Math.max(was?.w ?? 0, w), h: Math.max(was?.h ?? 0, h) };
    window.localStorage.setItem(DISPLAY_KEY, JSON.stringify(all));
  } catch {
    // Not remembered on this device: it's worked out from the screen instead.
  }
}
/** The landscape welcome's text size (px) for this screen held this way, and the height it was fitted to. */
const SCALE_KEY = "latchkey.kioskScale";
function rememberedScale(key: string): number | null {
  try {
    const v = (
      JSON.parse(window.localStorage.getItem(SCALE_KEY) ?? "{}") as Record<string, unknown>
    )[key];
    return typeof v === "object" && v && typeof (v as { px?: unknown }).px === "number"
      ? (v as { px: number }).px
      : null;
  } catch {
    return null;
  }
}
function rememberScale(key: string, px: number, h: number) {
  try {
    const all = JSON.parse(window.localStorage.getItem(SCALE_KEY) ?? "{}") as Record<
      string,
      unknown
    >;
    all[key] = { px: Math.round(px * 100) / 100, h };
    window.localStorage.setItem(SCALE_KEY, JSON.stringify(all));
  } catch {
    // Not remembered: worked out again next time.
  }
}

/** The host reset the calibration: learn the display from scratch. */
function forgetDisplay() {
  try {
    window.localStorage.removeItem(SCALE_KEY);
    window.localStorage.removeItem(DISPLAY_KEY);
  } catch {
    // Nothing kept.
  }
}

/** A text box (or similar) has focus, so an on-screen keyboard may be up. */
function typing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return (
    el.tagName === "INPUT" &&
    !/^(button|checkbox|radio|range|submit|reset|file|color|image)$/i.test(
      (el as HTMLInputElement).type,
    )
  );
}

/** What the kiosk lays out for, reported to the dashboard (calibration draws it). */
export type FitReport = {
  /** What the browser says now. */
  now: Display;
  /** The display as learned (largest seen held this way). */
  learned: Display;
  /** The calibrated area, if the host set one for this way up. */
  area: Area | null;
};

/**
 * Every check-in screen fits the display, so nothing runs past the bottom,
 * and nothing shakes. Everything below the header is in rem, so the page's
 * base font size scales it all together.
 *
 * - The display is the largest page this device has had held this way
 *   (settleDisplay, tested; remembered across visits): the screen doesn't
 *   change size, so an on-screen keyboard, the address bar, a toolbar or a
 *   navigation bar (at the bottom, or at the side on its side) never
 *   shrinks it. It's measured again only when the device turns (its own
 *   orientation, not the page's shape) or the width falls a long way (a
 *   foldable). Opened with the keyboard up (the address was just typed),
 *   the height comes from what it learned, or its screen. On a computer, a
 *   much shorter window counts too. --kiosk-h carries the height for CSS.
 * - The host's calibration for this tablet and way up (kiosk-calibration.ts)
 *   wins: the page is laid out for that area, moved and zoomed as set
 *   (returned as `frame` for the page to apply), until the host resets it.
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
function useScreenFit(
  content: React.RefObject<HTMLDivElement | null>,
  atWelcome: boolean,
  stepKey: string,
  expanded: boolean,
  calibrations: Calibrations,
  onReport?: (r: FitReport) => void,
  /** A door tablet: a fixed screen, so the browser's bars and keyboard never change its size. */
  fixedScreen = false,
  /** Jumbo lays its screens out in cqmin, so nothing there sets the size: it comes from the screen's height. */
  jumbo = false,
) {
  const jumboNow = useRef(jumbo);
  jumboNow.current = jumbo;
  const welcome = useRef(atWelcome);
  welcome.current = atWelcome;
  const cals = useRef(calibrations);
  cals.current = calibrations;
  const report = useRef(onReport);
  report.current = onReport;
  const refit = useRef<{ reset: () => void; recalibrate: () => void }>({
    reset: () => {},
    recalibrate: () => {},
  });
  const [frame, setFrame] = useState<Area | null>(null);
  useEffect(() => {
    const html = document.documentElement;
    // The page's own size when the kiosk is left (KIOSK_FIT_SCRIPT may have set one before paint).
    const before = "";
    const measure = (): Display => ({
      w: window.innerWidth,
      h: window.innerHeight,
      orientation: deviceOrientation(),
    });
    // A door tablet is a fixed screen even if it reports a mouse: only turning it measures again.
    const touch = fixedScreen || isTouchDevice();
    const screenSize = () => ({ w: window.screen.width, h: window.screen.height });
    const fullscreen = () =>
      !!document.fullscreenElement ||
      !!window.matchMedia?.("(display-mode: fullscreen), (display-mode: standalone)").matches;
    // The keyboard takes a moment to slide away after typing ends: that counts as typing too.
    let typedAt = 0;
    const keyboardMaybeUp = () => typing() || Date.now() - typedAt < 1500;
    // What the browser says now, made into the display (and the largest remembered when no keyboard is up).
    const settle = (prev: Display | null): Display => {
      const now = measure();
      const key = calibrationKey(screenSize(), now.orientation);
      const ctx = {
        touch,
        screen: screenSize(),
        typing: keyboardMaybeUp(),
        fullscreen: fullscreen(),
        learned: remembered(key),
      };
      if (
        touch &&
        !ctx.typing &&
        !keyboardLikely(now.h, orientedScreen(ctx.screen, now.orientation).h)
      )
        remember(key, now.w, now.h);
      return settleDisplay(prev, now, ctx);
    };
    const same = (a: Display, b: Display) =>
      a.w === b.w &&
      a.h === b.h &&
      a.orientation === b.orientation &&
      !!a.estimated === !!b.estimated;
    // As learned from the browser, and what every screen is fitted to (the calibrated area, unzoomed, if set).
    let learned = settle(null);
    let area: Area | null = null;
    let display = learned;
    const calibrate = () => {
      area = areaFor(cals.current, learned.orientation, learned);
      display = area
        ? {
            w: Math.round(area.w / area.zoom),
            h: Math.round(area.h / area.zoom),
            orientation: learned.orientation,
          }
        : learned;
      setFrame(area);
      report.current?.({ now: measure(), learned, area });
    };
    calibrate();
    // Font size per pixel of display height, from the last landscape welcome.
    // Remembered from an earlier visit, so the first screen already has its size (KIOSK_FIT_SCRIPT set it before paint).
    let ratio: number | null = (() => {
      const px0 = rememberedScale(calibrationKey(screenSize(), learned.orientation));
      return px0 && learned.w > learned.h ? px0 / display.h : null;
    })();
    // Since the last reset: may this screen still grow (only the landscape welcome, until it first shrinks)?
    let mayGrow = false;
    let frameId = 0;
    const px = () => Number.parseFloat(window.getComputedStyle(html).fontSize) || FIT.base;
    const set = (v: number) => {
      html.style.fontSize = v === FIT.base ? before : `${v}px`;
    };
    const wide = () => display.w > display.h;
    const scale = () =>
      !wide()
        ? FIT.base
        : ratio !== null
          ? Math.min(FIT.max, Math.max(FIT.min, ratio * display.h))
          : FIT.base;
    const header = (v: number) => html.style.setProperty("--kiosk-header", `${v}px`);
    const height = () => html.style.setProperty("--kiosk-h", `${display.h}px`);

    const check = () => {
      const el = content.current;
      if (!el) return;
      if (jumboNow.current) {
        // What the landscape welcome used to grow to, so everything in rem (the screensaver,
        // the bell's list, dialogs) keeps its size on Jumbo.
        const v = Math.round(Math.min(FIT.max, Math.max(FIT.base, display.h / 36)) * 10) / 10;
        if (Math.abs(px() - v) > 0.05) set(v);
        header(v);
        return;
      }
      const h = display.h;
      const landscape = wide();
      const current = px();
      // Switched off and on within this one frame, so nothing is ever painted unstretched.
      html.setAttribute("data-kiosk-measure", "");
      const tall = el.offsetHeight;
      html.removeAttribute("data-kiosk-measure");
      // On a tablet, text stays close to the same size on every screen (layouts use the width
      // instead); only a phone may shrink a long screen right down.
      const smallest = landscape ? FIT.min : FIT.min_upright;
      const min =
        Math.min(display.w, display.h) >= TABLET_SHORT_SIDE
          ? Math.max(smallest, scale() * TABLET_KEEP)
          : smallest;
      if (tall > h) {
        // Too tall: shrink until it fits, a hair under so rounding never leaves it over.
        mayGrow = false;
        const next = fitFontSize(current, tall, h * 0.99, { min, max: current });
        if (next < current - 0.05) set(next);
      } else if (mayGrow && !fitted(tall, h)) {
        const next = fitFontSize(current, tall, h * 0.99, {
          min,
          max: Math.min(FIT.max, widthCap(display.w)),
        });
        if (next > current + 0.05) set(next);
        else mayGrow = false;
      } else {
        mayGrow = false;
      }
      if (landscape && welcome.current) {
        ratio = px() / h;
        if (touch)
          rememberScale(calibrationKey(screenSize(), display.orientation), px(), display.h);
        header(px());
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(check);
    };
    const reset = () => {
      height();
      if (!wide()) ratio = null;
      const start = scale();
      set(start);
      header(start);
      mayGrow = wide() && welcome.current;
      schedule();
    };
    const resized = () => {
      const next = settle(learned);
      if (same(next, learned)) return;
      learned = next;
      ratio = null;
      calibrate();
      reset();
    };
    // Turning the device: its new size can arrive a moment after the event.
    let turnTimer = 0;
    const turned = () => {
      window.clearTimeout(turnTimer);
      turnTimer = window.setTimeout(resized, 250);
    };

    // Typing: keep the box in view above the keyboard; afterwards, back to filling the screen.
    let focusTimer = 0;
    const focusIn = () => {
      if (!typing()) return;
      window.clearTimeout(focusTimer);
      // After the keyboard has slid up.
      focusTimer = window.setTimeout(() => {
        (document.activeElement as HTMLElement | null)?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      }, 300);
    };
    const focusOut = () => {
      typedAt = Date.now();
      window.clearTimeout(focusTimer);
      // Moving to the next box keeps the keyboard up; only when typing has ended, settle back.
      focusTimer = window.setTimeout(() => {
        if (typing()) return;
        window.scrollTo({ top: 0, behavior: "smooth" });
        // A turn or a width change while typing (or an estimate made with the keyboard up) is caught up now.
        resized();
      }, 200);
    };
    const keyboardMoved = () => {
      if (typing())
        (document.activeElement as HTMLElement | null)?.scrollIntoView({ block: "center" });
    };

    refit.current = {
      reset,
      recalibrate: () => {
        ratio = null;
        calibrate();
        reset();
      },
    };
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
      cancelAnimationFrame(frameId);
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
      html.style.removeProperty("--kiosk-h");
    };
  }, [content, fixedScreen]);
  // A new screen (or a change of button size) starts from the scale again.
  useEffect(() => {
    refit.current.reset();
  }, [atWelcome, stepKey, expanded, jumbo]);
  // The host changed the calibration: lay out for the new area at once.
  useEffect(() => {
    refit.current.recalibrate();
  }, [calibrations]);
  return frame;
}

/**
 * This door tablet, as Latchkey knows it (kioskTablet): on start, every few
 * minutes and whenever the host pings, it says what it is (display, app
 * version, connection, location when already allowed) and learns its
 * number, name, setup code (while it waits to be paired), calibration and
 * whether its host is watching its camera. A tablet without a token joins
 * there and then. A reset calibration also forgets the learned display, so
 * it learns again. `changedAt`: when the host last changed the calibration,
 * for the outline shown while they're calibrating.
 */
function useKioskTablet(code: string, enabled: boolean) {
  const fn = useServerFn(kioskTablet);
  const [cals, setCals] = useState<Calibrations>({});
  const [changedAt, setChangedAt] = useState(0);
  const [tablet, setTablet] = useState<Omit<TabletState, "calibration" | "device"> | null>(null);
  const last = useRef<string>("{}");
  const reportRef = useRef<FitReport | null>(null);
  // Joining: one request at a time, or two starts at once add the same tablet twice.
  const joining = useRef(false);
  const load = useCallback(() => {
    if (!deviceToken(code)) {
      if (joining.current) return;
      joining.current = true;
    }
    const r = reportRef.current;
    const display = r
      ? {
          w: r.now.w,
          h: r.now.h,
          screenW: window.screen.width,
          screenH: window.screen.height,
          orientation: r.learned.orientation,
          usedW: r.learned.w,
          usedH: r.learned.h,
        }
      : undefined;
    void readFix(false)
      .catch(() => null)
      .then((fix) => {
        const device = deviceToken(code);
        return fn({
          data: {
            code,
            ...(device ? { device } : {}),
            ...(display ? { display } : {}),
            version: APP_VERSION,
            fix,
            ...(() => {
              const sig = deviceSignature(navigator.userAgent, {
                w: window.screen.width,
                h: window.screen.height,
                dpr: window.devicePixelRatio,
                touch: navigator.maxTouchPoints,
              });
              return sig ? { sig } : {};
            })(),
            // What this browser can run (the host may have chosen full on one that can't quite).
            compat: (() => {
              const mode = detectMode({
                moduleScripts: "noModule" in document.createElement("script"),
                colorMix: !!window.CSS?.supports?.("color", "color-mix(in srgb, red, blue)"),
              });
              return { detected: mode !== "full", mode, reason: browserLabel(navigator.userAgent) };
            })(),
          },
        });
      })
      .then((res) => {
        if (res.device) keepDeviceToken(code, res.device);
        // The host's level for this tablet: remembered for the next start (KIOSK_COMPAT_SCRIPT).
        try {
          localStorage.removeItem(compatKey(code));
          if (res.modeChosen) localStorage.setItem(modeKey(code), res.modeChosen);
          else localStorage.removeItem(modeKey(code));
        } catch {
          // Not kept: the dashboard's choice still applies at each check-in.
        }
        if (res.mode !== "full") {
          window.location.replace(`/lite/${code}`);
          return;
        }
        const { calibration, device: _d, ...rest } = res;
        setTablet(rest);
        const next = JSON.stringify(calibration);
        if (next === last.current) return;
        const wasSet = last.current !== "{}";
        last.current = next;
        if (wasSet && next === "{}") forgetDisplay();
        setCals(calibration);
        setChangedAt(Date.now());
      })
      .catch(() => {})
      .finally(() => {
        joining.current = false;
      });
  }, [code, fn]);
  useEffect(() => {
    if (!enabled) return;
    load();
    const id = window.setInterval(load, 5 * 60_000);
    const stop = onKioskPing(code, load);
    return () => {
      window.clearInterval(id);
      stop();
    };
  }, [code, enabled, load]);
  // The display changed (turned, learned larger): tell the dashboard soon after, once it settles.
  const timer = useRef(0);
  const onReport = useCallback(
    (r: FitReport) => {
      reportRef.current = r;
      if (!enabled) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(load, 1500);
    },
    [enabled, load],
  );
  // Watching ends when the host stops (no more pings extend it): check again then.
  useEffect(() => {
    if (!tablet?.watchUntil) return;
    const left = Date.parse(tablet.watchUntil) - Date.now();
    const id = window.setTimeout(load, Math.max(1000, left + 500));
    return () => window.clearTimeout(id);
  }, [tablet?.watchUntil, load]);
  return { calibrations: cals, changedAt, onReport, tablet, reload: load };
}

/**
 * The host is watching this tablet's camera (they switched it on for this
 * tablet and are looking now): live video straight to their screen
 * (cam-p2p.ts, direct and encrypted, never through Latchkey), on every
 * screen, with a notice on screen the whole time. Stops when they stop.
 */
function useCameraWatch(channel: string | null): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!channel) return;
    setOn(true);
    let stop: (() => void) | null = null;
    let gone = false;
    void import("@/lib/cam-p2p").then(({ serveTabletCamera }) => {
      if (!gone) stop = serveTabletCamera(channel, () => {});
    });
    return () => {
      gone = true;
      stop?.();
      setOn(false);
    };
  }, [channel]);
  return on;
}

/**
 * When the host's direct video can't connect (cam-p2p.ts), they watch
 * pictures instead: while `active`, a 480px picture every 3 seconds to
 * kioskSnapshotUpload (kept as the latest only, deleted when they stop).
 */
function useCameraSnapshots(code: string, active: boolean): boolean {
  const upload = useServerFn(kioskSnapshotUpload);
  useEffect(() => {
    if (!active) return;
    let gone = false;
    let stream: MediaStream | null = null;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    let timer = 0;
    void navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } }, audio: false })
      .then(async (s) => {
        if (gone) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        video.srcObject = s;
        await video.play().catch(() => undefined);
        const send = () => {
          const device = deviceToken(code);
          if (!device || !video.videoWidth) return;
          const scale = Math.min(1, 480 / video.videoWidth);
          const c = document.createElement("canvas");
          c.width = Math.round(video.videoWidth * scale);
          c.height = Math.round(video.videoHeight * scale);
          c.getContext("2d")?.drawImage(video, 0, 0, c.width, c.height);
          void upload({ data: { code, device, image: c.toDataURL("image/jpeg", 0.6) } }).catch(
            () => {},
          );
        };
        send();
        timer = window.setInterval(send, 3000);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
      window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active, code, upload]);
  return active;
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
  /** The host's welcome is up: no reset or screensaver; after welcomeMinutes it rests. */
  welcome: boolean;
  welcomeMinutes: number;
  onReset: () => void;
  onSaver: () => void;
  onWelcomeRest: () => void;
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
      const todo = idleActions(Date.now() - lastTouch.current, now, {
        atWelcome: now.atWelcome,
        resetDone: resetDone.current,
        saver: now.saver,
        welcome: now.welcome,
      });
      if (todo.reset) {
        resetDone.current = true;
        now.onReset();
      }
      if (todo.saver) now.onSaver();
      if (todo.welcomeRest) now.onWelcomeRest();
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

/** A check-in untouched this long counts as walked away from when the host puts a card up. */
const LEFT_MID_FLOW_MS = 45_000;

/** Mirrors KIOSK_COMPAT_SCRIPT's test for a shared screen: no ?guest/?resume/?join, and not a phone. */
const EXPANDED_FIRST_SCRIPT = `(function(){try{if(/[?&](guest|resume|join)=/.test(location.search))return;if(Math.min(screen.width,screen.height)<600)return;document.documentElement.setAttribute("data-kiosk-touch","expanded")}catch(e){}})();`;

function Kiosk() {
  const p = Route.useLoaderData();
  const { guest, resume, join, test } = Route.useSearch();
  // On a guest's own phone: the same screen, without the shared-tablet extras
  // (idle reset, screensaver, welcome overlay, hidden exit, kiosk install).
  // Always called, so hooks keep the same order whatever the address says.
  const portraitPhone = usePortraitPhone();
  const personal = guest === true || !!resume || !!join || portraitPhone;
  const shared = !personal;
  // The public guest tour is this same screen. Its only differences are hooks here
  // (and isTour() on the server): it never takes over the visitor's browser,
  // and the hidden host corner just leaves the tour.
  const tour = p.tour === true;
  // The app started: KIOSK_COMPAT_SCRIPT stops waiting to send a browser that can't run it to /lite.
  useEffect(() => {
    (window as { __lkBooted?: boolean }).__lkBooted = true;
  }, []);
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
  const sayHere = useServerFn(kioskHere);
  const [session, setSession] = useState(0);
  // The host's sample photos (?test=): for one check-in only, then gone with the link.
  const samplesFn = useServerFn(getTestSamples);
  const [samples, setSamples] = useState<TestSamples | null>(null);
  useEffect(() => {
    if (!test) return;
    let live = true;
    samplesFn({ data: { code: p.code, token: test } })
      .then((r) => {
        if (live && r.ok && (r.id || r.face)) setSamples({ id: r.id, face: r.face });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test, p.code]);
  // The property's best reviews, shown while an ID is checked (host's setting; shared tablets only).
  const reviewsFn = useServerFn(kioskReviews);
  const [reviews, setReviews] = useState<KioskReview[]>([]);
  const reviewsOn = !personal && p.theme.kioskReviews;
  useEffect(() => {
    if (!reviewsOn) return setReviews([]);
    let live = true;
    const load = () =>
      reviewsFn({ data: { code: p.code } })
        .then((r) => live && setReviews(r.reviews))
        .catch(() => undefined);
    void load();
    const id = window.setInterval(() => void load(), 30 * 60_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewsOn, p.code]);
  // Armed from the test card (claimArmedSamples): the next check-in here uses the sample photos.
  const claimFn = useServerFn(claimArmedSamples);
  useEffect(() => {
    if (personal || tour) return;
    const look = () =>
      void claimFn({ data: { code: p.code } })
        .then((r) => {
          if (r.ok && (r.id || r.face)) setSamples({ id: r.id, face: r.face });
        })
        .catch(() => undefined);
    look();
    return onKioskPing(p.code, look);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.code, personal, tour]);
  // Once a check-in has started with them, the samples go with it (done or reset): the next
  // person at the tablet is a real guest. Unused, they go after 15 minutes.
  const samplesInUse = useRef(false);
  useEffect(() => {
    if (!samples) return;
    const t = window.setTimeout(() => {
      if (!samplesInUse.current) setSamples(null);
    }, 15 * 60_000);
    return () => window.clearTimeout(t);
  }, [samples]);
  const firstSession = useRef(session);
  useEffect(() => {
    if (session === firstSession.current) return;
    firstSession.current = session;
    if (!samplesInUse.current && !test) return;
    samplesInUse.current = false;
    setSamples(null);
    if (test)
      void navigate({
        to: ".",
        search: (s: Record<string, unknown>) => ({ ...s, test: undefined }),
        replace: true,
      } as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);
  const [exitOpen, setExitOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [saver, setSaver] = useState(false);
  const [atWelcome, setAtWelcome] = useState(true);
  // Brightness, clock size and timings: the host's own where set, else Latchkey's (super admin).
  const saverLook = useSaverLook(p.code, shared);
  const { resetMinutes, welcomeMinutes } = saverLook.defaults;
  const saverMinutes = saverLook.rest.idleMinutes ?? saverLook.defaults.saverMinutes;
  const { welcome, dismiss, reload: reloadWelcome } = useKioskWelcome(p.code, shared);
  // The welcome is put aside for this guest's go (they tapped Check in, or "Not you?"); it comes
  // back when the kiosk resets, until the guest has checked in, the host takes it off or it ends.
  const [asideVersion, setAsideVersion] = useState<number | null>(null);
  const asideRef = useRef(asideVersion);
  asideRef.current = asideVersion;
  // Check-out day: goodbyes for guests leaving now, unless someone arriving tapped "Checking in?".
  const { goodbyes, reload: reloadGoodbyes } = useKioskGoodbyes(p.code, shared);
  // With guests' cards up, the host's welcome is one of them (it replaces that guest's card or joins them), never over them.
  const welcomeUpRaw =
    shared &&
    !!welcome &&
    asideVersion !== welcome.version &&
    goodbyes?.mergedWelcome !== welcome.version;
  const [goodbyeAside, setGoodbyeAside] = useState(false);
  const goodbyeAsideRef = useRef(goodbyeAside);
  goodbyeAsideRef.current = goodbyeAside;
  // Untouched for a while: the welcome rests (split, screen-friendly) until touched.
  const [welcomeRest, setWelcomeRest] = useState(false);
  // Tapping Check in on the welcome: CheckInFlow opens that guest's stay.
  const [welcomeStart, setWelcomeStart] = useState<{
    version: number | null;
    n: number;
    source?: "device" | "all";
    card?: string;
  } | null>(null);
  const calibration = useKioskTablet(p.code, shared && !tour);
  const tablet = calibration.tablet;
  // Service mode: the host sent their test check-in to this tablet (10 minutes, or until they end it).
  const service = useServiceMode(shared && !tour ? (tablet?.service ?? null) : null);
  const [serviceAside, setServiceAside] = useState(false);
  // In service mode nobody else checks in here: real guests' welcomes and cards wait.
  const welcomeUp = welcomeUpRaw && !service;
  useEffect(() => {
    if (!service) setServiceAside(false);
  }, [service]);
  // The host watching this tablet's camera, live, whatever is on screen.
  const watching = useCameraWatch(shared && !tour ? (tablet?.camChannel ?? null) : null);
  // The host's direct video couldn't connect: a picture every few seconds through Latchkey instead.
  const sendingShots = useCameraSnapshots(
    p.code,
    shared && !tour && !!tablet?.watchUntil && !tablet?.camChannel,
  );
  const camPermission = useCameraPermission(shared && !tour);
  const content = useRef<HTMLDivElement | null>(null);
  const [stepKey, setStepKey] = useState("welcome:");
  // The voice concierge (Pro plan, host's switch): on from the bubble beside Check in until the
  // check-in ends, the guest says stop, or taps its orb.
  const [voiceOn, setVoiceOn] = useState(false);
  const voice = shared && !personal ? (p.voice ?? null) : null;
  // The concierge's recordings load while the welcome is up, so it speaks the moment Check in is tapped.
  useEffect(() => {
    if (voice) warmVoice(voice.clips);
  }, [voice]);
  // Muted before a check-in (the top bar's button on the welcome): every check-in on this tablet
  // starts muted, and an unmute during one lasts only until it ends. Kept on the tablet.
  const muteKey = `latchkey.voiceMuted.${p.code}`;
  const [voiceMuted, setVoiceMuted] = useState(false);
  useEffect(() => {
    try {
      setVoiceMuted(localStorage.getItem(muteKey) === "1");
    } catch {
      // Private window: muting still works until the page reloads.
    }
  }, [muteKey]);
  const toggleVoiceMuted = () =>
    setVoiceMuted((m) => {
      try {
        localStorage.setItem(muteKey, m ? "0" : "1");
      } catch {
        // As above.
      }
      return !m;
    });
  useEffect(() => {
    if (samples && !stepKey.startsWith("welcome")) samplesInUse.current = true;
  }, [samples, stepKey]);
  // Door tablets only: Express ("xl"), the bold full-screen cards made from the theme (the host's choice, else Latchkey's default).
  const xl = shared && p.kioskLook?.look === "xl";
  const xlStyle = useMemo(
    () =>
      xl && p.kioskLook
        ? xlCss({ theme: p.theme, cardIn: p.kioskLook.cardIn, cardOut: p.kioskLook.cardOut })
        : "",
    [xl, p.kioskLook, p.theme],
  );
  // Express: the guest cards in the same colours as the steps (the theme's tints where the host hasn't picked).
  const expressColours = useMemo(() => {
    if (!xl || !p.kioskLook) return undefined;
    const c = expressCards(p.theme, p.kioskLook.cardIn, p.kioskLook.cardOut);
    return { in: c.cardIn, out: c.cardOut };
  }, [xl, p.kioskLook, p.theme]);
  // Door tablets only: keys, pads and buttons grow to use the whole screen (Look and feel → Door tablet, and always in Express).
  // Jumbo: the whole check-in looks like the Jumbo welcome card (its colour, ink and outline).
  const jumbo = shared && p.kioskLook?.look === "jumbo";
  const jumboVars = useMemo(() => {
    if (!jumbo) return undefined;
    const bg = p.kioskLook?.cardIn ?? DEFAULT_ARRIVALS.colour;
    return {
      "--j-bg": bg,
      "--j-ink": cardInk(bg),
      "--j-edge": cardEdge(bg),
    } as React.CSSProperties;
  }, [jumbo, p.kioskLook?.cardIn]);
  useEffect(() => {
    if (!jumbo) return;
    const html = document.documentElement;
    html.setAttribute("data-kiosk-jumbo", "");
    return () => html.removeAttribute("data-kiosk-jumbo");
  }, [jumbo]);
  useJumboFit(jumbo, stepKey);
  const expanded = shared && (p.theme.kioskTouch === "expanded" || xl || jumbo);
  // Clicks for taps, keys, sliders and photos on the shared tablet (theme.kioskSounds, kiosk-sound.ts).
  const sounds = shared && p.theme.kioskSounds;
  // The screen lights up white as each photo is taken (theme.kioskFlash, IdCamera).
  const flash = shared && p.theme.kioskFlash;
  useEffect(() => {
    setKioskFlash(flash);
    return () => setKioskFlash(false);
  }, [flash]);
  useEffect(() => {
    setKioskSounds(sounds);
    if (!sounds) return;
    const stop = listenForKioskSounds();
    return () => {
      stop();
      setKioskSounds(false);
    };
  }, [sounds]);
  // On <html>, so dialogs (portalled outside this page) are sized to match.
  useEffect(() => {
    if (!expanded) return;
    const html = document.documentElement;
    html.setAttribute("data-kiosk-touch", "expanded");
    return () => html.removeAttribute("data-kiosk-touch");
  }, [expanded]);
  const frame = useScreenFit(
    content,
    atWelcome,
    stepKey,
    expanded,
    calibration.calibrations,
    calibration.onReport,
    shared && !tour,
    jumbo,
  );
  // The host is calibrating from the dashboard: the area's outline shows for a while after each change.
  const [outline, setOutline] = useState(false);
  useEffect(() => {
    if (!calibration.changedAt || !shared) return;
    setOutline(true);
    const id = window.setTimeout(() => setOutline(false), 20_000);
    return () => window.clearTimeout(id);
  }, [calibration.changedAt, shared]);
  // The newest version: the small Update button, and reloading by itself when asked and nobody's using it.
  const appUpdate = useAppUpdate({
    audience: "kiosks",
    extra: [tablet?.update],
    // "When not in use" waits for a check-in or a host's welcome to finish (cards come back after a reload).
    busy: welcomeUp || !atWelcome,
    enabled: shared && !tour,
  });
  const goodbyeUp =
    shared && !service && !welcomeUp && !goodbyeAside && atWelcome && !!goodbyes?.cards.length;
  // Service mode: the test guest's own welcome card (when check-in cards are on) until tapped.
  const serviceCardUp = !!service?.card && atWelcome && !serviceAside;
  // What's on screen now, for the host's live view (Settings → Door tablets): which screen only.
  // The sun or moon button: the night look now, whatever the time, until the next touch.
  const [restTapped, setRestTapped] = useState(false);
  useEffect(() => {
    if (!saver) setRestTapped(false);
  }, [saver]);
  const restByClock = useRestShowing(saverLook.rest, p.timezone ?? "Europe/London", {
    start: p.quietStart,
    end: p.quietEnd,
  });
  const restShowing = restTapped ? restNow(saverLook.rest, true, true) : restByClock;
  // Smart Screensaver by day: this same screen, whatever it is, goes black and white until someone comes.
  const idleLong = useIdleFor(saverMinutes * 60_000, shared && !tour);
  const lowPower = lowPowerNow({
    // Never during a voice check-in: the guest is talking, not touching, and the Smart
    // Screensaver's sound watch would take the microphone from the concierge.
    shared: shared && !tour && !voiceOn,
    smart: saverLook.rest.smart,
    byClock: restByClock,
    atStart: atWelcome,
    idle: idleLong.idle,
    tapped: restTapped,
  });
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const sync = () => setIsFull(!!document.fullscreenElement);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const screenNow = screenFrom({
    welcomeUp,
    welcomeRest,
    cardsUp: goodbyeUp,
    saver: saver || lowPower,
    rest: lowPower ? "day" : restShowing,
    atWelcome,
    step: stepKey,
    join: !!join,
  });
  const screenKey = `${screenNow.view}:${screenNow.step ?? ""}:${isFull}:${camPermission.state ?? ""}`;
  const reportScreen = useServerFn(kioskScreenReport);
  useEffect(() => {
    if (!shared || tour) return;
    const id = window.setTimeout(() => {
      const device = deviceToken(p.code);
      if (!device) return;
      void reportScreen({
        data: {
          code: p.code,
          device,
          screen: {
            view: screenNow.view,
            step: screenNow.step,
            fullscreen: isFull,
            ...(camPermission.state
              ? {
                  camPermission: camPermission.state,
                  camera: camPermission.state !== "none",
                }
              : {}),
          },
        },
      }).catch(() => {});
    }, 800);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey, shared, tour, p.code]);
  // The welcome goes over everything, the screensaver too.
  // …and so do today's check-in and check-out cards: the screensaver only starts when none are up.
  useEffect(() => {
    if (welcomeUp || goodbyeUp) setSaver(false);
    if (!welcomeUp) setWelcomeRest(false);
  }, [welcomeUp, goodbyeUp, welcome?.version]);
  // The host just switched the night light on from their dashboard: an idle kiosk (on the welcome) lights up now.
  useEffect(() => {
    if (saverLook.nightOnAt && shared && atWelcome && !welcomeUp && !goodbyeUp) setSaver(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saverLook.nightOnAt]);

  const bump = useKioskIdle({
    enabled: shared,
    atWelcome,
    saver,
    resetMinutes,
    saverMinutes,
    welcome: welcomeUp || goodbyeUp,
    welcomeMinutes,
    onReset: () => {
      setExitOpen(false);
      setSession((n) => n + 1);
      setWelcomeStart(null);
      // Whoever was checking in walked away: the host's welcome (and today's goodbyes) show again.
      setAsideVersion(null);
      setGoodbyeAside(false);
      setServiceAside(false);
    },
    // Cards or a welcome put aside by someone who then walked away come back instead of the screensaver.
    onSaver: () => {
      if (goodbyeAsideRef.current || asideRef.current !== null) {
        setGoodbyeAside(false);
        setAsideVersion(null);
        setWelcomeStart(null);
        setSession((n) => n + 1);
        bump();
        return;
      }
      setSaver(true);
    },
    onWelcomeRest: () => setWelcomeRest(true),
  });

  // The host put a card up (Show now, or its time came): it shows, even if someone had put the
  // cards aside. A check-in left half done for a while gives way to it; one in progress never does.
  const lastTouch = useRef(Date.now());
  // By day with no Smart Screensaver the tablet stays as it is, ready to rest when night comes. A touch ends that.
  useEffect(() => {
    if (!saver || (restShowing !== "awake" && restShowing !== "day")) return;
    const wake = () => setSaver(false);
    window.addEventListener("pointerdown", wake, true);
    window.addEventListener("keydown", wake, true);
    return () => {
      window.removeEventListener("pointerdown", wake, true);
      window.removeEventListener("keydown", wake, true);
    };
  }, [saver, restShowing]);
  // Smart Screensaver: walking up (or a sound) wakes it, on this tablet alone. Nothing is kept or sent.
  useMotionWake(
    !voiceOn &&
      (lowPower ||
        (saverLook.rest.smart &&
          !tour &&
          shared &&
          saver &&
          !restTapped &&
          restShowing !== "awake" &&
          restShowing !== "day" &&
          !welcomeUp &&
          !goodbyeUp)),
    () => {
      setSaver(false);
      idleLong.wake();
      bump();
    },
  );
  useEffect(() => {
    const touched = () => {
      lastTouch.current = Date.now();
    };
    window.addEventListener("pointerdown", touched, true);
    window.addEventListener("keydown", touched, true);
    return () => {
      window.removeEventListener("pointerdown", touched, true);
      window.removeEventListener("keydown", touched, true);
    };
  }, []);
  const cardKeys = useRef<string[] | null>(null);
  useEffect(() => {
    if (!shared || !goodbyes) return;
    const keys = goodbyes.cards.map((c) => `${c.kind}:${c.handle || c.firstName}`);
    const before = cardKeys.current;
    cardKeys.current = keys;
    if (!before || !newCards(before, keys).length) return;
    setGoodbyeAside(false);
    setSaver(false);
    if (!atWelcome && Date.now() - lastTouch.current > LEFT_MID_FLOW_MS) {
      setWelcomeStart(null);
      setSession((n) => n + 1);
    }
    bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goodbyes]);

  /** The bell changed the cards: show them now (even if someone had put them aside). */
  function showPicked() {
    setGoodbyeAside(false);
    setSaver(false);
    reloadGoodbyes();
    bump();
  }

  /** From the welcome: check in as that guest (or find the stay as usual when it isn't for one). */
  /**
   * Any Check in on the tablet (a card, the host's welcome, the service card) starts the
   * concierge too, as the welcome's own button does. Called in the tap, so the tablet may play sound.
   */
  function startVoice() {
    if (!voice || voiceOn || !voiceSupported().speak) return;
    unlockAudio();
    setVoiceOn(true);
  }

  function startWelcome() {
    if (!welcome) return;
    startVoice();
    dismiss();
    setAsideVersion(welcome.version);
    setWelcomeRest(false);
    setSaver(false);
    setWelcomeStart({
      version: welcome.checkIn ? welcome.version : null,
      n: Date.now(),
      source: welcome.source ?? "all",
    });
    setSession((s) => s + 1);
    bump();
  }
  /** "Not you?": the usual start, for someone else. */
  function notThisGuest() {
    if (!welcome) return;
    setAsideVersion(welcome.version);
    setWelcomeRest(false);
    setWelcomeStart(null);
    setSession((s) => s + 1);
    bump();
  }

  // Full screen from the start, and back into it on the next touch if anything takes it out,
  // unless the host switched it off with the corner button (tapped 3 times).
  // Browsers only allow it from a touch, so in a browser tab it begins at the first one; installed
  // as an app (manifest "fullscreen") it opens full screen. navigationUI "hide" also hides Android's bottom bar.
  function goFullscreen() {
    if (!shared || tour || !fullscreenWanted()) return;
    enterFullscreen();
  }
  useEffect(() => {
    if (shared && !tour && fullscreenWanted()) enterFullscreen();
  }, [shared, tour]);

  // The host's way out: three quick taps on the top-right corner, or press and hold it. Watched on the whole page rather
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
    const inCorner = (e: PointerEvent) =>
      e.clientX >= window.innerWidth - HOLD_CORNER && e.clientY <= HOLD_CORNER;
    const stop = () => window.clearTimeout(timer);
    let taps: number[] = [];
    const down = (e: PointerEvent) => {
      fired = false;
      stop();
      if (!inCorner(e)) return;
      // Three quick taps on the empty corner (an icon there still answers its own tap): no hold,
      // which some tablets turn into the browser's own menu.
      const onControl = (e.target as Element | null)?.closest?.("button, a, [role=button]");
      if (!onControl) {
        const t = countTap(taps, Date.now());
        taps = t.taps;
        if (t.fired) {
          fired = true;
          openExit.current();
          return;
        }
      }
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
      if (e.clientX >= window.innerWidth - HOLD_CORNER && e.clientY <= HOLD_CORNER)
        e.preventDefault();
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
    const mine = deviceToken(p.code);
    const res = await unlock({
      // A tablet waiting for its code is paired by the PIN too.
      data: { code: p.code, pin, pair: !tour && !mine, ...(mine ? { device: mine } : {}) },
    }).catch(() => ({ ok: false, device: null }));
    if (!res.ok) return setPinError(true);
    // Paired as this property's door tablet: its location is asked for now, while the host is here, never in front of a guest.
    if (res.device) {
      keepDeviceToken(p.code, res.device);
      await readFix(true)
        .then((fix) => sayHere({ data: { code: p.code, device: res.device!, fix } }))
        .catch(() => {});
    }
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    await navigate({ to: "/app/today" });
  }

  // The tablet's own icons (the bell, the day, the phone QR via a portal): one box, in whichever top bar shows.
  const actionBox = (
    <div
      id="kiosk-header-action"
      className={
        shared
          ? "relative flex h-[3.5em] w-[10em] shrink-0 items-center justify-end gap-[0.5em]"
          : "hidden"
      }
    >
      {/* The voice concierge's orb and × (VoiceConcierge puts them here), left of the phone QR. */}
      <div id="kiosk-voice-slot" className="contents" />
      {/* The bell: put today's guest cards up from the tablet itself (the host can switch it off). */}
      {shared && atWelcome && !saver && tablet?.cardPicker ? (
        <KioskCardBell code={p.code} onApplied={showPicked} />
      ) : null}
      {shared && atWelcome && !saver ? (
        <button
          type="button"
          onClick={() => {
            setRestTapped(true);
            setSaver(true);
          }}
          aria-label={`${copy.dayPhases[dayProgress(new Date(), p.timezone ?? "Europe/London").phase] ?? ""} · ${copy.saverStart}`}
          title={copy.saverStart}
          className={headerIconClass}
        >
          <DayIcon tz={p.timezone ?? "Europe/London"} className="size-[2.25em]" />
        </button>
      ) : null}
    </div>
  );

  return (
    <ThemeScope theme={p.theme} global full>
      {/* Inputs stay at 16px or more however small the page is fitted, so phones don't zoom in on them. */}
      {/* Expanded: only a thin margin at the screen's edges. */}
      <div
        // The host's calibration: laid out for its area (unzoomed), then moved and zoomed into place.
        style={{
          ...jumboVars,
          ...(frame
            ? {
                width: `${frame.w / frame.zoom}px`,
                minHeight: `${frame.h / frame.zoom}px`,
                transform: `translate(${frame.x}px, ${frame.y}px) scale(${frame.zoom})`,
                transformOrigin: "0 0",
              }
            : {}),
        }}
        className={cn(
          "relative min-h-[var(--kiosk-h,100vh)] select-none bg-background [&_input]:text-[max(16px,1rem)] [&_textarea]:text-[max(16px,1rem)]",
          frame && "min-h-0 overflow-hidden",
          expanded
            ? "px-[0.5rem]"
            : "px-[var(--kiosk-header,16px)] sm:px-[calc(var(--kiosk-header,16px)*2)]",
          // A theme's frame is drawn 8-14px in from the edges (ThemeBackdrop): keep the page inside it.
          p.theme.frame !== "none" &&
            !expanded &&
            "px-[max(var(--kiosk-header,16px),24px)] pb-[20px] sm:px-[max(calc(var(--kiosk-header,16px)*2),32px)]",
        )}
        onPointerDown={goFullscreen}
        data-kiosk-root
        data-kiosk-jumbo={jumbo ? "" : undefined}
        data-kiosk-xl={xl ? "" : undefined}
      >
        {xl ? <style>{xlStyle}</style> : null}
        {voice && voiceOn ? (
          <VoiceConcierge
            code={p.code}
            gender={voice.gender}
            clips={voice.clips}
            cloudEar={voice.cloudEar}
            listens={tablet?.voiceListen !== false}
            startMuted={voiceMuted}
            stepKey={stepKey}
            onEnd={() => setVoiceOn(false)}
          />
        ) : null}
        {voice && !voiceOn ? (
          <VoiceMuteDefault muted={voiceMuted} onToggle={toggleVoiceMuted} />
        ) : null}
        {shared ? (
          <KioskSplash
            theme={p.theme}
            name={p.name}
            settled={tour || calibration.tablet !== null}
          />
        ) : null}
        <ThemeBackdrop theme={p.theme} />
        {atWelcome ? <ThemeSideNotes theme={p.theme} /> : null}
        {/* Measured for the landscape fit: the page's own content, without the screen-high minimum. */}
        <div ref={content} data-kx="screen" className="relative">
          {/* Sized once per display (--kiosk-header, in em below), so it never moves between screens. */}
          {jumbo ? (
            // Jumbo: the property at the left, the time and date in the middle, the tablet's icons
            // on the right. Back goes in the status bar (JumboSlot).
            // The clock stays near the middle and gives way to a longer name, never to the
            // icons; a name too long scrolls (JumboBar, rules in src/lib/jumbo-bar.ts).
            <JumboBar
              logo={
                <LogoMark
                  theme={p.theme}
                  name={p.name}
                  className="size-[1.4em] shrink-0 rounded-[0.25em] bg-white p-[0.1em] text-[0.6em]"
                />
              }
              name={p.name}
              tz={p.timezone ?? "Europe/London"}
              icons={actionBox}
            />
          ) : null}
          <header
            hidden={jumbo}
            className={cn(
              "mx-auto flex items-center gap-[0.75em]",
              expanded ? "w-full max-w-none pt-[0.5em]" : "max-w-[56em] pt-[1.5em]",
            )}
            style={{ fontSize: "var(--kiosk-header, 16px)" }}
          >
            <LogoMark
              theme={p.theme}
              name={p.name}
              className={cn(
                "size-[2.5em] shrink-0 text-[1.125em]",
                // Express: the mark on a light tile so it stands out on the property's colour.
                xl &&
                  (p.theme.logoUrl
                    ? "rounded-[0.5em] bg-white p-[0.2em]"
                    : "bg-foreground text-background ring-0"),
              )}
            />
            <span className="min-w-0 flex-1">
              {/* A centred theme shows its name on the welcome itself; the bar keeps just the mark. */}
              <span
                className={cn(
                  "block truncate font-display text-[1.125em]",
                  p.theme.layout === "centred" && atWelcome ? "invisible" : "",
                )}
              >
                {p.name}
              </span>
              {p.theme.subname && !(p.theme.layout === "centred" && atWelcome) ? (
                <span className="block truncate text-[0.7em] uppercase tracking-[0.25em] text-muted-foreground">
                  {p.theme.subname}
                </span>
              ) : null}
            </span>
            <KioskClock tz={p.timezone ?? "Europe/London"} longName={p.name.length > 14} />
            {/* Beside the time: the day's progress on the welcome (tap to rest the screen); later, the phone QR (CheckInFlow puts it here). */}
            {/* Always the same box, whichever icon is in it (or none), so nothing beside it shifts. */}
            {jumbo ? null : actionBox}
          </header>
          {samples ? (
            <p
              role="status"
              className="pointer-events-none fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full bg-amber-300 px-4 py-1 text-sm font-semibold text-black"
            >
              {copy.testSamplesBadge}
            </p>
          ) : null}
          {join ? (
            <JoinCheckIn share={join} />
          ) : (
            <KioskReviewsContext.Provider value={reviews}>
              <TestSamplesContext.Provider value={samples}>
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
                    // Checked in: the welcome for them comes off.
                    if (k.startsWith("done:")) reloadWelcome();
                  }}
                  welcomeStart={shared ? welcomeStart : null}
                  service={!!service}
                  onDone={
                    shared
                      ? () => {
                          setWelcomeStart(null);
                          setSession((n) => n + 1);
                          bump();
                        }
                      : undefined
                  }
                  qrPanel={!jumbo && saverLook.defaults.qrStyle === "panel"}
                  voiceStart={voice && !voiceOn ? () => setVoiceOn(true) : null}
                  jumbo={jumbo}
                  {...(tablet?.cameraSpot ? { cameraSpots: tablet.cameraSpot } : {})}
                />
              </TestSamplesContext.Provider>
            </KioskReviewsContext.Provider>
          )}
          {jumbo ? (
            // Jumbo: the welcome card screen's status bar. Steps put Ask host and other ways here.
            <footer
              id="jumbo-status"
              data-jumbo-status
              className="flex flex-wrap items-center justify-end gap-[2cqmin]"
            >
              {/* Back always at the bottom left; the steps' other ways (JumboSlot) follow at the right. */}
              <div id="jumbo-back" data-jumbo-back className="mr-auto flex items-center" />
            </footer>
          ) : null}
          <div data-kiosk-footer>
            <ThemeFooter
              theme={p.theme}
              className={cn(
                "mx-auto max-w-6xl",
                expanded ? "mt-[0.5em] w-full pb-[0.5em]" : "mt-[1.5em] pb-[1em]",
              )}
            />
          </div>
        </div>

        {/* The public tour: the floating demo panel (says it's a demo, switch property, start a trial, leave). */}
        {tour ? <GuestDemoDock code={p.code} /> : null}

        {/* Service mode: the host's test guest as a welcome card, or the screen marked all round. */}
        {serviceCardUp && service ? (
          <KioskWelcomeOverlay
            welcome={{
              headline: copy.serviceWelcome(service.firstName),
              body: copy.serviceWelcomeBody,
              version: 0,
            }}
            logo={
              <LogoMark theme={p.theme} name={p.name} className={tileLogo("size-24 text-4xl")} />
            }
            onCheckIn={() => {
              startVoice();
              setServiceAside(true);
              setSaver(false);
              setWelcomeStart({ version: null, n: Date.now() });
              setSession((n) => n + 1);
              bump();
            }}
            onNotMe={() => {
              setServiceAside(true);
              bump();
            }}
          />
        ) : null}
        {service && !service.card ? <ServiceFrame /> : null}

        {/* The host's welcome for an arriving guest: over everything, the screensaver too. */}
        {welcomeUp && welcome ? (
          welcomeRest ? (
            <KioskWelcomeRest
              welcome={welcome}
              tz={p.timezone ?? "Europe/London"}
              quiet={{ start: p.quietStart, end: p.quietEnd }}
              phoneUrl={
                typeof window === "undefined"
                  ? null
                  : `${window.location.origin}/kiosk/${p.code}?guest=1`
              }
              onCheckIn={startWelcome}
              onWake={() => {
                setWelcomeRest(false);
                bump();
              }}
            />
          ) : (
            <KioskWelcomeOverlay
              welcome={welcome}
              logo={
                <LogoMark theme={p.theme} name={p.name} className={tileLogo("size-24 text-4xl")} />
              }
              onCheckIn={startWelcome}
              onNotMe={notThisGuest}
            />
          )
        ) : null}

        {/* Check-out day: goodbyes to the guests leaving now, over the usual screen and the screensaver. */}
        {goodbyeUp && goodbyes ? (
          <KioskGoodbyeScreen
            code={p.code}
            goodbyes={goodbyes}
            colours={expressColours}
            clock={saverLook.rest.smart ? { tz: p.timezone ?? "Europe/London" } : null}
            logo={
              <LogoMark
                theme={p.theme}
                name={p.name}
                className={tileLogo("size-[1.4em] text-[0.5em]")}
              />
            }
            bell={
              tablet?.cardPicker ? (
                <KioskCardBell
                  code={p.code}
                  onApplied={showPicked}
                  className="text-[clamp(16px,2.4cqmin,28px)] text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
                />
              ) : null
            }
            onCheckIn={() => {
              // "Checking in? Start here" starts the check-in itself: no second button on the welcome.
              startVoice();
              setGoodbyeAside(true);
              setWelcomeStart({ version: null, n: Date.now() });
              setSession((n) => n + 1);
              bump();
            }}
            onArrive={(card) => {
              // The host's welcome opens their stay as it does on its own; any other card starts with the photo ID.
              startVoice();
              setGoodbyeAside(true);
              // A returning guest whose ID is on file: their own card opens their stay (startFromCard).
              setWelcomeStart(
                card.welcome?.checkIn
                  ? { version: card.welcome.version, n: Date.now(), source: card.welcome.source }
                  : card.known
                    ? { version: null, n: Date.now(), card: card.known }
                    : { version: null, n: Date.now() },
              );
              if (card.welcome) dismiss();
              setSession((n) => n + 1);
              bump();
            }}
            onLeft={() => {
              reloadGoodbyes();
              setSession((n) => n + 1);
              bump();
            }}
          />
        ) : null}

        {/* The host is looking through this tablet's camera: always said on screen while they are. */}
        {watching || sendingShots ? (
          <div className="pointer-events-none fixed left-3 top-3 z-[100] flex items-center gap-2 rounded-full bg-black px-3 py-1.5 text-sm font-medium text-white shadow-lg">
            <span className="size-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />
            {copy.cameraOn}
          </div>
        ) : null}

        {/* Which tablet this is and the app version, for the host and support; a waiting tablet's setup code.
            On a door tablet: the full screen switch and, when there's a newer version, Update (both tapped 3 times). */}
        {/* Jumbo: only on the first screen; the bottom bar belongs to Back and the step's other ways after that. */}
        {jumbo && !atWelcome ? null : shared && !tour ? (
          <KioskCorner
            label={
              tablet?.status === "pending" && tablet.pairCode ? (
                <span className="font-medium text-foreground">
                  {copy.tabletSetup(showPairCode(tablet.pairCode))} ·{" "}
                </span>
              ) : tablet?.number ? (
                `${tabletName(tablet)} · `
              ) : null
            }
            version={appUpdate.current}
            latest={appUpdate.latest}
            available={appUpdate.available}
          />
        ) : (
          <p className="pointer-events-none fixed bottom-1 left-2 z-[96] text-[11px] leading-tight text-muted-foreground/80">
            {shared && tablet?.status === "pending" && tablet.pairCode ? (
              <span className="font-medium text-foreground">
                {copy.tabletSetup(showPairCode(tablet.pairCode))} ·{" "}
              </span>
            ) : shared && tablet?.number ? (
              `${tabletName(tablet)} · `
            ) : null}
            <AppVersion
              current={appUpdate.current}
              latest={appUpdate.latest}
              available={appUpdate.available}
            />
          </p>
        )}

        {/* While the host calibrates from the dashboard: the area's edges, so they can line it up. */}
        {outline ? (
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[99] border-4 border-dashed border-accent"
          >
            <span className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
              {copy.calibrating}
            </span>
          </div>
        ) : null}

        {lowPower ? (
          <LowPowerLayer
            saver={saverLook}
            onWake={() => {
              setSaver(false);
              idleLong.wake();
              bump();
            }}
          />
        ) : null}
        {shared && saver && !welcomeUp && !goodbyeUp ? (
          <KioskAtRest
            name={p.name}
            code={p.code}
            saver={saverLook}
            showing={restShowing}
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
              {pinError ? (
                <p role="alert" className="text-destructive">
                  {copy.kioskWrongPin}
                </p>
              ) : null}
              <Button type="submit" size="touch" className="w-full" disabled={pin.length < 4}>
                {copy.kioskExitCta}
              </Button>
            </form>
            {/* Remote camera viewing can't stop at a question nobody's there to answer: allowed once, from the host's tap. */}
            {!tour &&
            camPermission.state &&
            camPermission.state !== "granted" &&
            camPermission.state !== "none" ? (
              <div className="space-y-2 border-t border-border pt-3 text-center">
                <Button
                  variant="outline"
                  size="touch"
                  className="w-full"
                  onClick={() => void camPermission.ask()}
                >
                  <Camera className="size-5" aria-hidden /> {copy.kioskAllowCamera}
                </Button>
                <p className="text-sm text-muted-foreground">{copy.kioskAllowCameraHint}</p>
              </div>
            ) : null}
            {!tour && saverLook.rest.smart ? (
              <div className="border-t border-border pt-3 text-center">
                <Button
                  variant="outline"
                  size="touch"
                  className="w-full"
                  onClick={() =>
                    void navigator.mediaDevices
                      ?.getUserMedia({ audio: true, video: true })
                      .then((s) => s.getTracks().forEach((t) => t.stop()))
                      .catch(() => {})
                  }
                >
                  <Mic className="size-5" aria-hidden /> {copy.kioskAllowWake}
                </Button>
              </div>
            ) : null}
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
  showing,
  tz,
  quiet,
  onWake,
}: {
  name: string;
  code: string;
  saver: ReturnType<typeof useSaverLook>;
  showing: RestShowing;
  tz: string;
  quiet: { start: string; end: string };
  onWake: () => void;
}) {
  // The host's QR choice applies whatever shows at rest.
  const qrUrl =
    saver.rest.clockQr && typeof window !== "undefined"
      ? `${window.location.origin}/kiosk/${code}?guest=1`
      : null;
  // By day with no Smart Screensaver, nothing covers the usual screen.
  if (showing === "awake") return null;
  // By day, the usual screen stays up in its low power look (LowPowerLayer).
  if (showing === "day") return null;
  if (showing === "night") return <KioskNightLight saver={saver} onWake={onWake} qrUrl={qrUrl} />;
  if (showing === "blank") return <KioskBlank onWake={onWake} qrUrl={qrUrl} />;
  return (
    <KioskScreensaver
      name={name}
      saver={saver}
      tz={tz}
      quiet={quiet}
      qrUrl={qrUrl}
      onWake={onWake}
    />
  );
}

/** Service mode while it lasts: the tablet's state, cleared by itself when its time is up. */
function useServiceMode(
  s: { until: string; firstName: string; card: boolean } | null,
): { until: string; firstName: string; card: boolean } | null {
  const [, tick] = useState(0);
  const left = s ? Date.parse(s.until) - Date.now() : 0;
  useEffect(() => {
    if (!s || left <= 0) return;
    const t = window.setTimeout(() => tick((n) => n + 1), Math.min(left + 200, 2 ** 31 - 1));
    return () => window.clearTimeout(t);
  }, [s, left]);
  return s && left > 0 ? s : null;
}

/** Service mode without a welcome card: red and white stripes round the screen, named on top. */
function ServiceFrame() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[90]">
      <div
        className="absolute inset-0"
        style={{
          border: "14px solid transparent",
          borderImage: "repeating-linear-gradient(45deg, #dc2626 0 18px, #ffffff 18px 36px) 14",
        }}
      />
      <p className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-xl bg-[#dc2626] px-6 py-1.5 text-lg font-bold uppercase tracking-wider text-white shadow">
        {copy.serviceMode}
      </p>
    </div>
  );
}
