import { useState } from "react";
import { Camera, Maximize2 } from "lucide-react";

import { CameraSpotPad } from "@/components/host/CameraSpotPad";
import { DeviceCalibration } from "@/components/host/KioskCalibration";
import { Button } from "@/components/ui/button";
import { doorTabletsCopy as copy } from "@/content/copy";
import type { KioskDevice } from "@/lib/kiosk-devices.functions";
import { cn } from "@/lib/utils";

/**
 * One tablet's set-up card with two sides: where its front camera is, and (flipped) how its
 * screen is lined up: the screen pad with move, size, zoom, fine tuning and reset, all in
 * the same frame. Both sides share one grid cell, so the card keeps the taller side's height.
 */
export function CameraScreenCard({
  device,
  index,
  code,
  onChanged,
  cameraOk,
}: {
  device: KioskDevice;
  index: number;
  code: string;
  onChanged: () => void;
  /** The tablet's browser can share its camera; otherwise only the screen side shows. */
  cameraOk: boolean;
}) {
  const [screenSide, setScreenSide] = useState(!cameraOk);
  const flip = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="shrink-0"
      onClick={() => setScreenSide((s) => !s)}
    >
      {screenSide ? <Camera className="size-4" /> : <Maximize2 className="size-4" />}
      {screenSide ? copy.flipCamera : copy.flipScreen}
    </Button>
  );
  const face =
    "col-start-1 row-start-1 transition-transform duration-500 [backface-visibility:hidden]";
  return (
    <div className="[perspective:1200px]">
      <div className="grid [transform-style:preserve-3d]">
        <div
          aria-hidden={screenSide}
          className={cn(face, screenSide && "pointer-events-none [transform:rotateY(180deg)]")}
        >
          {cameraOk ? <CameraSpotPad device={device} onChanged={onChanged} action={flip} /> : null}
        </div>
        <div
          aria-hidden={!screenSide}
          className={cn(
            face,
            "rounded-xl border border-border p-3",
            screenSide
              ? "[transform:rotateY(0deg)]"
              : "pointer-events-none [transform:rotateY(-180deg)]",
          )}
        >
          <div className="mb-2 flex items-center gap-2">
            <p className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
              <Maximize2 className="size-4" aria-hidden /> {copy.screenTitle}
            </p>
            {cameraOk ? flip : null}
          </div>
          <DeviceCalibration
            device={device}
            index={index}
            code={code}
            onSaved={onChanged}
            compact
          />
        </div>
      </div>
    </div>
  );
}
