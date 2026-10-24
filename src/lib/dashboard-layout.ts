/**
 * The order, width and folding of Today's sections, remembered per browser.
 * Each card is full width ("w") or sits in the left ("l") or right ("r")
 * column. Cards between two full-width ones form a band of two independent
 * columns, each stacked tightly, so a short card never leaves a gap beside a
 * tall one. Sections added later slot in where the default order puts them.
 * Pure.
 */
export type Place = "l" | "r" | "w";
export type Layout = { order: string[]; collapsed: string[]; place: Record<string, Place> };

/** Default places: full width where the page says so; the rest alternate left and right within each band. */
export function defaultPlaces(items: Array<{ id: string; wide?: boolean }>): Record<string, Place> {
  const out: Record<string, Place> = {};
  let next: Place = "l";
  for (const i of items) {
    if (i.wide) {
      out[i.id] = "w";
      next = "l";
    } else {
      out[i.id] = next;
      next = next === "l" ? "r" : "l";
    }
  }
  return out;
}

export function readLayout(raw: string | null, defaults: string[], defaultPlace: Record<string, Place> = {}): Layout {
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
  const savedPlace = saved.place && typeof saved.place === "object" ? (saved.place as Record<string, unknown>) : {};
  const place: Record<string, Place> = {};
  for (const id of defaults) {
    const p = savedPlace[id];
    place[id] = p === "l" || p === "r" || p === "w" ? p : (defaultPlace[id] ?? "l");
  }
  return { order: [...new Set(order)], collapsed: [...new Set(collapsed)], place };
}

export function toggleCollapsed(l: Layout, id: string): Layout {
  return { ...l, collapsed: l.collapsed.includes(id) ? l.collapsed.filter((x) => x !== id) : [...l.collapsed, id] };
}

export type Band = { kind: "wide"; id: string } | { kind: "cols"; left: string[]; right: string[]; last: string };

/** The page as bands: each full-width card on its own, and the cards between them in two columns. */
export function bands(l: Layout, ids: string[] = l.order): Band[] {
  const out: Band[] = [];
  let cur: Extract<Band, { kind: "cols" }> | null = null;
  for (const id of ids) {
    const p = l.place[id] ?? "l";
    if (p === "w") {
      out.push({ kind: "wide", id });
      cur = null;
      continue;
    }
    if (!cur) {
      cur = { kind: "cols", left: [], right: [], last: id };
      out.push(cur);
    }
    (p === "l" ? cur.left : cur.right).push(id);
    cur.last = id;
  }
  return out;
}

/** Moves a card next to another (or to the end of a band's column) and gives it that place. */
export function placeCard(l: Layout, id: string, ref: string, side: "before" | "after", place: Place): Layout {
  if (id === ref && l.place[id] === place) return l;
  const order = l.order.filter((x) => x !== id);
  const at = order.indexOf(ref);
  if (at < 0) return { ...l, place: { ...l.place, [id]: place } };
  order.splice(side === "before" ? at : at + 1, 0, id);
  const same = order.join() === l.order.join() && l.place[id] === place;
  return same ? l : { ...l, order, place: { ...l.place, [id]: place } };
}

/** Full width or back to a column, staying where it is in the order. */
export function setPlace(l: Layout, id: string, place: Place): Layout {
  return l.place[id] === place ? l : { ...l, place: { ...l.place, [id]: place } };
}
