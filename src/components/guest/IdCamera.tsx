import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Camera, ImageUp, Loader2, SwitchCamera, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { guest as copy } from "@/content/copy";
import { fromFile } from "@/lib/photo-file";
import { photoFill, photoStage } from "@/lib/photo-progress";
import { useAutoSnap, type SnapShape } from "@/hooks/use-auto-snap";
import { CameraCalloutBox, StageExtra } from "@/components/guest/KioskPhotoStage";
import { JumboSlot } from "@/components/guest/JumboSlot";
import { useKioskStage } from "@/hooks/use-kiosk-stage";
import type { Spot } from "@/lib/kiosk-camera-spot";
import { cn } from "@/lib/utils";
import { kioskFlash, kioskSound } from "@/lib/kiosk-sound";
import { sampleLook, samplePhase } from "@/lib/test-sample-motion";
import { useTestSample } from "@/components/guest/TestSamples";
import { ReviewTicker, useHasKioskReviews } from "@/components/guest/KioskReviews";

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

/** The same, from a picture (a host's sample photo standing in for the camera). */
function stillOf(img: HTMLImageElement, max: number, quality: number): string {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
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

/** The ID's edges or the face, drawn over the preview in the picture's own pixels (which line up with object-cover). */
function SnapOverlay({
  size,
  shape,
  mirrored,
  whole = false,
}: {
  size: { w: number; h: number } | null;
  shape: SnapShape;
  mirrored: boolean;
  /** The picture is shown whole (Jumbo), not filling its box. */
  whole?: boolean;
}) {
  if (!size?.w) return null;
  const colour = shape.good ? "#22c55e" : "#ffffff";
  const xs = shape.points.map((p) => p.x);
  const ys = shape.points.map((p) => p.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const line = Math.max(size.w / (shape.good ? 110 : 160), 3);
  return (
    <svg
      viewBox={`0 0 ${size.w} ${size.h}`}
      preserveAspectRatio={whole ? "xMidYMid meet" : "xMidYMid slice"}
      className={cn("pointer-events-none absolute inset-0 size-full", mirrored && "-scale-x-100")}
      aria-hidden
    >
      {shape.kind === "id" ? (
        <polygon
          points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={colour}
          strokeWidth={line}
          strokeLinejoin="round"
        />
      ) : (
        <path
          d={faceOutline(left, top, right - left, bottom - top)}
          fill="none"
          stroke={colour}
          strokeWidth={line}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/**
 * A head-and-shoulders outline around a face the detector found, so the guest sees they've
 * been recognised and the photo is about to be taken: the head (a little taller than the box,
 * narrowing to the chin), the neck and the tops of the shoulders.
 */
function faceOutline(x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2;
  const top = y - h * 0.32;
  const chin = y + h * 1.08;
  const half = w * 0.62;
  const cheek = y + h * 0.55;
  const neck = w * 0.24;
  const shoulderY = chin + h * 0.32;
  const shoulder = w * 1.25;
  return [
    // Head: crown, temples, cheeks, round chin.
    `M ${cx} ${top}`,
    `C ${cx + half * 1.05} ${top}, ${cx + half} ${cheek - h * 0.35}, ${cx + half} ${cheek}`,
    `C ${cx + half} ${chin - h * 0.12}, ${cx + w * 0.22} ${chin}, ${cx} ${chin}`,
    `C ${cx - w * 0.22} ${chin}, ${cx - half} ${chin - h * 0.12}, ${cx - half} ${cheek}`,
    `C ${cx - half} ${cheek - h * 0.35}, ${cx - half * 1.05} ${top}, ${cx} ${top}`,
    // Neck and shoulders.
    `M ${cx - neck} ${chin - h * 0.04} L ${cx - neck} ${chin + h * 0.14}`,
    `Q ${cx - neck} ${shoulderY - h * 0.08}, ${cx - shoulder} ${shoulderY + h * 0.12}`,
    `M ${cx + neck} ${chin - h * 0.04} L ${cx + neck} ${chin + h * 0.14}`,
    `Q ${cx + neck} ${shoulderY - h * 0.08}, ${cx + shoulder} ${shoulderY + h * 0.12}`,
  ].join(" ");
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
  auto = false,
  spot = null,
  aside = null,
  jumbo = false,
}: {
  /** Jumbo door tablet: a few big words on the left, the preview and the phone on the right. */
  jumbo?: boolean;
  /** The phone's QR code: in the space left under or beside the floating preview when there is one. */
  aside?: ReactNode;
  /** A door tablet: takes the photo by itself once it sees a whole ID or a face, and a selfie's button counts down. */
  auto?: boolean;
  /** A door tablet: where its front camera is, so the preview floats right by it. */
  spot?: Spot | null;
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
  // A host's test with sample photos: the picture stands in for the camera (TestSamples.tsx).
  const sample = useTestSample(kind);
  const hasReviews = useHasKioskReviews();
  const sampleRef = useRef<HTMLImageElement>(null);
  const [sampleSize, setSampleSize] = useState<{ w: number; h: number } | null>(null);
  const [flashing, setFlashing] = useState(false);
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
    if (sample) {
      setReady(true);
      return;
    }
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
          const v = videoRef.current;
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
  }, [current, sample]);

  // The front camera shows like a mirror, so moving feels natural; an ID is always kept the right way round.
  const mirrored = current === "user";
  // A selfie on a door tablet: the button counts down, as it's hard to stand back and tap it.
  const [count, setCount] = useState<number | null>(null);
  const timed = auto && kind === "face";
  useEffect(() => {
    if (count === null) return;
    if (busy) return setCount(null);
    if (count === 0) {
      setCount(null);
      take();
      return;
    }
    const t = window.setTimeout(() => setCount(count - 1), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, busy]);
  const snap = useAutoSnap(
    videoRef,
    kind,
    !sample && auto && ready && !busy && !shot && count === null,
    () => take(),
  );
  // The sample photo plays a real guest's moment: it comes in tilted and blurred, lines up, sharpens,
  // gets its outline, holds, and is taken by itself. Once per screen; after that, Take photo replays it.
  const [sampleRun, setSampleRun] = useState(0);
  const [sampleMs, setSampleMs] = useState<number | null>(null);
  const autoPlayed = useRef(false);
  useEffect(() => {
    if (!sample || !ready || busy || shot || !sampleSize) return;
    if (sampleRun === 0 && autoPlayed.current) return;
    autoPlayed.current = true;
    const startAt = Date.now();
    setSampleMs(0);
    const id = window.setInterval(() => {
      const ms = Date.now() - startAt;
      setSampleMs(ms);
      if (samplePhase(ms) === "take") {
        window.clearInterval(id);
        setSampleMs(null);
        take();
      }
    }, 80);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample, ready, busy, shot, sampleSize, sampleRun]);
  const phase = sampleMs === null ? null : samplePhase(sampleMs);
  const sampleShape: SnapShape | null =
    sample && sampleSize && (phase === "outline" || phase === "hold")
      ? {
          kind,
          good: phase === "hold",
          points:
            kind === "id"
              ? [
                  { x: sampleSize.w * 0.04, y: sampleSize.h * 0.05 },
                  { x: sampleSize.w * 0.96, y: sampleSize.h * 0.05 },
                  { x: sampleSize.w * 0.96, y: sampleSize.h * 0.95 },
                  { x: sampleSize.w * 0.04, y: sampleSize.h * 0.95 },
                ]
              : [
                  { x: sampleSize.w * 0.36, y: sampleSize.h * 0.24 },
                  { x: sampleSize.w * 0.64, y: sampleSize.h * 0.24 },
                  { x: sampleSize.w * 0.64, y: sampleSize.h * 0.58 },
                  { x: sampleSize.w * 0.36, y: sampleSize.h * 0.58 },
                ],
        }
      : null;
  const shown = sample ? sampleShape : snap.shape;
  const say: keyof (typeof copy.autoSnap)["id"] = sample
    ? phase === "hold"
      ? "hold"
      : phase === "outline"
        ? "look"
        : kind === "id"
          ? "small"
          : "cut_off"
    : snap.say;
  // The voice concierge (VoiceConcierge) listens for these: the camera opening, what it sees, the shot.
  useEffect(() => {
    if (!auto || !ready) return;
    window.dispatchEvent(new CustomEvent("lk-camera", { detail: { kind } }));
  }, [auto, ready, kind]);
  useEffect(() => {
    if (!auto || !ready || busy || shot) return;
    const v = videoRef.current;
    const shape = sample ? null : snap.shape;
    window.dispatchEvent(
      new CustomEvent("lk-snap", {
        detail: {
          kind,
          say: snap.say,
          points: shape?.points ?? null,
          good: !!shape?.good,
          w: v?.videoWidth ?? 0,
          h: v?.videoHeight ?? 0,
          front: mirrored,
        },
      }),
    );
  }, [auto, ready, busy, shot, snap, kind, mirrored, sample]);
  // Beside the camera only for the front one: the back one is on the other side of the tablet.
  const pointing = !!spot && current === "user";
  // The floating preview only where the host placed the front camera; otherwise the standard
  // layout, with the screen still fitted so nothing scrolls.
  const callout = useKioskStage(auto && !jumbo, auto && !jumbo && pointing ? spot : null);
  const standard = auto && !jumbo && !callout;
  // Jumbo puts the step's own heading on the left half, so it reads it from the page.
  const own = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState("");
  // The camera's own shape (width over height), once it's running.
  useLayoutEffect(() => {
    if (!jumbo) return;
    const h = own.current?.closest("section")?.querySelector(":scope > h1");
    setTitle(h?.textContent ?? "");
  }, [jumbo]);

  function capture() {
    const small = SMALL[kind];
    const img = sampleRef.current;
    if (sample) {
      if (!img?.naturalWidth) return;
      const smallShot = stillOf(img, small.max, small.quality);
      setShot(smallShot);
      return onCapture(stillOf(img, 1400, 0.8), smallShot);
    }
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const keepMirror = mirrored && kind === "face";
    const smallShot = still(video, small.max, small.quality, keepMirror);
    setShot(smallShot);
    // 1400px is plenty for the reader and quicker to send than a full camera frame.
    onCapture(still(video, 1400, 0.8, keepMirror), smallShot);
  }

  /**
   * Takes the photo with the shutter sound and, on a door tablet with the flash on, the screen
   * white at full strength for a moment first, lighting the face or ID in front of it.
   */
  function take() {
    window.dispatchEvent(new CustomEvent("lk-shot", { detail: { kind } }));
    const lit = kioskFlash() && (mirrored || !!sample);
    if (!lit) {
      kioskSound("shutter");
      return capture();
    }
    setFlashing(true);
    window.setTimeout(() => {
      kioskSound("shutter");
      capture();
    }, 180);
    window.setTimeout(() => setFlashing(false), 480);
  }

  const preview = (
    <>
      {sample ? (
        <img
          ref={sampleRef}
          src={sample}
          alt=""
          onLoad={(e) =>
            setSampleSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
          }
          className={cn(
            "absolute inset-0 z-[1] size-full bg-black transition-[transform,filter] duration-700 ease-out",
            jumbo ? "object-contain" : "object-cover",
          )}
          style={sampleLook(phase)}
        />
      ) : null}
      {flashing
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-0 z-[2147483647] bg-white"
              aria-hidden
            />,
            document.body,
          )
        : null}
      <video
        ref={videoRef}
        // The standard door tablet layout: the picture takes what's left of the card once the words
        // and buttons fit, so the text never has to shrink for it.
        style={
          standard
            ? {
                maxHeight:
                  "max(9rem, min(calc(var(--kiosk-h, 100dvh) * 0.5), calc(var(--photo-h, 100dvh) - 17rem)))",
              }
            : undefined
        }
        playsInline
        muted
        // Stacked: never taller than about half the screen, so the button below stays in view.
        // Beside the buttons: as tall as the screen allows once the heading and the rest (sized in rem) fit,
        // so the text keeps its size and the camera takes what's left.
        className={cn(
          "aspect-[4/3] w-full object-cover",
          !callout &&
            (standard
              ? ""
              : side
                ? "max-h-[min(calc(var(--kiosk-h,100dvh)*0.58),calc(var(--kiosk-h,100dvh)-28rem))]"
                : "max-h-[calc(var(--kiosk-h,100dvh)*0.46)]"),
          mirrored && "-scale-x-100",
        )}
      />
      {shot && busy ? (
        <img
          src={shot}
          alt=""
          // As kept: an ID the right way round, a face as the guest saw it.
          className="absolute inset-0 z-[4] size-full object-cover"
        />
      ) : null}
      {ready && kind === "id" && !(shot && busy) && !shown && !sample ? <IdHint /> : null}
      {(auto || sample) && ready && shown && !shot ? (
        <div className="pointer-events-none absolute inset-0 z-[2]">
          <SnapOverlay
            size={
              sample
                ? sampleSize
                : videoRef.current
                  ? { w: videoRef.current.videoWidth, h: videoRef.current.videoHeight }
                  : null
            }
            shape={shown}
            mirrored={!sample && mirrored}
            whole={jumbo}
          />
        </div>
      ) : null}
      {(auto || (sample && phase !== null)) && ready && !shot && count === null ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 z-[3] mx-auto w-fit max-w-[90%] rounded-full bg-black px-4 py-1.5 text-center text-lg text-white">
          {copy.autoSnap[kind][say]}
        </p>
      ) : null}
      {count !== null && count > 0 ? (
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center"
          role="status"
          aria-live="assertive"
        >
          <span className="grid size-32 place-items-center rounded-full bg-black font-display text-7xl text-white">
            {count}
          </span>
        </div>
      ) : null}
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
    </>
  );
  const takeButton = (
    <Button
      size="touch-xl"
      className="w-full"
      onClick={() => (sample ? setSampleRun((n) => n + 1) : timed ? setCount(3) : take())}
      disabled={!ready || busy || count !== null || phase !== null}
    >
      {busy ? (
        <Loader2 className="size-6 animate-spin" />
      ) : timed ? (
        <Timer className="size-6" aria-hidden />
      ) : (
        <Camera className="size-6" />
      )}
      {busy ? (busyLabel ?? copy.idChecking) : timed ? copy.faceTimer : (cta ?? copy.idTakePhoto)}
    </Button>
  );
  // While it's checked, the property's reviews take the help line's place (host's choice).
  const reviewsNow = busy && !!shot && hasReviews;
  const helpBits = (
    <>
      {reviewsNow ? null : (
        <p className={cn("text-center text-muted-foreground", side && "text-lg")}>
          {help ?? copy.idCameraHelp}
        </p>
      )}
      {busy && shot ? <PhotoProgress kind={kind} /> : null}
      {reviewsNow ? <ReviewTicker /> : null}
    </>
  );
  const moreBits = (
    <>
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
    </>
  );

  // Jumbo: the step's heading and a short line on the left half; the preview, its button and the
  // phone's square on the right. No floating, no help paragraphs.
  if (jumbo)
    return (
      <div ref={own} data-jumbo-photo className="grid h-full min-h-0 grid-cols-2 gap-[3cqmin]">
        <div className="flex min-h-0 flex-col gap-[2cqmin]">
          {/* One paragraph, as big as the welcome card's words; the phone's square fills the rest below. */}
          <p data-jumbo-para className="font-display font-bold">
            {title.replace(/[.!?]$/, "")}. {kind === "face" ? copy.jumboFace : copy.jumboId}.
            {aside ? ` ${copy.jumboWords.phone}.` : null}
          </p>
          {busy && shot ? <PhotoProgress kind={kind} /> : null}
          {reviewsNow ? <ReviewTicker /> : aside}
        </div>
        {/* The camera picture and Take photo fill the rest of the card. */}
        <div className="flex min-h-0 flex-col gap-[2cqmin]">
          <div
            className="relative min-h-0 flex-1 overflow-hidden rounded-[2cqmin] bg-black"
            data-jumbo-preview
          >
            {preview}
          </div>
          {takeButton}
        </div>
        <JumboSlot on to="jumbo-status">
          {moreBits}
        </JumboSlot>
      </div>
    );

  // The standard door tablet layout: the words on the left, the camera picture on the right with
  // Take photo under it and a small QR code below that (stacked when upright).
  if (standard)
    return (
      <div
        className={
          side ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] items-center gap-8" : "space-y-4"
        }
      >
        {side ? (
          <div className="space-y-4">
            {helpBits}
            {moreBits}
          </div>
        ) : null}
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl bg-muted">{preview}</div>
          {/* Take photo with the small phone square beside it, so the picture keeps the height. */}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">{takeButton}</div>
            {aside ? <div className="shrink-0">{aside}</div> : null}
          </div>
        </div>
        {side ? null : (
          <div className="space-y-4">
            {helpBits}
            {moreBits}
          </div>
        )}
      </div>
    );

  // A door tablet: floating by the camera, with its button; the rest stays in the step's own card.
  if (callout)
    return (
      <>
        <CameraCalloutBox callout={callout} pointing={pointing}>
          <div className="relative overflow-hidden rounded-xl bg-muted">{preview}</div>
          {takeButton}
        </CameraCalloutBox>
        <div className="space-y-3">
          {helpBits}
          {moreBits}
          {callout.extra ? null : aside}
        </div>
        {callout.extra ? <StageExtra rect={callout.extra}>{aside}</StageExtra> : null}
      </>
    );

  return (
    <div
      className={
        side ? "grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-center gap-8" : "space-y-4"
      }
    >
      <div className="relative overflow-hidden rounded-2xl bg-muted">{preview}</div>
      <div className="space-y-4">
        {helpBits}
        {takeButton}
        {moreBits}
        {aside}
      </div>
    </div>
  );
}
