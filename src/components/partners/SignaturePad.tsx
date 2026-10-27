import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Shortest drawn line that counts as a signature, in canvas pixels (a dot or a tap doesn't). */
const MIN_STROKE = 120;

/**
 * Draw a signature with a finger, pen or mouse. Reports a PNG (data URL)
 * once the drawing is long enough to be a signature, and null when cleared.
 */
export function SignaturePad({
  onChange,
  label,
}: {
  onChange: (png: string | null) => void;
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const length = useRef(0);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  };

  const report = () =>
    onChange(length.current >= MIN_STROKE ? canvas.current!.toDataURL("image/png") : null);

  return (
    <div className="space-y-2">
      <canvas
        ref={canvas}
        width={600}
        height={200}
        role="img"
        aria-label={label}
        className="h-40 w-full touch-none rounded-xl border border-input bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          last.current = point(e);
        }}
        onPointerMove={(e) => {
          if (!drawing.current || !last.current) return;
          const p = point(e);
          const ctx = canvas.current!.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(last.current.x, last.current.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          length.current += Math.hypot(p.x - last.current.x, p.y - last.current.y);
          last.current = p;
          if (empty) setEmpty(false);
        }}
        onPointerUp={() => {
          drawing.current = false;
          last.current = null;
          report();
        }}
        onPointerCancel={() => {
          drawing.current = false;
          last.current = null;
          report();
        }}
      />
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {empty
            ? "Sign with your finger, a pen or the mouse."
            : length.current < MIN_STROKE
              ? "Keep going: that's a little short for a signature."
              : "Signed."}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            const c = canvas.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            length.current = 0;
            setEmpty(true);
            onChange(null);
          }}
        >
          <Eraser className="size-4" /> Clear
        </Button>
      </div>
    </div>
  );
}
