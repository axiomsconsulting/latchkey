import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeftRight,
  Printer,
  Sofa,
  Thermometer,
  FireExtinguisher,
  Lamp,
  WashingMachine,
  Utensils,
  GripHorizontal,
  PanelLeft,
  RotateCw,
  Eye,
  MoveDiagonal2,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
  ITEM_CATEGORIES,
  FURNITURE,
  snapPoint,
  itemPlace,
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
  ["things", ["item"]],
];

/** Lines finished after two taps; the rest (stairs, curtains, private lines, shapes) need Finish. */
const TWO_TAP: Tool[] = ["door", "opening", "steps", "barred", "radiator"];

/** Where the editor's tools sit: beside the plan, or floating over it (wide screens). */
type BarSide = "left" | "right" | "top" | "bottom" | "float";
const BAR_SIDES: BarSide[] = ["left", "right", "top", "bottom", "float"];
const BAR_KEY = "latchkey.planTools";

/** The host's chosen plan width in the editor, on this device. */
const PLAN_WIDTH_KEY = "latchkey.planWidth";

type MarkType = "area" | "line" | "item" | "entrance" | "lift" | "pin";
/** What's selected: an area, line or item by id; the entrance or lift; a room's pin by room id. */
type Selected = { type: MarkType; id: string } | null;
type Grab = {
  kind: MarkType;
  id: string;
  /** A corner point, or -1 to move the whole mark. */
  index: number;
  from?: Point;
  orig?: Pins;
};

/** Moves every point of a mark by d, kept on the plan. */
const shift = (pts: Point[], d: Point): Point[] => {
  const dx = Math.min(
    1 - Math.max(...pts.map((p) => p.x)),
    Math.max(-Math.min(...pts.map((p) => p.x)), d.x),
  );
  const dy = Math.min(
    1 - Math.max(...pts.map((p) => p.y)),
    Math.max(-Math.min(...pts.map((p) => p.y)), d.y),
  );
  return pts.map((p) => ({
    x: Math.round((p.x + dx) * 1000) / 1000,
    y: Math.round((p.y + dy) * 1000) / 1000,
  }));
};

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
  // Drawn areas cover the plan picture; the host can see through them while tracing.
  const [seeThrough, setSeeThrough] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const handle = useRef<Grab | null>(null);
  // The plan's size: by default as wide as fits the screen's height; the host can resize it from
  // its corner (kept on this device).
  const frame = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ x: number; w: number } | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [planWidth, setPlanWidth] = useState<number | null>(null);
  const fitWidth = () => {
    const room = frame.current?.getBoundingClientRect().width ?? 800;
    const tall = Math.max(260, window.innerHeight - 220);
    return Math.round(Math.min(room, ratio ? tall * ratio : room));
  };
  useEffect(() => {
    if (!plan.url) return;
    const img = new Image();
    img.onload = () => img.naturalHeight && setRatio(img.naturalWidth / img.naturalHeight);
    img.src = plan.url;
  }, [plan.url]);
  useEffect(() => {
    let kept: number | null = null;
    try {
      kept = Number(localStorage.getItem(PLAN_WIDTH_KEY)) || null;
    } catch {
      kept = null;
    }
    setPlanWidth(kept ?? fitWidth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratio]);

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

  /** What's under a tap: the entrance, lift and room pins, items, then lines, then the smallest area holding it. */
  function pick(p: Point): Selected {
    const near = (q: Point | undefined | null) => !!q && Math.hypot(q.x - p.x, q.y - p.y) < 0.025;
    if (near(pins.entrance)) return { type: "entrance", id: "entrance" };
    if (near(pins.lift)) return { type: "lift", id: "lift" };
    const pin = Object.entries(pins.rooms ?? {}).find(([, q]) => near(q));
    if (pin) return { type: "pin", id: pin[0] };
    const it =
      items.find((i) => Math.hypot(i.at.x - p.x, i.at.y - p.y) < 0.025) ??
      items.find(
        (i) => i.w && i.h && Math.abs(p.x - i.at.x) <= i.w / 2 && Math.abs(p.y - i.at.y) <= i.h / 2,
      );
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
      const hit = pick(p);
      // Pressing on the mark already selected and dragging moves the whole of it.
      if (hit && sel && hit.type === sel.type && hit.id === sel.id) {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        history.current = [...history.current.slice(-40), pins];
        handle.current = { kind: hit.type, id: hit.id, index: -1, from: p, orig: pins };
        return;
      }
      setSel(hit);
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
      const f = FURNITURE[itemKind];
      const it: Item = {
        id: markId(),
        kind: itemKind,
        at: p,
        note: "",
        ...(f ? { w: f.w, h: f.h } : {}),
      };
      setPins((x) => ({ ...x, items: [...(x.items ?? []), it] }));
      // Placed: back to Select with it chosen, ready to move, resize or describe.
      setTool("select");
      setSel({ type: "item", id: it.id });
      return;
    }
    // A double tap (to finish) shouldn't add the same point twice.
    const last = draft[draft.length - 1];
    if (last && Math.hypot(last.x - p.x, last.y - p.y) < 0.006) return;
    const next = [...draft, tool === "poly" ? snapPoint(p, areas) : p];
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
      if (h.index === -1 && h.from && h.orig) {
        const d = { x: p.x - h.from.x, y: p.y - h.from.y };
        const o = h.orig;
        setPinsRaw((x) => moved(x, o, h.kind, h.id, d));
        return;
      }
      if (h.kind === "entrance")
        setPinsRaw((x) => (x.entrance ? { ...x, entrance: { ...x.entrance, ...p } } : x));
      else if (h.kind === "lift") setPinsRaw((x) => ({ ...x, lift: p }));
      else if (h.kind === "pin")
        setPinsRaw((x) => ({ ...x, rooms: { ...(x.rooms ?? {}), [h.id]: p } }));
      else if (h.kind === "item" && h.index === 1)
        setPinsRaw((x) => ({
          ...x,
          items: (x.items ?? []).map((i) =>
            i.id === h.id
              ? {
                  ...i,
                  w: Math.round(Math.max(0.01, Math.abs(p.x - i.at.x) * 2) * 1000) / 1000,
                  h: Math.round(Math.max(0.01, Math.abs(p.y - i.at.y) * 2) * 1000) / 1000,
                }
              : i,
          ),
        }));
      else if (h.kind === "item") patch<Item>("items", h.id, { at: p });
      else if (h.kind === "area")
        setPinsRaw((x) => ({
          ...x,
          areas: (x.areas ?? []).map((a) =>
            a.id === h.id
              ? {
                  ...a,
                  poly: a.poly.map((q, i) => (i === h.index ? snapPoint(p, areas, h.id) : q)),
                }
              : a,
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
      const h = handle.current;
      handle.current = null;
      // A moved room lines up with its neighbours when it's let go close to them.
      if (h.kind === "area" && h.index === -1)
        setPinsRaw((x) => {
          const others = (x.areas ?? []).filter((a) => a.id !== h.id);
          return {
            ...x,
            areas: (x.areas ?? []).map((a) =>
              a.id === h.id ? { ...a, poly: a.poly.map((q) => snapPoint(q, others)) } : a,
            ),
          };
        });
      return;
    }
    if (drag) {
      const { from, to } = drag;
      setDrag(null);
      if (Math.abs(to.x - from.x) > 0.015 && Math.abs(to.y - from.y) > 0.015)
        // Corners near another room join its walls, so there's no gap between them.
        addArea(
          [
            { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y) },
            { x: Math.max(from.x, to.x), y: Math.min(from.y, to.y) },
            { x: Math.max(from.x, to.x), y: Math.max(from.y, to.y) },
            { x: Math.min(from.x, to.x), y: Math.max(from.y, to.y) },
          ].map((q) => snapPoint(q, areas)),
        );
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
        // The host's own items stay; what the reader saw or suggests is added (suggested ones say so).
        items: [
          ...(p.items ?? []),
          ...r.map.items.filter(
            (n) =>
              !(p.items ?? []).some(
                (o) => o.kind === n.kind && Math.hypot(o.at.x - n.at.x, o.at.y - n.at.y) < 0.05,
              ),
          ),
        ],
        ...(r.entrance ? { entrance: r.entrance } : {}),
      }));
      setTool("select");
      toast.success(copy.aiDone(r.map.areas.length, r.map.items.length));
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

  /** The pins with one mark moved by d from where it was in `o`. */
  function moved(x: Pins, o: Pins, kind: MarkType, id: string, d: Point): Pins {
    const pt = (q: Point) => shift([q], d)[0]!;
    if (kind === "entrance" && o.entrance)
      return { ...x, entrance: { ...o.entrance, ...pt(o.entrance) } };
    if (kind === "lift" && o.lift) return { ...x, lift: pt(o.lift) };
    if (kind === "pin" && o.rooms?.[id])
      return { ...x, rooms: { ...(x.rooms ?? {}), [id]: pt(o.rooms[id]!) } };
    if (kind === "item") {
      const it = (o.items ?? []).find((i) => i.id === id);
      return it
        ? { ...x, items: (x.items ?? []).map((i) => (i.id === id ? { ...i, at: pt(it.at) } : i)) }
        : x;
    }
    if (kind === "area") {
      const a = (o.areas ?? []).find((i) => i.id === id);
      return a
        ? {
            ...x,
            areas: (x.areas ?? []).map((i) => (i.id === id ? { ...i, poly: shift(a.poly, d) } : i)),
          }
        : x;
    }
    const l = (o.lines ?? []).find((i) => i.id === id);
    return l
      ? {
          ...x,
          lines: (x.lines ?? []).map((i) => (i.id === id ? { ...i, pts: shift(l.pts, d) } : i)),
        }
      : x;
  }

  /** A new corner point between two (areas and lines), dragged from where it's added. */
  function insertPoint(kind: "area" | "line", id: string, after: number, p: Point) {
    setPins((x) =>
      kind === "area"
        ? {
            ...x,
            areas: (x.areas ?? []).map((a) =>
              a.id === id
                ? { ...a, poly: [...a.poly.slice(0, after + 1), p, ...a.poly.slice(after + 1)] }
                : a,
            ),
          }
        : {
            ...x,
            lines: (x.lines ?? []).map((l) =>
              l.id === id
                ? { ...l, pts: [...l.pts.slice(0, after + 1), p, ...l.pts.slice(after + 1)] }
                : l,
            ),
          },
    );
    handle.current = { kind, id, index: after + 1 };
  }

  /** Takes a corner point out (an area keeps at least 3, a line 2). */
  function dropPoint(kind: "area" | "line", id: string, index: number) {
    setPins((x) =>
      kind === "area"
        ? {
            ...x,
            areas: (x.areas ?? []).map((a) =>
              a.id === id && a.poly.length > 3
                ? { ...a, poly: a.poly.filter((_, i) => i !== index) }
                : a,
            ),
          }
        : {
            ...x,
            lines: (x.lines ?? []).map((l) =>
              l.id === id && l.pts.length > 2
                ? { ...l, pts: l.pts.filter((_, i) => i !== index) }
                : l,
            ),
          },
    );
  }

  const selArea = sel?.type === "area" ? areas.find((a) => a.id === sel.id) : undefined;
  const selLine = sel?.type === "line" ? lines.find((l) => l.id === sel.id) : undefined;
  const selItem = sel?.type === "item" ? items.find((i) => i.id === sel.id) : undefined;
  const selPoint: Point | null =
    sel?.type === "entrance"
      ? (pins.entrance ?? null)
      : sel?.type === "lift"
        ? (pins.lift ?? null)
        : sel?.type === "pin"
          ? (pins.rooms?.[sel.id] ?? null)
          : null;
  const handles: Array<{ kind: MarkType; id: string; index: number; p: Point }> = selArea
    ? selArea.poly.map((p, i) => ({ kind: "area", id: selArea.id, index: i, p }))
    : selLine
      ? selLine.pts.map((p, i) => ({ kind: "line", id: selLine.id, index: i, p }))
      : selItem
        ? [
            { kind: "item", id: selItem.id, index: 0, p: selItem.at },
            // Furniture: the bottom-right corner resizes it (from its centre).
            ...(selItem.w && selItem.h
              ? [
                  {
                    kind: "item" as const,
                    id: selItem.id,
                    index: 1,
                    p: { x: selItem.at.x + selItem.w / 2, y: selItem.at.y + selItem.h / 2 },
                  },
                ]
              : []),
          ]
        : selPoint && sel
          ? [{ kind: sel.type, id: sel.id, index: 0, p: selPoint }]
          : [];
  // Between corner points: tap to add one there.
  const mids: Array<{ kind: "area" | "line"; id: string; after: number; p: Point }> = selArea
    ? selArea.poly.map((p, i) => {
        const q = selArea.poly[(i + 1) % selArea.poly.length]!;
        return {
          kind: "area" as const,
          id: selArea.id,
          after: i,
          p: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 },
        };
      })
    : selLine
      ? selLine.pts.slice(0, -1).map((p, i) => {
          const q = selLine.pts[i + 1]!;
          return {
            kind: "line" as const,
            id: selLine.id,
            after: i,
            p: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 },
          };
        })
      : [];
  const remove = () => {
    if (!sel) return;
    if (sel.type === "entrance") setPins(({ entrance: _e, ...p }) => p);
    else if (sel.type === "lift") setPins(({ lift: _l, ...p }) => p);
    else if (sel.type === "pin")
      setPins((p) => {
        const rooms = { ...(p.rooms ?? {}) };
        delete rooms[sel.id];
        return { ...p, rooms };
      });
    else {
      const list = sel.type === "area" ? "areas" : sel.type === "line" ? "lines" : "items";
      setPins((p) => ({
        ...p,
        [list]: ((p[list] ?? []) as Array<{ id: string }>).filter((x) => x.id !== sel.id),
      }));
    }
    setSel(null);
  };
  // Delete or Backspace removes the selected mark; Escape lets go of it.
  const removeRef = useRef(remove);
  removeRef.current = remove;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "Escape") setSel(null);
      if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        removeRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);
  const levelsHere = plans.filter((p) => p.building === building).map((p) => p.level);

  // The tools' place: beside the plan on any side, or floating over it (wide screens), kept per device.
  const [barSide, setBarSideRaw] = useState<BarSide>("left");
  const [floatAt, setFloatAt] = useState({ x: 8, y: 8 });
  const floatGrab = useRef<{ x: number; y: number; at: { x: number; y: number } } | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(BAR_KEY) as BarSide | null;
      const wide = window.matchMedia("(min-width: 768px)").matches;
      if (v && BAR_SIDES.includes(v) && (v !== "float" || wide)) setBarSideRaw(v);
      const f = JSON.parse(localStorage.getItem(`${BAR_KEY}.at`) ?? "null");
      if (f && typeof f.x === "number" && typeof f.y === "number") setFloatAt(f);
    } catch {
      // Defaults.
    }
  }, []);
  const setBarSide = (v: BarSide) => {
    setBarSideRaw(v);
    try {
      localStorage.setItem(BAR_KEY, v);
    } catch {
      // Not kept.
    }
  };
  const vertical = barSide === "left" || barSide === "right" || barSide === "float";
  const toolbar = (
    <div
      role="toolbar"
      aria-label={copy.toolsLabel}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      data-keep-size
      className={cn(
        "no-scrollbar flex shrink-0 gap-1 rounded-2xl border border-border bg-card p-1 shadow-sm",
        vertical
          ? "max-h-[min(80dvh,46rem)] flex-col overflow-y-auto"
          : "w-full flex-row overflow-x-auto",
        barSide === "float" && "shadow-xl",
      )}
    >
      {barSide === "float" ? (
        <button
          type="button"
          aria-label={copy.moveTools}
          title={copy.moveTools}
          className="grid h-6 w-full cursor-grab touch-none place-items-center rounded-lg text-muted-foreground hover:bg-muted"
          onPointerDown={(e) => {
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            floatGrab.current = { x: e.clientX, y: e.clientY, at: floatAt };
          }}
          onPointerMove={(e) => {
            const g = floatGrab.current;
            if (!g) return;
            const r = frame.current?.getBoundingClientRect();
            setFloatAt({
              x: Math.max(0, Math.min((r?.width ?? 600) - 56, g.at.x + e.clientX - g.x)),
              y: Math.max(0, Math.min((r?.height ?? 600) - 56, g.at.y + e.clientY - g.y)),
            });
          }}
          onPointerUp={() => {
            floatGrab.current = null;
            try {
              localStorage.setItem(`${BAR_KEY}.at`, JSON.stringify(floatAt));
            } catch {
              // Not kept.
            }
          }}
        >
          <GripHorizontal className="size-4" aria-hidden />
        </button>
      ) : null}
      {GROUPS.map(([g, tools], gi) => (
        <div
          key={g}
          role="group"
          aria-label={copy.groups[g]}
          className={cn(
            "flex gap-1",
            vertical ? "flex-col" : "flex-row",
            gi > 0 && (vertical ? "border-t border-border pt-1" : "border-l border-border pl-1"),
          )}
        >
          {tools.map((t) => {
            if (t === "item")
              return (
                <ThingPicker
                  key={t}
                  value={tool === "radiator" ? "radiator" : itemKind}
                  active={tool === "item" || tool === "radiator"}
                  side={
                    barSide === "right"
                      ? "left"
                      : barSide === "top"
                        ? "bottom"
                        : barSide === "bottom"
                          ? "top"
                          : "right"
                  }
                  onPick={(k) => {
                    setDraft([]);
                    setSel(null);
                    if (k === "radiator") setTool("radiator");
                    else {
                      setItemKind(k);
                      setTool("item");
                    }
                  }}
                />
              );
            const Icon = TOOL_ICON[t];
            return (
              <button
                key={t}
                type="button"
                aria-pressed={tool === t}
                aria-label={`${copy.groups[g]}: ${copy.tools[t]}`}
                title={copy.tools[t]}
                onClick={() => {
                  setTool(t);
                  setDraft([]);
                  if (t !== "select") setSel(null);
                }}
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-xl transition-colors sm:size-10",
                  tool === t
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </button>
            );
          })}
        </div>
      ))}
      <div
        className={cn(
          "flex gap-1",
          vertical
            ? "flex-col border-t border-border pt-1"
            : "flex-row border-l border-border pl-1",
        )}
      >
        <button
          type="button"
          aria-label={copy.undo}
          title={copy.undo}
          disabled={!history.current.length}
          onClick={() => {
            const last = history.current.pop();
            if (last) setPinsRaw(last);
            setSel(null);
          }}
          className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-muted disabled:opacity-40 sm:size-10"
        >
          <Undo2 className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          aria-pressed={seeThrough}
          aria-label={copy.seeThrough}
          title={copy.seeThrough}
          onClick={() => setSeeThrough((v) => !v)}
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl sm:size-10",
            seeThrough ? "bg-primary text-primary-foreground" : "hover:bg-muted",
          )}
        >
          <Eye className="size-5" aria-hidden />
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={copy.placeTools}
              title={copy.placeTools}
              className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-muted sm:size-10"
            >
              <PanelLeft className="size-5" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" side="right" align="start">
            <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{copy.placeTools}</p>
            {BAR_SIDES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setBarSide(v)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-muted sm:min-h-9",
                  v === "float" && "hidden md:flex",
                  barSide === v && "font-semibold text-primary",
                )}
              >
                {copy.barSides[v]}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );

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
        <Button size="sm" variant="outline" asChild>
          <Link
            to="/app/floor-plans-print/$propertyId"
            params={{ propertyId }}
            search={{ floors: plan.id }}
          >
            <Printer className="size-4" /> {copy.printPlans}
          </Link>
        </Button>
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

      {/* What the chosen tool does, and its choices */}
      <div className="space-y-2" data-keep-size>
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
          {tool === "item" || tool === "radiator" ? (
            <span className="inline-flex items-center gap-1.5 font-medium">
              {(() => {
                const Icon = tool === "radiator" ? Heater : ITEM_ICON[itemKind];
                return <Icon className="size-4 text-primary" aria-hidden />;
              })()}
              {cap(tool === "radiator" ? "radiator" : ITEM_WORDS[itemKind])}
            </span>
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
        </div>
      </div>

      {/* The plan with its map: fits the screen to start, resized from its corner; the tools
          beside it (or floating over it on a wide screen) */}
      <div
        className={cn(
          "flex gap-2",
          barSide === "left" && "flex-row",
          barSide === "right" && "flex-row-reverse",
          barSide === "top" && "flex-col",
          barSide === "bottom" && "flex-col-reverse",
        )}
      >
        {barSide !== "float" ? toolbar : null}
        <div ref={frame} className="relative min-w-0 flex-1">
          {barSide === "float" ? (
            <div className="absolute z-20" style={{ left: floatAt.x, top: floatAt.y }}>
              {toolbar}
            </div>
          ) : null}
          <div
            className="relative mx-auto"
            style={{ width: planWidth ?? undefined, maxWidth: "100%" }}
          >
            <div
              ref={box}
              className={cn(
                "relative select-none",
                tool !== "select" && "touch-none cursor-crosshair",
                tool === "select" && sel && "touch-none cursor-move",
              )}
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
                mask={!seeThrough}
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
                      points={[...draft, ...(hover ? [hover] : [])]
                        .map((q) => `${q.x},${q.y}`)
                        .join(" ")}
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
                {Object.entries(pins.rooms ?? {}).map(([id, q]) => (
                  <span
                    key={`pin-${id}`}
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow"
                    style={{ left: `${q.x * 100}%`, top: `${q.y * 100}%` }}
                  >
                    {roomNames[id] ?? copy.roomPin}
                  </span>
                ))}
                {tool === "select"
                  ? handles.map((h) => (
                      <span
                        key={`${h.id}-${h.index}`}
                        className="absolute size-5 -translate-x-1/2 -translate-y-1/2 cursor-move touch-none rounded-full border-2 border-slate-900 bg-white shadow"
                        style={{ left: `${h.p.x * 100}%`, top: `${h.p.y * 100}%` }}
                        title={h.kind === "area" || h.kind === "line" ? copy.pointHelp : undefined}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          history.current = [...history.current.slice(-40), pins];
                          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                          handle.current = { kind: h.kind, id: h.id, index: h.index };
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (h.kind === "area" || h.kind === "line")
                            dropPoint(h.kind, h.id, h.index);
                        }}
                        onPointerMove={move}
                        onPointerUp={up}
                      />
                    ))
                  : null}
                {tool === "select"
                  ? mids.map((m) => (
                      <span
                        key={`mid-${m.id}-${m.after}`}
                        title={copy.addPoint}
                        className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 cursor-copy touch-none rounded-full border-2 border-slate-900 bg-slate-300 opacity-80"
                        style={{ left: `${m.p.x * 100}%`, top: `${m.p.y * 100}%` }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                          insertPoint(m.kind, m.id, m.after, m.p);
                        }}
                        onPointerMove={move}
                        onPointerUp={up}
                      />
                    ))
                  : null}
              </FloorMapView>
            </div>
            <span
              role="separator"
              aria-label={copy.resize}
              title={copy.resize}
              className="absolute -bottom-2 -right-2 z-10 grid size-7 cursor-nwse-resize touch-none place-items-center rounded-full border-2 border-white bg-slate-900 text-white shadow"
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                resizing.current = {
                  x: e.clientX,
                  w: box.current?.getBoundingClientRect().width ?? 0,
                };
              }}
              onPointerMove={(e) => {
                const r = resizing.current;
                if (!r) return;
                const max = frame.current?.getBoundingClientRect().width ?? Infinity;
                setPlanWidth(Math.round(Math.min(max, Math.max(240, r.w + (e.clientX - r.x)))));
              }}
              onPointerUp={() => {
                resizing.current = null;
                try {
                  if (planWidth) localStorage.setItem(PLAN_WIDTH_KEY, String(planWidth));
                } catch {
                  // Not kept: it fits the screen next time.
                }
              }}
              onDoubleClick={() => {
                try {
                  localStorage.removeItem(PLAN_WIDTH_KEY);
                } catch {
                  // Nothing kept anyway.
                }
                setPlanWidth(fitWidth());
              }}
            >
              <MoveDiagonal2 className="size-3.5" aria-hidden />
            </span>
          </div>
        </div>
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
          {selArea.access === "guest_room" || selArea.kind === "bedroom" || selArea.roomId ? (
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
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => patch<Line>("lines", selLine.id, { pts: [...selLine.pts].reverse() })}
          >
            <ArrowLeftRight className="size-4" /> {copy.reverse}
          </Button>
          <Button variant="ghost" size="sm" className="justify-self-start" onClick={remove}>
            <Trash2 className="size-4" /> {copy.remove}
          </Button>
        </div>
      ) : null}
      {selPoint && sel && (sel.type === "entrance" || sel.type === "lift" || sel.type === "pin") ? (
        <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
          <p className="font-medium sm:col-span-2">
            {sel.type === "entrance"
              ? copy.entrance
              : sel.type === "lift"
                ? copy.lift
                : copy.roomPin}
          </p>
          {sel.type === "entrance" && pins.entrance ? (
            <KindSelect
              label={copy.facing}
              value={pins.entrance.facing}
              options={(["up", "down", "left", "right"] as Facing[]).map((f) => [
                f,
                copy.facings[f] ?? f,
              ])}
              onChange={(v) =>
                setPins((p) =>
                  p.entrance ? { ...p, entrance: { ...p.entrance, facing: v as Facing } } : p,
                )
              }
              block
            />
          ) : null}
          {sel.type === "pin" ? (
            <KindSelect
              label={copy.room}
              value={sel.id}
              options={rooms.map((r) => [r.id, r.name] as [string, string])}
              onChange={(v) => {
                if (v === sel.id) return;
                setPins((p) => {
                  const r = { ...(p.rooms ?? {}) };
                  const q = r[sel.id]!;
                  delete r[sel.id];
                  return { ...p, rooms: { ...r, [v]: q } };
                });
                setSel({ type: "pin", id: v });
              }}
              block
            />
          ) : null}
          <p className="text-sm text-muted-foreground sm:col-span-2">{copy.dragHelp}</p>
          <Button variant="ghost" size="sm" className="justify-self-start" onClick={remove}>
            <Trash2 className="size-4" /> {copy.remove}
          </Button>
        </div>
      ) : null}
      {selItem ? (
        <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>{copy.itemKind}</Label>
            <ThingGrid
              value={selItem.kind}
              onPick={(v) => {
                if (v === "radiator") return;
                const k = v as ItemKind;
                const f = FURNITURE[k];
                setPins((p) => ({
                  ...p,
                  items: (p.items ?? []).map((i) => {
                    if (i.id !== selItem.id) return i;
                    const { w: _w, h: _h, ...rest } = i;
                    return f
                      ? { ...rest, kind: k, w: i.w ?? f.w, h: i.h ?? f.h }
                      : { ...rest, kind: k };
                  }),
                }));
              }}
            />
          </div>
          {selItem.w && selItem.h ? (
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
              <p className="text-sm text-muted-foreground">{copy.furnitureHelp}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  patch<Item>("items", selItem.id, { w: selItem.h ?? 0.05, h: selItem.w ?? 0.05 })
                }
              >
                <RotateCw className="size-4" /> {copy.turn}
              </Button>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label>{copy.itemNote}</Label>
            <Input
              value={selItem.note}
              maxLength={120}
              onChange={(e) => patch<Item>("items", selItem.id, { note: e.target.value })}
            />
          </div>
          <p className="text-sm text-muted-foreground sm:col-span-2">
            {(() => {
              const f = mapFloors(now).find((x) => x.id === plan.id);
              const it = f?.map.items.find((x) => x.id === selItem.id);
              if (!f || !it) return null;
              const placed = itemPlace(f, it, roomNames);
              const whose = placed.area?.roomId
                ? copy.itemRoomOnly(roomNames[placed.area.roomId] ?? "")
                : placed.area?.access === "shared"
                  ? copy.itemShared
                  : placed.area
                    ? copy.itemPrivate
                    : null;
              return `${cap(placed.words)}${whose ? `. ${whose}` : ""}`;
            })()}
          </p>
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
  groups,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (v: string) => void;
  block?: boolean;
  /** Shown in groups with headings (the item list by category). */
  groups?: Array<{ label: string; values: string[] }>;
}) {
  return (
    <div className={cn(block ? "space-y-1" : "flex items-center gap-2")}>
      <Label className={cn(!block && "text-sm font-normal")}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={cn(block ? "w-full" : "h-9 w-48")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {groups
            ? groups.map((g) => (
                <SelectGroup key={g.label}>
                  <SelectLabel>{g.label}</SelectLabel>
                  {g.values.map((v) => (
                    <SelectItem key={v} value={v}>
                      {options.find((o) => o[0] === v)?.[1] ?? v}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))
            : options.map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Each category's icon in the things picker. */
const CATEGORY_ICON: Record<string, LucideIcon> = {
  kitchen: Utensils,
  laundry: WashingMachine,
  room: Lamp,
  safety: FireExtinguisher,
  utilities: Thermometer,
  furniture: Sofa,
};

type Thing = ItemKind | "radiator";

/** The categories with their things; radiators (drawn as a line) sit with heating. */
const THING_GROUPS: Array<{ id: string; label: string; kinds: Thing[] }> = ITEM_CATEGORIES.map(
  (c) => ({
    ...c,
    kinds: c.id === "utilities" ? (["radiator", ...c.kinds] as Thing[]) : c.kinds,
  }),
);

const thingIcon = (k: Thing): LucideIcon => (k === "radiator" ? Heater : ITEM_ICON[k]);
const thingWord = (k: Thing) => cap(k === "radiator" ? "radiator" : ITEM_WORDS[k]);

/**
 * Things by category, as icons: categories down the left, that category's things on the right.
 * Names show on hover and to screen readers.
 */
function ThingGrid({
  value,
  onPick,
  withRadiator = false,
}: {
  value: Thing;
  onPick: (k: Thing) => void;
  withRadiator?: boolean;
}) {
  const groups = withRadiator
    ? THING_GROUPS
    : THING_GROUPS.map((g) => ({ ...g, kinds: g.kinds.filter((k) => k !== "radiator") }));
  const [cat, setCat] = useState(
    () => groups.find((g) => g.kinds.includes(value))?.id ?? groups[0]!.id,
  );
  const shown = groups.find((g) => g.id === cat) ?? groups[0]!;
  return (
    <div className="flex gap-2">
      <div
        role="tablist"
        aria-orientation="vertical"
        className="flex flex-col gap-1 border-r border-border pr-2"
      >
        {groups.map((g) => {
          const Icon = CATEGORY_ICON[g.id] ?? Package;
          return (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={cat === g.id}
              aria-label={g.label}
              title={g.label}
              onClick={() => setCat(g.id)}
              className={cn(
                "grid size-11 place-items-center rounded-xl sm:size-10",
                cat === g.id ? "bg-secondary text-primary ring-1 ring-primary" : "hover:bg-muted",
              )}
            >
              <Icon className="size-5" aria-hidden />
            </button>
          );
        })}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{shown.label}</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1">
          {shown.kinds.map((k) => {
            const Icon = thingIcon(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={value === k}
                aria-label={thingWord(k)}
                title={thingWord(k)}
                onClick={() => onPick(k)}
                className={cn(
                  "grid size-11 place-items-center rounded-xl sm:size-10",
                  value === k ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** The toolbar's Things button: shows the thing being placed; opens the picker. */
function ThingPicker({
  value,
  active,
  side,
  onPick,
}: {
  value: Thing;
  active: boolean;
  side: "left" | "right" | "top" | "bottom";
  onPick: (k: Thing) => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = thingIcon(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-pressed={active}
          aria-label={`${copy.groups.things}: ${thingWord(value)}`}
          title={`${copy.groups.things}: ${thingWord(value)}`}
          className={cn(
            "relative grid size-11 shrink-0 place-items-center rounded-xl sm:size-10",
            active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
          )}
        >
          <Icon className="size-5" aria-hidden />
          <Package className="absolute bottom-0.5 right-0.5 size-2.5 opacity-70" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} align="start" className="w-[min(20rem,90vw)] p-2">
        <ThingGrid
          value={value}
          withRadiator
          onPick={(k) => {
            onPick(k);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
