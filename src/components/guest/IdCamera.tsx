import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { guest as copy } from "@/content/copy";

/**
 * Live camera preview that captures one still as a JPEG data URL. The image
 * only ever lives in memory; it is sent once for reading and then discarded.
 */
export function IdCamera({
  busy,
  onCapture,
  onFail,
}: {
  busy: boolean;
  onCapture: (dataUrl: string) => void;
  onFail: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
          audio: false,
        });
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
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", 0.85);
    canvas.width = 0;
    onCapture(url);
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl bg-muted">
        <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
        {!ready ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : null}
      </div>
      <p className="text-center text-muted-foreground">{copy.idCameraHelp}</p>
      <Button size="touch-xl" className="w-full" onClick={capture} disabled={!ready || busy}>
        {busy ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
        {busy ? copy.idChecking : copy.idTakePhoto}
      </Button>
    </div>
  );
}
