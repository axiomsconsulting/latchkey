import { describe, expect, it } from "vitest";

import {
  arrangeSections,
  dropSection,
  moveSection,
  readLayout,
  toggleOpen,
} from "../src/lib/section-layout";

describe("a person's arrangement of a page", () => {
  it("reads what's saved, safely", () => {
    expect(readLayout(null)).toEqual({ order: [], open: [] });
    expect(readLayout("nonsense")).toEqual({ order: [], open: [] });
    expect(readLayout('{"order":["a",1],"open":"x"}')).toEqual({ order: ["a"], open: [] });
  });
  it("keeps their order, and new sections join beside their neighbour", () => {
    expect(arrangeSections([], ["a", "b"])).toEqual(["a", "b"]);
    expect(arrangeSections(["b", "a"], ["a", "b"])).toEqual(["b", "a"]);
    expect(arrangeSections(["c", "a"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
    expect(arrangeSections(["b"], ["new", "b"])).toEqual(["new", "b"]);
    expect(arrangeSections(["gone", "a"], ["a"])).toEqual(["a"]);
  });
  it("moves among what's on screen only", () => {
    const order = ["a", "x", "b", "c"];
    expect(moveSection(order, "b", -1, ["a", "b", "c"])).toEqual(["b", "x", "a", "c"]);
    expect(moveSection(order, "a", -1, ["a", "b"])).toEqual(order);
    expect(moveSection(order, "c", 1, ["a", "c"])).toEqual(order);
  });
  it("a drag takes the place it's dropped on, either way", () => {
    expect(dropSection(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(dropSection(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(dropSection(["a", "b"], "a", "a")).toEqual(["a", "b"]);
  });
  it("opens and folds", () => {
    expect(toggleOpen([], "a")).toEqual(["a"]);
    expect(toggleOpen(["a"], "a")).toEqual([]);
  });
});
