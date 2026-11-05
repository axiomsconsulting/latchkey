import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Camera } from "lucide-react";

import { guest as copy } from "@/content/copy";
import { POINTER_SPACE, type CameraCallout, type Edge } from "@/lib/kiosk-camera-spot";
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
  const badge =
    pointer.edge === "top"
      ? { top: -POINTER_SPACE + 2, left: pointer.at - 16 }
      : pointer.edge === "bottom"
        ? { bottom: -POINTER_SPACE + 2, left: pointer.at - 16 }
        : pointer.edge === "left"
          ? { left: -POINTER_SPACE + 2, top: pointer.at - 16 }
          : { right: -POINTER_SPACE + 2, top: pointer.at - 16 };
  return createPortal(
    <div
      data-kiosk-callout
      className="fixed z-[75] flex flex-col gap-2 rounded-2xl bg-card p-2 shadow-2xl ring-1 ring-border"
      style={{ left: box.x, top: box.y, width: box.w }}
    >
      {pointing ? (
        <>
          <span
            aria-hidden
            className={cn("absolute size-0", POINTER[pointer.edge])}
            style={along}
          />
          <span
            aria-label={copy.cameraIsHere}
            title={copy.cameraIsHere}
            className="absolute grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow"
            style={badge}
          >
            <Camera className="size-4" aria-hidden />
          </span>
        </>
      ) : null}
      {children}
    </div>,
    host.current,
  );
}
