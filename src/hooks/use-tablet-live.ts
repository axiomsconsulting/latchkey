import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { previewKioskScreens } from "@/lib/goodbye.functions";
import { stopWatchingKiosks, watchKiosks } from "@/lib/kiosk-devices.functions";
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
      void stopFn({ data: { propertyId: property.id } }).catch(() => {});
    };
  }, [ids, property.id, property.short_code, watchFn, stopFn]);
  return shots;
}
