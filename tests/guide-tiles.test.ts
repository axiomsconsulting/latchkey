import { describe, expect, it } from "vitest";

import { MAX_TILES, autoTiles, normaliseTiles, shownTiles, tilesPerRow } from "../src/lib/guide-tiles";

const P = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const sections = [
  { key: "arrival", title: "Getting here" },
  { key: "parking", title: "Parking" },
  { key: "breakfast", title: "Breakfast" },
  { key: "rules", title: "House rules" },
  { key: "custom_9", title: "Local walks" },
];
const stay = { page: "stay" as const, sections, hasWifi: true, canOrder: true };
const room = { page: "room" as const, sections, hasWifi: true, canOrder: false };

describe("guide quick tiles", () => {
  it("is automatic until the host chooses, as before: Wi-Fi, first sections, extras, messages", () => {
    expect(normaliseTiles(null)).toBeNull();
    expect(normaliseTiles({})).toBeNull();
    expect(autoTiles(stay).map((t) => t.kind)).toEqual(["wifi", "section", "section", "section", "extras", "messages"]);
    expect(shownTiles(null, room).map((t) => t.label)).toEqual(["Wi-Fi", "Getting here", "Parking", "Breakfast", "House rules", "Local walks"]);
  });

  it("keeps at most eight safe tiles; custom tiles need a title and content", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, kind: "wifi" }));
    expect(normaliseTiles(many)).toHaveLength(MAX_TILES);
    const t = normaliseTiles([
      { kind: "custom", title: "Spa menu", content: { type: "doc", path: `${P}/tiles/spa.pdf`, name: "Spa.pdf" } },
      { kind: "custom", title: "No content" },
      { kind: "custom", title: "Bad link", content: { type: "link", url: "javascript:alert(1)" } },
      { kind: "custom", title: "Elsewhere", content: { type: "image", path: "../../secret.png" } },
      { kind: "custom", title: "Town map", content: { type: "link", url: "https://maps.example/town" } },
      { kind: "section" },
      { kind: "lasers" },
      { kind: "times", icon: "not-an-icon", title: "  When   to arrive " },
    ])!;
    expect(t.map((x) => x.title)).toEqual(["Spa menu", "Town map", "When to arrive"]);
    expect(t[2]!.icon).toBeUndefined();
  });

  it("shows only tiles whose target is on this page, with their own labels", () => {
    const chosen = normaliseTiles([
      { id: "a", kind: "section", section: "parking", title: "Where to park", icon: "car" },
      { id: "b", kind: "section", section: "gone" },
      { id: "c", kind: "extras" },
      { id: "d", kind: "checkin" },
      { id: "e", kind: "custom", title: "Welcome", content: { type: "text", body: "Hello!" } },
    ]);
    expect(shownTiles(chosen, stay).map((t) => [t.label, t.action.kind])).toEqual([["Where to park", "jump"], ["Extras", "extras"], ["Welcome", "open"]]);
    expect(shownTiles(chosen, room).map((t) => t.action.kind)).toEqual(["jump", "checkin", "open"]);
    expect(shownTiles(chosen, { ...stay, canOrder: false }).some((t) => t.action.kind === "extras")).toBe(false);
    expect(shownTiles(chosen, stay, { extras: "Treats" })[1]!.label).toBe("Treats");
  });

  it("spreads tiles over the full width in even rows", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(tilesPerRow)).toEqual([1, 2, 3, 4, 3, 3, 4, 4]);
  });
});
