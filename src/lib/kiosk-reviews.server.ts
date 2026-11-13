/* eslint-disable @typescript-eslint/no-explicit-any -- kiosk_reviews and kiosk_review_fetches are from migration 0102 */
/**
 * Server only: reading a property's reviews from its own listing links through Firecrawl
 * (kiosk-reviews.ts holds the rules). Used by the host's Fetch reviews, Latchkey admin's
 * Fetch now, and the daily clean-up, which reads again any property showing reviews whose
 * last read is older than Latchkey admin's "every N days" (job_settings.every_minutes of
 * the "review_import" routine; 7 days unless changed).
 */
import { reviewsDue } from "./kiosk-reviews";
import { secret } from "@/lib/secrets";

const FIRECRAWL = "https://api.firecrawl.dev/v1/scrape";
const firecrawlKey = () => (secret("FIRECRAWL_API_KEY") ?? "").trim() || null;
/** At most this many pages per property, so one read can't run up the bill. */
const MAX_PAGES = 8;
export const DEFAULT_REVIEW_DAYS = 7;

async function db(): Promise<any> {
  const { admin } = await import("./checkin.server");
  return admin();
}

export async function canFetchReviews(): Promise<boolean> {
  const { jobAllowed } = await import("./usage.server");
  return !!firecrawlKey() && (await jobAllowed("review_import"));
}

export async function reviewEveryDays(): Promise<number> {
  const { data } = await (
    await db()
  )
    .from("job_settings")
    .select("every_minutes")
    .eq("key", "review_import")
    .maybeSingle();
  const m = Number(data?.every_minutes);
  return Number.isFinite(m) && m > 0 ? Math.max(1, Math.round(m / 1440)) : DEFAULT_REVIEW_DAYS;
}

export async function setReviewEveryDays(days: number): Promise<void> {
  const sb = await db();
  const { data } = await sb
    .from("job_settings")
    .select("key")
    .eq("key", "review_import")
    .maybeSingle();
  const row = { key: "review_import", every_minutes: days * 1440 };
  const { error } = data
    ? await sb.from("job_settings").update(row).eq("key", "review_import")
    : // A new row keeps the routine's own switch where it was (off until switched on).
      await sb.from("job_settings").insert({ ...row, enabled: false });
  if (error) throw new Error(error.message);
  const { forgetJobSettings } = await import("./usage.server");
  forgetJobSettings?.();
}

/** Reads one property's listing pages and keeps their top reviews. */
export async function fetchReviewsFor(
  propertyId: string,
  hostId: string,
): Promise<{ pages: number; kept: number }> {
  const { normaliseListingLinks } = await import("./listing-links");
  const { REVIEW_PROMPT, REVIEW_SCHEMA, fromScraped, reviewKey, reviewPages } =
    await import("./kiosk-reviews");
  const sb = await db();
  const [{ data: p }, { data: rooms }] = await Promise.all([
    sb.from("properties").select("listing_links").eq("id", propertyId).single(),
    sb.from("rooms").select("listing_links").eq("property_id", propertyId),
  ]);
  const links = [
    ...normaliseListingLinks(p?.listing_links),
    ...((rooms ?? []) as Array<{ listing_links: unknown }>).flatMap((r) =>
      normaliseListingLinks(r.listing_links),
    ),
  ];
  const pages = [
    ...new Map(
      links.flatMap((l) => reviewPages(l.url).map((url) => [url, l.site] as const)),
    ).entries(),
  ].slice(0, MAX_PAGES);
  if (!pages.length)
    throw new Error("Add your listing links first (Properties → the property or a room).");

  const { bumpUsage } = await import("./usage.server");
  const found = new Map<string, Record<string, unknown>>();
  let read = 0;
  for (const [url, site] of pages) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    try {
      const res = await fetch(FIRECRAWL, {
        method: "POST",
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${firecrawlKey()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          formats: ["json"],
          jsonOptions: { schema: REVIEW_SCHEMA, prompt: REVIEW_PROMPT },
          onlyMainContent: false,
          waitFor: 3000,
          timeout: 80_000,
          blockAds: true,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { json?: { reviews?: unknown[] } };
      };
      await bumpUsage(hostId, "firecrawl:reviews");
      if (!res.ok || body.success === false) continue;
      read++;
      for (const raw of body.data?.json?.reviews ?? []) {
        const r = fromScraped((raw ?? {}) as Record<string, unknown>, site);
        if (!r) continue;
        const key = reviewKey(r);
        if (!found.has(key))
          found.set(key, {
            property_id: propertyId,
            site: r.site.slice(0, 40),
            first_name: r.firstName.slice(0, 40),
            rating: r.rating,
            out_of: r.outOf,
            review_date: r.date,
            quote: r.text,
            review_key: key,
            source_url: url,
            fetched_at: new Date().toISOString(),
          });
      }
    } catch {
      // One page that won't read doesn't stop the others.
    } finally {
      clearTimeout(timer);
    }
  }
  const note = async (error: string | null, kept: number) =>
    sb
      .from("kiosk_review_fetches")
      .upsert(
        {
          property_id: propertyId,
          fetched_at: new Date().toISOString(),
          pages: read,
          kept,
          error,
        },
        { onConflict: "property_id" },
      )
      .then(
        () => undefined,
        () => undefined,
      );
  if (!read) {
    await note("No listing page could be read", 0);
    throw new Error("None of your listing pages could be read. Try again later.");
  }
  const rows = [...found.values()];
  if (rows.length) {
    // A review seen before keeps the host's choice to hide it (hidden isn't sent).
    const { error } = await sb
      .from("kiosk_reviews")
      .upsert(rows, { onConflict: "property_id,review_key" });
    if (error) throw new Error("This needs the latest update (migration 0102).");
  }
  await note(null, rows.length);
  return { pages: read, kept: rows.length };
}

type PropertyRow = {
  id: string;
  name: string;
  host_id: string;
  showing: boolean;
  links: number;
  lastFetched: string | null;
  kept: number | null;
  error: string | null;
};

/** Every property with listing links: whether it shows reviews and when they were last read. */
export async function reviewProperties(): Promise<PropertyRow[]> {
  const { normaliseListingLinks } = await import("./listing-links");
  const sb = await db();
  const [{ data: props }, { data: rooms }, fetches] = await Promise.all([
    sb.from("properties").select("id, name, host_id, theme_config, listing_links, is_demo"),
    sb.from("rooms").select("property_id, listing_links"),
    sb
      .from("kiosk_review_fetches")
      .select("property_id, fetched_at, kept, error")
      .then(
        (r: { data: unknown }) => r.data ?? [],
        () => [],
      ),
  ]);
  const roomLinks = new Map<string, number>();
  for (const r of (rooms ?? []) as Array<{ property_id: string; listing_links: unknown }>)
    roomLinks.set(
      r.property_id,
      (roomLinks.get(r.property_id) ?? 0) + normaliseListingLinks(r.listing_links).length,
    );
  const last = new Map(
    (
      fetches as Array<{
        property_id: string;
        fetched_at: string;
        kept: number;
        error: string | null;
      }>
    ).map((f) => [f.property_id, f]),
  );
  return ((props ?? []) as any[])
    .filter((p) => !p.is_demo)
    .map((p) => {
      const f = last.get(p.id);
      return {
        id: p.id as string,
        name: p.name as string,
        host_id: p.host_id as string,
        showing: (p.theme_config as { kioskReviews?: unknown } | null)?.kioskReviews === true,
        links: normaliseListingLinks(p.listing_links).length + (roomLinks.get(p.id) ?? 0),
        lastFetched: f?.fetched_at ?? null,
        kept: f?.kept ?? null,
        error: f?.error ?? null,
      };
    })
    .filter((p) => p.links > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Reads reviews for several properties: the chosen ones (Latchkey admin's Fetch now), or,
 * on the daily clean-up, every property showing reviews whose last read is due.
 */
export async function refreshReviews(opts: {
  only: string[] | null;
  dueOnly?: boolean;
  limit: number;
}): Promise<{ done: number; failed: number; skipped: number }> {
  if (!(await canFetchReviews())) return { done: 0, failed: 0, skipped: 0 };
  const days = await reviewEveryDays();
  const all = await reviewProperties();
  const chosen = all.filter((p) =>
    opts.only
      ? opts.only.includes(p.id)
      : !opts.dueOnly || (p.showing && reviewsDue(p.lastFetched, days)),
  );
  let done = 0;
  let failed = 0;
  for (const p of chosen.slice(0, opts.limit)) {
    try {
      await fetchReviewsFor(p.id, p.host_id);
      done++;
    } catch {
      failed++;
    }
  }
  return { done, failed, skipped: Math.max(0, chosen.length - opts.limit) };
}
