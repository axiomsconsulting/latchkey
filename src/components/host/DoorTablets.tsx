import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Camera,
  CameraOff,
  KeyRound,
  Loader2,
  Maximize2,
  MonitorSmartphone,
  RefreshCw,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { common, doorTabletsCopy as copy, updateCopy } from "@/content/copy";
import { useLatestVersion } from "@/hooks/use-app-update";
import { newerVersion } from "@/lib/app-update";
import { requestTabletUpdate } from "@/lib/app-updates.functions";
import { gridFor, isOnline, tabletName } from "@/lib/kiosk-devices";
import {
  listKioskDevices,
  pairKioskByCode,
  removeKioskDevice,
  renameKioskDevice,
  setKioskAutoPair,
  setKioskCamera,
  stopWatchingKiosks,
  watchKiosks,
  type KioskDevice,
} from "@/lib/kiosk-devices.functions";
import { kioskPinger, pingKiosk } from "@/lib/kiosk-ping";
import { cn } from "@/lib/utils";

type Property = { id: string; short_code: string };

/** This property's tablets, shared by the Settings card, Today's strip and the welcome panel. */
export function useDoorTablets(propertyId: string, refetch = 15_000) {
  const listFn = useServerFn(listKioskDevices);
  return useQuery({
    queryKey: ["kiosk-devices", propertyId],
    queryFn: () => listFn({ data: { propertyId } }),
    refetchInterval: refetch,
    enabled: !!propertyId,
  });
}

function ago(iso: string | null): string {
  if (!iso) return copy.never;
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? copy.justNow : m < 60 ? copy.minutesAgo(m) : copy.hoursAgo(Math.round(m / 60));
}

/**
 * Settings → Look → Door tablets: every tablet at the property by number,
 * laid out in a grid; pair a waiting one with the code it shows, name
 * them, switch on the camera view (guests must be told), calibrate and
 * remove. Tablets on the property's Wi-Fi (or close by) join by themselves
 * when that's switched on.
 */
export function DoorTablets({ property }: { property: Property }) {
  const qc = useQueryClient();
  const q = useDoorTablets(property.id);
  const pairFn = useServerFn(pairKioskByCode);
  const autoFn = useServerFn(setKioskAutoPair);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [wall, setWall] = useState(false);
  const devices: KioskDevice[] = q.data?.devices ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["kiosk-devices", property.id] });

  async function pair(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await pairFn({ data: { propertyId: property.id, pairCode: code } });
      await pingKiosk(res.code);
      setCode("");
      toast.success(copy.paired(res.number));
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  const grid = gridFor(devices.length);
  const cameras = devices.filter((d) => d.status === "confirmed" && d.cameraAllowed);
  const latest = useLatestVersion();
  return (
    <section className="card-soft p-5" data-tour="door-tablets">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <MonitorSmartphone className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        {cameras.length ? (
          <Button variant="outline" onClick={() => setWall(true)}>
            <Video className="size-4" /> {copy.viewCameras(cameras.length)}
          </Button>
        ) : null}
      </div>

      {q.data && !q.data.available ? (
        <p className="mt-4 text-sm text-muted-foreground">{copy.unavailable}</p>
      ) : (
        <>
          <form onSubmit={pair} className="mt-4 flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-sm">
              <span className="block font-medium">{copy.pairTitle}</span>
              <Input
                inputMode="numeric"
                autoComplete="off"
                placeholder="482 913"
                className="h-11 w-40 text-center font-mono text-lg tracking-widest"
                value={code}
                maxLength={9}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <Button
              type="submit"
              className="h-11"
              disabled={busy || code.replace(/\D/g, "").length !== 6}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              {copy.pair}
            </Button>
            <p className="basis-full text-xs text-muted-foreground">{copy.pairHelp}</p>
          </form>

          <label className="mt-4 flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
            <Switch
              checked={q.data?.autoPair ?? true}
              onCheckedChange={(on) =>
                void autoFn({ data: { propertyId: property.id, on } })
                  .then(refresh)
                  .catch(() => toast.error(common.errorBody))
              }
            />
            <span>
              <span className="block font-medium">{copy.autoPair}</span>
              <span className="text-muted-foreground">{copy.autoPairHelp}</span>
            </span>
          </label>

          {devices.some((d) => d.status === "confirmed") ? (
            <TabletUpdates property={property} />
          ) : null}

          {devices.length ? (
            <div
              className="mt-4 grid gap-3"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${grid.cols > 2 ? 15 : 18}rem), 1fr))`,
              }}
            >
              {devices.map((d) => (
                <TabletCard
                  key={d.id}
                  latest={latest}
                  device={d}
                  property={property}
                  onChanged={() => void refresh()}
                />
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-muted p-3 text-sm">{copy.none}</p>
          )}
        </>
      )}
      {wall ? (
        <CameraWall property={property} devices={cameras} onClose={() => setWall(false)} />
      ) : null}
    </section>
  );
}

function TabletCard({
  device: d,
  property,
  onChanged,
  latest,
}: {
  latest: string | null;
  device: KioskDevice;
  property: Property;
  onChanged: () => void;
}) {
  const renameFn = useServerFn(renameKioskDevice);
  const removeFn = useServerFn(removeKioskDevice);
  const cameraFn = useServerFn(setKioskCamera);
  const [label, setLabel] = useState(d.label ?? "");
  const [askCamera, setAskCamera] = useState(false);
  const [told, setTold] = useState(false);
  const online = isOnline(d.lastSeenAt, Date.now());
  const pending = d.status === "pending";

  async function camera(allowed: boolean) {
    try {
      const res = await cameraFn({ data: { deviceId: d.id, allowed, guestsTold: told } });
      await pingKiosk(res.code);
      setAskCamera(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    }
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-2xl border-2 p-4",
        pending ? "border-dashed border-accent" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary font-display text-lg text-primary-foreground">
          {d.number ?? "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{tabletName(d)}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={cn(
                "size-2 rounded-full",
                online ? "bg-success" : "bg-muted-foreground/40",
              )}
              aria-hidden
            />
            {pending ? copy.waiting : online ? copy.online : ago(d.lastSeenAt)}
            {d.appVersion ? ` · v${d.appVersion}` : ""}
          </p>
          {d.appVersion && latest && newerVersion(latest, d.appVersion) ? (
            <p className="text-xs text-accent">{updateCopy.outOfDate(latest)}</p>
          ) : null}
        </div>
      </div>
      {pending ? (
        <p className="text-sm">{copy.waitingHelp}</p>
      ) : (
        <>
          <Input
            className="h-10"
            value={label}
            maxLength={40}
            placeholder={copy.namePlaceholder}
            aria-label={copy.name}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => {
              if (label === (d.label ?? "")) return;
              void renameFn({ data: { deviceId: d.id, label } })
                .then(async () => {
                  await pingKiosk(property.short_code);
                  onChanged();
                })
                .catch(() => toast.error(common.errorBody));
            }}
          />
          {d.display ? (
            <p className="text-xs text-muted-foreground">
              {copy.screen(
                d.display.usedW || d.display.w,
                d.display.usedH || d.display.h,
                d.display.orientation,
              )}
            </p>
          ) : null}
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              {d.cameraAllowed ? <Camera className="size-4" /> : <CameraOff className="size-4" />}
              {copy.camera}
            </span>
            <Switch
              checked={d.cameraAllowed}
              onCheckedChange={(on) => (on ? setAskCamera(true) : void camera(false))}
            />
          </label>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {!pending ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/app/settings" search={{ focus: "kioskScreen" }}>
              <Maximize2 className="size-4" /> {copy.calibrate}
            </Link>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => {
            if (!window.confirm(copy.removeConfirm(tabletName(d)))) return;
            void removeFn({ data: { deviceId: d.id } })
              .then(async (res) => {
                await pingKiosk(res.code);
                onChanged();
              })
              .catch(() => toast.error(common.errorBody));
          }}
        >
          <Trash2 className="size-4" /> {copy.remove}
        </Button>
      </div>

      <Dialog open={askCamera} onOpenChange={setAskCamera}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.cameraTitle}</DialogTitle>
            <DialogDescription>{copy.cameraBody}</DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={told}
              onCheckedChange={(v) => setTold(v === true)}
            />
            {copy.cameraTold}
          </label>
          <Button disabled={!told} onClick={() => void camera(true)}>
            {copy.cameraOn}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * The cameras of the tablets the host switched it on for, as a grid, a new
 * picture every few seconds. Each tablet says on screen that it's being
 * viewed; when this closes they stop and the pictures are deleted.
 */
export function CameraWall({
  property,
  devices,
  onClose,
}: {
  property: Property;
  devices: KioskDevice[];
  onClose: () => void;
}) {
  const watchFn = useServerFn(watchKiosks);
  const stopFn = useServerFn(stopWatchingKiosks);
  const [shots, setShots] = useState<Record<string, { image: string; takenAt: string }>>({});
  const ids = devices.map((d) => d.id).join(",");
  const pinger = useRef<ReturnType<typeof kioskPinger> | null>(null);
  useEffect(() => {
    pinger.current = kioskPinger(property.short_code);
    let live = true;
    let first = true;
    const tick = async () => {
      const res = await watchFn({
        data: { propertyId: property.id, deviceIds: ids ? ids.split(",") : [] },
      }).catch(() => null);
      if (!live) return;
      // The tablets learn they're being watched from a ping, then send pictures.
      if (first) {
        pinger.current?.send();
        first = false;
      }
      if (res) setShots(Object.fromEntries(res.shots.map((x) => [x.deviceId, x])));
    };
    void tick();
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      live = false;
      window.clearInterval(id);
      pinger.current?.close();
      void stopFn({ data: { propertyId: property.id } }).catch(() => {});
    };
  }, [ids, property.id, property.short_code, watchFn, stopFn]);
  const grid = gridFor(devices.length);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[94dvh] w-[min(96vw,80rem)] max-w-none overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copy.wallTitle}</DialogTitle>
          <DialogDescription>{copy.wallBody}</DialogDescription>
        </DialogHeader>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${Math.min(grid.cols, 4)}, minmax(0, 1fr))` }}
        >
          {devices.map((d) => {
            const shot = shots[d.id];
            return (
              <figure key={d.id} className="overflow-hidden rounded-xl bg-black">
                {shot ? (
                  <img
                    src={shot.image}
                    alt={copy.wallAlt(tabletName(d))}
                    className="aspect-[4/3] w-full object-cover"
                  />
                ) : (
                  <div className="grid aspect-[4/3] w-full place-items-center text-sm text-white/70">
                    <Loader2 className="size-5 animate-spin" />
                  </div>
                )}
                <figcaption className="flex items-center justify-between px-3 py-2 text-xs text-white/80">
                  <span>
                    {d.number}. {tabletName(d)}
                  </span>
                  <span>{shot ? ago(shot.takenAt) : copy.connecting}</span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Today's kiosk card: each tablet as a chip (number, name, on or not), and the cameras. */
export function TabletStrip({ property }: { property: Property }) {
  const q = useDoorTablets(property.id, 30_000);
  const [wall, setWall] = useState(false);
  const devices: KioskDevice[] = q.data?.devices ?? [];
  if (!devices.length) return null;
  const cameras = devices.filter((d) => d.status === "confirmed" && d.cameraAllowed);
  const now = Date.now();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {devices.map((d) => (
        <Link
          key={d.id}
          to="/app/settings"
          search={{ focus: "kioskTablets" }}
          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs"
        >
          <span
            className={cn(
              "size-2 rounded-full",
              d.status === "pending"
                ? "bg-accent"
                : isOnline(d.lastSeenAt, now)
                  ? "bg-success"
                  : "bg-muted-foreground/40",
            )}
            aria-hidden
          />
          {d.number}. {tabletName(d)}
          {d.status === "pending" ? ` · ${copy.waitingShort}` : ""}
        </Link>
      ))}
      {cameras.length ? (
        <Button size="sm" variant="outline" onClick={() => setWall(true)}>
          <Video className="size-4" /> {copy.viewCameras(cameras.length)}
        </Button>
      ) : null}
      {wall ? (
        <CameraWall property={property} devices={cameras} onClose={() => setWall(false)} />
      ) : null}
    </div>
  );
}

/** Update this property's tablets: now (each reloads once idle) or at a set time. */
function TabletUpdates({ property }: { property: Property }) {
  const fn = useServerFn(requestTabletUpdate);
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);
  async function ask(when: string | null) {
    setBusy(true);
    try {
      const res = await fn({
        data: {
          propertyId: property.id,
          ...(when ? { at: new Date(when).toISOString() } : {}),
        },
      });
      if (res.code) await pingKiosk(res.code);
      toast.success(when ? updateCopy.tabletsScheduled : updateCopy.tabletsAsked);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 rounded-xl border border-border p-3 text-sm">
      <p className="font-medium">{updateCopy.tabletsTitle}</p>
      <p className="text-muted-foreground">{updateCopy.tabletsHelp}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void ask(null)}>
          <RefreshCw className="size-4" /> {updateCopy.tabletsNow}
        </Button>
        <Input
          type="datetime-local"
          className="h-9 w-auto"
          aria-label={updateCopy.at}
          value={at}
          onChange={(e) => setAt(e.target.value)}
        />
        <Button size="sm" variant="outline" disabled={busy || !at} onClick={() => void ask(at)}>
          {updateCopy.schedule}
        </Button>
      </div>
    </div>
  );
}
