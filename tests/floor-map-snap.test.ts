import { describe, expect, it } from "vitest";

import {
  SUGGESTED,
  connections,
  marksFromReading,
  normaliseMap,
  snapAreas,
  snapPoint,
  type Area,
  type Point,
} from "@/lib/floor-map";

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const area = (id: string, poly: Point[], kind: Area["kind"] = "bedroom"): Area => ({
  id,
  kind,
  name: "",
  poly,
  access: "shared",
  roomId: null,
});

describe("snapping rooms together", () => {
  it("joins a corner to a nearby corner, else onto a nearby wall", () => {
    const a = [area("room1", rect(0.1, 0.1, 0.4, 0.4))];
    expect(snapPoint({ x: 0.41, y: 0.405 }, a)).toEqual({ x: 0.4, y: 0.4 });
    expect(snapPoint({ x: 0.41, y: 0.25 }, a)).toEqual({ x: 0.4, y: 0.25 });
    expect(snapPoint({ x: 0.5, y: 0.25 }, a)).toEqual({ x: 0.5, y: 0.25 });
    expect(snapPoint({ x: 0.41, y: 0.405 }, a, "room1")).toEqual({ x: 0.41, y: 0.405 });
  });

  it("closes the gap between two rooms, so a door between them works", () => {
    const snapped = snapAreas([
      area("hall0", rect(0.1, 0.1, 0.4, 0.9), "hallway"),
      area("room1", rect(0.41, 0.1, 0.7, 0.5)),
    ]);
    expect(snapped[1]!.poly[0]).toEqual({ x: 0.4, y: 0.1 });
    const map = normaliseMap({
      areas: snapped,
      lines: [
        {
          id: "door1",
          kind: "door",
          pts: [
            { x: 0.4, y: 0.2 },
            { x: 0.4, y: 0.3 },
          ],
        },
      ],
      items: [],
    });
    const g = connections([{ id: "f", level: 0, map }]);
    expect(g.get("f:hall0")?.map((e) => e.to)).toContain("f:room1");
  });

  it("joins rooms through a door drawn across a small gap", () => {
    const map = normaliseMap({
      areas: [
        area("hall0", rect(0.1, 0.1, 0.4, 0.9), "hallway"),
        area("room1", rect(0.43, 0.1, 0.7, 0.5)),
      ],
      lines: [
        {
          id: "door1",
          kind: "door",
          pts: [
            { x: 0.4, y: 0.25 },
            { x: 0.43, y: 0.25 },
          ],
        },
      ],
      items: [],
    });
    const g = connections([{ id: "f", level: 0, map }]);
    expect(g.get("f:hall0")?.map((e) => e.to)).toContain("f:room1");
  });
});

describe("reading a plan", () => {
  it("adds radiators, items it saw, and suggested ones marked as such", () => {
    const r = marksFromReading(
      {
        is_floor_plan: true,
        areas: [
          { kind: "kitchenette", label: "Kitchen", corners: rect(0.1, 0.1, 0.4, 0.4) },
          { kind: "hallway", label: "", corners: rect(0.405, 0.1, 0.6, 0.9) },
        ],
        doors: [],
        stairs: [],
        features: [{ kind: "radiator", from: { x: 0.12, y: 0.1 }, to: { x: 0.3, y: 0.1 } }],
        items: [
          { kind: "sink", x: 0.2, y: 0.15, seen: true },
          { kind: "fire_blanket", x: 0.3, y: 0.3, seen: false },
        ],
        entrance: null,
      },
      0,
      [],
    );
    expect(r?.map.lines.map((l) => l.kind)).toEqual(["radiator"]);
    expect(r?.map.items.map((i) => [i.kind, i.note])).toEqual([
      ["sink", ""],
      ["fire_blanket", SUGGESTED],
    ]);
    // The hallway's wall joined the kitchenette's.
    expect(r?.map.areas[1]!.poly[0]).toEqual({ x: 0.4, y: 0.1 });
  });
});
