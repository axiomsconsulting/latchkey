import { describe, expect, it } from "vitest";

import { moveItem } from "../src/lib/reorder";

describe("moving an item in a list", () => {
  it("moves down, up, to the ends, and ignores nonsense", () => {
    const l = ["a", "b", "c", "d"];
    expect(moveItem(l, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(l, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveItem(l, 1, 99)).toEqual(["a", "c", "d", "b"]);
    expect(moveItem(l, 2, 2)).toBe(l);
    expect(moveItem(l, 9, 0)).toBe(l);
  });
});
