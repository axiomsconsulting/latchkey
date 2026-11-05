import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Contrast, Sun } from "lucide-react";

import { SaverBand, type useSaverLook } from "@/components/guest/KioskClocks";
import { guest as copy } from "@/content/copy";
import { DAY_LOOK, shouldInvert } from "@/lib/kiosk-rest";

/** The page's own colour, however the theme wrote it (the browser turns anything into pixels). */
function pageIsLight(): boolean {
  const el = document.querySelector("[data-kiosk-root]");
  if (!el) return true;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return true;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = window.getComputedStyle(el).backgroundColor || "#ffffff";
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return shouldInvert(d[0] ?? 255, d[1] ?? 255, d[2] ?? 255);
}

/**
 * Smart Screensaver by day. The kiosk screen underneath stays exactly as it is, under a filter
 * (styles.css), so nothing moves or changes size. This layer is above it and outside the filter:
 * any touch wakes the screen without pressing what's under it, except the bands at the edges.
 */
export function LowPowerLayer({
  saver,
  onWake,
}: {
  saver: ReturnType<typeof useSaverLook>;
  onWake: () => void;
}) {
  const { day, setDay, commitDay } = saver;
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-kiosk-lowpower", "");
    if (pageIsLight()) html.setAttribute("data-lp-invert", "");
    return () => {
      html.removeAttribute("data-kiosk-lowpower");
      html.removeAttribute("data-lp-invert");
      html.style.removeProperty("--lp-brightness");
      html.style.removeProperty("--lp-contrast");
    };
  }, []);
  useEffect(() => {
    const html = document.documentElement;
    html.style.setProperty("--lp-brightness", String(day.brightness));
    html.style.setProperty("--lp-contrast", String(day.contrast));
  }, [day.brightness, day.contrast]);
  return createPortal(
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={copy.saverWake}
        className="fixed inset-0 z-[94] cursor-pointer select-none"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onWake();
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onWake}
      />
      <SaverBand
        side="left"
        label={copy.saverBrightness}
        icon={Sun}
        value={day.brightness}
        lo={DAY_LOOK.brightness.min}
        hi={DAY_LOOK.brightness.max}
        step={DAY_LOOK.brightness.step}
        brightness={1}
        onChange={(brightness) => setDay((d) => ({ ...d, brightness }))}
        onCommit={commitDay}
      />
      <SaverBand
        side="right"
        label={copy.saverContrast}
        icon={Contrast}
        value={day.contrast}
        lo={DAY_LOOK.contrast.min}
        hi={DAY_LOOK.contrast.max}
        step={DAY_LOOK.contrast.step}
        brightness={1}
        onChange={(contrast) => setDay((d) => ({ ...d, contrast }))}
        onCommit={commitDay}
      />
    </>,
    document.body,
  );
}
