import { useCallback, useEffect, useState } from "react";

export type CamPermission = "granted" | "denied" | "prompt" | "none";

/**
 * This browser's camera permission, kept up to date: granted, denied,
 * prompt (it would ask) or none (no camera at all); null where the browser
 * won't say. `ask` opens the camera once from a tap (the host's, on the
 * door tablet), so later remote viewing doesn't stop at a question nobody
 * answers.
 */
export function useCameraPermission(enabled: boolean) {
  const [state, setState] = useState<CamPermission | null>(null);
  const check = useCallback(async () => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) return setState("none");
    const devices = await md.enumerateDevices?.().catch(() => [] as MediaDeviceInfo[]);
    const cams = (devices ?? []).filter((d) => d.kind === "videoinput");
    if (devices && !cams.length) return setState("none");
    try {
      const p = await navigator.permissions?.query({ name: "camera" as PermissionName });
      if (p) {
        setState(p.state as CamPermission);
        p.onchange = () => setState(p.state as CamPermission);
        return;
      }
    } catch {
      // Not every browser can be asked (older Safari).
    }
    // Device names only show once the camera is allowed.
    setState(cams.some((c) => c.label) ? "granted" : null);
  }, []);
  useEffect(() => {
    if (enabled) void check();
  }, [enabled, check]);
  const ask = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      // Refused: the state below says so.
    }
    await check();
  }, [check]);
  return { state, ask };
}
