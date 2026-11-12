/**
 * Floor plans and the way to each room (floor_plans, migration 0109). The host uploads a plan per
 * floor (all drawn the same way up) and marks on them: the main entrance (and which way you face
 * walking in), the stairs, a lift, and each room. From those marks Latchkey says the way in plain
 * words: how many flights up or down, and where the room is from the stairs (left or right, front
 * or back, as you face walking in). No AI guesses where a room is: only the host's marks count.
 * Pure; tested in tests/guest-guide-extras.test.ts.
 */

import {
  hasMap,
  levelName,
  mapDirections,
  normaliseMap,
  type Area,
  type Facing,
  type FloorMap,
  type Item,
  type Line,
  type MapFloor,
  type Point,
} from "./floor-map";

export { levelName };
export type { Facing, Point };

export type Pins = {
  entrance?: Point & { facing: Facing };
  stairs?: Point;
  lift?: Point;
  /** Room id → where it is on this floor. */
  rooms: Record<string, Point>;
  /** The floor map drawn over the plan (floor-map.ts), kept only when there's something in it. */
  areas?: Area[];
  lines?: Line[];
  items?: Item[];
};

export type FloorPlan = {
  id: string;
  /** 0 = ground floor, 1 = first floor, -1 = basement. */
  level: number;
  label: string | null;
  pins: Pins;
};

const pt = (v: unknown): Point | null => {
  const o = (v ?? {}) as Record<string, unknown>;
  const x = Number(o["x"]);
  const y = Number(o["y"]);
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1
    ? { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 }
    : null;
};
const FACINGS: Facing[] = ["up", "down", "left", "right"];

/** Marks from storage, made safe: positions are fractions of the picture (0 to 1). */
export function normalisePins(raw: unknown): Pins {
  const o = (raw ?? {}) as Record<string, unknown>;
  const e = pt(o["entrance"]);
  const facing = (o["entrance"] as Record<string, unknown> | undefined)?.["facing"];
  const rooms: Record<string, Point> = {};
  for (const [id, v] of Object.entries((o["rooms"] ?? {}) as Record<string, unknown>)) {
    const p = pt(v);
    if (p && /^[0-9a-f-]{36}$/i.test(id)) rooms[id] = p;
  }
  const out: Pins = { rooms };
  if (e)
    out.entrance = { ...e, facing: FACINGS.includes(facing as Facing) ? (facing as Facing) : "up" };
  const s = pt(o["stairs"]);
  if (s) out.stairs = s;
  const l = pt(o["lift"]);
  if (l) out.lift = l;
  const m = normaliseMap(o);
  if (m.areas.length) out.areas = m.areas;
  if (m.lines.length) out.lines = m.lines;
  if (m.items.length) out.items = m.items;
  return out;
}

const VEC: Record<Facing, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Where `to` is from `from`, as you face walking in: ahead/behind and left/right, in words. */
export function whereFrom(from: Point, to: Point, facing: Facing): { side: string; depth: string } {
  const f = VEC[facing];
  const r = { x: -f.y, y: f.x };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const ahead = dx * f.x + dy * f.y;
  const right = dx * r.x + dy * r.y;
  const side = Math.abs(right) < 0.1 ? "" : right > 0 ? "on the right" : "on the left";
  const depth =
    ahead > 0.45
      ? "at the far end"
      : ahead > 0.15
        ? "further along"
        : ahead < -0.15
          ? "back towards the front"
          : "close by";
  return { side, depth };
}

const join = (a: string, b: string) => [a, b].filter(Boolean).join(", ");

/** A plan's map, as floor-map.ts reads it. */
export function mapOf(p: Pins): FloorMap {
  return { areas: p.areas ?? [], lines: p.lines ?? [], items: p.items ?? [] };
}

/** Every floor as the map needs it. */
export function mapFloors(plans: FloorPlan[]): MapFloor[] {
  return plans.map((p) => ({
    id: p.id,
    level: p.level,
    entrance: p.pins.entrance,
    lift: p.pins.lift,
    rooms: p.pins.rooms,
    map: mapOf(p.pins),
  }));
}

export type Directions = {
  steps: string[];
  /** The plan the room is on, and where on it. */
  planId: string;
  level: number;
  at: Point;
  /** With a floor map: the way drawn on each floor, the room's outline and its heating. */
  route?: Array<{ planId: string; level: number; points: Point[] }>;
  area?: Point[];
  heating?: string[];
};

/**
 * The way from the main entrance to a room, in a few short steps, or null when the host hasn't
 * marked the room (or the entrance). Floors: the difference between the entrance's level and the
 * room's, as flights of stairs (or the lift when there is one).
 */
export function directionsTo(
  plans: FloorPlan[],
  roomId: string,
  roomName: string,
  roomNames: Record<string, string> = {},
): Directions | null {
  // With a floor map, the real way in along doors and stairs; otherwise the marks below.
  if (plans.some((p) => hasMap(mapOf(p.pins)))) {
    const d = mapDirections(mapFloors(plans), roomId, roomName, roomNames);
    if (d) return d;
  }
  const home = plans.find((p) => p.pins.entrance);
  const plan = plans.find((p) => p.pins.rooms[roomId]);
  if (!home?.pins.entrance || !plan) return null;
  const entrance = home.pins.entrance;
  const facing = entrance.facing;
  const at = plan.pins.rooms[roomId]!;
  const steps: string[] = [];
  if (plan.level === home.level) {
    const w = whereFrom(entrance, at, facing);
    steps.push(`Come in through the main entrance.`);
    steps.push(`${roomName} is on this floor, ${join(w.depth, w.side)}.`);
    return { steps, planId: plan.id, level: plan.level, at };
  }
  const flights = Math.abs(plan.level - home.level);
  const up = plan.level > home.level;
  const stairs = home.pins.stairs;
  const lift = home.pins.lift;
  steps.push(`Come in through the main entrance.`);
  if (stairs) {
    const w = whereFrom(entrance, stairs, facing);
    steps.push(`The stairs are ${join(w.depth, w.side)}.`);
  }
  steps.push(
    `Go ${up ? "up" : "down"} ${flights} ${flights === 1 ? "flight" : "flights"} of stairs to the ${levelName(plan.level)}${lift ? ", or take the lift" : ""}.`,
  );
  const from = plan.pins.stairs ?? stairs ?? entrance;
  const w = whereFrom(from, at, facing);
  steps.push(
    `From the ${up ? "top" : "bottom"} of the stairs, ${roomName} is ${join(w.depth, w.side)}.`,
  );
  return { steps, planId: plan.id, level: plan.level, at };
}
