import { useEffect, useLayoutEffect, useState } from "react";

import { cameraCallout, type CameraCallout, type Spot } from "@/lib/kiosk-camera-spot";

const root = () => document.querySelector<HTMLElement>("[data-kiosk-root]");

/**
 * A door tablet's photo screen, which never scrolls. The preview floats over everything right
 * by the camera; the step's own card moves into what's left of the screen (styles.css,
 * html[data-kiosk-photo]) and shrinks only if it has to. `spot` null: no floating preview.
 */
export function useKioskStage(on: boolean, spot: Spot | null): CameraCallout | null {
  const [callout, setCallout] = useState<CameraCallout | null>(null);
  const key = spot ? `${spot.x},${spot.y}` : "";
  useLayoutEffect(() => {
    if (!on) return;
    const html = document.documentElement;
    const lay = () => {
      const r = root();
      const h = Number.parseFloat(html.style.getPropertyValue("--kiosk-h")) || window.innerHeight;
      const w = r?.offsetWidth || window.innerWidth;
      const rem = Number.parseFloat(window.getComputedStyle(html).fontSize) || 16;
      const c = spot ? cameraCallout(spot, { w, h }, rem * 6.5) : null;
      setCallout(c);
      // Under the header and the back button, unless the free block starts lower.
      const flow = document.querySelector<HTMLElement>("[data-kiosk-flow]");
      const rootTop = r?.getBoundingClientRect().top ?? 0;
      const back = flow?.querySelector<HTMLElement>(":scope > button");
      const under = Math.round(
        (back?.getBoundingClientRect().bottom ?? flow?.getBoundingClientRect().top ?? 0) - rootTop,
      );
      const free = c?.free ?? { x: 0, y: 0, w, h };
      const top = Math.max(free.y, under);
      html.style.setProperty("--photo-x", `${free.x}px`);
      html.style.setProperty("--photo-y", `${top}px`);
      html.style.setProperty("--photo-w", `${free.w}px`);
      html.style.setProperty("--photo-h", `${Math.max(120, free.y + free.h - top)}px`);
      html.setAttribute("data-kiosk-photo", "");
    };
    lay();
    window.addEventListener("resize", lay);
    return () => {
      window.removeEventListener("resize", lay);
      html.removeAttribute("data-kiosk-photo");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, key]);

  // Whatever the step holds (a message, the QR code, several buttons), it fits its block.
  useEffect(() => {
    if (!on) return;
    const find = () => document.querySelector<HTMLElement>("[data-kiosk-flow] main");
    const main = find();
    if (!main) return;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const kids = [...main.children] as HTMLElement[];
        kids.forEach((k) => (k.style.zoom = ""));
        // Stepping down until it all shows, since not everything scales in step.
        let z = 1;
        for (let i = 0; i < 12 && main.scrollHeight > main.clientHeight + 1 && z > 0.5; i++) {
          z = z * (main.clientHeight / main.scrollHeight) * 0.99;
          kids.forEach((k) => (k.style.zoom = String(Math.max(0.5, z))));
        }
      });
    };
    fit();
    const seen = new MutationObserver(fit);
    seen.observe(main, { childList: true, subtree: true });
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(frame);
      seen.disconnect();
      window.removeEventListener("resize", fit);
      ([...main.children] as HTMLElement[]).forEach((k) => (k.style.zoom = ""));
    };
  }, [on, callout?.free.w, callout?.free.h]);
  return callout;
}
