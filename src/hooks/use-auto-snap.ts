import { useEffect, useRef, useState, type RefObject } from "react";

import {
  AGAIN_AFTER_MS,
  HOLD_MS,
  SCAN_WIDTH,
  centreOf,
  faceFits,
  holdStep,
  lookForId,
  toGrey,
  type Hold,
  type Point,
} from "@/lib/auto-snap";

export type SnapShape = {
  /** Corners in the video's own pixels. */
  points: Point[];
  kind: "id" | "face";
  /** Good enough to take: drawn in the bright colour. */
  good: boolean;
};

export type SnapState = {
  shape: SnapShape | null;
  /** What to tell the guest. */
  say: "look" | "cut_off" | "small" | "blurry" | "dark" | "glare" | "hold";
};

type FaceDetector = {
  detectForVideo: (
    v: HTMLVideoElement,
    t: number,
  ) => {
    detections: Array<{
      boundingBox?: { originX: number; originY: number; width: number; height: number };
    }>;
  };
  close: () => void;
};

let faceModel: Promise<FaceDetector> | null = null;

/** One detector per page, from Latchkey's own files, only once a face step opens. */
function loadFaces(): Promise<FaceDetector> {
  faceModel ??= import("@mediapipe/tasks-vision").then(({ FaceDetector: Detector }) =>
    Detector.createFromOptions(
      {
        wasmLoaderPath: "/vision/vision_wasm_internal.js",
        wasmBinaryPath: "/vision/vision_wasm_internal.wasm",
      },
      {
        baseOptions: { modelAssetPath: "/vision/blaze_face_short_range.tflite", delegate: "CPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.6,
      },
    ),
  ) as unknown as Promise<FaceDetector>;
  faceModel.catch(() => {
    faceModel = null;
  });
  return faceModel;
}

/**
 * Door tablets only: watches the preview for a whole readable ID or a face, outlines
 * it, and takes the photo once it's held still. Everything runs on the tablet and
 * nothing is kept or sent. If a face can't be looked for here, it does nothing and
 * the guest uses the button.
 */
export function useAutoSnap(
  video: RefObject<HTMLVideoElement | null>,
  kind: "id" | "face",
  on: boolean,
  onSnap: () => void,
): SnapState {
  const [state, setState] = useState<SnapState>({ shape: null, say: "look" });
  const latest = useRef(onSnap);
  latest.current = onSnap;

  useEffect(() => {
    if (!on) {
      setState({ shape: null, say: "look" });
      return;
    }
    let stopped = false;
    let hold: Hold = null;
    // A moment to settle when it opens, and to move away after a photo that didn't work.
    const startAt =
      Date.now() + (kind === "id" ? 1200 : 600) + (again.current ? AGAIN_AFTER_MS : 0);
    again.current = true;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let faces: FaceDetector | null = null;
    if (kind === "face") {
      void loadFaces()
        .then((d) => {
          if (!stopped) faces = d;
        })
        .catch(() => {});
    }

    const tick = () => {
      const v = video.current;
      if (stopped || !v || v.readyState < 2 || !v.videoWidth) return;
      const now = Date.now();
      let seen: ReturnType<typeof centreOf> | null = null;
      let shape: SnapShape | null = null;
      let say: SnapState["say"] = "look";
      if (kind === "id") {
        if (!ctx) return;
        const scale = SCAN_WIDTH / v.videoWidth;
        canvas.width = SCAN_WIDTH;
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const pic = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const look = lookForId(
          toGrey(pic.data, canvas.width, canvas.height),
          canvas.width,
          canvas.height,
        );
        const corners = look.corners;
        if (corners) {
          shape = {
            kind,
            good: look.ok,
            points: corners.map((p) => ({ x: p.x / scale, y: p.y / scale })),
          };
        }
        if (look.ok) seen = centreOf(look.corners, canvas.width, canvas.height);
        else if (look.reason !== "none") say = look.reason;
      } else {
        if (!faces) return;
        const found = faces.detectForVideo(v, performance.now()).detections;
        const box = found
          .map((d) => d.boundingBox)
          .filter((b): b is NonNullable<typeof b> => !!b)
          .sort((a, b) => b.width - a.width)[0];
        if (box) {
          const b = { x: box.originX, y: box.originY, width: box.width, height: box.height };
          const good = faceFits(b, v.videoWidth, v.videoHeight);
          const points = [
            { x: b.x, y: b.y },
            { x: b.x + b.width, y: b.y },
            { x: b.x + b.width, y: b.y + b.height },
            { x: b.x, y: b.y + b.height },
          ];
          shape = { kind, good, points };
          if (good) seen = centreOf(points, v.videoWidth, v.videoHeight);
          else say = "cut_off";
        }
      }
      const step = holdStep(hold, seen, now, HOLD_MS[kind]);
      hold = step.hold;
      if (seen) say = "hold";
      setState({ shape, say });
      if (step.fire && now >= startAt) {
        stopped = true;
        latest.current();
      }
    };
    const id = window.setInterval(tick, 200);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, kind]);
  // Whether a photo has already been tried here.
  const again = useRef(false);
  return state;
}
