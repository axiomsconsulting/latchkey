import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { type CameraCallout, type Edge, type Rect } from "@/lib/kiosk-camera-spot";
import { useFitBox } from "@/hooks/use-kiosk-stage";
import { cn } from "@/lib/utils";

const root = () => document.querySelector<HTMLElement>("[data-kiosk-root]");

const POINTER: Record<Edge, string> = {
  top: "-top-3 -translate-x-1/2 border-x-[14px] border-b-[14px] border-x-transparent border-b-card",
  bottom:
    "-bottom-3 -translate-x-1/2 border-x-[14px] border-t-[14px] border-x-transparent border-t-card",
  left: "-left-3 -translate-y-1/2 border-y-[14px] border-r-[14px] border-y-transparent border-r-card",
  right:
    "-right-3 -translate-y-1/2 border-y-[14px] border-l-[14px] border-y-transparent border-l-card",
};

/** The floating preview and its button, with a pointer to the camera (only when it's the front one). */
export function CameraCalloutBox({
  callout,
  pointing,
  children,
}: {
  callout: CameraCallout;
  pointing: boolean;
  children: ReactNode;
}) {
  const host = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    host.current = root() ?? document.body;
    setReady(true);
  }, []);
  if (!ready || !host.current) return null;
  const { box, pointer } = callout;
  const along =
    pointer.edge === "top" || pointer.edge === "bottom"
      ? { left: pointer.at }
      : { top: pointer.at };
  return createPortal(
    <div
      data-kiosk-callout
      className="fixed z-[75] flex flex-col gap-2 rounded-2xl bg-card p-2 shadow-2xl ring-1 ring-border"
      style={{ left: box.x, top: box.y, width: box.w }}
    >
      {pointing ? (
        <span aria-hidden className={cn("absolute size-0", POINTER[pointer.edge])} style={along} />
      ) : null}
      {children}
    </div>,
    host.current,
  );
}

/** A second block the floating preview leaves (often under it): the phone's QR code goes here. */
export function StageExtra({ rect, children }: { rect: Rect; children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => setHost(root() ?? document.body), []);
  // Once it's on the page (the portal waits a moment), and whenever its size changes.
  useFitBox(box, host ? `${rect.w}x${rect.h}` : null);
  if (!host) return null;
  return createPortal(
    <div
      ref={box}
      data-kiosk-extra
      className="fixed z-[74] flex flex-col justify-center overflow-hidden p-2"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      {children}
    </div>,
    host,
  );
}
