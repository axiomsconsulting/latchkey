import { describe, expect, it } from "vitest";

import { arrange, cleanHref, NAV_BUILT_INS, normaliseLayouts, normaliseNav, resolveNav } from "../src/lib/ui-config";

const labels = Object.fromEntries(NAV_BUILT_INS.map((b) => [b.labelKey, b.labelKey.toUpperCase()]));

describe("menu", () => {
  it("starts with the app's own items, in their order", () => {
    expect(normaliseNav(null).map((e) => e.id)).toEqual(NAV_BUILT_INS.map((b) => b.id));
  });

  it("keeps the admin's order, hidden items and own items", () => {
    const nav = normaliseNav([
      { id: "settings" },
      { id: "custom_help", label: "Help", href: "https://help.example.com", icon: "life-buoy" },
      { id: "today", hidden: true },
    ]);
    expect(nav.find((e) => e.id === "today")?.hidden).toBe(true);
    // Built-ins the admin didn't place join their default neighbours; the admin's own order stays.
    expect(nav.map((e) => e.id)).toEqual(["settings", "admin", "custom_help", "today", "bookings", "housekeeping", "services", "guides", "properties", "connections", "direct", "reports"]);
  });

  it("puts a menu item added in a later release next to its neighbour in a saved menu", () => {
    const saved = ["today", "bookings", "services", "guides", "properties", "connections", "settings", "admin"].map((id) => ({ id }));
    expect(normaliseNav(saved).map((e) => e.id).slice(0, 4)).toEqual(["today", "bookings", "housekeeping", "services"]);
  });

  it("never hides Latchkey admin, and shows it only to super admins", () => {
    const nav = normaliseNav([{ id: "admin", hidden: true }]);
    expect(nav.find((e) => e.id === "admin")?.hidden).toBeUndefined();
    expect(resolveNav(nav, labels, { superAdmin: false }).some((i) => i.id === "admin")).toBe(false);
    expect(resolveNav(nav, labels, { superAdmin: true }).some((i) => i.id === "admin")).toBe(true);
  });

  it("drops own items with unsafe links, no label, or bad icons", () => {
    const nav = normaliseNav([
      { id: "custom_a", label: "A", href: "javascript:alert(1)" },
      { id: "custom_b", label: "", href: "/app/today" },
      { id: "custom_c", label: "C", href: "/app/register", iconUrl: "https://evil.example/x.png" },
      { id: "hack", label: "D", href: "/app/today" },
    ]);
    expect(nav.find((e) => e.id === "custom_a")).toBeUndefined();
    expect(nav.find((e) => e.id === "custom_b")).toBeUndefined();
    expect(nav.find((e) => e.id === "custom_c")?.iconUrl).toBeUndefined();
    expect(nav.find((e) => e.id === "hack")).toBeUndefined();
  });

  it("knows a page in the app from another site", () => {
    expect(cleanHref("/app/register")).toBe("/app/register");
    expect(cleanHref("//evil.example")).toBeNull();
    expect(cleanHref("http://plain.example")).toBeNull();
    const item = resolveNav(normaliseNav([{ id: "custom_x", label: "X", href: "https://x.example/" }]), labels, { superAdmin: false }).find((i) => i.id === "custom_x");
    expect(item).toMatchObject({ id: "custom_x", external: true });
  });
});

describe("page sections", () => {
  it("defaults to every section in its order", () => {
    const l = normaliseLayouts(null);
    expect(l["today"]!.order[0]).toBe("guests");
    expect(l["today"]!.hidden).toEqual([]);
  });

  it("keeps the admin's order and hidden sections, never hiding locked ones", () => {
    const l = normaliseLayouts({ settings: { order: ["adminLink", "privacy"], hidden: ["adminLink", "demo", "nope"] } });
    const order = l["settings"]!.order;
    expect(order.indexOf("adminLink")).toBeLessThan(order.indexOf("privacy"));
    expect(l["settings"]!.hidden).toEqual(["demo"]);
  });

  it("puts sections added in a later release next to their default neighbours, not at the end", () => {
    // Saved before "messages" and "labels" existed: they join after "domain", where they sit by default.
    const l = normaliseLayouts({ settings: { order: ["business", "team", "support", "domain", "privacy", "extras"], hidden: [] } });
    const order = l["settings"]!.order;
    expect(order.slice(0, 8)).toEqual(["business", "group", "team", "support", "domain", "messages", "labels", "privacy"]);
    expect(order).toHaveLength(new Set(order).size);
  });

  it("arranges what a page shows", () => {
    expect(arrange({ order: ["b", "a", "c"], hidden: ["c"] }, ["a", "b", "c", "d"])).toEqual(["b", "a", "d"]);
    expect(arrange(undefined, ["a", "b"])).toEqual(["a", "b"]);
  });
});
