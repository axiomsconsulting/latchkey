/**
 * The order and collapsed state of Today's sections, remembered per browser.
 * Sections added later slot in where the default order puts them. Pure.
 */
export type Layout = { order: string[]; collapsed: string[] };

export function readLayout(raw: string | null, defaults: string[]): Layout {
  let saved: Partial<Layout> = {};
  try {
    saved = JSON.parse(raw ?? "{}") as Partial<Layout>;
  } catch {
    saved = {};
  }
  const known = new Set(defaults);
  const order = (Array.isArray(saved.order) ? saved.order : []).filter((id): id is string => typeof id === "string" && known.has(id));
  // New sections go after the one they follow by default.
  for (const id of defaults) {
    if (order.includes(id)) continue;
    const before = defaults.slice(0, defaults.indexOf(id)).reverse().find((d) => order.includes(d));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  }
  const collapsed = (Array.isArray(saved.collapsed) ? saved.collapsed : []).filter((id): id is string => typeof id === "string" && known.has(id));
  return { order: [...new Set(order)], collapsed: [...new Set(collapsed)] };
}

export function toggleCollapsed(l: Layout, id: string): Layout {
  return { ...l, collapsed: l.collapsed.includes(id) ? l.collapsed.filter((x) => x !== id) : [...l.collapsed, id] };
}
