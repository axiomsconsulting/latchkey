import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { common, doorTabletsCopy as copy } from "@/content/copy";
import { previewPlace, spotFor, type Spot, type WayUp } from "@/lib/kiosk-camera-spot";
import { setKioskCameraSpot, type KioskDevice } from "@/lib/kiosk-devices.functions";
import { pingKiosk } from "@/lib/kiosk-ping";
import { cn } from "@/lib/utils";

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/**
 * A picture of the tablet with a camera icon to drag to where its front camera
 * is (the edge, a notch, or under the screen). Saved on letting go; the
 * shaded part shows where the photo preview will open.
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
  const long = Math.max(device.display?.w ?? 16, device.display?.h ?? 10);
  const short = Math.max(1, Math.min(device.display?.w ?? 16, device.display?.h ?? 10));
  const place = previewPlace(spot, way);

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
          style={{ aspectRatio: way === "landscape" ? `${long} / ${short}` : `${short} / ${long}` }}
        >
          {/* Where the preview opens. */}
          <div
            className={cn(
              "absolute grid place-items-center rounded bg-primary/20 text-[10px] text-foreground",
              way === "landscape"
                ? cn("bottom-1 top-1 w-[55%]", place.first ? "left-1" : "right-1")
                : cn("inset-x-1 h-[45%]", place.first ? "top-1" : "bottom-1"),
            )}
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
      {device.cameraSpot[way] ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => void save(null)}>
          {copy.spotReset}
        </Button>
      ) : null}
    </div>
  );
}
