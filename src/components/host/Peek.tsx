import { useEffect, useRef, useState, type ReactNode } from "react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const HOVER_OPEN_MS = 220;
const HOVER_CLOSE_MS = 160;
const HOLD_MS = 450;

/**
 * More detail behind a number, name or card. Hover (mouse or pen), press
 * and hold (touch) or tab to it (keyboard) to see it; a normal click or tap
 * still follows the link inside. Holding never follows the link.
 */
export function Peek({
  children,
  content,
  className,
  side = "bottom",
  align = "start",
}: {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const anchor = useRef<HTMLSpanElement | null>(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const later = (fn: () => void, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span
          ref={anchor}
          className={cn("peek-trigger", className)}
          onPointerEnter={(e) => {
            if (e.pointerType !== "touch") later(() => setOpen(true), HOVER_OPEN_MS);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType !== "touch") later(() => setOpen(false), HOVER_CLOSE_MS);
          }}
          onPointerDown={(e) => {
            if (e.pointerType !== "touch") return;
            held.current = false;
            start.current = { x: e.clientX, y: e.clientY };
            later(() => {
              held.current = true;
              setOpen(true);
              navigator.vibrate?.(10);
            }, HOLD_MS);
          }}
          onPointerMove={(e) => {
            // Scrolling, not holding.
            if (e.pointerType === "touch" && start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) {
              clearTimeout(timer.current);
              start.current = null;
            }
          }}
          onPointerUp={(e) => {
            if (e.pointerType === "touch" && !held.current) clearTimeout(timer.current);
          }}
          onPointerCancel={() => clearTimeout(timer.current)}
          onContextMenu={(e) => {
            if (held.current || open) e.preventDefault();
          }}
          onClickCapture={(e) => {
            if (held.current) {
              e.preventDefault();
              e.stopPropagation();
              held.current = false;
            }
          }}
          onFocus={(e) => {
            if ((e.target as Element).matches?.(":focus-visible")) setOpen(true);
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) later(() => setOpen(false), HOVER_CLOSE_MS);
          }}
        >
          {children}
        </span>
      </PopoverAnchor>
      <PopoverContent
        side={side}
        align={align}
        className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl p-4 text-sm shadow-lifted"
        onOpenAutoFocus={(e) => e.preventDefault()}
        // Letting go of a hold focuses the link underneath: that isn't leaving.
        onFocusOutside={(e) => {
          if (anchor.current?.contains(e.target as Node)) e.preventDefault();
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={(e) => {
          if (e.pointerType !== "touch") clearTimeout(timer.current);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "touch") later(() => setOpen(false), HOVER_CLOSE_MS);
        }}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}

/** A label and value inside a peek. */
export function PeekFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
