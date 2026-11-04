/**
 * Each person's own arrangement of a settings page: the order of its sections and
 * which are open, kept on this device. Pure, tested.
 */
export type SectionLayout = { order: string[]; open: string[] };

export const EMPTY_LAYOUT: SectionLayout = { order: [], open: [] };

export function readLayout(raw: string | null): SectionLayout {
  try {
    const v = JSON.parse(raw ?? "null") as Partial<SectionLayout> | null;
    const list = (x: unknown) =>
      Array.isArray(x) ? x.filter((i): i is string => typeof i === "string") : [];
    return { order: list(v?.order), open: list(v?.open) };
  } catch {
    return EMPTY_LAYOUT;
  }
}

/** Saved order first; a section added since goes back beside its usual neighbour, not to the end. */
export function arrangeSections(saved: string[], ids: string[]): string[] {
  const out = saved.filter((id) => ids.includes(id));
  ids.forEach((id, i) => {
    if (out.includes(id)) return;
    const before = ids[i - 1];
    const at = before ? out.indexOf(before) : -1;
    if (i === 0) out.unshift(id);
    else if (at >= 0) out.splice(at + 1, 0, id);
    else out.push(id);
  });
  return out;
}

/** One place up or down among the sections on screen, leaving any hidden ones where they are. */
export function moveSection(
  order: string[],
  id: string,
  by: -1 | 1,
  visible: readonly string[],
): string[] {
  const shown = order.filter((x) => visible.includes(x));
  const i = shown.indexOf(id);
  const other = shown[i + by];
  if (i < 0 || !other) return order;
  return order.map((x) => (x === id ? other : x === other ? id : x));
}

/** Dragged onto another section: takes its place. */
export function dropSection(order: string[], id: string, onto: string): string[] {
  if (id === onto || !order.includes(id) || !order.includes(onto)) return order;
  const rest = order.filter((x) => x !== id);
  const at = rest.indexOf(onto);
  const down = order.indexOf(id) < order.indexOf(onto);
  rest.splice(down ? at + 1 : at, 0, id);
  return rest;
}

export function toggleOpen(open: string[], id: string): string[] {
  return open.includes(id) ? open.filter((x) => x !== id) : [...open, id];
}
