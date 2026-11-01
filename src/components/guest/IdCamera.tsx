import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, ImageUp, Loader2, SwitchCamera } from "lucide-react";

import { Button } from "@/components/ui/button";
import { guest as copy } from "@/content/copy";
import { fromFile } from "@/lib/photo-file";
import { photoFill, photoStage } from "@/lib/photo-progress";
import { cn } from "@/lib/utils";

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
 * The camera asked for: on a phone the back one for an ID and the front one
 * for a face; on a door tablet the host's choice (the front by default,
 * since the back faces the wall). Asked for strictly first, because some
 * phones treat a preference loosely; then as a preference; then any camera,
 * so a laptop with a single webcam still works.
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
      if (
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "SecurityError")
      )
        break;
    }
  }
  throw last ?? new Error("no camera");
}

/** A grey outline of a driving licence: photo on the left, lines of text on the right. */
function LicenceOutline() {
  return (
    <svg
      viewBox="0 0 172 108"
      className="h-auto w-[62%]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="2" y="2" width="168" height="104" rx="10" />
      <rect x="14" y="22" width="44" height="56" rx="5" />
      <circle cx="36" cy="42" r="9" />
      <path d="M22 72c3-10 9-14 14-14s11 4 14 14" />
      <path d="M72 26h80M72 42h62M72 56h72M72 70h50M14 92h140" />
    </svg>
  );
}

/** A grey outline of a passport's photo page, held open. */
function PassportOutline() {
  return (
    <svg
      viewBox="0 0 172 124"
      className="h-auto w-[62%]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="2" y="2" width="168" height="120" rx="8" />
      <path d="M2 58h168" strokeDasharray="4 5" />
      <rect x="14" y="66" width="34" height="44" rx="3" />
      <circle cx="31" cy="81" r="6.5" />
      <path d="M20 106c2-7 6-10 11-10s9 3 11 10" />
      <path d="M58 72h60M58 84h90M58 96h50M14 18h70M14 32h110M14 44h56" />
    </svg>
  );
}

/**
 * Shown once as the camera opens: a driving licence, then a passport, a
 * second each in dim grey, so guests know to photograph their ID (not
 * themselves). Then out of the way.
 */
function IdHint() {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    const a = window.setTimeout(() => setStage(1), 1000);
    const b = window.setTimeout(() => setStage(2), 2000);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, []);
  return (
    <div
      className="pointer-events-none absolute inset-0 grid place-items-center text-neutral-300/70"
      aria-hidden
    >
      <div
        className={`col-start-1 row-start-1 grid w-full place-items-center transition-opacity duration-300 ${stage === 0 ? "opacity-100" : "opacity-0"}`}
      >
        <LicenceOutline />
      </div>
      <div
        className={`col-start-1 row-start-1 grid w-full place-items-center transition-opacity duration-300 ${stage === 1 ? "opacity-100" : "opacity-0"}`}
      >
        <PassportOutline />
      </div>
    </div>
  );
}

/** While a photo is dealt with: what's happening now, and a bar that keeps moving. */
function PhotoProgress({ kind }: { kind: "id" | "face" }) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setMs(Date.now() - start), 200);
    return () => clearInterval(t);
  }, []);
  const fill = photoFill(kind, ms);
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill * 100)}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear"
          style={{ width: `${fill * 100}%` }}
        />
      </div>
      <p className="text-center text-base text-muted-foreground">
        {copy.photoStages[photoStage(kind, ms)]}
      </p>
    </div>
  );
}

/** Small copies the host keeps: an ID stays readable at 1024px, a face needs far less. */
const SMALL = {
  id: { max: 1024, quality: 0.62 },
  face: { max: 480, quality: 0.6 },
} as const;

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
  kind = "id",
  help,
  cta,
  busyLabel,
  side = false,
  extra,
  upload = false,
}: {
  /** A guest's own phone: a saved photo of the ID may be used instead (never for a face, which is live). */
  upload?: boolean;
  /** A door tablet on its side: the camera on the left, the help and buttons beside it, so nothing has to shrink. */
  side?: boolean;
  /** More buttons under the main one (skip, another way). */
  extra?: ReactNode;
  busy: boolean;
  onCapture: (full: string, small: string) => void;
  onFail: () => void;
  /** The camera to start with: "user" is the front one. The guest can switch (the button on the picture). */
  facing?: "environment" | "user";
  /** What's photographed: an ID (outline hints, sharper copy, never mirrored) or a face. */
  kind?: "id" | "face";
  help?: string;
  cta?: string;
  busyLabel?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState(facing);
  // Only offered when there's another camera to switch to.
  const [cameras, setCameras] = useState(0);
  // The picture just taken stays on screen while it's dealt with.
  const [shot, setShot] = useState<string | null>(null);
  useEffect(() => {
    if (!busy) setShot(null);
  }, [busy]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        const stream = await openCamera(current);
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
        // Device names and counts are only shown once a camera is allowed.
        const devices = await navigator.mediaDevices.enumerateDevices?.().catch(() => []);
        if (!cancelled) setCameras((devices ?? []).filter((d) => d.kind === "videoinput").length);
      } catch {
        if (!cancelled) onFail();
      }
    }
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // Opens again only when the guest switches camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // The front camera shows like a mirror, so moving feels natural; an ID is always kept the right way round.
  const mirrored = current === "user";
  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const keepMirror = mirrored && kind === "face";
    const small = SMALL[kind];
    const smallShot = still(video, small.max, small.quality, keepMirror);
    setShot(smallShot);
    // 1400px is plenty for the reader and quicker to send than a full camera frame.
    onCapture(still(video, 1400, 0.8, keepMirror), smallShot);
  }

  return (
    <div
      className={
        side ? "grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-center gap-8" : "space-y-4"
      }
    >
      <div className="relative overflow-hidden rounded-2xl bg-muted">
        <video
          ref={videoRef}
          playsInline
          muted
          // Stacked: never taller than about half the screen, so the button below stays in view.
          // Beside the buttons: as tall as the screen allows once the heading and the rest (sized in rem) fit,
          // so the text keeps its size and the camera takes what's left.
          className={cn(
            "aspect-[4/3] w-full object-cover",
            side
              ? "max-h-[min(calc(var(--kiosk-h,100dvh)*0.58),calc(var(--kiosk-h,100dvh)-28rem))]"
              : "max-h-[calc(var(--kiosk-h,100dvh)*0.46)]",
            mirrored && "-scale-x-100",
          )}
        />
        {shot && busy ? (
          <img
            src={shot}
            alt=""
            // As kept: an ID the right way round, a face as the guest saw it.
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
        {ready && kind === "id" && !(shot && busy) ? <IdHint /> : null}
        {cameras > 1 ? (
          <button
            type="button"
            onClick={() => setCurrent((c) => (c === "user" ? "environment" : "user"))}
            disabled={busy}
            aria-label={copy.cameraFlip}
            title={copy.cameraFlip}
            className="absolute right-3 top-3 grid size-14 place-items-center rounded-full bg-black text-white shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <SwitchCamera className="size-7" aria-hidden />
          </button>
        ) : null}
        {!ready ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : null}
      </div>
      <div className="space-y-4">
        <p className={cn("text-center text-muted-foreground", side && "text-lg")}>
          {help ?? copy.idCameraHelp}
        </p>
        {busy && shot ? <PhotoProgress kind={kind} /> : null}
        <Button size="touch-xl" className="w-full" onClick={capture} disabled={!ready || busy}>
          {busy ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
          {busy ? (busyLabel ?? copy.idChecking) : (cta ?? copy.idTakePhoto)}
        </Button>
        {upload && kind === "id" ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                void fromFile(f)
                  .then(({ full, small }) => {
                    setShot(small);
                    onCapture(full, small);
                  })
                  .catch(() => undefined);
              }}
            />
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <ImageUp className="size-5" aria-hidden /> {copy.idUpload}
            </Button>
          </>
        ) : null}
        {extra}
      </div>
    </div>
  );
}
