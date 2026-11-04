/**
 * Booking sites: the built-in platforms, named and given logos by Latchkey admin
 * (site_settings.booking_sites) along with the web addresses their links must use,
 * plus any other site a host adds. Built-ins keep their fixed channel ids; an added
 * site is stored on a booking as channel "other" plus its site_key, so calendar
 * matching and the database enum never change. Pure, so it can be unit tested.
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

/** As stored in hosts.booking_sites: a site the host added, with its website. */
export type StoredSite = {
  key: string;
  label: string;
  icon_url: string | null;
  url?: string | null;
};

export type Site = {
  key: string;
  label: string;
  iconUrl: string | null;
  builtIn: boolean;
  /** A link for this site must have one of these in its web address. None: anything goes. */
  domains: string[];
  /** A site the host added: its website. */
  url: string | null;
};

/** Latchkey admin's choices for one built-in site. An empty label falls back to the usual wording. */
export type PlatformSite = { label: string; iconUrl: string | null; domains: string[] };
export type PlatformSites = Record<BuiltInSite, PlatformSite>;

/** What a site's links must contain, until Latchkey admin says otherwise. */
export const DEFAULT_SITE_DOMAINS: Record<BuiltInSite, string[]> = {
  airbnb: ["airbnb"],
  booking_com: ["booking.com"],
  homestay: ["homestay.com"],
  vrbo: ["vrbo.com", "homeaway"],
  agoda: ["agoda.com"],
  direct: [],
  other: [],
};

/** Web address parts as typed: lower case, no https:// or path, each once. */
export function cleanDomains(raw: unknown): string[] {
  const items = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\s,]+/) : [];
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const d = item
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (/^[a-z0-9.-]{2,60}$/.test(d) && !out.includes(d)) out.push(d);
    if (out.length >= 8) break;
  }
  return out;
}

export function normalisePlatformSites(raw: unknown): PlatformSites {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as PlatformSites;
  for (const key of BUILT_IN_SITES) {
    const o = (v[key] && typeof v[key] === "object" ? v[key] : {}) as Record<string, unknown>;
    out[key] = {
      label: typeof o["label"] === "string" ? o["label"].trim().slice(0, 40) : "",
      iconUrl: cleanIcon(o["icon_url"]),
      domains: "domains" in o ? cleanDomains(o["domains"]) : DEFAULT_SITE_DOMAINS[key],
    };
  }
  return out;
}

/** The web address of a link, lower case, or null when it isn't one. */
function hostOf(url: string): string | null {
  try {
    return new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Whether a link can belong to this site. Not a security check: it catches a link pasted under the wrong site. */
export function urlFitsSite(url: string, site: Pick<Site, "domains">): boolean {
  if (!site.domains.length) return true;
  const host = hostOf(url);
  return !!host && site.domains.some((d) => host.includes(d));
}

/** Which site a link is from, by the admin's rules or an added site's own website. */
export function siteForUrl<T extends Pick<Site, "domains" | "url">>(
  sites: T[],
  url: string,
): T | null {
  const host = hostOf(url);
  if (!host) return null;
  return (
    sites.find(
      (s) =>
        s.domains.some((d) => host.includes(d)) ||
        (!!s.url && hostOf(s.url)?.replace(/^www\./, "") === host.replace(/^www\./, "")),
    ) ?? null
  );
}

const SITE_KEY = /^site_[a-z0-9]{4,24}$/;
const MAX_SITES = 30;

const cleanWebsite = (raw: unknown): string | null =>
  typeof raw === "string" && /^https:\/\/[^\s"'<>]+$/i.test(raw.trim()) && raw.trim().length <= 300
    ? raw.trim()
    : null;

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
    const url = cleanWebsite(o["url"]);
    out.push({ key, label, icon_url: cleanIcon(o["icon_url"]), ...(url ? { url } : {}) });
    if (out.length >= MAX_SITES) break;
  }
  return out;
}

/**
 * Every site a host offers: the built-ins as Latchkey admin set them, then the
 * ones the host added. Anything a host once stored for a built-in is ignored.
 */
export function resolveSites(
  stored: unknown,
  platform: PlatformSites,
  defaults: Record<string, string>,
): Site[] {
  const builtIns = BUILT_IN_SITES.map((key): Site => ({
    key,
    label: platform[key].label || defaults[key] || key,
    iconUrl: platform[key].iconUrl,
    builtIn: true,
    domains: platform[key].domains,
    url: null,
  }));
  const added = normaliseStoredSites(stored)
    .filter((s) => !isBuiltIn(s.key))
    .map((s): Site => ({
      key: s.key,
      label: s.label,
      iconUrl: s.icon_url,
      builtIn: false,
      domains: [],
      url: s.url ?? null,
    }));
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
