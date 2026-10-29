import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Loader2,
  Maximize2,
  Minimize2,
  MonitorSmartphone,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { checkinSettings, common } from "@/content/copy";
import {
  areaFor,
  clampArea,
  moveEdge,
  scaleArea,
  shift,
  startArea,
  zoomBy,
  type Area,
  type Base,
  type Edge,
} from "@/lib/kiosk-calibration";
import {
  listKioskDevices,
  renameKioskDevice,
  saveKioskCalibration,
  type KioskDevice,
} from "@/lib/kiosk-devices.functions";
import { kioskPinger } from "@/lib/kiosk-ping";
import { tabletName } from "@/lib/kiosk-devices";
import { cn } from "@/lib/utils";

const copy = checkinSettings.calibration;

function ago(iso: string | null): string {
  if (!iso) return copy.never;
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  const when =
    m < 1
      ? "just now"
      : m < 60
        ? `${m} min ago`
        : m < 48 * 60
          ? `${Math.round(m / 60)} h ago`
          : new Date(iso).toLocaleDateString("en-GB");
  return copy.seen(when);
}

/**
 * Settings → Look → Door tablet screen: line up the kiosk on a paired
 * tablet like a projector, from the dashboard while looking at the tablet.
 * Drag the area to move it, its edges to resize it, pinch or scroll to
 * zoom; or use the buttons. Every change is saved after a moment and the
 * tablet is pinged, so it follows straight away (and shows its edges while
 * you work). Reset hands it back to learning its own screen.
 */
export function KioskCalibration({ property }: { property: { id: string; short_code: string } }) {
  const listFn = useServerFn(listKioskDevices);
  const q = useQuery({
    queryKey: ["kiosk-devices", property.id],
    queryFn: () => listFn({ data: { propertyId: property.id } }),
    // The tablet reports its screen a moment after it opens or turns.
    refetchInterval: 10_000,
  });
  // Only tablets that are paired (a waiting one has nothing to line up yet).
  const devices: KioskDevice[] = (q.data?.devices ?? []).filter(
    (d: KioskDevice) => d.status !== "pending",
  );
  const [picked, setPicked] = useState<string | null>(null);
  const device = devices.find((d) => d.id === picked) ?? devices[0] ?? null;

  return (
    <section className="card-soft p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <MonitorSmartphone className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
      </div>
      {q.data && !q.data.available ? (
        <p className="mt-4 text-sm text-muted-foreground">{checkinSettings.journey.unavailable}</p>
      ) : !devices.length ? (
        <p className="mt-4 rounded-xl bg-muted p-3 text-sm">
          {q.isLoading ? <Loader2 className="size-4 animate-spin" /> : copy.none}
        </p>
      ) : (
        <>
          {devices.length > 1 ? (
            <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label={copy.pick}>
              {devices.map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={device?.id === d.id}
                  onClick={() => setPicked(d.id)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left text-sm",
                    device?.id === d.id ? "border-primary bg-primary/10" : "border-border",
                  )}
                >
                  <span className="block font-medium">
                    {d.number ? `${d.number}. ` : ""}
                    {tabletName(d) || copy.unnamed(i + 1)}
                  </span>
                  <span className="block text-xs text-muted-foreground">{ago(d.lastSeenAt)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {device ? (
            <DeviceCalibration
              key={device.id}
              device={device}
              index={devices.indexOf(device)}
              code={property.short_code}
              onSaved={() => void q.refetch()}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

function DeviceCalibration({
  device,
  index,
  code,
  onSaved,
}: {
  device: KioskDevice;
  index: number;
  code: string;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(saveKioskCalibration);
  const renameFn = useServerFn(renameKioskDevice);
  const d = device.display;
  const orientation = d?.orientation ?? "landscape";
  // The display as the tablet learned it (largest page seen): what the area is drawn against.
  const base: Base | null = d ? { w: d.usedW || d.w, h: d.usedH || d.h } : null;
  const [area, setArea] = useState<Area | null>(() =>
    base ? (areaFor(device.calibration, orientation, base) ?? startArea(base)) : null,
  );
  const [fine, setFine] = useState(false);
  const [label, setLabel] = useState(device.label ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const calibrated = !!device.calibration[orientation];

  // Once the tablet first reports its screen (or turns), start from what it has.
  const key = base ? `${orientation}:${base.w}x${base.h}` : "";
  const lastKey = useRef(key);
  useEffect(() => {
    if (!base || key === lastKey.current) return;
    lastKey.current = key;
    setArea(areaFor(device.calibration, orientation, base) ?? startArea(base));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // One channel to the tablet while calibrating, so each change reaches it at once.
  const pinger = useRef<ReturnType<typeof kioskPinger> | null>(null);
  useEffect(() => {
    pinger.current = kioskPinger(code);
    return () => pinger.current?.close();
  }, [code]);

  // Saved a moment after the last change.
  const timer = useRef(0);
  const save = useCallback(
    (next: Area | null) => {
      if (!base) return;
      window.clearTimeout(timer.current);
      setState("saving");
      timer.current = window.setTimeout(() => {
        void saveFn({
          data: {
            deviceId: device.id,
            orientation,
            calibration: next ? { area: next, base } : null,
          },
        })
          .then(() => {
            pinger.current?.send();
            setState("saved");
            onSaved();
          })
          .catch((err: unknown) => {
            setState("idle");
            toast.error(err instanceof Error ? err.message : common.errorBody);
          });
      }, 250);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [device.id, orientation, base?.w, base?.h],
  );
  const change = (f: (a: Area, b: Base) => Area) => {
    if (!area || !base) return;
    const next = f(area, base);
    setArea(next);
    save(next);
  };

  if (!base || !area)
    return <p className="mt-4 rounded-xl bg-muted p-3 text-sm">{copy.noDisplay}</p>;

  const step = fine ? 1 : 10;
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">{copy.rename}</span>
          <Input
            className="h-10 w-48"
            value={label}
            placeholder={copy.renamePlaceholder}
            maxLength={40}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => {
              if (label === (device.label ?? "")) return;
              void renameFn({ data: { deviceId: device.id, label } })
                .then(onSaved)
                .catch(() => toast.error(common.errorBody));
            }}
          />
        </label>
        <p className="text-sm text-muted-foreground">
          {tabletName(device) || copy.unnamed(index + 1)} · {copy.wayUp[orientation]} ·{" "}
          {calibrated ? copy.calibrated : copy.learned} · {ago(device.lastSeenAt)}
        </p>
      </div>

      <ScreenPad base={base} area={area} step={step} onChange={change} />

      <p className="text-xs text-muted-foreground">{copy.drag}</p>
      <p className="text-sm tabular-nums">
        {copy.readout(area.w, area.h, area.x, area.y, area.zoom)}
        {state !== "idle" ? (
          <span className="text-muted-foreground">
            {" · "}
            {state === "saving" ? copy.saving : copy.savedAuto}
          </span>
        ) : null}
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <p className="text-sm font-medium">{copy.move}</p>
          <div className="grid w-fit grid-cols-3 gap-1">
            <span />
            <Button
              variant="outline"
              size="icon"
              aria-label={copy.up}
              onClick={() => change((a, b) => shift(a, b, 0, -step))}
            >
              <ArrowUp className="size-4" />
            </Button>
            <span />
            <Button
              variant="outline"
              size="icon"
              aria-label={copy.left}
              onClick={() => change((a, b) => shift(a, b, -step, 0))}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={copy.down}
              onClick={() => change((a, b) => shift(a, b, 0, step))}
            >
              <ArrowDown className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={copy.right}
              onClick={() => change((a, b) => shift(a, b, step, 0))}
            >
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{copy.size}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => change((a, b) => scaleArea(a, b, fine ? 0.995 : 0.98))}
            >
              <Minimize2 className="size-4" /> {copy.smaller}
            </Button>
            <Button
              variant="outline"
              onClick={() => change((a, b) => scaleArea(a, b, fine ? 1.005 : 1.02))}
            >
              <Maximize2 className="size-4" /> {copy.larger}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{copy.zoom}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => change((a, b) => zoomBy(a, b, fine ? 0.99 : 0.95))}
            >
              <ZoomOut className="size-4" /> {copy.zoomOut}
            </Button>
            <Button
              variant="outline"
              onClick={() => change((a, b) => zoomBy(a, b, fine ? 1.01 : 1.05))}
            >
              <ZoomIn className="size-4" /> {copy.zoomIn}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={fine} onCheckedChange={setFine} /> {copy.fine}
        </label>
        <Button
          variant="outline"
          onClick={() => {
            const fresh = startArea(base);
            setArea(fresh);
            save(null);
            toast.success(copy.resetDone);
          }}
        >
          <RotateCcw className="size-4" /> {copy.reset}
        </Button>
      </div>
    </div>
  );
}

type Drag =
  | { kind: "move"; x: number; y: number; start: Area }
  | { kind: "edge"; edge: Edge; x: number; y: number; start: Area }
  | { kind: "pinch"; dist: number; start: Area };

/**
 * The tablet's screen drawn small, with the area on it. One finger or the
 * mouse drags the area or an edge; two fingers pinch to zoom; the wheel
 * zooms; arrow keys move it.
 */
function ScreenPad({
  base,
  area,
  step,
  onChange,
}: {
  base: Base;
  area: Area;
  step: number;
  onChange: (f: (a: Area, b: Base) => Area) => void;
}) {
  const pad = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = pad.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // Screen px per drawn px, with a margin so an area larger than the screen still shows.
  const margin = 0.2;
  const k = width ? width / (base.w * (1 + margin * 2)) : 0;
  const ox = base.w * margin * k;
  const oy = base.h * margin * k;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<Drag | null>(null);
  const live = useRef(area);
  live.current = area;

  const down = (e: React.PointerEvent, kind: "move" | Edge) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      drag.current = { kind: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y), start: live.current };
      return;
    }
    drag.current =
      kind === "move"
        ? { kind: "move", x: e.clientX, y: e.clientY, start: live.current }
        : { kind: "edge", edge: kind, x: e.clientX, y: e.clientY, start: live.current };
  };
  const move = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !k) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = drag.current;
    if (!g) return;
    if (g.kind === "pinch") {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      if (g.dist > 0) onChange((_a, b) => zoomBy(g.start, b, dist / g.dist));
      return;
    }
    const dx = Math.round((e.clientX - g.x) / k);
    const dy = Math.round((e.clientY - g.y) / k);
    if (g.kind === "move") onChange((_a, b) => shift(g.start, b, dx, dy));
    else {
      const d = g.edge === "left" ? -dx : g.edge === "right" ? dx : g.edge === "top" ? -dy : dy;
      onChange((_a, b) => moveEdge(g.start, b, g.edge, d));
    }
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2 && drag.current?.kind === "pinch") drag.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };

  // Wheel zooms (passive listeners can't stop the page scrolling, so it's added by hand).
  useEffect(() => {
    const el = pad.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      onChange((a, b) => zoomBy(a, b, e.deltaY < 0 ? 1.02 : 1 / 1.02));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [onChange]);

  const r = clampArea(area, base);
  const edgeHandle = (edge: Edge, cls: string) => (
    <div
      role="presentation"
      onPointerDown={(e) => down(e, edge)}
      className={cn("absolute touch-none bg-accent/80", cls)}
    />
  );
  return (
    <div
      ref={pad}
      tabIndex={0}
      aria-label={copy.drag}
      onKeyDown={(e) => {
        const map: Record<string, [number, number]> = {
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
        };
        const m = map[e.key];
        if (!m) return;
        e.preventDefault();
        onChange((a, b) => shift(a, b, m[0], m[1]));
      }}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className="relative w-full touch-none select-none overflow-hidden rounded-2xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ height: k ? base.h * (1 + margin * 2) * k : 200 }}
    >
      {k ? (
        <>
          {/* The tablet's screen. */}
          <div
            className="absolute rounded-lg border-2 border-foreground/40 bg-background"
            style={{ left: ox, top: oy, width: base.w * k, height: base.h * k }}
          />
          {/* The area the kiosk uses, with its zoom shown as the size of the sample text. */}
          <div
            role="presentation"
            onPointerDown={(e) => down(e, "move")}
            className="absolute cursor-move touch-none rounded-md border-2 border-primary bg-primary/15"
            style={{ left: ox + r.x * k, top: oy + r.y * k, width: r.w * k, height: r.h * k }}
          >
            <span
              className="pointer-events-none absolute inset-0 grid place-items-center font-display text-primary"
              style={{ fontSize: `${Math.max(10, 16 * k * 4 * r.zoom)}px` }}
            >
              Aa
            </span>
            {edgeHandle("left", "-left-1.5 top-1/4 h-1/2 w-3 cursor-ew-resize rounded-full")}
            {edgeHandle("right", "-right-1.5 top-1/4 h-1/2 w-3 cursor-ew-resize rounded-full")}
            {edgeHandle("top", "-top-1.5 left-1/4 h-3 w-1/2 cursor-ns-resize rounded-full")}
            {edgeHandle("bottom", "-bottom-1.5 left-1/4 h-3 w-1/2 cursor-ns-resize rounded-full")}
          </div>
        </>
      ) : null}
    </div>
  );
}
