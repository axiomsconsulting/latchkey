import { useEffect, useState } from "react";

import type { Orientation } from "@/lib/kiosk-fit";

/** A touch screen (phone, tablet), where a keyboard and toolbars change the page's size but never the display's. */
export function isTouchDevice(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
}

/** The device's own orientation. Not the page's shape, which an on-screen keyboard can flip. */
export function deviceOrientation(): Orientation {
  const type = window.screen.orientation?.type;
  if (type) return type.startsWith("landscape") ? "landscape" : "portrait";
  const legacy = (window as { orientation?: number }).orientation;
  if (typeof legacy === "number") return Math.abs(legacy) === 90 ? "landscape" : "portrait";
  return window.screen.width > window.screen.height ? "landscape" : "portrait";
}

/**
 * Wider than tall, as the kiosk lays itself out: on a touch screen, the way
 * the device is held (a keyboard never flips it); on a computer, the window.
 */
export function useLandscapeDisplay(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const update = () => setWide(isTouchDevice() ? deviceOrientation() === "landscape" : window.innerWidth > window.innerHeight);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.screen.orientation?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.screen.orientation?.removeEventListener?.("change", update);
    };
  }, []);
  return wide;
}
