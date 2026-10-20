/**
 * The quick tiles at the top of the stay guide (/stay/$token) and the room
 * guide (/room/$code). Hosts choose up to eight in Stay guides → Quick tiles
 * (properties.guide_tiles, migration 0041); none chosen means the automatic
 * set (Wi-Fi, the first guide sections, extras, messages). Each tile jumps
 * to part of the guide, opens extras or messages, or opens the host's own
 * content (text, a link, a photo or a PDF) in place, without leaving the
 * page. Pure: no network or database access.
 */

export const MAX_TILES = 8;

export const TILE_KINDS = ["wifi", "section", "extras", "messages", "times", "checkin", "custom"] as const;
export type TileKind = (typeof TILE_KINDS)[number];

export const CONTENT_TYPES = ["text", "link", "image", "doc"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** Icons a host can give a tile (keys of NAV_ICONS in src/components/NavIcon.tsx). */
export const TILE_ICONS = [
  "wifi", "book-open", "key", "door-open", "bed-double", "bath", "car", "map-pin", "coffee", "utensils-crossed", "shopping-bag", "gift",
  "message-circle", "phone", "help-circle", "file-text", "star", "heart", "leaf", "sparkles", "globe", "link", "calendar-days", "tag",
] as const;

export type TileContent = {
  type: ContentType;
  /** Text tiles: what shows when it opens. */
  body?: string;
  /** Link tiles: an https link, shown inside the page. */
  url?: string;
  /** Photo and PDF tiles: the file's path in the private "guides" bucket. */
  path?: string;
  /** The uploaded file's own name, shown on the download button. */
  name?: string;
};

export type GuideTile = {
  id: string;
  kind: TileKind;
  /** "section" tiles: the guide section they open. */
  section?: string;
  /** The tile's label; empty uses the default (the section's title, "Wi-Fi", …). */
  title?: string;
  icon?: string;
  /** "custom" tiles only. */
  content?: TileContent;
};

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const id = (v: unknown, i: number) => (typeof v === "string" && /^[a-z0-9-]{1,40}$/i.test(v) ? v : `tile-${i + 1}`);

function content(raw: unknown): TileContent | undefined {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const type = CONTENT_TYPES.includes(r["type"] as ContentType) ? (r["type"] as ContentType) : null;
  if (!type) return undefined;
  if (type === "text") {
    const body = typeof r["body"] === "string" ? r["body"].trim().slice(0, 4000) : "";
    return body ? { type, body } : undefined;
  }
  if (type === "link") {
    const url = typeof r["url"] === "string" && /^https:\/\/[^\s<>"]{3,1990}$/.test(r["url"]) ? r["url"] : "";
    return url ? { type, url } : undefined;
  }
  // Only paths Latchkey made: "<property id>/tiles/<file>".
  const path = typeof r["path"] === "string" && /^[0-9a-f-]{36}\/tiles\/[\w.-]{1,120}$/.test(r["path"]) ? r["path"] : "";
  if (!path) return undefined;
  const name = clean(r["name"], 120);
  return name ? { type, path, name } : { type, path };
}

/** Stored tiles, made safe: at most eight, known kinds, custom ones with content. null = automatic. */
export function normaliseTiles(raw: unknown): GuideTile[] | null {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { tiles?: unknown }).tiles) ? (raw as { tiles: unknown[] }).tiles : null;
  if (!list) return null;
  const out: GuideTile[] = [];
  const seen = new Set<string>();
  for (const [i, t] of list.entries()) {
    if (out.length >= MAX_TILES) break;
    const r = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
    const kind = TILE_KINDS.includes(r["kind"] as TileKind) ? (r["kind"] as TileKind) : null;
    if (!kind) continue;
    let tid = id(r["id"], i);
    while (seen.has(tid)) tid = `${tid}-x`;
    const tile: GuideTile = { id: tid, kind };
    const title = clean(r["title"], 40);
    if (title) tile.title = title;
    if (typeof r["icon"] === "string" && (TILE_ICONS as readonly string[]).includes(r["icon"])) tile.icon = r["icon"];
    if (kind === "section") {
      const key = typeof r["section"] === "string" && /^[a-z0-9_-]{1,60}$/.test(r["section"]) ? r["section"] : "";
      if (!key) continue;
      tile.section = key;
    }
    if (kind === "custom") {
      const c = content(r["content"]);
      if (!c || !title) continue;
      tile.content = c;
    }
    seen.add(tid);
    out.push(tile);
  }
  return out;
}

export type TilePage = {
  page: "stay" | "room";
  sections: Array<{ key: string; title: string }>;
  hasWifi: boolean;
  /** Extras and messages: only on a guest's own stay (not read-only). */
  canOrder: boolean;
};

export type ShownTile = {
  id: string;
  icon: string;
  label: string;
  /** What a tap does. */
  action: { kind: "jump"; target: string; section?: string } | { kind: "extras" } | { kind: "messages" } | { kind: "checkin" } | { kind: "open"; tileId: string };
};

export const TILE_LABELS: Record<Exclude<TileKind, "section" | "custom">, string> = {
  wifi: "Wi-Fi",
  extras: "Extras",
  messages: "Message us",
  times: "Times",
  checkin: "Check in",
};

const DEFAULT_ICONS: Record<TileKind, string> = {
  wifi: "wifi",
  section: "book-open",
  extras: "gift",
  messages: "message-circle",
  times: "calendar-days",
  checkin: "key",
  custom: "sparkles",
};

/** The automatic set, as before hosts could choose: Wi-Fi, the first sections, extras and messages. */
export function autoTiles(ctx: TilePage): GuideTile[] {
  const extra = ctx.page === "stay" && ctx.canOrder ? 2 : 0;
  // Six in all: the room guide has five sections after Wi-Fi; the stay guide also fits extras and messages.
  const first = ctx.page === "room" ? 5 : Math.max(0, 6 - extra - (ctx.hasWifi ? 1 : 0));
  return [
    ...(ctx.hasWifi ? [{ id: "auto-wifi", kind: "wifi" as const }] : []),
    ...ctx.sections.slice(0, first).map((s) => ({ id: `auto-${s.key}`, kind: "section" as const, section: s.key })),
    ...(extra ? [{ id: "auto-extras", kind: "extras" as const }, { id: "auto-messages", kind: "messages" as const }] : []),
  ];
}

/**
 * What shows on this page: the host's tiles (or the automatic set), leaving
 * out any whose target isn't here (a removed section, no Wi-Fi, extras on a
 * room guide), each with its label, icon and what a tap does.
 */
export function shownTiles(stored: GuideTile[] | null, ctx: TilePage, labels: Partial<Record<TileKind, string>> = {}): ShownTile[] {
  const titles = new Map(ctx.sections.map((s) => [s.key, s.title]));
  const out: ShownTile[] = [];
  for (const t of stored ?? autoTiles(ctx)) {
    const icon = t.icon ?? DEFAULT_ICONS[t.kind];
    const fallback = t.kind === "section" || t.kind === "custom" ? "" : (labels[t.kind] ?? TILE_LABELS[t.kind]);
    switch (t.kind) {
      case "wifi":
        if (ctx.hasWifi) out.push({ id: t.id, icon, label: t.title || fallback, action: { kind: "jump", target: ctx.page === "stay" ? "stay-wifi" : "room-wifi" } });
        break;
      case "section": {
        const title = titles.get(t.section ?? "");
        if (title) out.push({ id: t.id, icon, label: t.title || title, action: { kind: "jump", target: `guide-${t.section}`, section: t.section! } });
        break;
      }
      case "extras":
        if (ctx.page === "stay" && ctx.canOrder) out.push({ id: t.id, icon, label: t.title || fallback, action: { kind: "extras" } });
        break;
      case "messages":
        if (ctx.page === "stay" && ctx.canOrder) out.push({ id: t.id, icon, label: t.title || fallback, action: { kind: "messages" } });
        break;
      case "times":
        if (ctx.page === "stay") out.push({ id: t.id, icon, label: t.title || fallback, action: { kind: "jump", target: "stay-times" } });
        break;
      case "checkin":
        if (ctx.page === "room") out.push({ id: t.id, icon, label: t.title || fallback, action: { kind: "checkin" } });
        break;
      case "custom":
        if (t.content && t.title) out.push({ id: t.id, icon, label: t.title, action: { kind: "open", tileId: t.id } });
        break;
    }
    if (out.length >= MAX_TILES) break;
  }
  return out;
}

/**
 * Tiles share the full width: one row up to four, then two even rows
 * (5 → 3+2, 8 → 4+4). Returns how many sit in a row on a phone.
 */
export function tilesPerRow(count: number): number {
  if (count <= 4) return Math.max(count, 1);
  return Math.ceil(count / 2);
}
