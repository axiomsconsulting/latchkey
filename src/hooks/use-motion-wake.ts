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
import type { WakeBy } from "@/lib/kiosk-rest";

/**
 * While `active`, watches for movement (camera) or listens for sound (mic) and
 * calls onMotion. Only compares a tiny picture or a sound level on this tablet:
 * nothing is kept or sent. Closes the camera or mic as soon as it's not needed.
 * Without permission it does nothing, and a touch still wakes the tablet.
 */
export function useMotionWake(by: WakeBy, active: boolean, onMotion: () => void) {
  const latest = useRef(onMotion);
  latest.current = onMotion;
  useEffect(() => {
    if (!active || by === "off") return;
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let audio: AudioContext | null = null;
    let steps = 0;
    let hits = 0;
    const tell = (hit: boolean) => {
      steps += 1;
      if (steps <= WAKE_SETTLE_STEPS) return;
      hits = hit ? hits + 1 : 0;
      if (hits >= WAKE_NEEDS_STEPS) latest.current();
    };

    const watch = (s: MediaStream) => {
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
      timer = window.setInterval(() => {
        if (!ctx || video.readyState < 2) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const now = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        if (before) tell(movedIn(changedShare(before, now)));
        before = now;
      }, WAKE_STEP_MS);
    };

    const listen = (s: MediaStream) => {
      audio = new AudioContext();
      void audio.resume().catch(() => {});
      const analyser = audio.createAnalyser();
      analyser.fftSize = 1024;
      audio.createMediaStreamSource(s).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let baseline = 0;
      timer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const level = loudness(samples);
        tell(baseline > 0 && isLoud(level, baseline));
        baseline = nextBaseline(baseline, level);
      }, WAKE_STEP_MS);
    };

    void md
      .getUserMedia(
        by === "camera"
          ? { video: { facingMode: "user", width: 160, height: 120 }, audio: false }
          : { audio: true, video: false },
      )
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (by === "camera") watch(s);
        else listen(s);
      })
      .catch(() => {});

    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      void audio?.close().catch(() => {});
    };
  }, [by, active]);
}
