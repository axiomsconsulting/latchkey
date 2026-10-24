import { describe, expect, it } from "vitest";

import { bands, defaultPlaces, placeCard, readLayout, setPlace, toggleCollapsed } from "../src/lib/dashboard-layout";

const D = ["guests", "messages", "requests", "cleaning", "settings"];
const P = defaultPlaces([{ id: "guests", wide: true }, { id: "messages" }, { id: "requests" }, { id: "cleaning" }, { id: "settings", wide: true }]);

describe("Today's layout", () => {
  it("starts in the default order with nothing collapsed, alternating columns", () => {
    expect(readLayout(null, D, P)).toEqual({ order: D, collapsed: [], place: { guests: "w", messages: "l", requests: "r", cleaning: "l", settings: "w" } });
    expect(readLayout("not json", D, P).order).toEqual(D);
  });

  it("keeps the host's order and places, drops removed sections and slots new ones in", () => {
    const saved = JSON.stringify({ order: ["settings", "guests", "gone", "cleaning"], collapsed: ["cleaning", "gone"], place: { cleaning: "w", gone: "l", settings: "x" } });
    const l = readLayout(saved, D, P);
    expect(l.order).toEqual(["settings", "guests", "messages", "requests", "cleaning"]);
    expect(l.collapsed).toEqual(["cleaning"]);
    expect(l.place.cleaning).toBe("w");
    expect(l.place.settings).toBe("w");
  });

  it("collapses and expands", () => {
    const l = readLayout(null, D, P);
    expect(toggleCollapsed(l, "messages").collapsed).toEqual(["messages"]);
    expect(toggleCollapsed(toggleCollapsed(l, "messages"), "messages").collapsed).toEqual([]);
  });

  it("lays cards out as full-width bands and two independent columns", () => {
    const l = readLayout(null, D, P);
    expect(bands(l)).toEqual([
      { kind: "wide", id: "guests" },
      { kind: "cols", left: ["messages", "cleaning"], right: ["requests"], last: "cleaning" },
      { kind: "wide", id: "settings" },
    ]);
  });

  it("snaps a card into a column or full width", () => {
    const l = readLayout(null, D, P);
    const wide = placeCard(l, "requests", "guests", "after", "w");
    expect(wide.order).toEqual(["guests", "requests", "messages", "cleaning", "settings"]);
    expect(bands(wide)[1]).toEqual({ kind: "wide", id: "requests" });
    const right = placeCard(l, "settings", "cleaning", "after", "r");
    expect(bands(right)).toEqual([
      { kind: "wide", id: "guests" },
      { kind: "cols", left: ["messages", "cleaning"], right: ["requests", "settings"], last: "settings" },
    ]);
    expect(placeCard(l, "messages", "messages", "before", "l")).toBe(l);
    expect(setPlace(l, "messages", "w").place.messages).toBe("w");
  });
});
