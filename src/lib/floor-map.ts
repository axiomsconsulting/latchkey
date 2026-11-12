/**
 * The floor map drawn over each floor plan (stored with the plan's marks in floor_plans.pins, so no
 * new column): areas (rooms, bathrooms, hallways, landings, stairwells, kitchens…, each shared,
 * one guest's room, or private), lines (doors, open doorways, steps, barred doors, curtains, lines
 * marking a private area, stairs straight / turning / curved, radiators) and items (fridge,
 * microwave, cutlery, crockery, thermostat, heater…). From it Latchkey works out the guest's way in
 * along real doors and stairs, never through a private area, and says it in plain words ("the
 * second door on your left"), plus which shared spaces guests may use, what's in them, what's
 * private, and where the heating is. Only the host's marks count; an AI reading of the plan only
 * proposes marks for the host to check. Pure; tested in tests/floor-map.test.ts.
 */

export type Point = { x: number; y: number };
export type Facing = "up" | "down" | "left" | "right";

export const AREA_KINDS = [
  "entrance",
  "hallway",
  "landing",
  "stairwell",
  "bedroom",
  "bathroom",
  "ensuite",
  "wc",
  "kitchen",
  "kitchenette",
  "lounge",
  "dining",
  "utility",
  "office",
  "garden",
  "other",
] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

/** shared: any guest may use it; guest_room: only the guest staying in it (bedrooms, en-suites); private: no guests. */
export type Access = "shared" | "guest_room" | "private";

export type Area = {
  id: string;
  kind: AreaKind;
  name: string;
  /** Corners as fractions of the picture (0 to 1). */
  poly: Point[];
  access: Access;
  /** The bookable room this is (a bedroom, or an en-suite belonging to it). */
  roomId: string | null;
};

export const LINE_KINDS = [
  "door",
  "opening",
  "steps",
  "barred",
  "curtain",
  "private",
  "stairs",
  "radiator",
] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export type StairShape = "auto" | "straight" | "turning" | "curved";

export type Line = {
  id: string;
  kind: LineKind;
  /** Drawn in order: stairs from this floor towards the floor they lead to; steps from the lower side. */
  pts: Point[];
  /** Stairs: where they lead and their shape (auto = from the line as drawn). */
  toLevel?: number | null;
  shape?: StairShape;
  /** Steps (and stairs, if the host counts them). */
  count?: number | null;
};

export const ITEM_KINDS = [
  "fridge",
  "freezer",
  "microwave",
  "kettle",
  "toaster",
  "hob",
  "oven",
  "sink",
  "dishwasher",
  "cutlery",
  "crockery",
  "glasses",
  "pans",
  "washing_machine",
  "dryer",
  "iron",
  "thermostat",
  "heater",
  "boiler",
  "fuse_box",
  "stopcock",
  "first_aid",
  "fire_extinguisher",
  "fire_blanket",
  "bins",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export type Item = { id: string; kind: ItemKind; at: Point; note: string };

export type FloorMap = { areas: Area[]; lines: Line[]; items: Item[] };

/** One floor as the map needs it. */
export type MapFloor = {
  id: string;
  level: number;
  /** "" for the main house, else the building's name ("Annex", "Coach house"): each has its own floors and entrance. */
  building?: string;
  entrance?: (Point & { facing: Facing }) | undefined;
  lift?: Point | undefined;
  /** Older single-point room marks (room id → point). */
  rooms?: Record<string, Point>;
  map: FloorMap;
};

/* ------------------------------- words ------------------------------- */

const ORD = [
  "ground",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
];

/** "ground floor", "second floor", "basement", "lower basement" */
export function levelName(level: number): string {
  if (level === -1) return "basement";
  if (level < -1) return "lower basement";
  return `${ORD[level] ?? `${level}th`} floor`;
}

export const AREA_WORDS: Record<AreaKind, string> = {
  entrance: "entrance hall",
  hallway: "hallway",
  landing: "landing",
  stairwell: "stairwell",
  bedroom: "bedroom",
  bathroom: "bathroom",
  ensuite: "en-suite",
  wc: "toilet",
  kitchen: "kitchen",
  kitchenette: "kitchenette",
  lounge: "lounge",
  dining: "dining room",
  utility: "utility room",
  office: "office",
  garden: "garden",
  other: "room",
};

export const ITEM_WORDS: Record<ItemKind, string> = {
  fridge: "fridge",
  freezer: "freezer",
  microwave: "microwave",
  kettle: "kettle",
  toaster: "toaster",
  hob: "hob",
  oven: "oven",
  sink: "sink",
  dishwasher: "dishwasher",
  cutlery: "cutlery",
  crockery: "crockery",
  glasses: "glasses",
  pans: "pans",
  washing_machine: "washing machine",
  dryer: "tumble dryer",
  iron: "iron",
  thermostat: "thermostat",
  heater: "heater",
  boiler: "boiler",
  fuse_box: "fuse box",
  stopcock: "water stopcock",
  first_aid: "first aid kit",
  fire_extinguisher: "fire extinguisher",
  fire_blanket: "fire blanket",
  bins: "bins",
};

/** Who may use an area of this kind until the host says otherwise. */
export function defaultAccess(kind: AreaKind): Access {
  if (kind === "bedroom" || kind === "ensuite") return "guest_room";
  if (
    kind === "entrance" ||
    kind === "hallway" ||
    kind === "landing" ||
    kind === "stairwell" ||
    kind === "kitchenette" ||
    kind === "bathroom" ||
    kind === "wc"
  )
    return "shared";
  return "private";
}

const CIRCULATION: AreaKind[] = ["entrance", "hallway", "landing", "stairwell"];
const DOORLIKE: LineKind[] = ["door", "opening", "steps"];
const BARRIERS: LineKind[] = ["barred", "curtain", "private"];

/* ---------------------------- normalising ---------------------------- */

const ID = /^[a-z0-9]{4,24}$/;
const UUID = /^[0-9a-f-]{36}$/i;

const pt = (v: unknown): Point | null => {
  const o = (v ?? {}) as Record<string, unknown>;
  const x = Number(o["x"]);
  const y = Number(o["y"]);
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1
    ? { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 }
    : null;
};
const pts = (v: unknown, min: number, max: number): Point[] | null => {
  if (!Array.isArray(v)) return null;
  const out = v.map(pt).filter((p): p is Point => !!p);
  return out.length >= min && out.length === v.length ? out.slice(0, max) : null;
};
const words = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        // eslint-disable-next-line no-control-regex -- strips control characters
        .replace(/[\u0000-\u001f<>]/g, "")
        .trim()
        .slice(0, max)
    : "";
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

/** A floor map from storage (or from the AI's proposal), made safe. */
export function normaliseMap(raw: unknown): FloorMap {
  const o = (raw ?? {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const fresh = (v: unknown) => {
    const id = typeof v === "string" && ID.test(v) && !seen.has(v) ? v : null;
    if (id) seen.add(id);
    return id;
  };
  const areas: Area[] = [];
  for (const a of Array.isArray(o["areas"]) ? (o["areas"] as unknown[]).slice(0, 80) : []) {
    const r = (a ?? {}) as Record<string, unknown>;
    const id = fresh(r["id"]);
    const poly = pts(r["poly"], 3, 24);
    if (!id || !poly) continue;
    const kind = pick(r["kind"], AREA_KINDS, "other");
    areas.push({
      id,
      kind,
      name: words(r["name"], 40),
      poly,
      access: pick(r["access"], ["shared", "guest_room", "private"] as const, defaultAccess(kind)),
      roomId: typeof r["roomId"] === "string" && UUID.test(r["roomId"]) ? r["roomId"] : null,
    });
  }
  const lines: Line[] = [];
  for (const l of Array.isArray(o["lines"]) ? (o["lines"] as unknown[]).slice(0, 150) : []) {
    const r = (l ?? {}) as Record<string, unknown>;
    const id = fresh(r["id"]);
    const p = pts(r["pts"], 2, 16);
    if (!id || !p) continue;
    const kind = pick(r["kind"], LINE_KINDS, "door");
    const line: Line = { id, kind, pts: p };
    if (kind === "stairs") {
      const to = Number(r["toLevel"]);
      line.toLevel = Number.isInteger(to) && to >= -3 && to <= 30 ? to : null;
      line.shape = pick(r["shape"], ["auto", "straight", "turning", "curved"] as const, "auto");
    }
    if (kind === "stairs" || kind === "steps") {
      const n = Number(r["count"]);
      line.count = Number.isInteger(n) && n > 0 && n <= 60 ? n : null;
    }
    lines.push(line);
  }
  const items: Item[] = [];
  for (const it of Array.isArray(o["items"]) ? (o["items"] as unknown[]).slice(0, 120) : []) {
    const r = (it ?? {}) as Record<string, unknown>;
    const id = fresh(r["id"]);
    const at = pt(r["at"]);
    if (!id || !at || !ITEM_KINDS.includes(r["kind"] as ItemKind)) continue;
    items.push({ id, kind: r["kind"] as ItemKind, at, note: words(r["note"], 120) });
  }
  return { areas, lines, items };
}

/** A short random id for a new mark. */
export function markId(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(6, "0");
}

/* ----------------------------- geometry ----------------------------- */

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Point) => Math.hypot(v.x, v.y);
const dist = (a: Point, b: Point) => len(sub(a, b));
const unit = (v: Point): Point => {
  const l = len(v) || 1;
  return { x: v.x / l, y: v.y / l };
};
const mid = (p: Point[]): Point => {
  // The middle along the line (by length), so a bent line's middle sits on it.
  if (p.length === 2) return { x: (p[0]!.x + p[1]!.x) / 2, y: (p[0]!.y + p[1]!.y) / 2 };
  const total = p.slice(1).reduce((s, q, i) => s + dist(p[i]!, q), 0);
  let left = total / 2;
  for (let i = 1; i < p.length; i++) {
    const d = dist(p[i - 1]!, p[i]!);
    if (d >= left && d > 0) {
      const t = left / d;
      return {
        x: p[i - 1]!.x + (p[i]!.x - p[i - 1]!.x) * t,
        y: p[i - 1]!.y + (p[i]!.y - p[i - 1]!.y) * t,
      };
    }
    left -= d;
  }
  return p[p.length - 1]!;
};

export function centroid(poly: Point[]): Point {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const c = p.x * q.y - q.x * p.y;
    a += c;
    cx += (p.x + q.x) * c;
    cy += (p.y + q.y) * c;
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function inside(p: Point, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      hit = !hit;
  }
  return hit;
}

function segDist(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a);
  const l2 = ab.x * ab.x + ab.y * ab.y;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2)) : 0;
  return dist(p, { x: a.x + ab.x * t, y: a.y + ab.y * t });
}

/** How far p is from the area's outline (0 on it). */
export function edgeDist(p: Point, poly: Point[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++)
    d = Math.min(d, segDist(p, poly[i]!, poly[(i + 1) % poly.length]!));
  return d;
}

const lineDist = (p: Point, line: Point[]) => {
  let d = Infinity;
  for (let i = 1; i < line.length; i++) d = Math.min(d, segDist(p, line[i - 1]!, line[i]!));
  return d;
};

/** Points every `step` along a closed outline. */
function along(poly: Point[], step = 0.005): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let k = 0; k < n; k++)
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

const TOUCH = 0.012;

/** The wall two areas share: its length and middle, or null when they don't touch. */
export function sharedEdge(
  a: Point[],
  b: Point[],
): { length: number; at: Point; pts: Point[] } | null {
  const hits = along(a).filter((p) => edgeDist(p, b) <= TOUCH);
  const length = hits.length * 0.005;
  if (length < 0.02) return null;
  return {
    length,
    at: {
      x: hits.reduce((s, p) => s + p.x, 0) / hits.length,
      y: hits.reduce((s, p) => s + p.y, 0) / hits.length,
    },
    pts: hits,
  };
}

/** The area a point is in (the smallest that holds it), or the nearest within `near`. */
export function areaAt(areas: Area[], p: Point, near = 0.05): Area | null {
  const holding = areas.filter((a) => inside(p, a.poly));
  if (holding.length) return holding.sort((x, y) => polyArea(x.poly) - polyArea(y.poly))[0] ?? null;
  let best: Area | null = null;
  let bd = near;
  for (const a of areas) {
    const d = edgeDist(p, a.poly);
    if (d <= bd) {
      bd = d;
      best = a;
    }
  }
  return best;
}

function polyArea(poly: Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

/** The two areas a door (or curtain, or steps) sits between: the nearest two to its middle. */
function between(areas: Area[], line: Point[]): [Area, Area] | null {
  const m = mid(line);
  const near = areas
    .map((a) => ({
      a,
      d: inside(m, a.poly) ? Math.min(0.0001, edgeDist(m, a.poly)) : edgeDist(m, a.poly),
    }))
    .filter((x) => x.d <= 0.04)
    .sort((x, y) => x.d - y.d);
  // Both ends of a line help when its middle is in one area only (a door drawn just inside a room).
  if (near.length < 2) {
    for (const end of [line[0]!, line[line.length - 1]!]) {
      const a = areaAt(areas, end, 0.03);
      if (a && !near.some((x) => x.a.id === a.id)) near.push({ a, d: 0.04 });
    }
  }
  return near.length >= 2 ? [near[0]!.a, near[1]!.a] : null;
}

/* ----------------------------- stairs ----------------------------- */

/** Turns along a line, in degrees: positive to the right (the picture's y runs down). */
function turns(p: Point[]): number[] {
  const out: number[] = [];
  for (let i = 2; i < p.length; i++) {
    const a = unit(sub(p[i - 1]!, p[i - 2]!));
    const b = unit(sub(p[i]!, p[i - 1]!));
    out.push((Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y) * 180) / Math.PI);
  }
  return out;
}

/** The stairs' shape as drawn: straight, turning (sharp corners) or curved (many small bends). */
export function stairShape(p: Point[]): {
  shape: Exclude<StairShape, "auto">;
  corners: number;
  side: "left" | "right" | null;
  total: number;
} {
  const t = turns(p);
  const total = t.reduce((s, x) => s + x, 0);
  const side = Math.abs(total) < 30 ? null : total > 0 ? "right" : "left";
  if (Math.abs(total) < 30 && t.every((x) => Math.abs(x) < 30))
    return { shape: "straight", corners: 0, side: null, total };
  const corners = t.filter((x) => Math.abs(x) >= 60).length;
  if (corners > 0) return { shape: "turning", corners, side, total };
  return { shape: "curved", corners: 0, side, total };
}

/** How the stairs go, in words, as you climb (or go down) them. */
export function stairWords(line: Line, reverse: boolean): string {
  const p = reverse ? [...line.pts].reverse() : line.pts;
  const s = stairShape(p);
  const shape = line.shape && line.shape !== "auto" ? line.shape : s.shape;
  const side = s.side ? ` to the ${s.side}` : "";
  if (shape === "straight") return "They go straight";
  if (shape === "curved") return `They curve round${side}`;
  if (Math.abs(s.total) > 150 && s.side) return `They turn back on themselves${side}`;
  const n = Math.max(1, s.corners);
  return `They turn${side}${n === 1 ? " once" : n === 2 ? " twice" : ` ${n} times`}`;
}

/* ------------------------------ routes ------------------------------ */

type Node = { floor: MapFloor; area: Area };
type Via =
  | { kind: "door" | "opening" | "steps" | "open"; at: Point; line: Line | null }
  | { kind: "stairs"; at: Point; line: Line; reverse: boolean; arrive: Point; heading: Point }
  | { kind: "lift"; at: Point; arrive: Point };
type Edge = { to: string; via: Via; cost: number };

const key = (f: MapFloor, a: Area) => `${f.id}:${a.id}`;

/** Every way between areas: doors, open doorways, steps, open hallways, stairs and the lift. */
export function connections(floors: MapFloor[]): Map<string, Edge[]> {
  const g = new Map<string, Edge[]>();
  const add = (from: string, e: Edge) => g.set(from, [...(g.get(from) ?? []), e]);
  const both = (f1: MapFloor, a: Area, f2: MapFloor, b: Area, via: Via, back: Via, extra = 0) => {
    const ca = centroid(a.poly);
    const cb = centroid(b.poly);
    const cost = dist(ca, via.at) + dist(via.at, cb) + extra;
    add(key(f1, a), { to: key(f2, b), via, cost });
    add(key(f2, b), { to: key(f1, a), via: back, cost });
  };
  for (const f of floors) {
    const { areas, lines } = f.map;
    const barriers = lines.filter((l) => BARRIERS.includes(l.kind));
    const doors = lines.filter((l) => DOORLIKE.includes(l.kind));
    const linked = new Set<string>();
    for (const l of doors) {
      const pair = between(areas, l.pts);
      if (!pair) continue;
      const at = mid(l.pts);
      const kind = l.kind as "door" | "opening" | "steps";
      both(f, pair[0], f, pair[1], { kind, at, line: l }, { kind, at, line: l });
      linked.add([pair[0].id, pair[1].id].sort().join("|"));
    }
    // Open between hallways, landings and stairwells (and, on a floor with no doors drawn, between
    // any touching areas), unless a barred door, curtain or private line runs along the shared wall.
    const anyDoors = doors.length > 0;
    for (let i = 0; i < areas.length; i++)
      for (let j = i + 1; j < areas.length; j++) {
        const a = areas[i]!;
        const b = areas[j]!;
        if (linked.has([a.id, b.id].sort().join("|"))) continue;
        if (anyDoors && !(CIRCULATION.includes(a.kind) && CIRCULATION.includes(b.kind))) continue;
        const e = sharedEdge(a.poly, b.poly);
        if (!e) continue;
        const blocked =
          e.pts.filter((p) => barriers.some((l) => lineDist(p, l.pts) <= 0.02)).length >=
          e.pts.length * 0.4;
        if (blocked) continue;
        both(
          f,
          a,
          f,
          b,
          { kind: "open", at: e.at, line: null },
          { kind: "open", at: e.at, line: null },
        );
      }
    // Stairs, drawn on this floor towards the floor they lead to.
    for (const l of lines.filter((x) => x.kind === "stairs")) {
      const goesUp = l.toLevel == null || l.toLevel > f.level;
      const toLevel = l.toLevel ?? f.level + (goesUp ? 1 : -1);
      const other = floors.find(
        (x) => x.level === toLevel && (x.building ?? "") === (f.building ?? ""),
      );
      const start = l.pts[0]!;
      const end = l.pts[l.pts.length - 1]!;
      const here = areaAt(areas, start, 0.08);
      if (!other || !here) continue;
      const landing =
        areaAt(other.map.areas, end, 0.03) ??
        nearestOf(
          other.map.areas.filter((a) => CIRCULATION.includes(a.kind)),
          end,
        ) ??
        nearestOf(other.map.areas, end);
      if (!landing) continue;
      const lastDir = unit(sub(end, l.pts[l.pts.length - 2]!));
      const firstDir = unit(sub(l.pts[0]!, l.pts[1]!));
      const flights = Math.abs(toLevel - f.level);
      both(
        f,
        here,
        other,
        landing,
        { kind: "stairs", at: start, line: l, reverse: false, arrive: end, heading: lastDir },
        { kind: "stairs", at: end, line: l, reverse: true, arrive: start, heading: firstDir },
        0.3 * flights,
      );
    }
  }
  // The lift joins every floor of the same building where it's marked.
  const lifts = floors
    .map((f) => ({ f, a: f.lift ? areaAt(f.map.areas, f.lift, 0.06) : null }))
    .filter((x): x is { f: MapFloor; a: Area } => !!x.a && !!x.f.lift);
  for (let i = 0; i < lifts.length; i++)
    for (let j = i + 1; j < lifts.length; j++) {
      const x = lifts[i]!;
      const y = lifts[j]!;
      if ((x.f.building ?? "") !== (y.f.building ?? "")) continue;
      both(
        x.f,
        x.a,
        y.f,
        y.a,
        { kind: "lift", at: x.f.lift!, arrive: y.f.lift! },
        { kind: "lift", at: y.f.lift!, arrive: x.f.lift! },
        0.5 + 0.1 * Math.abs(x.f.level - y.f.level),
      );
    }
  return g;
}

function nearestOf(areas: Area[], p: Point): Area | null {
  let best: Area | null = null;
  let bd = Infinity;
  for (const a of areas) {
    const d = inside(p, a.poly) ? 0 : edgeDist(p, a.poly);
    if (d < bd) {
      bd = d;
      best = a;
    }
  }
  return best;
}

/** Where a room is: its own area, or the area holding its older pin. */
export function roomArea(floors: MapFloor[], roomId: string): Node | null {
  for (const f of floors) {
    const a = f.map.areas.find((x) => x.roomId === roomId && x.kind !== "ensuite");
    if (a) return { floor: f, area: a };
  }
  for (const f of floors) {
    const pin = f.rooms?.[roomId];
    const a = pin ? areaAt(f.map.areas, pin, 0.02) : null;
    if (a) return { floor: f, area: a };
  }
  return null;
}

/** Who may walk through an area on the way to `roomId`: shared areas, and the room itself. */
const passable = (a: Area, roomId: string) =>
  a.access === "shared" || (a.access === "guest_room" && a.roomId === roomId);

/** The shortest way from the entrance to the room through areas the guest may use, or null. */
export function findRoute(
  floors: MapFloor[],
  roomId: string,
): { start: Node; steps: Array<{ from: Node; to: Node; via: Via }> } | null {
  const goal = roomArea(floors, roomId);
  if (!goal) return null;
  // The entrance of the building the room is in (an annex has its own).
  const home = floors.find((f) => f.entrance && (f.building ?? "") === (goal.floor.building ?? ""));
  if (!home?.entrance) return null;
  const startArea = areaAt(home.map.areas, home.entrance, 0.06);
  if (!startArea) return null;
  const start: Node = { floor: home, area: startArea };
  const nodes = new Map<string, Node>();
  for (const f of floors) for (const a of f.map.areas) nodes.set(key(f, a), { floor: f, area: a });
  const g = connections(floors);
  const goalKey = key(goal.floor, goal.area);
  const best = new Map<string, number>([[key(home, startArea), 0]]);
  const prev = new Map<string, { from: string; via: Via }>();
  const open = new Set<string>([key(home, startArea)]);
  while (open.size) {
    let cur = "";
    let cd = Infinity;
    for (const k of open)
      if ((best.get(k) ?? Infinity) < cd) {
        cd = best.get(k)!;
        cur = k;
      }
    open.delete(cur);
    if (cur === goalKey) break;
    // Never through anywhere private, or another guest's room (the start is always allowed).
    const here = nodes.get(cur)!;
    if (cur !== key(home, startArea) && !passable(here.area, roomId)) continue;
    for (const e of g.get(cur) ?? []) {
      const n = nodes.get(e.to);
      if (!n || (!passable(n.area, roomId) && e.to !== goalKey)) continue;
      if (n.area.access === "private") continue;
      const d = cd + e.cost;
      if (d < (best.get(e.to) ?? Infinity)) {
        best.set(e.to, d);
        prev.set(e.to, { from: cur, via: e.via });
        open.add(e.to);
      }
    }
  }
  if (!best.has(goalKey)) return null;
  const steps: Array<{ from: Node; to: Node; via: Via }> = [];
  for (let k = goalKey; prev.has(k);) {
    const p = prev.get(k)!;
    steps.unshift({ from: nodes.get(p.from)!, to: nodes.get(k)!, via: p.via });
    k = p.from;
  }
  return { start, steps };
}

/* ---------------------------- directions ---------------------------- */

const VEC: Record<Facing, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Where `to` is from `from` while walking `heading`: ahead / behind / left / right, and how far along. */
export function relative(from: Point, heading: Point, to: Point): { ahead: number; right: number } {
  const h = unit(heading);
  const r = { x: -h.y, y: h.x };
  const d = sub(to, from);
  return { ahead: d.x * h.x + d.y * h.y, right: d.x * r.x + d.y * r.y };
}

/** Doors along a corridor are on one side however far ahead they are, so the side wins once it's clear. */
function sideWord(rel: { ahead: number; right: number }): "ahead" | "left" | "right" | "behind" {
  if (rel.ahead < -0.04 && Math.abs(rel.right) < Math.abs(rel.ahead)) return "behind";
  if (Math.abs(rel.right) >= 0.04) return rel.right > 0 ? "right" : "left";
  return "ahead";
}

const ORDINAL = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

export const nameOf = (a: Area, roomNames: Record<string, string> = {}) =>
  (a.roomId && a.kind !== "ensuite" ? roomNames[a.roomId] : null) || a.name || AREA_WORDS[a.kind];

const into = (a: Area, names: Record<string, string>) => {
  const n = nameOf(a, names);
  const the = a.name || (a.roomId && names[a.roomId]) ? "" : "the ";
  return `${a.kind === "landing" ? "onto" : "into"} ${the}${n}`;
};
const where = (w: ReturnType<typeof sideWord>) =>
  w === "ahead" ? "ahead" : w === "behind" ? "behind you" : `on your ${w}`;

export type MapDirections = {
  steps: string[];
  /** The way drawn on each floor, in order. */
  route: Array<{ planId: string; level: number; points: Point[] }>;
  planId: string;
  level: number;
  at: Point;
  /** The room's outline, to light up. */
  area: Point[];
  /** Heating in the room, said from its door. */
  heating: string[];
};

/**
 * The way from the main entrance to a room through doors, open hallways, steps, stairs or the
 * lift, in short steps, or null when the map doesn't join them (then the older directions apply).
 */
export function mapDirections(
  floors: MapFloor[],
  roomId: string,
  roomName: string,
  roomNames: Record<string, string> = {},
): MapDirections | null {
  const r = findRoute(floors, roomId);
  if (!r) return null;
  const names = { ...roomNames, [roomId]: roomName };
  const home = r.start.floor;
  let pos: Point = { x: home.entrance!.x, y: home.entrance!.y };
  let heading = VEC[home.entrance!.facing];
  const door = entranceName(home.building);
  const steps: string[] = [`Come in through ${door} ${into(r.start.area, names)}.`];
  const route: MapDirections["route"] = [{ planId: home.id, level: home.level, points: [pos] }];
  const last = () => route[route.length - 1]!;
  const goal = r.steps.length ? r.steps[r.steps.length - 1]!.to : r.start;
  if (!r.steps.length) steps[0] = `Come in through ${door}: ${roomName} is right there.`;

  for (let i = 0; i < r.steps.length; i++) {
    const s = r.steps[i]!;
    const v = s.via;
    // A long way across a hallway or landing to one side: turn along it first.
    const turn = turnAlong(s.from.area, pos, heading, v.at);
    if (turn) {
      steps.push(
        `Turn ${turn.side} ${turn.along ? `along the ${nameOf(s.from.area, names)}` : ""}`.trim() +
          ".",
      );
      heading = turn.heading;
    }
    const rel = relative(pos, heading, v.at);
    const w = sideWord(rel);
    const close = Math.hypot(rel.ahead, rel.right) < 0.05;
    const isGoal = s.to === goal;
    last().points.push(v.at);
    if (v.kind === "stairs" || v.kind === "lift") {
      // Several flights in a row are said once.
      let to = s.to;
      let j = i;
      while (r.steps[j + 1] && r.steps[j + 1]!.via.kind === v.kind) {
        j++;
        to = r.steps[j]!.to;
      }
      const up = to.floor.level > s.from.floor.level;
      const floorsGone = Math.abs(to.floor.level - s.from.floor.level);
      const how =
        floorsGone > 1 ? `${up ? "up" : "down"} ${floorsGone} floors` : up ? "up" : "down";
      const place = close ? "" : ` ${where(w)}`;
      if (v.kind === "lift")
        steps.push(`Take the lift${place} ${how} to the ${levelName(to.floor.level)}.`);
      else {
        const shape = stairWords(v.line, v.reverse);
        const n = v.line.count ? ` (${v.line.count} steps)` : "";
        steps.push(
          `Take the stairs${place} ${how} to the ${levelName(to.floor.level)}${n}. ${shape}${floorsGone > 1 ? " on the first flight" : ""}.`,
        );
      }
      // On the new floor: where the stairs (or lift) come out.
      const lastStep = r.steps[j]!;
      const arrive =
        lastStep.via.kind === "stairs" || lastStep.via.kind === "lift" ? lastStep.via.arrive : v.at;
      route.push({ planId: to.floor.id, level: to.floor.level, points: [arrive] });
      pos = arrive;
      if (lastStep.via.kind === "stairs") heading = lastStep.via.heading;
      const isEnd = to === goal;
      if (isEnd) steps.push(`${roomName} is right at the ${up ? "top" : "bottom"} of the stairs.`);
      else if (to.area.kind !== "stairwell") steps.push(`You come out ${into(to.area, names)}.`);
      i = j;
      continue;
    }
    // Which door along this side it is, counting doors passed on the same side.
    let ord = "";
    if (v.kind === "door" && (w === "left" || w === "right") && !close) {
      const here = s.from.area;
      const others = s.from.floor.map.lines
        .filter((l) => l.kind === "door" && l !== v.line)
        .map((l) => mid(l.pts))
        .filter((m) => edgeDist(m, here.poly) <= 0.03)
        .map((m) => relative(pos, heading, m))
        .filter((x) => sideWord(x) === w && x.ahead > -0.02 && x.ahead < rel.ahead - 0.01);
      ord = ORDINAL[others.length] ?? "";
    }
    const place = close ? "" : ` ${where(w)}`;
    const doorWord = v.kind === "opening" ? "doorway" : "door";
    if (isGoal) {
      if (v.kind === "open") steps.push(`${roomName} is${place || " here"}.`);
      else if (v.kind === "steps")
        steps.push(`${roomName} is${place || " here"}, ${stepsWords(v.line!, pos)}.`);
      else steps.push(`${roomName} is the ${ord ? `${ord} ` : ""}${doorWord}${place || " here"}.`);
    } else if (v.kind === "open") {
      // Walking into a stairwell just to take the stairs: the stairs' own step says where they are.
      const next = r.steps[i + 1]?.via.kind;
      if (!(s.to.area.kind === "stairwell" && (next === "stairs" || next === "lift")))
        steps.push(
          `${w === "ahead" || close ? "Carry on" : `Turn ${w === "behind" ? "round" : w}`} ${into(s.to.area, names)}.`,
        );
    } else if (v.kind === "steps")
      steps.push(`${capital(stepsWords(v.line!, pos))}${place}, ${into(s.to.area, names)}.`);
    else
      steps.push(
        `Go through the ${ord ? `${ord} ` : ""}${doorWord}${place} ${into(s.to.area, names)}.`,
      );
    // Walking on: through the door, into the next area.
    const next = centroid(s.to.area.poly);
    heading = unit(sub(next, v.at));
    if (len(sub(next, v.at)) < 1e-6) heading = unit(sub(v.at, pos));
    pos = v.at;
  }
  const at = centroid(goal.area.poly);
  last().points.push(at);
  return {
    steps,
    route: route.filter((x) => x.points.length > 1),
    planId: goal.floor.id,
    level: goal.floor.level,
    at,
    area: goal.area.poly,
    heating: heatingWords(goal.floor, goal.area, pos, heading),
  };
}

/**
 * When the next door or stairs are well off to one side in a hallway or landing, the guest turns
 * along it first: the new heading is the area's long direction towards the target.
 */
function turnAlong(
  area: Area,
  pos: Point,
  heading: Point,
  to: Point,
): { side: "left" | "right"; heading: Point; along: boolean } | null {
  const d = sub(to, pos);
  if (len(d) < 0.12) return null;
  const xs = area.poly.map((p) => p.x);
  const ys = area.poly.map((p) => p.y);
  const wide = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
  const along = CIRCULATION.includes(area.kind);
  const axis: Point = along
    ? wide
      ? { x: Math.sign(d.x) || 1, y: 0 }
      : { x: 0, y: Math.sign(d.y) || 1 }
    : unit(d);
  const h = unit(heading);
  const dot = h.x * axis.x + h.y * axis.y;
  if (dot > 0.5) return null;
  // Only when the target lies mostly along the new direction, not just beside where they stand.
  const rel = relative(pos, axis, to);
  if (rel.ahead < 0.05) return null;
  const cross = h.x * axis.y - h.y * axis.x;
  if (Math.abs(cross) < 0.5) return null;
  return { side: cross > 0 ? "right" : "left", heading: axis, along };
}

/** "the main entrance", or "the annex's entrance" for a separate building. */
export function entranceName(building: string | undefined): string {
  return building ? `the ${building.replace(/^the /i, "")}'s entrance` : "the main entrance";
}

/** How a floor is named in tabs and on guest pages: "Ground floor", "Annex · First floor". */
export function floorTitle(
  building: string | undefined,
  level: number,
  label?: string | null,
): string {
  const l = levelName(level);
  const base = `${l.charAt(0).toUpperCase()}${l.slice(1)}`;
  return [building, label || base].filter(Boolean).join(" · ");
}

/** Floors in order: the main house first, then each building, each from its lowest level up. */
export function sortFloors<T extends { level: number; building?: string }>(floors: T[]): T[] {
  return [...floors].sort(
    (a, b) =>
      Number(!!a.building) - Number(!!b.building) ||
      (a.building ?? "").localeCompare(b.building ?? "") ||
      a.level - b.level,
  );
}

/** Levels missing between a building's floors (stairs to them can't be followed), as level numbers. */
export function missingLevels(levels: number[]): number[] {
  if (!levels.length) return [];
  const have = new Set(levels);
  const out: number[] = [];
  for (let l = Math.min(...levels); l <= Math.max(...levels); l++) if (!have.has(l)) out.push(l);
  return out;
}

/** The levels a new floor can take in a building: the next one up and the next one down (each free). */
export function nextLevels(levels: number[]): number[] {
  if (!levels.length) return [0];
  const up = Math.max(...levels) + 1;
  const down = Math.min(...levels) - 1;
  return [up, ...(down >= -3 ? [down] : [])].filter((l) => l <= 30);
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function stepsWords(l: Line, from: Point): string {
  // Drawn from the lower side: walking from nearer the first point means going up.
  const up = dist(from, l.pts[0]!) <= dist(from, l.pts[l.pts.length - 1]!);
  const n = l.count;
  return `mind the ${n ? `${n} ${n === 1 ? "step" : "steps"}` : "steps"} ${up ? "up" : "down"}`;
}

/** Radiators, heaters and the thermostat in a room, said as you walk in through its door. */
export function heatingWords(floor: MapFloor, area: Area, door: Point, heading: Point): string[] {
  const out: string[] = [];
  const say = (what: string, p: Point) => {
    const rel = relative(door, heading, p);
    const w = sideWord(rel);
    const depth = rel.ahead > 0.12 ? ", at the far end" : rel.ahead < 0.04 ? ", by the door" : "";
    out.push(
      `The ${what} is ${w === "ahead" ? "straight ahead" : w === "behind" ? "behind the door" : `on your ${w}`}${depth} as you walk in.`,
    );
  };
  for (const l of floor.map.lines)
    if (l.kind === "radiator" && inside(mid(l.pts), area.poly)) say("radiator", mid(l.pts));
  for (const it of floor.map.items)
    if ((it.kind === "heater" || it.kind === "thermostat") && inside(it.at, area.poly))
      say(ITEM_WORDS[it.kind], it.at);
  return out.slice(0, 4);
}

/* --------------------------- the house in words --------------------------- */

export type HouseNotes = {
  /** Shared spaces guests may use, with what's in them. */
  shared: Array<{ name: string; level: number; items: string[] }>;
  /** Areas guests may not go into. */
  private: Array<{ name: string; level: number }>;
  /** Barred doors, curtains and private lines, where they are. */
  barriers: string[];
  /** Thermostats, boilers, fuse boxes, first aid and fire safety, where they are. */
  useful: string[];
};

const SAFETY: ItemKind[] = [
  "thermostat",
  "boiler",
  "fuse_box",
  "stopcock",
  "first_aid",
  "fire_extinguisher",
  "fire_blanket",
  "bins",
];

const itemText = (it: Item) => `${ITEM_WORDS[it.kind]}${it.note ? ` (${it.note})` : ""}`;

/** The spaces guests may use, what's private and where useful things are, from every floor's map. */
export function houseNotes(floors: MapFloor[], roomNames: Record<string, string> = {}): HouseNotes {
  const notes: HouseNotes = { shared: [], private: [], barriers: [], useful: [] };
  for (const f of [...floors].sort((a, b) => a.level - b.level)) {
    const { areas, lines, items } = f.map;
    const at = (p: Point) => areaAt(areas, p, 0.02);
    for (const a of areas) {
      const inHere = items.filter(
        (it) => !SAFETY.includes(it.kind) && it.kind !== "heater" && at(it.at)?.id === a.id,
      );
      if (a.access === "shared" && !CIRCULATION.includes(a.kind))
        notes.shared.push({
          name: nameOf(a, roomNames),
          level: f.level,
          items: inHere.map(itemText),
        });
      if (a.access === "private")
        notes.private.push({ name: nameOf(a, roomNames), level: f.level });
    }
    for (const l of lines.filter((x) => BARRIERS.includes(x.kind))) {
      const a = at(mid(l.pts));
      const what =
        l.kind === "barred" ? "A locked door" : l.kind === "curtain" ? "A curtain" : "A line";
      notes.barriers.push(
        `${what}${a ? ` in the ${nameOf(a, roomNames)}` : ""} on the ${levelName(f.level)} marks a private area: please don't go past it.`,
      );
    }
    for (const it of items.filter((x) => SAFETY.includes(x.kind))) {
      const a = at(it.at);
      notes.useful.push(
        `The ${itemText(it)} is ${a ? `in the ${nameOf(a, roomNames)}` : "here"} on the ${levelName(f.level)}.`,
      );
    }
  }
  return notes;
}

/** The notes as one block of text (the receptionist's knowledge). */
export function houseText(n: HouseNotes): string {
  const lines: string[] = [];
  if (n.shared.length)
    lines.push(
      `Shared spaces guests may use: ${n.shared
        .map(
          (s) =>
            `${s.name} (${levelName(s.level)})${s.items.length ? ` with ${s.items.join(", ")}` : ""}`,
        )
        .join("; ")}.`,
    );
  if (n.private.length)
    lines.push(
      `Private, not for guests: ${n.private.map((s) => `${s.name} (${levelName(s.level)})`).join("; ")}.`,
    );
  lines.push(...n.barriers, ...n.useful);
  return lines.join("\n");
}

/** A floor's map is worth using once it has areas. */
export const hasMap = (m: FloorMap | undefined | null) => !!m && m.areas.length > 0;

/* --------------------------- reading a plan (AI) --------------------------- */

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The bookable room a label printed on a plan names ("Bedroom 2", "Room 2", "The Garden Room"), if any. */
export function matchRoomLabel(
  label: string,
  rooms: Array<{ id: string; name: string }>,
): string | null {
  const l = squash(label);
  if (!l) return null;
  const exact = rooms.find((r) => squash(r.name) === l);
  if (exact) return exact.id;
  const num = /\b(\d{1,3})\b/.exec(l)?.[1];
  if (num) {
    const same = rooms.filter((r) => new RegExp(`\\b${num}\\b`).test(squash(r.name)));
    if (same.length === 1) return same[0]!.id;
  }
  const word = rooms.filter((r) => {
    const n = squash(r.name);
    return n.length >= 4 && (l.includes(n) || n.includes(l));
  });
  return word.length === 1 ? word[0]!.id : null;
}

/** What the AI is asked for when it reads a plan (all positions as fractions of the picture). */
export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    is_floor_plan: { type: "boolean" },
    areas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: [...AREA_KINDS] },
          label: { type: "string" },
          corners: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { x: { type: "number" }, y: { type: "number" } },
              required: ["x", "y"],
            },
          },
        },
        required: ["kind", "label", "corners"],
      },
    },
    doors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["door", "opening", "steps"] },
          from: {
            type: "object",
            additionalProperties: false,
            properties: { x: { type: "number" }, y: { type: "number" } },
            required: ["x", "y"],
          },
          to: {
            type: "object",
            additionalProperties: false,
            properties: { x: { type: "number" }, y: { type: "number" } },
            required: ["x", "y"],
          },
        },
        required: ["kind", "from", "to"],
      },
    },
    stairs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          goes: { type: "string", enum: ["up", "down"] },
          path: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { x: { type: "number" }, y: { type: "number" } },
              required: ["x", "y"],
            },
          },
        },
        required: ["goes", "path"],
      },
    },
    entrance: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        facing: { type: "string", enum: ["up", "down", "left", "right"] },
      },
      required: ["x", "y", "facing"],
    },
  },
  required: ["is_floor_plan", "areas", "doors", "stairs", "entrance"],
} as const;

export const PLAN_PROMPT =
  "This picture should be an architectural floor plan of one floor of a house or guest house. " +
  "Give every position as fractions of the picture: x from 0 (left edge) to 1 (right edge), y from 0 (top) to 1 (bottom). " +
  "List each enclosed space as an area with its kind and the label printed on the plan (empty if none), " +
  "and its corners in order around it (four for a rectangle; more for L-shapes). Hallways, landings and " +
  "stairwells are areas too. A room labelled bedroom or with a bed is a bedroom; one with a bath or shower " +
  "next to a bedroom and only reached from it is an ensuite; a separate toilet is wc. " +
  "List each door (the gap in the wall, from one side of the gap to the other), each open doorway or arch as " +
  "opening, and each short flight of a few steps as steps (drawn from the lower side to the higher side). " +
  "List each staircase as stairs with its path along the middle of the treads, in order from this floor towards " +
  "the floor it leads to, following any turns or curves, and whether it goes up or down from this floor. " +
  "Give the main front entrance (if it's on this floor) as the point at the door and which way a person faces " +
  "walking in (up, down, left or right on the picture), else null. Do not guess anything you can't see; " +
  "set is_floor_plan to false if this isn't a floor plan.";

/** The AI's reading of a plan, as marks for the host to check (ids made here; rooms matched by label). */
export function marksFromReading(
  raw: unknown,
  level: number,
  rooms: Array<{ id: string; name: string }>,
): { map: FloorMap; entrance: (Point & { facing: Facing }) | null } | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r["is_floor_plan"] !== true) return null;
  const clamp = (p: unknown) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const x = Number(o["x"]);
    const y = Number(o["y"]);
    return Number.isFinite(x) && Number.isFinite(y)
      ? { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
      : null;
  };
  type Raw = Record<string, unknown> | null | undefined;
  const list = (v: unknown) => (Array.isArray(v) ? (v as Raw[]) : []);
  const used = new Set<string>();
  const areas = list(r["areas"]).map((a) => {
    const kind = pick(a?.["kind"], AREA_KINDS, "other");
    const label = words(a?.["label"], 40);
    let roomId = kind === "bedroom" ? matchRoomLabel(label, rooms) : null;
    if (roomId && used.has(roomId)) roomId = null;
    if (roomId) used.add(roomId);
    return {
      id: markId(),
      kind,
      name: roomId ? "" : label,
      poly: list(a?.["corners"]).map(clamp),
      access: defaultAccess(kind),
      roomId,
    };
  });
  const lines = [
    ...list(r["doors"]).map((d) => ({
      id: markId(),
      kind: pick(d?.["kind"], ["door", "opening", "steps"] as const, "door"),
      pts: [clamp(d?.["from"]), clamp(d?.["to"])],
    })),
    ...list(r["stairs"]).map((st) => ({
      id: markId(),
      kind: "stairs",
      pts: list(st?.["path"]).map(clamp),
      toLevel: st?.["goes"] === "down" ? level - 1 : level + 1,
      shape: "auto",
    })),
  ];
  const map = normaliseMap({ areas, lines, items: [] });
  const e = r["entrance"] ? clamp(r["entrance"]) : null;
  const facing = (r["entrance"] as Record<string, unknown> | null)?.["facing"];
  return {
    map,
    entrance: e
      ? {
          ...e,
          facing: (["up", "down", "left", "right"] as const).includes(facing as Facing)
            ? (facing as Facing)
            : "up",
        }
      : null,
  };
}
