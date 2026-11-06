import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { common, doorTabletsCopy as copy } from "@/content/copy";
import { cameraCallout, spotFor, type Spot, type WayUp } from "@/lib/kiosk-camera-spot";
import { setKioskCameraSpot, type KioskDevice } from "@/lib/kiosk-devices.functions";
import { pingKiosk } from "@/lib/kiosk-ping";
import { cn } from "@/lib/utils";

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/**
 * A picture of the tablet with a camera icon to drag to where its front camera is: any edge,
 * a notch, or under the screen. Saved on letting go. It shows the floating preview where
 * the tablet will really put it (cameraCallout, the same rule the kiosk uses).
 */
export function CameraSpotPad({
  device,
  onChanged,
}: {
  device: KioskDevice;
  onChanged: () => void;
}) {
  const saveFn = useServerFn(setKioskCameraSpot);
  const [way, setWay] = useState<WayUp>(
    device.display?.orientation === "portrait" ? "portrait" : "landscape",
  );
  const saved = spotFor(device.cameraSpot, device.deviceSig, way);
  const [spot, setSpot] = useState<Spot>(saved);
  useEffect(() => setSpot(saved), [saved.x, saved.y]); // eslint-disable-line react-hooks/exhaustive-deps
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // Dragging the preview itself: where it started, and where the pointer was.
  const moving = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  async function save(next: Spot | null) {
    try {
      const res = await saveFn({ data: { deviceId: device.id, way, spot: next } });
      await pingKiosk(res.code);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    }
  }
  const at = (e: React.PointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };
  const long = Math.max(device.display?.w ?? 1280, device.display?.h ?? 800);
  const short = Math.max(1, Math.min(device.display?.w ?? 1280, device.display?.h ?? 800));
  const screen = way === "landscape" ? { w: long, h: short } : { w: short, h: long };
  const { box } = cameraCallout(spot, screen, 96);
  const nudge = (dx: number, dy: number) => {
    const next = {
      ...spot,
      ox: Math.max(-0.5, Math.min(0.5, (spot.ox ?? 0) + dx)),
      oy: Math.max(-0.5, Math.min(0.5, (spot.oy ?? 0) + dy)),
    };
    setSpot(next);
    void save(next);
  };

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Camera className="size-4" aria-hidden /> {copy.spotTitle}
      </p>
      <p className="text-xs text-muted-foreground">{copy.spotHelp}</p>
      <div className="flex gap-1.5">
        {(["landscape", "portrait"] as const).map((w) => (
          <Button
            key={w}
            type="button"
            size="sm"
            variant={way === w ? "default" : "outline"}
            onClick={() => setWay(w)}
          >
            {w === "landscape" ? copy.spotSide : copy.spotUpright}
          </Button>
        ))}
      </div>
      <div className="mx-auto w-full max-w-xs p-3">
        <div
          ref={frame}
          className={cn(
            "relative mx-auto rounded-lg border-[6px] border-neutral-800 bg-muted",
            way === "portrait" ? "w-2/3" : "w-full",
          )}
          style={{ aspectRatio: `${screen.w} / ${screen.h}` }}
        >
          {/* Where the preview floats: drag it to fine-tune. */}
          <div
            role="button"
            tabIndex={-1}
            aria-label={copy.spotMovePreview}
            title={copy.spotMovePreview}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              moving.current = { px: e.clientX, py: e.clientY, ox: spot.ox ?? 0, oy: spot.oy ?? 0 };
            }}
            onPointerMove={(e) => {
              const m = moving.current;
              const r = frame.current?.getBoundingClientRect();
              if (!m || !r) return;
              setSpot((s) => ({
                ...s,
                ox: Math.max(-0.5, Math.min(0.5, m.ox + (e.clientX - m.px) / r.width)),
                oy: Math.max(-0.5, Math.min(0.5, m.oy + (e.clientY - m.py) / r.height)),
              }));
            }}
            onPointerUp={() => {
              if (!moving.current) return;
              moving.current = null;
              void save(spot);
            }}
            className="absolute grid cursor-move touch-none select-none place-items-center rounded bg-primary/25 text-[10px] text-foreground ring-1 ring-primary"
            style={{
              left: `${(box.x / screen.w) * 100}%`,
              top: `${(box.y / screen.h) * 100}%`,
              width: `${(box.w / screen.w) * 100}%`,
              height: `${(box.h / screen.h) * 100}%`,
            }}
          >
            {copy.spotPreview}
          </div>
          <button
            type="button"
            aria-label={copy.spotDrag}
            title={copy.spotDrag}
            className="absolute grid size-9 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-full bg-primary text-primary-foreground shadow-md active:cursor-grabbing"
            style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
            onPointerDown={(e) => {
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (dragging.current) setSpot(at(e));
            }}
            onPointerUp={(e) => {
              if (!dragging.current) return;
              dragging.current = false;
              void save(at(e));
            }}
            onKeyDown={(e) => {
              const step = 0.05;
              const moved =
                e.key === "ArrowLeft"
                  ? { ...spot, x: clamp(spot.x - step) }
                  : e.key === "ArrowRight"
                    ? { ...spot, x: clamp(spot.x + step) }
                    : e.key === "ArrowUp"
                      ? { ...spot, y: clamp(spot.y - step) }
                      : e.key === "ArrowDown"
                        ? { ...spot, y: clamp(spot.y + step) }
                        : null;
              if (!moved) return;
              e.preventDefault();
              setSpot(moved);
              void save(moved);
            }}
          >
            <Camera className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1">
        <span className="mr-1 text-xs text-muted-foreground">{copy.spotNudge}</span>
        {(
          [
            [ArrowLeft, -0.02, 0, copy.spotLeft],
            [ArrowUp, 0, -0.02, copy.spotUp],
            [ArrowDown, 0, 0.02, copy.spotDown],
            [ArrowRight, 0.02, 0, copy.spotRight],
          ] as const
        ).map(([Icon, dx, dy, label]) => (
          <Button
            key={label}
            type="button"
            size="icon"
            variant="outline"
            className="size-8"
            aria-label={label}
            title={label}
            onClick={() => nudge(dx, dy)}
          >
            <Icon className="size-4" aria-hidden />
          </Button>
        ))}
        {spot.ox || spot.oy ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              const { ox: _ox, oy: _oy, ...rest } = spot;
              setSpot(rest);
              void save(rest);
            }}
          >
            <RotateCcw className="size-4" aria-hidden /> {copy.spotCentre}
          </Button>
        ) : null}
      </div>
      {device.cameraSpot[way] ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => void save(null)}>
          {copy.spotReset}
        </Button>
      ) : null}
    </div>
  );
}
