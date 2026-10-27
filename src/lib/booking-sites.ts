/**
 * Booking sites: the built-in platforms plus any the host adds as they come
 * up. Built-ins keep their fixed channel ids; an added site is stored on a
 * booking as channel "other" plus its site_key, so calendar matching and the
 * database enum never change. Pure, so it can be unit tested.
 */

export const BUILT_IN_SITES = [
  "airbnb",
  "booking_com",
  "homestay",
  "vrbo",
  "agoda",
  "direct",
  "other",
] as const;
export type BuiltInSite = (typeof BUILT_IN_SITES)[number];

/** As stored in hosts.booking_sites: label and icon for any site, built-in or added. */
export type StoredSite = { key: string; label: string; icon_url: string | null };

export type Site = { key: string; label: string; iconUrl: string | null; builtIn: boolean };

const SITE_KEY = /^site_[a-z0-9]{4,24}$/;
const MAX_SITES = 30;

export function isBuiltIn(key: string): key is BuiltInSite {
  return (BUILT_IN_SITES as readonly string[]).includes(key);
}

export function isSiteKey(key: string): boolean {
  return SITE_KEY.test(key);
}

/** Any key a guest or host may pick: a built-in id or an added site. */
export function isPlatformKey(key: string): boolean {
  return isBuiltIn(key) || isSiteKey(key);
}

export function newSiteKey(random: () => number = Math.random): string {
  let s = "";
  while (s.length < 8) s += random().toString(36).slice(2);
  return `site_${s.slice(0, 8)}`;
}

/** Only https links (signed storage URLs) or inline images are shown as icons. */
function cleanIcon(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (/^https:\/\/[^\s"'<>]+$/i.test(v) && v.length <= 2000) return v;
  if (
    /^data:image\/(png|jpeg|webp|x-icon|vnd\.microsoft\.icon);base64,[a-z0-9+/=]+$/i.test(v) &&
    v.length <= 40_000
  )
    return v;
  return null;
}

export function normaliseStoredSites(raw: unknown): StoredSite[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: StoredSite[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const key = typeof o["key"] === "string" ? o["key"] : "";
    if (!isPlatformKey(key) || seen.has(key)) continue;
    const label = typeof o["label"] === "string" ? o["label"].trim().slice(0, 40) : "";
    // An added site needs a name; a built-in can fall back to its default.
    if (!label && !isBuiltIn(key)) continue;
    seen.add(key);
    out.push({ key, label, icon_url: cleanIcon(o["icon_url"]) });
    if (out.length >= MAX_SITES) break;
  }
  return out;
}

/**
 * Every site the host offers, built-ins first in their usual order, then the
 * ones they added. Labels come from booking_sites, then the older
 * channel_labels, then the default wording.
 */
export function resolveSites(
  channelLabels: Record<string, string> | null | undefined,
  stored: unknown,
  defaults: Record<string, string>,
): Site[] {
  const list = normaliseStoredSites(stored);
  const byKey = new Map(list.map((s) => [s.key, s]));
  const builtIns = BUILT_IN_SITES.map((key) => {
    const s = byKey.get(key);
    return {
      key,
      label: s?.label || channelLabels?.[key]?.trim() || defaults[key] || key,
      iconUrl: s?.icon_url ?? null,
      builtIn: true,
    };
  });
  const added = list
    .filter((s) => !isBuiltIn(s.key))
    .map((s) => ({ key: s.key, label: s.label, iconUrl: s.icon_url, builtIn: false }));
  return [...builtIns, ...added];
}

/** Which site a stay came from: the added site when there is one. */
export function platformKey(b: { channel: string; site_key?: string | null }): string {
  return b.site_key && isSiteKey(b.site_key) ? b.site_key : b.channel;
}

/** How a picked site is saved on a booking or calendar link. */
export function toChannel(key: string): { channel: BuiltInSite; site_key: string | null } {
  if (isBuiltIn(key)) return { channel: key, site_key: null };
  if (isSiteKey(key)) return { channel: "other", site_key: key };
  return { channel: "other", site_key: null };
}

export function siteFor(sites: Site[], key: string): Site | null {
  return sites.find((s) => s.key === key) ?? null;
}
