/**
 * "New" badges on the services tabs: what this browser has already seen, per property and tab,
 * kept in localStorage. The first time a property is opened everything there counts as seen,
 * so only what arrives afterwards is new. Pure helpers; tested in tests/seen.test.ts.
 */
export type SeenStore = Record<string, string[]>;

/** The ids in `current` not seen yet (none at all before the first visit). */
export function unseen(current: string[], seen: string[] | undefined): string[] {
  if (!seen) return [];
  const s = new Set(seen);
  return current.filter((id) => !s.has(id));
}

/** Marks these ids seen, keeping at most `max` (the newest). */
export function markSeen(seen: string[] | undefined, ids: string[], max = 500): string[] {
  const out = [...(seen ?? [])];
  for (const id of ids) if (!out.includes(id)) out.push(id);
  return out.slice(-max);
}

export function readSeen(raw: string | null): SeenStore {
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: SeenStore = {};
    for (const [k, list] of Object.entries(v as Record<string, unknown>))
      if (Array.isArray(list)) out[k] = list.filter((x): x is string => typeof x === "string");
    return out;
  } catch {
    return {};
  }
}
