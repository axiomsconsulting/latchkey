import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { guest as copy } from "@/content/copy";

/** Draws the frame no larger than `max` pixels on its longest side. */
function still(video: HTMLVideoElement, max: number, quality: number, mirror: boolean): string {
  const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  if (ctx && mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", quality);
  canvas.width = 0;
  return url;
}

/**
 * The right camera for the job: the back camera to photograph an ID, the
 * front one for a face. Asked for strictly first, because some phones treat
 * a preference loosely; then as a preference; then any camera, so a laptop
 * with a single webcam still works.
 */
async function openCamera(facing: "environment" | "user"): Promise<MediaStream> {
  const width = { ideal: facing === "user" ? 1280 : 1920 };
  const tries: MediaTrackConstraints[] = [
    { facingMode: { exact: facing }, width },
    { facingMode: { ideal: facing }, width },
    { width },
  ];
  let last: unknown = null;
  for (const video of tries) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (err) {
      last = err;
      // Permission refused: asking again in another way won't help.
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")) break;
    }
  }
  throw last ?? new Error("no camera");
}

/** Small copies the host keeps: an ID stays readable at 1024px, a face needs far less. */
const SMALL = { environment: { max: 1024, quality: 0.62 }, user: { max: 480, quality: 0.6 } } as const;

/**
 * Live camera preview that captures one still. `full` is sent once for
 * reading and then discarded; `small` is a low-resolution JPEG the host may
 * keep, made here so the full image never needs storing.
 */
export function IdCamera({
  busy,
  onCapture,
  onFail,
  facing = "environment",
  help,
  cta,
  busyLabel,
}: {
  busy: boolean;
  onCapture: (full: string, small: string) => void;
  onFail: () => void;
  /** "user" for a face photo with the front camera. */
  facing?: "environment" | "user";
  help?: string;
  cta?: string;
  busyLabel?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        const stream = await openCamera(facing);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        if (!cancelled) onFail();
      }
    }
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const mirror = facing === "user";
    const small = SMALL[facing];
    onCapture(still(video, 1600, 0.85, mirror), still(video, small.max, small.quality, mirror));
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl bg-muted">
        <video
          ref={videoRef}
          playsInline
          muted
          className={facing === "user" ? "aspect-[4/3] w-full -scale-x-100 object-cover" : "aspect-[4/3] w-full object-cover"}
        />
        {!ready ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : null}
      </div>
      <p className="text-center text-muted-foreground">{help ?? copy.idCameraHelp}</p>
      <Button size="touch-xl" className="w-full" onClick={capture} disabled={!ready || busy}>
        {busy ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
        {busy ? (busyLabel ?? copy.idChecking) : (cta ?? copy.idTakePhoto)}
      </Button>
    </div>
  );
}
