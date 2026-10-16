import { describe, expect, it } from "vitest";

import { readLayout, toggleCollapsed } from "../src/lib/dashboard-layout";

const D = ["guests", "messages", "requests", "cleaning", "settings"];

describe("Today's layout", () => {
  it("starts in the default order with nothing collapsed", () => {
    expect(readLayout(null, D)).toEqual({ order: D, collapsed: [] });
    expect(readLayout("not json", D)).toEqual({ order: D, collapsed: [] });
  });

  it("keeps the host's order, drops removed sections and slots new ones in", () => {
    const saved = JSON.stringify({ order: ["settings", "guests", "gone", "cleaning"], collapsed: ["cleaning", "gone"] });
    expect(readLayout(saved, D)).toEqual({ order: ["settings", "guests", "messages", "requests", "cleaning"], collapsed: ["cleaning"] });
  });

  it("collapses and expands", () => {
    const l = readLayout(null, D);
    expect(toggleCollapsed(l, "messages").collapsed).toEqual(["messages"]);
    expect(toggleCollapsed(toggleCollapsed(l, "messages"), "messages").collapsed).toEqual([]);
  });
});
