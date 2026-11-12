import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  DoorClosed,
  DoorOpen,
  Footprints,
  Heater,
  LogIn,
  Map as MapIcon,
  MousePointer2,
  Package,
  Pentagon,
  Plus,
  RectangleHorizontal,
  Slash,
  Sparkles,
  TrendingUp,
  Trash2,
  Undo2,
  Upload,
  X,
  ArrowUpDown,
  Ban,
  Blinds,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { FloorMapView } from "@/components/FloorMapView";
import { ITEM_ICON } from "@/components/floor-map-look";
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
import {
  AREA_KINDS,
  AREA_WORDS,
  ITEM_KINDS,
  ITEM_WORDS,
  areaAt,
  defaultAccess,
  edgeDist,
  floorTitle,
  houseNotes,
  houseText,
  levelName,
  markId,
  missingLevels,
  nextLevels,
  sortFloors,
  type Access,
  type Area,
  type AreaKind,
  type Facing,
  type Item,
  type ItemKind,
  type Line,
  type LineKind,
  type Point,
  type StairShape,
} from "@/lib/floor-map";
import { directionsTo, mapFloors, type Pins } from "@/lib/floor-plans";
import {
  deleteFloorPlan,
  getFloorPlans,
  readFloorPlanMap,
  saveFloorPins,
  saveFloorPlan,
} from "@/lib/guest-extras.functions";
import { shrinkPhoto } from "@/lib/photo-file";
import { cn } from "@/lib/utils";

type Plan = { id: string; level: number; label: string | null; pins: Pins; url: string | null };
type Room = { id: string; name: string };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const levelLabel = (l: number) => copy.levels[String(l)] ?? cap(levelName(l));

/**
 * Stay guides → Floor plans (floor-map.ts, floor-plans.ts): one tab per floor, in order (the main
 * house from its lowest level, then any separate building such as an annex), and an Add floor tab.
 */
export function FloorPlansEditor({ propertyId }: { propertyId: string }) {
  const getFn = useServerFn(getFloorPlans);
  const qc = useQueryClient();
  const key = ["floor-plans", propertyId];
  const q = useQuery({ queryKey: key, queryFn: () => getFn({ data: { propertyId } }) });
  const [tab, setTab] = useState<string | null>(null);
  const plans = useMemo(
    () =>
      sortFloors(
        ((q.data?.plans ?? []) as Plan[]).map((p) => ({ ...p, building: p.pins.building ?? "" })),
      ),
    [q.data],
  );
  useEffect(() => {
    if (!q.data) return;
    if (tab === "add") return;
    if (!tab || !plans.some((p) => p.id === tab)) setTab(plans[0]?.id ?? "add");
  }, [q.data, plans, tab]);
  if (q.isLoading || !q.data) return <Skeleton className="h-32 rounded-2xl" />;
  const d = q.data;
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: key }),
      qc.invalidateQueries({ queryKey: ["guide-extras"] }),
    ]);
  const active = plans.find((p) => p.id === tab) ?? null;

  // Gaps between a building's floors: stairs through them can't be followed.
  const buildings = [...new Set(plans.map((p) => p.building))];
  const gaps = buildings.flatMap((b) =>
    missingLevels(plans.filter((p) => p.building === b).map((p) => p.level)).map((l) =>
      floorTitle(b, l).toLowerCase(),
    ),
  );

  return (
    <section className="card-soft space-y-4 p-5" data-tour="floor-plans">
      <div>
        <h2 className="flex items-center gap-2 text-lg">
          <MapIcon className="size-5 text-primary" /> {copy.plansTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{copy.plansBody}</p>
      </div>
      {d.available ? (
        <>
          <div
            role="tablist"
            aria-label={copy.plansTitle}
            className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto border-b border-border px-1"
          >
            {plans.map((p) => (
              <TabButton key={p.id} on={tab === p.id} onClick={() => setTab(p.id)}>
                {floorTitle(p.building, p.level, p.label)}
              </TabButton>
            ))}
            <TabButton on={tab === "add"} onClick={() => setTab("add")}>
              <Plus className="size-4" aria-hidden /> {copy.addFloor}
            </TabButton>
          </div>
          {gaps.length ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              {copy.gap(gaps.join(", "))}
            </p>
          ) : null}
          {tab === "add" || !active ? (
            <AddFloor
              propertyId={propertyId}
              plans={plans}
              onAdded={async (id) => {
                await refresh();
                setTab(id);
              }}
            />
          ) : (
            <FloorMapEditor
              key={active.id}
              propertyId={propertyId}
              plan={active}
              plans={plans}
              rooms={d.rooms}
              onChanged={refresh}
              onDeleted={async () => {
                setTab(null);
                await refresh();
              }}
            />
          )}
        </>
      ) : null}
    </section>
  );
}

function TabButton({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cn(
        "-mb-px inline-flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm whitespace-nowrap",
        on
          ? "border-primary font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** The Add floor tab: which building, which level (the next one up or down), then the plan picture. */
function AddFloor({
  propertyId,
  plans,
  onAdded,
}: {
  propertyId: string;
  plans: Array<Plan & { building: string }>;
  onAdded: (id: string) => Promise<void>;
}) {
  const saveFn = useServerFn(saveFloorPlan);
  const pinsFn = useServerFn(saveFloorPins);
  const names = [...new Set(plans.map((p) => p.building).filter(Boolean))];
  const [building, setBuilding] = useState("");
  const [custom, setCustom] = useState("");
  const [other, setOther] = useState(false);
  const b = other ? custom.trim() : building;
  const used = plans.filter((p) => p.building === b).map((p) => p.level);
  const suggested = nextLevels(used);
  const [level, setLevel] = useState<number>(suggested[0] ?? 0);
  useEffect(() => setLevel(nextLevels(used)[0] ?? 0), [b, plans.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const choices = [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8];

  async function add(file: File) {
    setBusy(true);
    try {
      const { id } = await saveFn({
        data: {
          propertyId,
          id: null,
          level,
          label: null,
          dataUrl: await shrinkPhoto(file, 2400, 0.85),
        },
      });
      if (b) await pinsFn({ data: { propertyId, id, pins: { rooms: {}, building: b } } });
      await onAdded(id);
      toast.success(copy.plansSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!plans.length ? <p className="text-sm text-muted-foreground">{copy.noFloors}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>{copy.building}</Label>
          <Select
            value={other ? "__other" : building || "__main"}
            onValueChange={(v) => {
              setOther(v === "__other");
              if (v !== "__other") setBuilding(v === "__main" ? "" : v);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__main">{copy.mainHouse}</SelectItem>
              {names.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
              <SelectItem value="__other">{copy.otherBuilding}</SelectItem>
            </SelectContent>
          </Select>
          {other ? (
            <Input
              value={custom}
              maxLength={40}
              placeholder={copy.buildingName}
              onChange={(e) => setCustom(e.target.value)}
            />
          ) : null}
        </div>
        <div className="space-y-1">
          <Label>{copy.level}</Label>
          <Select value={String(level)} onValueChange={(v) => setLevel(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {choices.map((l) => (
                <SelectItem key={l} value={String(l)} disabled={used.includes(l)}>
                  {levelLabel(l)}
                  {used.includes(l) ? ` (${copy.taken})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <label
        className={cn(
          "inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted",
          (busy || used.includes(level) || (other && !custom.trim())) &&
            "pointer-events-none opacity-60",
        )}
      >
        <Upload className="size-4" />
        {copy.choosePlan}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void add(f);
          }}
        />
      </label>
    </div>
  );
}

/* --------------------------------- the map --------------------------------- */

type Tool =
  | "select"
  | "rect"
  | "poly"
  | "door"
  | "opening"
  | "steps"
  | "stairs"
  | "lift"
  | "entrance"
  | "barred"
  | "curtain"
  | "private"
  | "radiator"
  | "item";

const TOOL_ICON: Record<Tool, LucideIcon> = {
  select: MousePointer2,
  rect: RectangleHorizontal,
  poly: Pentagon,
  door: DoorClosed,
  opening: DoorOpen,
  steps: Footprints,
  stairs: TrendingUp,
  lift: ArrowUpDown,
  entrance: LogIn,
  barred: Ban,
  curtain: Blinds,
  private: Slash,
  radiator: Heater,
  item: Package,
};

const GROUPS: Array<[keyof typeof copy.groups, Tool[]]> = [
  ["areas", ["select", "rect", "poly"]],
  ["ways", ["entrance", "door", "opening", "steps", "stairs", "lift"]],
  ["private", ["barred", "curtain", "private"]],
  ["things", ["radiator", "item"]],
];

/** Lines finished after two taps; the rest (stairs, curtains, private lines, shapes) need Finish. */
const TWO_TAP: Tool[] = ["door", "opening", "steps", "barred", "radiator"];

type Selected = { type: "area" | "line" | "item"; id: string } | null;

function FloorMapEditor({
  propertyId,
  plan,
  plans,
  rooms,
  onChanged,
  onDeleted,
}: {
  propertyId: string;
  plan: Plan & { building: string };
  plans: Array<Plan & { building: string }>;
  rooms: Room[];
  onChanged: () => Promise<unknown>;
  onDeleted: () => Promise<void>;
}) {
  const pinsFn = useServerFn(saveFloorPins);
  const saveFn = useServerFn(saveFloorPlan);
  const delFn = useServerFn(deleteFloorPlan);
  const aiFn = useServerFn(readFloorPlanMap);
  const [pins, setPinsRaw] = useState<Pins>(plan.pins);
  const history = useRef<Pins[]>([]);
  const setPins = (next: Pins | ((p: Pins) => Pins)) =>
    setPinsRaw((p) => {
      history.current = [...history.current.slice(-40), p];
      return typeof next === "function" ? next(p) : next;
    });
  const [level, setLevel] = useState(plan.level);
  const [label, setLabel] = useState(plan.label ?? "");
  const [tool, setTool] = useState<Tool>("select");
  const [draft, setDraft] = useState<Point[]>([]);
  const [drag, setDrag] = useState<{ from: Point; to: Point } | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [areaKind, setAreaKind] = useState<AreaKind>("bedroom");
  const [itemKind, setItemKind] = useState<ItemKind>("fridge");
  const [sel, setSel] = useState<Selected>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [previewRoom, setPreviewRoom] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const handle = useRef<{ kind: "area" | "line" | "item"; id: string; index: number } | null>(null);

  const saved = plan.pins;
  const dirty =
    changed(pins, saved) || level !== plan.level || (label || null) !== (plan.label || null);
  const areas = pins.areas ?? [];
  const lines = pins.lines ?? [];
  const items = pins.items ?? [];
  const building = pins.building ?? "";
  const used = plans.filter((p) => p.id !== plan.id && p.building === building).map((p) => p.level);

  function at(e: { clientX: number; clientY: number }): Point {
    const r = box.current!.getBoundingClientRect();
    return {
      x: Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 1000) / 1000,
      y: Math.round(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) * 1000) / 1000,
    };
  }

  const patch = <T extends Area | Line | Item>(
    list: "areas" | "lines" | "items",
    id: string,
    change: Partial<T>,
  ) =>
    setPins((p) => ({
      ...p,
      [list]: ((p[list] ?? []) as T[]).map((x) => (x.id === id ? { ...x, ...change } : x)),
    }));

  function addLine(kind: LineKind, pts: Point[]) {
    const line: Line = { id: markId(), kind, pts };
    if (kind === "stairs") {
      line.toLevel = plans.some((p) => p.building === building && p.level === level + 1)
        ? level + 1
        : plans.some((p) => p.building === building && p.level === level - 1)
          ? level - 1
          : level + 1;
      line.shape = "auto";
    }
    setPins((p) => ({ ...p, lines: [...(p.lines ?? []), line] }));
    setSel({ type: "line", id: line.id });
  }

  function addArea(poly: Point[]) {
    const a: Area = {
      id: markId(),
      kind: areaKind,
      name: "",
      poly,
      access: defaultAccess(areaKind),
      roomId: null,
    };
    setPins((p) => ({ ...p, areas: [...(p.areas ?? []), a] }));
    setSel({ type: "area", id: a.id });
  }

  function finish() {
    if (tool === "poly" && draft.length >= 3) addArea(draft);
    else if ((tool === "stairs" || tool === "curtain" || tool === "private") && draft.length >= 2)
      addLine(tool, draft);
    setDraft([]);
  }

  /** What's under a tap: items first, then lines, then the smallest area holding it. */
  function pick(p: Point): Selected {
    const it = items.find((i) => Math.hypot(i.at.x - p.x, i.at.y - p.y) < 0.025);
    if (it) return { type: "item", id: it.id };
    const ln = lines.find(
      (l) => edgeDist(p, [...l.pts, ...[...l.pts].reverse().slice(1, -1)]) < 0.015,
    );
    if (ln) return { type: "line", id: ln.id };
    const a = areaAt(areas, p, 0);
    return a ? { type: "area", id: a.id } : null;
  }

  function down(e: React.PointerEvent) {
    if (!box.current) return;
    const p = at(e);
    if (tool === "select") {
      setSel(pick(p));
      return;
    }
    if (tool === "rect") {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDrag({ from: p, to: p });
      return;
    }
    if (tool === "entrance") {
      setPins((x) => ({ ...x, entrance: { ...p, facing: x.entrance?.facing ?? "up" } }));
      return;
    }
    if (tool === "lift") {
      setPins((x) => ({ ...x, lift: p }));
      return;
    }
    if (tool === "item") {
      const it: Item = { id: markId(), kind: itemKind, at: p, note: "" };
      setPins((x) => ({ ...x, items: [...(x.items ?? []), it] }));
      setSel({ type: "item", id: it.id });
      return;
    }
    // A double tap (to finish) shouldn't add the same point twice.
    const last = draft[draft.length - 1];
    if (last && Math.hypot(last.x - p.x, last.y - p.y) < 0.006) return;
    const next = [...draft, p];
    if (TWO_TAP.includes(tool) && next.length === 2) {
      addLine(tool as LineKind, next);
      setDraft([]);
    } else setDraft(next);
  }

  function move(e: React.PointerEvent) {
    if (!box.current) return;
    const p = at(e);
    if (handle.current) {
      const h = handle.current;
      if (h.kind === "item") patch<Item>("items", h.id, { at: p });
      else if (h.kind === "area")
        setPinsRaw((x) => ({
          ...x,
          areas: (x.areas ?? []).map((a) =>
            a.id === h.id ? { ...a, poly: a.poly.map((q, i) => (i === h.index ? p : q)) } : a,
          ),
        }));
      else
        setPinsRaw((x) => ({
          ...x,
          lines: (x.lines ?? []).map((l) =>
            l.id === h.id ? { ...l, pts: l.pts.map((q, i) => (i === h.index ? p : q)) } : l,
          ),
        }));
      return;
    }
    if (drag) setDrag({ ...drag, to: p });
    if (draft.length) setHover(p);
  }

  function up() {
    if (handle.current) {
      handle.current = null;
      return;
    }
    if (drag) {
      const { from, to } = drag;
      setDrag(null);
      if (Math.abs(to.x - from.x) > 0.015 && Math.abs(to.y - from.y) > 0.015)
        addArea([
          { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y) },
          { x: Math.max(from.x, to.x), y: Math.min(from.y, to.y) },
          { x: Math.max(from.x, to.x), y: Math.max(from.y, to.y) },
          { x: Math.min(from.x, to.x), y: Math.max(from.y, to.y) },
        ]);
    }
  }

  async function save() {
    setBusy(true);
    try {
      if (level !== plan.level || (label || null) !== (plan.label || null))
        await saveFn({
          data: { propertyId, id: plan.id, level, label: label || null, dataUrl: null },
        });
      await pinsFn({ data: { propertyId, id: plan.id, pins: pins as never } });
      history.current = [];
      await onChanged();
      toast.success(copy.plansSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  async function readAi() {
    if ((areas.length || lines.length) && !window.confirm(copy.aiReplace)) return;
    setReading(true);
    try {
      const r = await aiFn({ data: { propertyId, id: plan.id } });
      setPins((p) => ({
        ...p,
        areas: r.map.areas,
        lines: r.map.lines,
        items: p.items ?? [],
        ...(r.entrance ? { entrance: r.entrance } : {}),
      }));
      setTool("select");
      toast.success(copy.aiDone(r.map.areas.length));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setReading(false);
    }
  }

  // What guests read, with this floor as it is now (the others as saved).
  const now = plans.map((p) => (p.id === plan.id ? { ...p, level, pins } : { ...p, pins: p.pins }));
  const roomNames = Object.fromEntries(rooms.map((r) => [r.id, r.name]));
  const shownRoom =
    rooms.find((r) => r.id === previewRoom) ??
    rooms.find((r) => areas.some((a) => a.roomId === r.id) || pins.rooms[r.id]) ??
    null;
  const preview = shownRoom ? directionsTo(now, shownRoom.id, shownRoom.name, roomNames) : null;
  const house = houseText(houseNotes(mapFloors(now), roomNames));

  const selArea = sel?.type === "area" ? areas.find((a) => a.id === sel.id) : undefined;
  const selLine = sel?.type === "line" ? lines.find((l) => l.id === sel.id) : undefined;
  const selItem = sel?.type === "item" ? items.find((i) => i.id === sel.id) : undefined;
  const handles: Array<{ kind: "area" | "line" | "item"; id: string; index: number; p: Point }> =
    selArea
      ? selArea.poly.map((p, i) => ({ kind: "area", id: selArea.id, index: i, p }))
      : selLine
        ? selLine.pts.map((p, i) => ({ kind: "line", id: selLine.id, index: i, p }))
        : selItem
          ? [{ kind: "item", id: selItem.id, index: 0, p: selItem.at }]
          : [];
  const remove = () => {
    if (!sel) return;
    const list = sel.type === "area" ? "areas" : sel.type === "line" ? "lines" : "items";
    setPins((p) => ({
      ...p,
      [list]: ((p[list] ?? []) as Array<{ id: string }>).filter((x) => x.id !== sel.id),
    }));
    setSel(null);
  };
  const levelsHere = plans.filter((p) => p.building === building).map((p) => p.level);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>{copy.level}</Label>
          <Select value={String(level)} onValueChange={(v) => setLevel(Number(v))}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((l) => (
                <SelectItem key={l} value={String(l)} disabled={used.includes(l)}>
                  {levelLabel(l)}
                  {used.includes(l) ? ` (${copy.taken})` : ""}
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
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={reading || !plan.url}
          onClick={() => void readAi()}
        >
          <Sparkles className="size-4" /> {reading ? copy.reading : copy.readAi}
        </Button>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 text-sm hover:bg-muted">
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
          size="sm"
          variant="ghost"
          onClick={async () => {
            if (!window.confirm(copy.deleteSure)) return;
            try {
              await delFn({ data: { propertyId, id: plan.id } });
              await onDeleted();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : common.errorBody);
            }
          }}
        >
          <Trash2 className="size-4" /> {copy.deletePlan}
        </Button>
      </div>

      {/* Tools */}
      <div className="space-y-2" data-keep-size>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {GROUPS.map(([g, tools]) => (
            <div key={g} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{copy.groups[g]}</p>
              <div className="flex flex-wrap gap-1">
                {tools.map((t) => {
                  const Icon = TOOL_ICON[t];
                  return (
                    <Button
                      key={t}
                      size="sm"
                      variant={tool === t ? "default" : "outline"}
                      data-keep-label
                      onClick={() => {
                        setTool(t);
                        setDraft([]);
                        if (t !== "select") setSel(null);
                      }}
                    >
                      <Icon className="size-4" aria-hidden /> {copy.tools[t]}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 p-2 text-sm">
          <span>{copy.help[tool]}</span>
          {tool === "rect" || tool === "poly" ? (
            <KindSelect
              label={copy.newAreaKind}
              value={areaKind}
              options={AREA_KINDS.map((k) => [k, cap(AREA_WORDS[k])])}
              onChange={(v) => setAreaKind(v as AreaKind)}
            />
          ) : null}
          {tool === "item" ? (
            <KindSelect
              label={copy.itemToPlace}
              value={itemKind}
              options={ITEM_KINDS.map((k) => [k, cap(ITEM_WORDS[k])])}
              onChange={(v) => setItemKind(v as ItemKind)}
            />
          ) : null}
          {tool === "entrance" && pins.entrance ? (
            <KindSelect
              label={copy.facing}
              value={pins.entrance.facing}
              options={(["up", "down", "left", "right"] as const).map((f) => [f, copy.facings[f]!])}
              onChange={(v) =>
                setPins((p) =>
                  p.entrance ? { ...p, entrance: { ...p.entrance, facing: v as Facing } } : p,
                )
              }
            />
          ) : null}
          {draft.length ? (
            <span className="ml-auto flex gap-1">
              {!TWO_TAP.includes(tool) ? (
                <Button size="sm" onClick={finish}>
                  <Check className="size-4" /> {copy.finish}
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setDraft([])}>
                <X className="size-4" /> {copy.cancel}
              </Button>
            </span>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className={cn(!draft.length && "ml-auto")}
            disabled={!history.current.length}
            onClick={() => {
              const last = history.current.pop();
              if (last) setPinsRaw(last);
              setSel(null);
            }}
          >
            <Undo2 className="size-4" /> {copy.undo}
          </Button>
        </div>
      </div>

      {/* The plan with its map */}
      <div
        ref={box}
        className={cn("relative select-none", tool !== "select" && "touch-none cursor-crosshair")}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={() => (tool === "poly" || tool === "stairs" ? finish() : undefined)}
      >
        <FloorMapView
          url={plan.url}
          alt={floorTitle(building, level)}
          areas={areas.map((a) => ({
            id: a.id,
            poly: a.poly,
            access: a.access,
            kind: a.kind,
          }))}
          lines={lines}
          items={items}
          selected={sel?.id ?? null}
        >
          <svg
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 size-full"
            aria-hidden
          >
            {drag ? (
              <rect
                x={Math.min(drag.from.x, drag.to.x)}
                y={Math.min(drag.from.y, drag.to.y)}
                width={Math.abs(drag.to.x - drag.from.x)}
                height={Math.abs(drag.to.y - drag.from.y)}
                fill="rgba(37,99,235,0.15)"
                stroke="#2563eb"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {draft.length ? (
              <polyline
                points={[...draft, ...(hover ? [hover] : [])].map((q) => `${q.x},${q.y}`).join(" ")}
                fill="none"
                stroke="#0f172a"
                strokeWidth={2}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
          {/* Labels on areas */}
          {areas.map((a) => {
            const xs = a.poly.map((p) => p.x);
            const ys = a.poly.map((p) => p.y);
            const c = {
              x: (Math.min(...xs) + Math.max(...xs)) / 2,
              y: (Math.min(...ys) + Math.max(...ys)) / 2,
            };
            const name =
              (a.roomId ? roomNames[a.roomId] : null) || a.name || cap(AREA_WORDS[a.kind]);
            return (
              <span
                key={a.id}
                className={cn(
                  "pointer-events-none absolute max-w-[30%] -translate-x-1/2 -translate-y-1/2 truncate rounded px-1 text-[10px] leading-4 font-medium sm:text-xs",
                  a.access === "private"
                    ? "bg-red-50 text-red-800"
                    : a.access === "guest_room"
                      ? "bg-slate-100 text-slate-800"
                      : "bg-blue-50 text-blue-800",
                )}
                style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
              >
                {name}
              </span>
            );
          })}
          {pins.entrance ? (
            <Dot p={pins.entrance} cls="bg-emerald-600" title={copy.entrance} />
          ) : null}
          {pins.lift ? <Dot p={pins.lift} cls="bg-sky-600" title={copy.lift} /> : null}
          {tool === "select"
            ? handles.map((h) => (
                <span
                  key={`${h.id}-${h.index}`}
                  className="absolute size-5 -translate-x-1/2 -translate-y-1/2 cursor-move touch-none rounded-full border-2 border-slate-900 bg-white shadow"
                  style={{ left: `${h.p.x * 100}%`, top: `${h.p.y * 100}%` }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    history.current = [...history.current.slice(-40), pins];
                    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                    handle.current = { kind: h.kind, id: h.id, index: h.index };
                  }}
                  onPointerMove={move}
                  onPointerUp={up}
                />
              ))
            : null}
        </FloorMapView>
      </div>

      {/* The selected mark's details */}
      {selArea ? (
        <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
          <KindSelect
            label={copy.areaKind}
            value={selArea.kind}
            options={AREA_KINDS.map((k) => [k, cap(AREA_WORDS[k])])}
            onChange={(v) =>
              patch<Area>("areas", selArea.id, {
                kind: v as AreaKind,
                access: defaultAccess(v as AreaKind),
              })
            }
            block
          />
          <div className="space-y-1">
            <Label>{copy.name}</Label>
            <Input
              value={selArea.name}
              maxLength={40}
              onChange={(e) => patch<Area>("areas", selArea.id, { name: e.target.value })}
            />
          </div>
          <KindSelect
            label={copy.access}
            value={selArea.access}
            options={(["shared", "guest_room", "private"] as Access[]).map((a) => [
              a,
              copy.accesses[a]!,
            ])}
            onChange={(v) => patch<Area>("areas", selArea.id, { access: v as Access })}
            block
          />
          {selArea.kind === "bedroom" || selArea.kind === "ensuite" ? (
            <KindSelect
              label={copy.room}
              value={selArea.roomId ?? "none"}
              options={[
                ["none", copy.noRoom],
                ...rooms.map((r) => [r.id, r.name] as [string, string]),
              ]}
              onChange={(v) =>
                patch<Area>("areas", selArea.id, { roomId: v === "none" ? null : v })
              }
              block
            />
          ) : null}
          <Button variant="ghost" size="sm" className="justify-self-start" onClick={remove}>
            <Trash2 className="size-4" /> {copy.remove}
          </Button>
        </div>
      ) : null}
      {selLine ? (
        <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
          <KindSelect
            label={copy.lineKind}
            value={selLine.kind}
            options={(
              [
                "door",
                "opening",
                "steps",
                "stairs",
                "barred",
                "curtain",
                "private",
                "radiator",
              ] as LineKind[]
            ).map((k) => [k, copy.tools[k] ?? k])}
            onChange={(v) => patch<Line>("lines", selLine.id, { kind: v as LineKind })}
            block
          />
          {selLine.kind === "stairs" ? (
            <>
              <KindSelect
                label={copy.leadsTo}
                value={String(selLine.toLevel ?? level + 1)}
                options={[level + 1, level - 1]
                  .filter((l) => l >= -3)
                  .map((l) => [
                    String(l),
                    `${levelLabel(l)}${levelsHere.includes(l) ? "" : ` (${copy.addFloor.toLowerCase()})`}`,
                  ])}
                onChange={(v) => patch<Line>("lines", selLine.id, { toLevel: Number(v) })}
                block
              />
              <KindSelect
                label={copy.shape}
                value={selLine.shape ?? "auto"}
                options={(["auto", "straight", "turning", "curved"] as StairShape[]).map((k) => [
                  k,
                  copy.shapes[k]!,
                ])}
                onChange={(v) => patch<Line>("lines", selLine.id, { shape: v as StairShape })}
                block
              />
            </>
          ) : null}
          {selLine.kind === "stairs" || selLine.kind === "steps" ? (
            <div className="space-y-1">
              <Label>{copy.count}</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={selLine.count ?? ""}
                onChange={(e) =>
                  patch<Line>("lines", selLine.id, {
                    count: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
          ) : null}
          <Button variant="ghost" size="sm" className="justify-self-start" onClick={remove}>
            <Trash2 className="size-4" /> {copy.remove}
          </Button>
        </div>
      ) : null}
      {selItem ? (
        <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
          <KindSelect
            label={copy.itemKind}
            value={selItem.kind}
            options={ITEM_KINDS.map((k) => [k, cap(ITEM_WORDS[k])])}
            onChange={(v) => patch<Item>("items", selItem.id, { kind: v as ItemKind })}
            block
          />
          <div className="space-y-1">
            <Label>{copy.itemNote}</Label>
            <Input
              value={selItem.note}
              maxLength={120}
              onChange={(e) => patch<Item>("items", selItem.id, { note: e.target.value })}
            />
          </div>
          <Button variant="ghost" size="sm" className="justify-self-start" onClick={remove}>
            <Trash2 className="size-4" /> {copy.remove}
          </Button>
        </div>
      ) : null}

      {/* What guests read */}
      <div className="space-y-3 rounded-xl bg-muted/60 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-1.5 font-medium">
            <Footprints className="size-4" aria-hidden /> {copy.preview}
          </p>
          {rooms.length ? (
            <KindSelect
              label={copy.previewRoom}
              value={shownRoom?.id ?? ""}
              options={rooms.map((r) => [r.id, r.name])}
              onChange={setPreviewRoom}
            />
          ) : null}
        </div>
        {preview ? (
          <ol className="list-decimal space-y-0.5 pl-5">
            {[...preview.steps, ...(preview.heating ?? [])].map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground">{copy.noDirections}</p>
        )}
        {house ? (
          <div>
            <p className="font-medium">{copy.house}</p>
            <p className="whitespace-pre-line text-muted-foreground">{house}</p>
          </div>
        ) : null}
        <ItemLegend items={items} />
      </div>
    </div>
  );
}

function ItemLegend({ items }: { items: Item[] }) {
  const kinds = [...new Set(items.map((i) => i.kind))];
  if (!kinds.length) return null;
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {kinds.map((k) => {
        const Icon = ITEM_ICON[k];
        return (
          <span key={k} className="inline-flex items-center gap-1">
            <Icon className="size-3.5" aria-hidden /> {cap(ITEM_WORDS[k])}
          </span>
        );
      })}
    </p>
  );
}

function Dot({ p, cls, title }: { p: Point; cls: string; title: string }) {
  return (
    <span
      title={title}
      className={cn(
        "pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow",
        cls,
      )}
      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
    />
  );
}

function KindSelect({
  label,
  value,
  options,
  onChange,
  block,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (v: string) => void;
  block?: boolean;
}) {
  return (
    <div className={cn(block ? "space-y-1" : "flex items-center gap-2")}>
      <Label className={cn(!block && "text-sm font-normal")}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={cn(block ? "w-full" : "h-9 w-48")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
