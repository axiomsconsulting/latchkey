import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { previewKioskScreens } from "@/lib/goodbye.functions";
import { startCameraLive, stopWatchingKiosks, watchKiosks } from "@/lib/kiosk-devices.functions";
import type { CameraState } from "@/lib/cam-p2p";
import { kioskPinger } from "@/lib/kiosk-ping";

type Property = { id: string; short_code: string };
export type LiveScreens = Awaited<ReturnType<typeof previewKioskScreens>>;

/** Every tablet's cards and welcome now, and the property's look (refreshed while shown). */
export function useLiveScreens(property: Property, on: boolean) {
  const fn = useServerFn(previewKioskScreens);
  return useQuery({
    queryKey: ["kiosk-preview", property.id],
    queryFn: () => fn({ data: { propertyId: property.id } }),
    refetchInterval: on ? 5_000 : false,
    enabled: on,
  });
}

/**
 * The cameras of these tablets while shown: a new picture every few seconds.
 * Each tablet says on screen that it's being viewed; when none are shown any
 * more they stop and the pictures are deleted.
 */
export function useCameraShots(property: Property, deviceIds: string[]) {
  const watchFn = useServerFn(watchKiosks);
  const stopFn = useServerFn(stopWatchingKiosks);
  const [shots, setShots] = useState<Record<string, { image: string; takenAt: string }>>({});
  const ids = [...deviceIds].sort().join(",");
  useEffect(() => {
    if (!ids) return;
    const pinger = kioskPinger(property.short_code);
    let live = true;
    let first = true;
    const tick = async () => {
      const res = await watchFn({
        data: { propertyId: property.id, deviceIds: ids.split(",") },
      }).catch(() => null);
      if (!live) return;
      // The tablets learn they're being watched from a ping, then send pictures.
      if (first) {
        pinger.send();
        first = false;
      }
      if (res) setShots(Object.fromEntries(res.shots.map((x) => [x.deviceId, x])));
    };
    void tick();
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      live = false;
      window.clearInterval(id);
      pinger.close();
      void stopFn({ data: { propertyId: property.id, deviceIds: ids.split(",") } }).catch(() => {});
    };
  }, [ids, property.id, property.short_code, watchFn, stopFn]);
  return shots;
}

/**
 * A tablet's live camera, straight from the tablet (cam-p2p.ts): asks
 * Latchkey for the private channel (and keeps the viewing going every 45
 * seconds), then receives the video directly. Stops, and tells the tablet,
 * when `on` turns false or the card goes. `switchCamera` flips to the
 * tablet's next camera (front, back, others).
 */
export function useCameraLive(property: Property, deviceId: string, on: boolean) {
  const startFn = useServerFn(startCameraLive);
  const stopFn = useServerFn(stopWatchingKiosks);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<CameraState | "error">("connecting");
  const [cams, setCams] = useState({ count: 1, index: 0 });
  const [error, setError] = useState<string | null>(null);
  const [control, setControl] = useState<{ switchCamera: () => void } | null>(null);
  useEffect(() => {
    if (!on) return;
    let gone = false;
    let session: { switchCamera: () => void; stop: () => void } | null = null;
    const pinger = kioskPinger(property.short_code);
    const keep = async () => {
      const res = await startFn({ data: { propertyId: property.id, deviceIds: [deviceId] } }).catch(
        (e: unknown) => {
          setError(e instanceof Error ? e.message : null);
          setState("error");
          return null;
        },
      );
      return res?.channels[0]?.channel ?? null;
    };
    void (async () => {
      const channel = await keep();
      if (gone || !channel) return;
      // The tablet learns it's being watched (and its channel) from this ping.
      pinger.send();
      const { watchTabletCamera } = await import("@/lib/cam-p2p");
      if (gone) return;
      session = watchTabletCamera(channel, {
        stream: setStream,
        state: setState,
        cams: (count, index) => setCams({ count, index }),
      });
      setControl({ switchCamera: session.switchCamera });
    })();
    const id = window.setInterval(() => void keep(), 45_000);
    return () => {
      gone = true;
      window.clearInterval(id);
      session?.stop();
      pinger.close();
      setStream(null);
      setControl(null);
      setState("connecting");
      void stopFn({ data: { propertyId: property.id, deviceIds: [deviceId] } }).catch(() => {});
    };
  }, [on, deviceId, property.id, property.short_code, startFn, stopFn]);
  return { stream, state, cams, error, switchCamera: () => control?.switchCamera() };
}
