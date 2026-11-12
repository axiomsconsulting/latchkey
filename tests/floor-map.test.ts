import { describe, expect, it } from "vitest";

import {
  areaAt,
  houseNotes,
  houseText,
  mapDirections,
  marksFromReading,
  matchRoomLabel,
  normaliseMap,
  sharedEdge,
  stairShape,
  stairWords,
  type MapFloor,
  type Point,
} from "@/lib/floor-map";
import { directionsTo, normalisePins, type FloorPlan } from "@/lib/floor-plans";

const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";
const R3 = "33333333-3333-4333-8333-333333333333";

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const v = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y1 },
];

// Ground: hallway up the middle, private lounge left, shared kitchenette and Room 1 right, stairwell at the top.
const groundMap = normaliseMap({
  areas: [
    { id: "hall0", kind: "hallway", poly: rect(0.4, 0.3, 0.6, 1) },
    { id: "lounge", kind: "lounge", poly: rect(0, 0.5, 0.4, 1) },
    { id: "kitch", kind: "kitchenette", poly: rect(0.6, 0.6, 1, 1) },
    { id: "room1", kind: "bedroom", poly: rect(0.6, 0.3, 1, 0.6), roomId: R1 },
    { id: "stair0", kind: "stairwell", poly: rect(0.4, 0, 0.6, 0.3) },
  ],
  lines: [
    { id: "dlounge", kind: "door", pts: v(0.4, 0.7, 0.4, 0.8) },
    { id: "dkitch", kind: "door", pts: v(0.6, 0.75, 0.6, 0.85) },
    { id: "droom1", kind: "door", pts: v(0.6, 0.4, 0.6, 0.5) },
    {
      id: "stairs0",
      kind: "stairs",
      pts: [
        { x: 0.45, y: 0.28 },
        { x: 0.45, y: 0.05 },
        { x: 0.55, y: 0.05 },
      ],
      toLevel: 1,
    },
    { id: "rad1", kind: "radiator", pts: v(0.95, 0.35, 0.95, 0.55) },
  ],
  items: [
    { id: "fridge", kind: "fridge", at: { x: 0.9, y: 0.9 }, note: "" },
    { id: "cutl", kind: "cutlery", at: { x: 0.8, y: 0.9 }, note: "drawer by the sink" },
    { id: "therm", kind: "thermostat", at: { x: 0.45, y: 0.6 }, note: "" },
  ],
});
// First floor: landing, Rooms 2 and 3 on the left, the owner's room (private) on the right behind a curtain.
const firstMap = normaliseMap({
  areas: [
    { id: "land1", kind: "landing", poly: rect(0.4, 0, 0.6, 0.6) },
    { id: "room2", kind: "bedroom", poly: rect(0, 0, 0.4, 0.3), roomId: R2 },
    { id: "room3", kind: "bedroom", poly: rect(0, 0.3, 0.4, 0.6), roomId: R3 },
    { id: "owner", kind: "bedroom", name: "Owner's room", access: "private", poly: rect(0.6, 0, 1, 0.6) },
  ],
  lines: [
    { id: "droom2", kind: "door", pts: v(0.4, 0.1, 0.4, 0.2) },
    { id: "droom3", kind: "door", pts: v(0.4, 0.4, 0.4, 0.5) },
    { id: "downer", kind: "door", pts: v(0.6, 0.2, 0.6, 0.3) },
    { id: "curt", kind: "curtain", pts: v(0.6, 0.1, 0.6, 0.4) },
  ],
});
const floors: MapFloor[] = [
  { id: "g", level: 0, entrance: { x: 0.5, y: 0.98, facing: "up" }, map: groundMap },
  { id: "f", level: 1, map: firstMap },
];

describe("floor map", () => {
  it("keeps only sound marks", () => {
    const m = normaliseMap({
      areas: [
        { id: "ok01", kind: "kitchen", poly: rect(0, 0, 0.5, 0.5) },
        { id: "ok01", kind: "kitchen", poly: rect(0, 0, 0.5, 0.5) },
        { id: "bad", kind: "kitchen", poly: rect(0, 0, 0.5, 0.5) },
        { id: "far1", kind: "hallway", poly: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }] },
      ],
      lines: [{ id: "st01", kind: "stairs", pts: v(0, 0, 0, 1), toLevel: 99 }],
      items: [{ id: "it01", kind: "spaceship", at: { x: 0.1, y: 0.1 } }],
    });
    expect(m.areas.map((a) => [a.id, a.access])).toEqual([["ok01", "private"]]);
    expect(m.lines[0]).toMatchObject({ kind: "stairs", toLevel: null, shape: "auto" });
    expect(m.items).toEqual([]);
  });

  it("finds where things are and which walls are shared", () => {
    expect(areaAt(groundMap.areas, { x: 0.5, y: 0.5 })?.id).toBe("hall0");
    expect(sharedEdge(rect(0.4, 0.3, 0.6, 1), rect(0.4, 0, 0.6, 0.3))?.length).toBeCloseTo(0.2, 1);
    expect(sharedEdge(rect(0, 0, 0.2, 0.2), rect(0.5, 0.5, 1, 1))).toBeNull();
  });

  it("reads the stairs' shape", () => {
    expect(stairShape(v(0, 1, 0, 0)).shape).toBe("straight");
    expect(stairShape([{ x: 0.5, y: 1 }, { x: 0.5, y: 0.5 }, { x: 0.8, y: 0.5 }])).toMatchObject({
      shape: "turning",
      side: "right",
      corners: 1,
    });
    const arc = Array.from({ length: 9 }, (_, i) => ({
      x: 0.5 + 0.3 * Math.cos(Math.PI + (i * Math.PI) / 8),
      y: 0.5 + 0.3 * Math.sin(Math.PI + (i * Math.PI) / 8),
    }));
    expect(stairShape(arc).shape).toBe("curved");
    const line = groundMap.lines.find((l) => l.id === "stairs0")!;
    expect(stairWords(line, false)).toBe("They turn to the right once");
    expect(stairWords(line, true)).toBe("They turn to the left once");
  });

  it("a room on the entrance floor: which door, counting from the entrance", () => {
    const d = mapDirections(floors, R1, "Room 1")!;
    expect(d.steps).toEqual([
      "Come in through the main entrance into the hallway.",
      "Room 1 is the second door on your right.",
    ]);
    expect(d.heating).toEqual(["The radiator is straight ahead, at the far end as you walk in."]);
  });

  it("upstairs: the stairs, their shape, then the door", () => {
    const d = mapDirections(floors, R3, "Room 3")!;
    expect(d.steps).toEqual([
      "Come in through the main entrance into the hallway.",
      "Take the stairs on your left up to the first floor. They turn to the right once.",
      "You come out onto the landing.",
      "Turn right along the landing.",
      "Room 3 is the second door on your right.",
    ]);
    expect(mapDirections(floors, R2, "Room 2")!.steps.slice(-1)).toEqual([
      "Room 2 is the first door on your right.",
    ]);
    expect(d.route.map((r) => r.planId)).toEqual(["g", "f"]);
  });

  it("never through a private area", () => {
    const blocked: MapFloor[] = [
      floors[0]!,
      {
        ...floors[1]!,
        map: normaliseMap({
          ...firstMap,
          areas: [
            { id: "land1", kind: "landing", poly: rect(0.4, 0, 0.6, 0.6), access: "private" },
            ...firstMap.areas.filter((a) => a.id !== "land1"),
          ],
        }),
      },
    ];
    expect(mapDirections(blocked, R3, "Room 3")).toBeNull();
  });

  it("falls back to the older marks without a map, and uses the map when there is one", () => {
    const plans: FloorPlan[] = [
      { id: "g", level: 0, label: null, pins: normalisePins({ entrance: { x: 0.5, y: 0.98, facing: "up" }, ...groundMap }) },
      { id: "f", level: 1, label: null, pins: normalisePins(firstMap) },
    ];
    expect(directionsTo(plans, R1, "Room 1")!.steps[1]).toBe("Room 1 is the second door on your right.");
  });

  it("says what guests may use and what's private", () => {
    const n = houseNotes(floors);
    expect(n.shared).toEqual([
      { name: "kitchenette", level: 0, items: ["fridge", "cutlery (drawer by the sink)"] },
    ]);
    expect(n.private.map((p) => p.name)).toEqual(["lounge", "Owner's room"]);
    expect(n.barriers[0]).toMatch(/A curtain .* first floor marks a private area/);
    expect(n.useful).toEqual(["The thermostat is in the hallway on the ground floor."]);
    expect(houseText(n)).toMatch(/^Shared spaces guests may use: kitchenette \(ground floor\) with fridge/);
  });
});

describe("reading a plan", () => {
  const rooms = [
    { id: R1, name: "Room 1" },
    { id: R2, name: "Room 2" },
    { id: R3, name: "The Garden Room" },
  ];
  it("matches printed labels to rooms", () => {
    expect(matchRoomLabel("Bedroom 2", rooms)).toBe(R2);
    expect(matchRoomLabel("GARDEN ROOM", rooms)).toBe(R3);
    expect(matchRoomLabel("Kitchen", rooms)).toBeNull();
  });
  it("turns the AI's reading into marks for the host to check", () => {
    const m = marksFromReading(
      {
        is_floor_plan: true,
        areas: [
          { kind: "bedroom", label: "Bedroom 1", corners: rect(0, 0, 0.5, 0.5) },
          { kind: "bedroom", label: "Room 1", corners: rect(0.5, 0, 1, 0.5) },
          { kind: "lounge", label: "Living", corners: rect(0, 0.5, 1.2, 1) },
        ],
        doors: [{ kind: "door", from: { x: 0.5, y: 0.1 }, to: { x: 0.5, y: 0.2 } }],
        stairs: [{ goes: "up", path: [{ x: 0.1, y: 0.9 }, { x: 0.1, y: 0.6 }] }],
        entrance: { x: 0.5, y: 1, facing: "up" },
      },
      0,
      rooms,
    )!;
    expect(m.map.areas.map((a) => [a.kind, a.roomId, a.access])).toEqual([
      ["bedroom", R1, "guest_room"],
      ["bedroom", null, "guest_room"],
      ["lounge", null, "private"],
    ]);
    expect(m.map.areas[2]!.poly[1]).toEqual({ x: 1, y: 0.5 });
    expect(m.map.lines.map((l) => [l.kind, l.toLevel ?? null])).toEqual([
      ["door", null],
      ["stairs", 1],
    ]);
    expect(m.entrance).toEqual({ x: 0.5, y: 1, facing: "up" });
    expect(marksFromReading({ is_floor_plan: false }, 0, rooms)).toBeNull();
  });
});
