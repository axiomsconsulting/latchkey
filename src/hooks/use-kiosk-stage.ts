import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { cameraCallout, type CameraCallout, type Spot } from "@/lib/kiosk-camera-spot";

const root = () => document.querySelector<HTMLElement>("[data-kiosk-root]");

/**
 * A door tablet's photo screen, which never scrolls. The preview floats over everything right
 * by the camera; the step's own card moves into what's left of the screen (styles.css,
 * html[data-kiosk-photo]) and shrinks only if it has to. `spot` null: no floating preview.
 */
export function useKioskStage(on: boolean, spot: Spot | null): CameraCallout | null {
  const [callout, setCallout] = useState<CameraCallout | null>(null);
  const key = spot ? `${spot.x},${spot.y},${spot.ox ?? 0},${spot.oy ?? 0}` : "";
  useLayoutEffect(() => {
    if (!on) return;
    const html = document.documentElement;
    const lay = () => {
      const r = root();
      const h = Number.parseFloat(html.style.getPropertyValue("--kiosk-h")) || window.innerHeight;
      const w = r?.offsetWidth || window.innerWidth;
      const rem = Number.parseFloat(window.getComputedStyle(html).fontSize) || 16;
      // Measured on screen, then turned into the page's own pixels: a calibrated tablet shows the
      // whole page zoomed (0.74 on a Teclast), and the card is placed in unzoomed pixels.
      const rootBox = r?.getBoundingClientRect();
      const zoom = rootBox && r?.offsetWidth ? rootBox.width / r.offsetWidth || 1 : 1;
      const inPage = (e: Element | null | undefined) => {
        if (!e || !rootBox) return null;
        const q = e.getBoundingClientRect();
        return {
          x: (q.left - rootBox.left) / zoom,
          y: (q.top - rootBox.top) / zoom,
          w: q.width / zoom,
          h: q.height / zoom,
        };
      };
      const flow = document.querySelector<HTMLElement>("[data-kiosk-flow]");
      const back = inPage(flow?.querySelector<HTMLElement>(":scope > button"));
      const header = inPage(document.querySelector<HTMLElement>("[data-kiosk-root] header"));
      // The preview floats over the header, but never over the Back button.
      const c = spot ? cameraCallout(spot, { w, h }, rem * 6.5, back ? [back] : []) : null;
      // The card starts under the header and the Back button, unless its block starts lower.
      const under = Math.round(
        Math.max(back ? back.y + back.h + 8 : 0, header ? header.y + header.h : 0),
      );
      // The spare space can't be up among the header and the Back button.
      setCallout(c && c.extra && c.extra.y < under ? { ...c, extra: null } : c);
      const free = c?.free ?? { x: 0, y: 0, w, h };
      const top = Math.max(free.y, under);
      html.style.setProperty("--photo-x", `${free.x}px`);
      html.style.setProperty("--photo-y", `${top}px`);
      html.style.setProperty("--photo-w", `${free.w}px`);
      html.style.setProperty("--photo-h", `${Math.max(120, free.y + free.h - top)}px`);
      html.setAttribute("data-kiosk-photo", "");
    };
    // The card leaves the page as soon as this is set, which can move the back button down:
    // so it's measured again once that has happened, and whenever the header or button changes size.
    html.setAttribute("data-kiosk-photo", "");
    lay();
    const again = requestAnimationFrame(lay);
    const seen = new ResizeObserver(() => lay());
    const flow = document.querySelector<HTMLElement>("[data-kiosk-flow]");
    const back = flow?.querySelector<HTMLElement>(":scope > button");
    if (back) seen.observe(back);
    if (flow) seen.observe(flow);
    window.addEventListener("resize", lay);
    return () => {
      cancelAnimationFrame(again);
      seen.disconnect();
      window.removeEventListener("resize", lay);
      html.removeAttribute("data-kiosk-photo");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, key]);

  // Whatever the step holds (a message, the QR code, several buttons), it fits its block.
  const main = useRef<HTMLElement | null>(null);
  useEffect(() => {
    main.current = on ? document.querySelector<HTMLElement>("[data-kiosk-flow] main") : null;
  });
  useFitBox(main, on ? `${callout?.free.w}x${callout?.free.h}` : null);
  return callout;
}

/**
 * Keeps a block's content inside it: if it doesn't fit, its children are zoomed down step by step
 * until all of it shows, and back to full size when it fits again.
 */
export function useFitBox(ref: { current: HTMLElement | null }, key: string | null) {
  useEffect(() => {
    if (key === null) return;
    let frame = 0;
    let el: HTMLElement | null = null;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el = ref.current;
        if (!el) return;
        const box = el;
        const kids = [...box.children] as HTMLElement[];
        kids.forEach((k) => (k.style.zoom = ""));
        let z = 1;
        for (let i = 0; i < 12 && box.scrollHeight > box.clientHeight + 1 && z > 0.5; i++) {
          z = z * (box.clientHeight / box.scrollHeight) * 0.99;
          kids.forEach((k) => (k.style.zoom = String(Math.max(0.5, z))));
        }
      });
    };
    fit();
    const target = ref.current;
    const seen = new MutationObserver(fit);
    if (target) seen.observe(target, { childList: true, subtree: true });
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(frame);
      seen.disconnect();
      window.removeEventListener("resize", fit);
      if (el) ([...el.children] as HTMLElement[]).forEach((k) => (k.style.zoom = ""));
    };
  }, [ref, key]);
}
