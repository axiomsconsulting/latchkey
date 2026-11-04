import { useEffect, useRef } from "react";

import {
  WAKE_FRAME,
  WAKE_NEEDS_STEPS,
  WAKE_SETTLE_STEPS,
  WAKE_STEP_MS,
  changedShare,
  isLoud,
  loudness,
  movedIn,
  nextBaseline,
} from "@/lib/motion-wake";

/** How many looks in a row must agree, counted apart for the camera and the microphone. */
function counter(onHit: () => void) {
  let steps = 0;
  let hits = 0;
  return (hit: boolean) => {
    steps += 1;
    if (steps <= WAKE_SETTLE_STEPS) return;
    hits = hit ? hits + 1 : 0;
    if (hits >= WAKE_NEEDS_STEPS) onHit();
  };
}

/**
 * While `active`, watches for movement (camera) and listens for sound (mic), and
 * calls onMotion on whichever comes first; a touch wakes the tablet anyway. Only
 * compares a tiny picture and a sound level on this tablet: nothing is kept or
 * sent. Each is asked for on its own, so one refused or missing leaves the other
 * working, and both close as soon as they're not needed.
 */
export function useMotionWake(active: boolean, onMotion: () => void) {
  const latest = useRef(onMotion);
  latest.current = onMotion;
  useEffect(() => {
    if (!active) return;
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) return;
    let stopped = false;
    const streams: MediaStream[] = [];
    const timers: number[] = [];
    let audio: AudioContext | null = null;
    const wake = () => latest.current();

    const watch = (s: MediaStream) => {
      const tell = counter(wake);
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = s;
      void video.play().catch(() => {});
      const canvas = document.createElement("canvas");
      canvas.width = WAKE_FRAME.width;
      canvas.height = WAKE_FRAME.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      let before: Uint8ClampedArray | null = null;
      timers.push(
        window.setInterval(() => {
          if (!ctx || video.readyState < 2) return;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const now = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          if (before) tell(movedIn(changedShare(before, now)));
          before = now;
        }, WAKE_STEP_MS),
      );
    };

    const listen = (s: MediaStream) => {
      const tell = counter(wake);
      audio = new AudioContext();
      void audio.resume().catch(() => {});
      const analyser = audio.createAnalyser();
      analyser.fftSize = 1024;
      audio.createMediaStreamSource(s).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let baseline = 0;
      timers.push(
        window.setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          const level = loudness(samples);
          tell(baseline > 0 && isLoud(level, baseline));
          baseline = nextBaseline(baseline, level);
        }, WAKE_STEP_MS),
      );
    };

    const open = (constraints: MediaStreamConstraints, use: (s: MediaStream) => void) =>
      void md
        .getUserMedia(constraints)
        .then((s) => {
          if (stopped) return s.getTracks().forEach((t) => t.stop());
          streams.push(s);
          use(s);
        })
        .catch(() => {});
    open({ video: { facingMode: "user", width: 160, height: 120 }, audio: false }, watch);
    open({ audio: true, video: false }, listen);

    return () => {
      stopped = true;
      timers.forEach((t) => window.clearInterval(t));
      streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      void (audio as AudioContext | null)?.close().catch(() => {});
    };
  }, [active]);
}
