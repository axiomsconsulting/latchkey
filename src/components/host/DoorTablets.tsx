import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Bell,
  Camera,
  CameraOff,
  Eye,
  Info,
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
import {
  common,
  doorTabletsCopy as copy,
  kioskPreviewCopy as liveCopy,
  updateCopy,
} from "@/content/copy";
import { useLatestVersion } from "@/hooks/use-app-update";
import { newerVersion, type UpdateMode } from "@/lib/app-update";
import { UpdateChooser } from "@/components/host/UpdateChooser";
import { CameraShot, ScreenCaption, TabletScreen } from "@/components/host/TabletLive";
import { useCameraShots, useLiveScreens, type LiveScreens } from "@/hooks/use-tablet-live";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { requestTabletUpdate } from "@/lib/app-updates.functions";
import { gridFor, isOnline, tabletName } from "@/lib/kiosk-devices";
import {
  listKioskDevices,
  pairKioskByCode,
  removeKioskDevice,
  renameKioskDevice,
  setKioskAutoPair,
  setKioskCamera,
  setKioskCardPicker,
  setKioskCompat,
  type KioskDevice,
} from "@/lib/kiosk-devices.functions";
import { pingKiosk } from "@/lib/kiosk-ping";
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
  const [anyScreen, setAnyScreen] = useState(false);
  // Faster while a live view is showing, so it follows the tablet.
  const q = useDoorTablets(property.id, anyScreen ? 3_000 : 15_000);
  const pairFn = useServerFn(pairKioskByCode);
  const autoFn = useServerFn(setKioskAutoPair);
  const pickerFn = useServerFn(setKioskCardPicker);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  // Each tablet's card shows its details, or flips to its live view or camera until flipped back.
  const [faces, setFaces] = useState<Record<string, Face>>({});
  const devices: KioskDevice[] = q.data?.devices ?? [];
  const faceOf = (id: string): Face => faces[id] ?? "details";
  const setFace = (id: string, f: Face) => setFaces((m) => ({ ...m, [id]: f }));
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
  const confirmed = devices.filter((d) => d.status === "confirmed");
  const cameras = confirmed.filter((d) => d.cameraAllowed);
  const latest = useLatestVersion();
  const anyLive = confirmed.some((d) => faceOf(d.id) === "screen");
  useEffect(() => setAnyScreen(anyLive), [anyLive]);
  const live = useLiveScreens(property, anyLive);
  const shots = useCameraShots(
    property,
    cameras.filter((d) => faceOf(d.id) === "camera").map((d) => d.id),
  );
  // "All" flips every tablet that can show it (and back again when they all already do).
  const allLive = confirmed.length > 0 && confirmed.every((d) => faceOf(d.id) === "screen");
  const allCameras = cameras.length > 0 && cameras.every((d) => faceOf(d.id) === "camera");
  const flipAll = (f: Face, list: KioskDevice[], already: boolean) =>
    setFaces((m) => ({
      ...m,
      ...Object.fromEntries(list.map((d) => [d.id, already ? "details" : f])),
    }));
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
        {confirmed.length ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={allLive ? "default" : "outline"}
              onClick={() => flipAll("screen", confirmed, allLive)}
            >
              <Eye className="size-4" /> {allLive ? liveCopy.backAll : liveCopy.open}
            </Button>
            {cameras.length ? (
              <Button
                size="sm"
                variant={allCameras ? "default" : "outline"}
                onClick={() => flipAll("camera", cameras, allCameras)}
              >
                <Video className="size-4" /> {allCameras ? liveCopy.backAll : liveCopy.cameras}
              </Button>
            ) : null}
          </div>
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

          <label className="mt-3 flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
            <Switch
              checked={q.data?.cardPicker ?? true}
              disabled={!q.data?.compatAvailable}
              onCheckedChange={(on) =>
                void pickerFn({ data: { propertyId: property.id, on } })
                  .then(async (res) => {
                    await pingKiosk(res.code);
                    await refresh();
                  })
                  .catch((err) =>
                    toast.error(err instanceof Error ? err.message : common.errorBody),
                  )
              }
            />
            <span>
              <span className="flex items-center gap-1.5 font-medium">
                <Bell className="size-4" aria-hidden /> {copy.cardPicker}
              </span>
              <span className="text-muted-foreground">{copy.cardPickerHelp}</span>
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
                  face={faceOf(d.id)}
                  onFace={(f) => setFace(d.id, f)}
                  live={live.data}
                  shot={shots[d.id]}
                />
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-muted p-3 text-sm">{copy.none}</p>
          )}
        </>
      )}
    </section>
  );
}

type Face = "details" | "screen" | "camera";

/**
 * One tablet: its details on the front; its live view or camera on the back
 * (the eye or camera icon flips it, the back arrow flips it back), with
 * Expand for a bigger look.
 */
function TabletCard({
  device: d,
  property,
  onChanged,
  latest,
  face,
  onFace,
  live,
  shot,
}: {
  latest: string | null;
  device: KioskDevice;
  property: Property;
  onChanged: () => void;
  face: Face;
  onFace: (f: Face) => void;
  live: LiveScreens | undefined;
  shot: { image: string; takenAt: string } | undefined;
}) {
  const renameFn = useServerFn(renameKioskDevice);
  const removeFn = useServerFn(removeKioskDevice);
  const cameraFn = useServerFn(setKioskCamera);
  const compatFn = useServerFn(setKioskCompat);
  const [label, setLabel] = useState(d.label ?? "");
  const [askCamera, setAskCamera] = useState(false);
  const [told, setTold] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const online = isOnline(d.lastSeenAt, Date.now());
  const pending = d.status === "pending";
  const flipped = face !== "details" && !pending;

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

  async function compat(on: boolean | null) {
    try {
      const res = await compatFn({ data: { deviceId: d.id, on } });
      await pingKiosk(res.code);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    }
  }

  // Number, name, on or not, version: the same at the top of both sides.
  const title = (
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary font-display text-lg text-primary-foreground">
        {d.number ?? "?"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{tabletName(d)}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn("size-2 rounded-full", online ? "bg-success" : "bg-muted-foreground/40")}
            aria-hidden
          />
          {pending ? copy.waiting : online ? copy.online : ago(d.lastSeenAt)}
          {d.appVersion ? ` · v${d.appVersion}` : ""}
        </p>
        {d.appVersion && latest && newerVersion(latest, d.appVersion) ? (
          <p className="text-xs text-accent">{updateCopy.outOfDate(latest)}</p>
        ) : null}
      </div>
      {flipped ? (
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label={liveCopy.expand}
            title={liveCopy.expand}
            onClick={() => setExpanded(true)}
          >
            <Maximize2 className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label={liveCopy.back}
            title={liveCopy.back}
            onClick={() => onFace("details")}
          >
            <ArrowLeft className="size-4" />
          </Button>
        </div>
      ) : !pending ? (
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label={liveCopy.liveView}
            title={liveCopy.liveView}
            onClick={() => onFace("screen")}
          >
            <Eye className="size-4" />
          </Button>
          {d.cameraAllowed ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label={liveCopy.cameraView}
              title={liveCopy.cameraView}
              onClick={() => onFace("camera")}
            >
              <Video className="size-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const back =
    face === "camera" ? (
      <CameraShot device={d} shot={shot} />
    ) : (
      <div className="space-y-1">
        <TabletScreen device={d} live={live} code={property.short_code} />
        <ScreenCaption device={d} />
      </div>
    );

  return (
    // Both sides share one grid cell, so the card is as tall as the taller side while it turns.
    <div className="[perspective:1600px]">
      <div
        className={cn(
          "grid transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none",
          flipped && "[transform:rotateY(180deg)]",
        )}
      >
        <div
          aria-hidden={flipped}
          className={cn(
            "space-y-3 rounded-2xl border-2 bg-card p-4 [backface-visibility:hidden] [grid-area:1/1]",
            pending ? "border-dashed border-accent" : "border-border",
            flipped && "pointer-events-none",
          )}
        >
          {title}
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
                  {d.cameraAllowed ? (
                    <Camera className="size-4" />
                  ) : (
                    <CameraOff className="size-4" />
                  )}
                  {copy.camera}
                </span>
                <Switch
                  checked={d.cameraAllowed}
                  onCheckedChange={(on) => (on ? setAskCamera(true) : void camera(false))}
                />
              </label>
            </>
          )}
          {/* Older tablets: ticked by itself when the tablet needs it. What it means is in the info button, not repeated on every tablet. */}
          <div className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox checked={d.compat} onCheckedChange={(v) => void compat(v === true)} />
              <span className="font-medium">{copy.compatShort}</span>
            </label>
            {d.compatDetected ? (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">
                {copy.compatDetectedTag}
              </span>
            ) : null}
            <CompatInfo
              device={d}
              onReset={d.compatChosen !== null ? () => void compat(null) : null}
            />
          </div>
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
        </div>

        {/* The back: live view or camera, until the back arrow. */}
        <div
          aria-hidden={!flipped}
          className={cn(
            "space-y-3 rounded-2xl border-2 border-primary bg-card p-4 [backface-visibility:hidden] [grid-area:1/1] [transform:rotateY(180deg)]",
            !flipped && "pointer-events-none",
          )}
        >
          {title}
          {flipped ? back : null}
        </div>
      </div>

      <Dialog open={expanded && flipped} onOpenChange={setExpanded}>
        <DialogContent className="max-h-[94dvh] w-[min(96vw,72rem)] max-w-none overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {d.number}. {tabletName(d)} ·{" "}
              {face === "camera" ? liveCopy.cameraView : liveCopy.liveView}
            </DialogTitle>
            <DialogDescription>{liveCopy.body}</DialogDescription>
          </DialogHeader>
          {back}
        </DialogContent>
      </Dialog>

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

/** What compatibility mode is, and what this tablet detected: tap the info icon (said once, not on every card). */
function CompatInfo({ device: d, onReset }: { device: KioskDevice; onReset: (() => void) | null }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={copy.compatInfo}
          title={copy.compatInfo}
          className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Info className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2 text-sm">
        <p className="font-medium">{copy.compat}</p>
        <p className="text-muted-foreground">{copy.compatHelp}</p>
        {d.compatDetected ? (
          <p className="font-medium text-accent">
            {d.compat
              ? copy.compatDetected(d.compatReason ?? "")
              : copy.compatDetectedOff(d.compatReason ?? "")}
          </p>
        ) : null}
        {onReset ? (
          <button
            type="button"
            className="text-xs text-primary underline-offset-2 hover:underline"
            onClick={onReset}
          >
            {copy.compatReset}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
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
  const shots = useCameraShots(
    property,
    devices.map((d) => d.id),
  );
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
          {devices.map((d) => (
            <div key={d.id} className="space-y-1">
              <p className="text-sm font-medium">
                {d.number}. {tabletName(d)}
              </p>
              <CameraShot device={d} shot={shots[d.id]} />
            </div>
          ))}
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

/** Update this property's tablets: now, when not in use, or at a set time. */
function TabletUpdates({ property }: { property: Property }) {
  const fn = useServerFn(requestTabletUpdate);
  const [busy, setBusy] = useState(false);
  async function ask(mode: UpdateMode, at: string | null) {
    setBusy(true);
    try {
      const res = await fn({
        data: { propertyId: property.id, mode, ...(at ? { at } : {}) },
      });
      if (res.code) await pingKiosk(res.code);
      toast.success(
        at
          ? updateCopy.tabletsScheduled
          : mode === "now"
            ? updateCopy.tabletsNowDone
            : updateCopy.tabletsAsked,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 space-y-2 rounded-xl border border-border p-3 text-sm">
      <p className="font-medium">{updateCopy.tabletsTitle}</p>
      <UpdateChooser busy={busy} onChoose={(mode, at) => void ask(mode, at)} />
    </div>
  );
}
