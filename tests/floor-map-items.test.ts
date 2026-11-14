import { describe, expect, it } from "vitest";

import { FURNITURE, ITEM_CATEGORIES, ITEM_KINDS, ITEM_WORDS, normaliseMap } from "@/lib/floor-map";

describe("floor plan items", () => {
  it("puts every kind in exactly one category, with words", () => {
    const listed = ITEM_CATEGORIES.flatMap((c) => c.kinds);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...ITEM_KINDS].sort());
    for (const k of ITEM_KINDS) expect(ITEM_WORDS[k]).toBeTruthy();
    for (const k of Object.keys(FURNITURE))
      expect(ITEM_CATEGORIES.find((c) => c.id === "furniture")?.kinds).toContain(k);
  });

  it("keeps a furnishing's size, gives it one if missing, and none to other items", () => {
    const m = normaliseMap({
      areas: [],
      lines: [],
      items: [
        { id: "bed1", kind: "bed", at: { x: 0.5, y: 0.5 }, note: "", w: 0.2, h: 0.1 },
        { id: "sofa1", kind: "sofa", at: { x: 0.3, y: 0.3 }, note: "" },
        { id: "alarm1", kind: "smoke_alarm", at: { x: 0.2, y: 0.2 }, note: "", w: 0.2, h: 0.2 },
        { id: "nope1", kind: "jacuzzi", at: { x: 0.2, y: 0.2 }, note: "" },
      ],
    });
    expect(m.items.map((i) => [i.kind, i.w ?? null, i.h ?? null])).toEqual([
      ["bed", 0.2, 0.1],
      ["sofa", FURNITURE.sofa!.w, FURNITURE.sofa!.h],
      ["smoke_alarm", null, null],
    ]);
  });
});
