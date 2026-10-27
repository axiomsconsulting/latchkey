/**
 * Links to a property's or room's own listing on the booking sites, kept so
 * the host can jump straight there from Properties. Each is the link and the
 * site it's on (a known site, or "other"); https only, tidied (no tracking or
 * search noise), each once. Pure.
 */
import { detectPlatform, listingUrl } from "./listing-import";

export type ListingLink = { site: string; url: string };
export const MAX_LINKS = 10;

function tidy(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    // Known sites lose their tracking and dates; other links are kept as they are, made https.
    if (detectPlatform(u.toString())) return listingUrl(u.toString());
    u.protocol = "https:";
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** From anything stored or typed (links, or {url} objects, or text with links in it). */
export function normaliseListingLinks(raw: unknown): ListingLink[] {
  const items: string[] = Array.isArray(raw)
    ? raw
        .map((x) =>
          typeof x === "string"
            ? x
            : x && typeof x === "object" && typeof (x as { url?: unknown }).url === "string"
              ? (x as { url: string }).url
              : "",
        )
        .filter(Boolean)
    : typeof raw === "string"
      ? (raw.match(/https?:\/\/[^\s<>"')]+/gi) ?? [])
      : [];
  const out: ListingLink[] = [];
  for (const item of items) {
    const url = tidy(item.replace(/[.,;]+$/, ""));
    if (!url || out.some((l) => l.url === url)) continue;
    out.push({ site: detectPlatform(url) ?? "other", url });
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

/** Adds new links to what's already kept, without repeating any. */
export const mergeListingLinks = (had: unknown, add: unknown): ListingLink[] =>
  normaliseListingLinks(
    [...normaliseListingLinks(had), ...normaliseListingLinks(add)].map((l) => l.url),
  );
