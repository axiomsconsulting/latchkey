import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DoorOpen, Footprints, Map as MapIcon, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { SaveButton, changed } from "@/components/host/SaveButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { common, guideExtrasAdminCopy as copy } from "@/content/copy";
import { directionsTo, levelName, type Facing, type Pins } from "@/lib/floor-plans";
import {
  deleteFloorPlan,
  getFloorPlans,
  saveFloorPins,
  saveFloorPlan,
} from "@/lib/guest-extras.functions";
import { shrinkPhoto } from "@/lib/photo-file";
import { cn } from "@/lib/utils";

const LEVELS = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8];

/** Stay guides → Floor plans (floor-plans.ts): a plan per floor, marked with the entrance, stairs, lift and rooms. */
export function FloorPlansEditor({ propertyId }: { propertyId: string }) {
  const getFn = useServerFn(getFloorPlans);
  const saveFn = useServerFn(saveFloorPlan);
  const delFn = useServerFn(deleteFloorPlan);
  const qc = useQueryClient();
  const key = ["floor-plans", propertyId];
  const q = useQuery({ queryKey: key, queryFn: () => getFn({ data: { propertyId } }) });
  const [busy, setBusy] = useState(false);
  const [newLevel, setNewLevel] = useState(0);
  if (q.isLoading || !q.data) return <Skeleton className="h-32 rounded-2xl" />;
  const d = q.data;
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: key }),
      qc.invalidateQueries({ queryKey: ["guide-extras"] }),
    ]);

  async function addFloor(file: File) {
    setBusy(true);
    try {
      await saveFn({
        data: {
          propertyId,
          id: null,
          level: newLevel,
          label: null,
          dataUrl: await shrinkPhoto(file, 2400, 0.85),
        },
      });
      await refresh();
      toast.success(copy.plansSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-4 p-5" data-tour="floor-plans">
      <div>
        <h2 className="flex items-center gap-2 text-lg">
          <MapIcon className="size-5 text-primary" /> {copy.plansTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{copy.plansBody}</p>
      </div>
      {d.available
        ? d.plans.map((plan) => (
            <FloorCard
              key={plan.id}
              propertyId={propertyId}
              plan={plan}
              plans={d.plans}
              rooms={d.rooms}
              onChanged={refresh}
              onDelete={async () => {
                await delFn({ data: { propertyId, id: plan.id } });
                await refresh();
              }}
            />
          ))
        : null}
      {d.available ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label>{copy.level}</Label>
            <Select value={String(newLevel)} onValueChange={(v) => setNewLevel(Number(v))}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => (
                  <SelectItem key={l} value={String(l)}>
                    {copy.levels[String(l)] ?? levelName(l)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label
            className={cn(
              "inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted",
              busy && "pointer-events-none opacity-60",
            )}
          >
            <Plus className="size-4" />
            {copy.addPlan}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void addFloor(f);
              }}
            />
          </label>
        </div>
      ) : null}
    </section>
  );
}

type Plan = { id: string; level: number; label: string | null; pins: Pins; url: string | null };
type Target = "entrance" | "stairs" | "lift" | string;

function FloorCard({
  propertyId,
  plan,
  plans,
  rooms,
  onChanged,
  onDelete,
}: {
  propertyId: string;
  plan: Plan;
  plans: Plan[];
  rooms: Array<{ id: string; name: string }>;
  onChanged: () => Promise<unknown>;
  onDelete: () => Promise<void>;
}) {
  const pinsFn = useServerFn(saveFloorPins);
  const saveFn = useServerFn(saveFloorPlan);
  const [pins, setPins] = useState<Pins>(plan.pins);
  const [target, setTarget] = useState<Target>("entrance");
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState(plan.level);
  const [label, setLabel] = useState(plan.label ?? "");
  useEffect(() => {
    setPins(plan.pins);
    setLevel(plan.level);
    setLabel(plan.label ?? "");
  }, [plan]);
  const dirty =
    changed(pins, plan.pins) || level !== plan.level || (label || null) !== (plan.label || null);

  async function save() {
    setBusy(true);
    try {
      if (level !== plan.level || (label || null) !== (plan.label || null))
        await saveFn({
          data: { propertyId, id: plan.id, level, label: label || null, dataUrl: null },
        });
      await pinsFn({ data: { propertyId, id: plan.id, pins: pins as never } });
      await onChanged();
      toast.success(copy.plansSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  function place(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const at = {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
    if (target === "entrance")
      setPins((p) => ({ ...p, entrance: { ...at, facing: p.entrance?.facing ?? "up" } }));
    else if (target === "stairs") setPins((p) => ({ ...p, stairs: at }));
    else if (target === "lift") setPins((p) => ({ ...p, lift: at }));
    else setPins((p) => ({ ...p, rooms: { ...p.rooms, [target]: at } }));
  }

  // Directions with this floor's marks as they are now (other floors as saved).
  const now = plans.map((p) => (p.id === plan.id ? { ...p, level, pins } : p));
  const sampleRoom = rooms.find((r) => r.id === target) ?? rooms.find((r) => pins.rooms[r.id]);
  const preview = sampleRoom ? directionsTo(now, sampleRoom.id, sampleRoom.name) : null;
  const dot = (x: number, y: number, cls: string, title: string) => (
    <span
      key={title}
      title={title}
      className={cn(
        "absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow",
        cls,
      )}
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    />
  );

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>{copy.level}</Label>
          <Select value={String(level)} onValueChange={(v) => setLevel(Number(v))}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l} value={String(l)}>
                  {copy.levels[String(l)] ?? levelName(l)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-40 flex-1 space-y-1">
          <Label>{copy.planName}</Label>
          <Input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <SaveButton dirty={dirty} busy={busy} onClick={() => void save()} />
        <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 text-sm hover:bg-muted">
          <Upload className="size-4" />
          {copy.replacePlan}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                await saveFn({
                  data: {
                    propertyId,
                    id: plan.id,
                    level,
                    label: label || null,
                    dataUrl: await shrinkPhoto(f, 2400, 0.85),
                  },
                });
                await onChanged();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : common.errorBody);
              }
            }}
          />
        </label>
        <Button
          size="icon"
          variant="ghost"
          aria-label={copy.deletePlan}
          onClick={() => void onDelete()}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">{copy.mark}</p>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["entrance", copy.entrance, !!pins.entrance],
              ["stairs", copy.stairs, !!pins.stairs],
              ["lift", copy.lift, !!pins.lift],
              ...rooms.map((r) => [r.id, r.name, !!pins.rooms[r.id]] as const),
            ] as Array<readonly [string, string, boolean]>
          ).map(([k, name, done]) => (
            <Button
              key={k}
              size="sm"
              variant={target === k ? "default" : "outline"}
              onClick={() => setTarget(k)}
              className={cn(!done && target !== k && "text-muted-foreground")}
            >
              {name}
              {done ? " ✓" : ""}
            </Button>
          ))}
        </div>
        {target === "entrance" && pins.entrance ? (
          <div className="flex items-center gap-2 text-sm">
            <DoorOpen className="size-4" aria-hidden />
            {copy.facing}
            <Select
              value={pins.entrance.facing}
              onValueChange={(v) =>
                setPins((p) =>
                  p.entrance ? { ...p, entrance: { ...p.entrance, facing: v as Facing } } : p,
                )
              }
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["up", "down", "left", "right"] as const).map((f) => (
                  <SelectItem key={f} value={f}>
                    {copy.facings[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {plan.url ? (
        <div
          className="relative cursor-crosshair overflow-hidden rounded-xl border border-border bg-white"
          onClick={place}
        >
          <img
            src={plan.url}
            alt={levelName(level)}
            className="block w-full select-none"
            draggable={false}
          />
          {pins.entrance
            ? dot(pins.entrance.x, pins.entrance.y, "bg-emerald-600", copy.entrance)
            : null}
          {pins.stairs ? dot(pins.stairs.x, pins.stairs.y, "bg-amber-500", copy.stairs) : null}
          {pins.lift ? dot(pins.lift.x, pins.lift.y, "bg-sky-600", copy.lift) : null}
          {Object.entries(pins.rooms).map(([id, p]) =>
            dot(
              p.x,
              p.y,
              id === target ? "bg-primary ring-4 ring-primary/30" : "bg-primary",
              rooms.find((r) => r.id === id)?.name ?? id,
            ),
          )}
        </div>
      ) : null}

      <div className="rounded-xl bg-muted/60 p-3 text-sm">
        <p className="flex items-center gap-1.5 font-medium">
          <Footprints className="size-4" aria-hidden /> {copy.preview}
          {sampleRoom ? `: ${sampleRoom.name}` : ""}
        </p>
        {preview ? (
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            {preview.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground">{copy.noDirections}</p>
        )}
      </div>
    </div>
  );
}
