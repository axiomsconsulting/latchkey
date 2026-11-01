import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera } from "lucide-react";
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
  ): { guest?: boolean; resume?: string; join?: string } & Utm => ({
    // A shared link's source stays on the URL (the tour from /tour or a post).
    ...pickUtm(search),
    ...(typeof search["join"] === "string" ? { join: search["join"] } : {}),
    ...(search["guest"] === true || search["guest"] === "1" || search["guest"] === 1
      ? { guest: true }
      : {}),
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
    scripts: [{ children: KIOSK_COMPAT_SCRIPT }, { children: KIOSK_FIT_SCRIPT }],
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
) {
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
  }, [atWelcome, stepKey, expanded]);
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
  const load = useCallback(() => {
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
      .catch(() => {});
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

function Kiosk() {
  const p = Route.useLoaderData();
  const { guest, resume, join } = Route.useSearch();
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
  const [exitOpen, setExitOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [saver, setSaver] = useState(false);
  const [atWelcome, setAtWelcome] = useState(true);
  // Brightness, clock size and timings: the host's own where set, else Latchkey's (super admin).
  const saverLook = useSaverLook(p.code, shared);
  const { resetMinutes, saverMinutes, welcomeMinutes } = saverLook.defaults;
  const { welcome, dismiss, reload: reloadWelcome } = useKioskWelcome(p.code, shared);
  // The welcome is put aside for this guest's go (they tapped Check in, or "Not you?"); it comes
  // back when the kiosk resets, until the guest has checked in, the host takes it off or it ends.
  const [asideVersion, setAsideVersion] = useState<number | null>(null);
  const asideRef = useRef(asideVersion);
  asideRef.current = asideVersion;
  // Check-out day: goodbyes for guests leaving now, unless someone arriving tapped "Checking in?".
  const { goodbyes, reload: reloadGoodbyes } = useKioskGoodbyes(p.code, shared);
  // With guests' cards up, the host's welcome is one of them (it replaces that guest's card or joins them), never over them.
  const welcomeUp =
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
  } | null>(null);
  const calibration = useKioskTablet(p.code, shared && !tour);
  const tablet = calibration.tablet;
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
  const expanded = shared && (p.theme.kioskTouch === "expanded" || xl);
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
  const goodbyeUp = shared && !welcomeUp && !goodbyeAside && atWelcome && !!goodbyes?.cards.length;
  // What's on screen now, for the host's live view (Settings → Door tablets): which screen only.
  const restShowing = useRestShowing(saverLook.rest, p.timezone ?? "Europe/London", {
    start: p.quietStart,
    end: p.quietEnd,
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
    saver,
    rest: restShowing,
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
  function startWelcome() {
    if (!welcome) return;
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

  return (
    <ThemeScope theme={p.theme} global full>
      {/* Inputs stay at 16px or more however small the page is fitted, so phones don't zoom in on them. */}
      {/* Expanded: only a thin margin at the screen's edges. */}
      <div
        // The host's calibration: laid out for its area (unzoomed), then moved and zoomed into place.
        style={
          frame
            ? {
                width: `${frame.w / frame.zoom}px`,
                minHeight: `${frame.h / frame.zoom}px`,
                transform: `translate(${frame.x}px, ${frame.y}px) scale(${frame.zoom})`,
                transformOrigin: "0 0",
              }
            : undefined
        }
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
        data-kiosk-xl={xl ? "" : undefined}
      >
        {xl ? <style>{xlStyle}</style> : null}
        <ThemeBackdrop theme={p.theme} />
        {atWelcome ? <ThemeSideNotes theme={p.theme} /> : null}
        {/* Measured for the landscape fit: the page's own content, without the screen-high minimum. */}
        <div ref={content} data-kx="screen" className="relative">
          {/* Sized once per display (--kiosk-header, in em below), so it never moves between screens. */}
          <header
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
            <div
              id="kiosk-header-action"
              className={
                shared
                  ? "relative flex h-[3.5em] w-[10em] shrink-0 items-center justify-end gap-[0.5em]"
                  : "hidden"
              }
            >
              {/* The bell: put today's guest cards up from the tablet itself (the host can switch it off). */}
              {shared && atWelcome && !saver && tablet?.cardPicker ? (
                <KioskCardBell code={p.code} onApplied={showPicked} />
              ) : null}
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
                // Checked in: the welcome for them comes off.
                if (k.startsWith("done:")) reloadWelcome();
              }}
              welcomeStart={shared ? welcomeStart : null}
              onDone={
                shared
                  ? () => {
                      setWelcomeStart(null);
                      setSession((n) => n + 1);
                      bump();
                    }
                  : undefined
              }
              qrPanel={saverLook.defaults.qrStyle === "panel"}
            />
          )}
          <ThemeFooter
            theme={p.theme}
            className={cn(
              "mx-auto max-w-6xl",
              expanded ? "mt-[0.5em] w-full pb-[0.5em]" : "mt-[1.5em] pb-[1em]",
            )}
          />
        </div>

        {/* The public tour: the floating demo panel (says it's a demo, switch property, start a trial, leave). */}
        {tour ? <GuestDemoDock code={p.code} /> : null}

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
              setGoodbyeAside(true);
              bump();
            }}
            onArrive={(card) => {
              // The host's welcome opens their stay as it does on its own; any other card starts with the photo ID.
              setGoodbyeAside(true);
              setWelcomeStart(
                card.welcome?.checkIn
                  ? { version: card.welcome.version, n: Date.now(), source: card.welcome.source }
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
        {shared && !tour ? (
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

        {shared && saver && !welcomeUp && !goodbyeUp ? (
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
  // The host's QR choice applies whatever shows at rest.
  const qrUrl =
    saver.rest.clockQr && typeof window !== "undefined"
      ? `${window.location.origin}/kiosk/${code}?guest=1`
      : null;
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
