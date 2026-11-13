import { describe, expect, it } from "vitest";

import {
  houseNotes,
  normaliseMap,
  reachableAreas,
  type MapFloor,
  type Point,
} from "@/lib/floor-map";
import { STACKS_UP_TO, cardSize, packColumns } from "@/lib/guide-view";

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

describe("gallery cards sized to their content", () => {
  it("stacks small cards and gives big ones a column each", () => {
    expect(packColumns([0.3, 0.3, 0.9, 0.2, 0.2, 0.2, 0.5, 0.5])).toEqual([
      [0, 1],
      [2],
      [3, 4, 5],
      [6, 7],
    ]);
    expect(packColumns([])).toEqual([]);
  });

  it("estimates a short card as stackable and a long one as not", () => {
    expect(cardSize({ text: 120 })).toBeLessThanOrEqual(STACKS_UP_TO);
    expect(cardSize({ text: 600, steps: 4, images: 1 })).toBeGreaterThan(STACKS_UP_TO);
    // Attachments show as large thumbnails: that card has a column of its own.
    expect(cardSize({ text: 50, attachments: 2 })).toBeGreaterThan(STACKS_UP_TO);
  });
});

describe("what guests can reach", () => {
  // Hall from the entrance; the lounge through a door; the snug is shared but behind a curtain.
  const floor: MapFloor = {
    id: "g",
    level: 0,
    building: "",
    entrance: { x: 0.5, y: 0.95, facing: "up" },
    map: normaliseMap({
      areas: [
        { id: "hall0", kind: "hallway", poly: rect(0.4, 0, 0.6, 1) },
        { id: "lounge", kind: "lounge", access: "shared", poly: rect(0, 0, 0.4, 1) },
        { id: "land0", kind: "landing", poly: rect(0.6, 0.2, 1, 0.5) },
        { id: "snug0", kind: "lounge", name: "Snug", access: "shared", poly: rect(0.6, 0.5, 1, 1) },
        {
          id: "office",
          kind: "other",
          name: "Office",
          access: "private",
          poly: rect(0.6, 0, 1, 0.2),
        },
      ],
      lines: [
        {
          id: "door1",
          kind: "door",
          pts: [
            { x: 0.4, y: 0.4 },
            { x: 0.4, y: 0.5 },
          ],
        },
        {
          id: "door2",
          kind: "door",
          pts: [
            { x: 0.6, y: 0.7 },
            { x: 0.6, y: 0.8 },
          ],
        },
        // The curtain hangs across the snug's doorway.
        {
          id: "curt1",
          kind: "curtain",
          pts: [
            { x: 0.6, y: 0.65 },
            { x: 0.6, y: 0.85 },
          ],
        },
      ],
      items: [],
    }),
  };

  it("never counts a shared room behind a curtain", () => {
    const r = reachableAreas([floor]);
    expect(r?.has("g:lounge")).toBe(true);
    expect(r?.has("g:office")).toBe(false);
    expect(r?.has("g:snug0")).toBe(false);
    const n = houseNotes([floor]);
    expect(n.shared.map((s) => s.name)).toContain("lounge");
    expect(n.shared.map((s) => s.name)).not.toContain("Snug");
    expect(n.private.map((s) => s.name)).toEqual(expect.arrayContaining(["Office", "Snug"]));
  });

  it("counts every shared area when no entrance is marked", () => {
    expect(reachableAreas([{ ...floor, entrance: undefined }])).toBeNull();
  });
});
