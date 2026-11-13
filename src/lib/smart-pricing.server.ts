/* eslint-disable @typescript-eslint/no-explicit-any -- smart_pricing and rate_readings are from migration 0107 */
/**
 * Server only: smart pricing's page reads (src/lib/smart-pricing.ts holds the rules). Reads the
 * price guests see on the booking sites for a few sample stays, through Firecrawl, for each
 * property that has smart pricing on: its rooms' and its own listing links (Properties), and the
 * other properties' links the host added. Runs from the calendar sync when a property's schedule
 * says so (behind the "rate_watch" routine, off until Latchkey admin switches it on), or when the
 * host taps Check prices now. Never changes a price: suggestions are accepted by the host.
 */
import {
  DEFAULT_SMART_PRICING,
  MAX_READS,
  PRICE_SCHEMA,
  PROPERTY_PAGES,
  matchRoomType,
  nightlyFrom,
  normaliseSmartPricing,
  priceSiteForUrl,
  pricePrompt,
  priceUrl,
  readDue,
  sampleStays,
  type PriceSite,
  type SmartPricing,
} from "./smart-pricing";
import { secret } from "@/lib/secrets";

const FIRECRAWL = "https://api.firecrawl.dev/v1/scrape";
const firecrawlKey = () => (secret("FIRECRAWL_API_KEY") ?? "").trim() || null;
const READ_AT_ONCE = 4;
/** Readings are kept this long (for the history of prices on the sites). */
const KEEP_DAYS = 180;

async function db(): Promise<any> {
  const { admin } = await import("./checkin.server");
  return admin();
}

export async function canReadPrices(): Promise<boolean> {
  const { jobAllowed } = await import("./usage.server");
  return !!firecrawlKey() && (await jobAllowed("rate_watch"));
}

/** A property's smart pricing settings (the starting ones before migration 0107 or when unset). */
export async function pricingFor(sb: any, propertyId: string): Promise<SmartPricing> {
  try {
    const { data, error } = await sb
      .from("properties")
      .select("smart_pricing")
      .eq("id", propertyId)
      .maybeSingle();
    if (error) return DEFAULT_SMART_PRICING;
    return normaliseSmartPricing(data?.smart_pricing);
  } catch {
    return DEFAULT_SMART_PRICING;
  }
}

const todayIn = (tz: string | null) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? "Europe/London" }).format(new Date());

type Target = {
  url: string;
  site: PriceSite;
  kind: "own" | "market";
  label: string | null;
  /** The room it prices; null = a property page whose room types are matched by name. */
  roomId: string | null;
};

/** Every page to read for a property: its rooms' and its own listing links, and the host's market links. */
export async function targetsFor(sb: any, propertyId: string, s: SmartPricing) {
  const { normaliseListingLinks } = await import("./listing-links");
  const [{ data: p }, { data: rooms }] = await Promise.all([
    sb
      .from("properties")
      .select("id, host_id, name, timezone, country_code, currency, listing_links, hosts(currency)")
      .eq("id", propertyId)
      .single(),
    sb
      .from("rooms")
      .select("id, display_name, public_title, listing_links, base_rate_pence")
      .eq("property_id", propertyId)
      .neq("active", false)
      .order("sort_order"),
  ]);
  const roomList = ((rooms ?? []) as any[]).map((r) => ({
    id: r.id as string,
    name: ((r.public_title as string | null) || (r.display_name as string)) ?? "",
    rate: typeof r.base_rate_pence === "number" ? (r.base_rate_pence as number) : null,
  }));
  const targets: Target[] = [];
  const add = (t: Target) => {
    if (!targets.some((x) => x.url === t.url && x.roomId === t.roomId)) targets.push(t);
  };
  for (const r of (rooms ?? []) as any[])
    for (const l of normaliseListingLinks(r.listing_links)) {
      const site = priceSiteForUrl(l.url);
      if (site) add({ url: l.url, site, kind: "own", label: null, roomId: r.id });
    }
  for (const l of normaliseListingLinks(p?.listing_links)) {
    const site = priceSiteForUrl(l.url);
    if (!site) continue;
    // A one-unit page on the property means the whole place is one room; a property page has room types.
    const roomId = PROPERTY_PAGES.includes(site) || roomList.length !== 1 ? null : roomList[0]!.id;
    add({ url: l.url, site, kind: "own", label: null, roomId });
  }
  for (const m of s.market)
    add({ url: m.url, site: m.site, kind: "market", label: m.label || null, roomId: m.roomId });
  return {
    property: p,
    rooms: roomList,
    currency: (
      (p?.currency as string | null) ||
      (p?.hosts?.currency as string | null) ||
      "GBP"
    ).toUpperCase(),
    targets,
  };
}

async function readPage(
  url: string,
  country: string | null,
  nights: number,
): Promise<{ ok: boolean; json: any; status: number; why: string | null }> {
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
        jsonOptions: { schema: PRICE_SCHEMA, prompt: pricePrompt(nights) },
        onlyMainContent: false,
        waitFor: 3000,
        timeout: 80_000,
        blockAds: true,
        ...(country ? { location: { country: country.toUpperCase() } } : {}),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      data?: { json?: unknown };
    };
    return {
      ok: res.ok && body.success !== false,
      json: body.data?.json ?? null,
      status: res.status,
      why: res.ok ? null : (body.error ?? `HTTP ${res.status}`),
    };
  } catch (e) {
    return { ok: false, json: null, status: 0, why: e instanceof Error ? e.message : "failed" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads prices for one property now: each target page for each sample stay (MAX_READS at most),
 * and keeps a reading per room and stay. Returns how many pages were read and prices found.
 */
export async function readPricesFor(
  propertyId: string,
  o: { hostId?: string } = {},
): Promise<{ pages: number; found: number; problems: string[] }> {
  if (!firecrawlKey()) throw new Error("Reading prices isn't set up yet (Latchkey admin).");
  const sb = await db();
  const s = await pricingFor(sb, propertyId);
  const { property, rooms, currency, targets } = await targetsFor(sb, propertyId, s);
  if (!property) throw new Error("Property not found.");
  if (!targets.length)
    throw new Error(
      "Add your listing links (Properties → a room or the property) or other properties' links first.",
    );
  const hostId = o.hostId ?? (property.host_id as string);
  const stays = sampleStays(todayIn(property.timezone), {
    horizon: s.horizonDays,
    count: s.samples,
    nights: s.nights,
  });
  const { bumpUsage } = await import("./usage.server");
  const rows: any[] = [];
  const problems = new Set<string>();
  const jobs = targets.flatMap((t) => stays.map((stay) => ({ t, stay }))).slice(0, MAX_READS);
  let pages = 0;
  let stop = false;
  const one = async ({ t, stay }: (typeof jobs)[number]) => {
    if (stop) return;
    const url = priceUrl(t.url, t.site, stay, currency);
    const res = await readPage(url, property.country_code ?? null, s.nights);
    pages++;
    await bumpUsage(hostId, "firecrawl:prices");
    if (res.status === 401 || res.status === 402 || res.status === 403) {
      problems.add("Reading pages is paused on Latchkey's side (Firecrawl account).");
      stop = true;
      return;
    }
    const base = {
      property_id: propertyId,
      kind: t.kind,
      site: t.site,
      url: t.url.slice(0, 600),
      label: t.label,
      check_in: stay.checkIn,
      nights: s.nights,
      currency,
      seen_at: new Date().toISOString(),
    };
    if (!res.ok || !res.json) {
      rows.push({
        ...base,
        room_id: t.roomId,
        nightly_pence: null,
        available: null,
        note: "Page didn't read",
      });
      return;
    }
    const j = res.json as Record<string, any>;
    if (t.roomId) {
      const r = nightlyFrom(j, { nights: s.nights, currency });
      rows.push({
        ...base,
        room_id: t.roomId,
        nightly_pence: r.nightly,
        available: r.available,
        note: r.note,
      });
      return;
    }
    // A property page: each of our rooms takes the room type with the same name.
    const types = (Array.isArray(j["rooms"]) ? j["rooms"] : [])
      .filter((x: any) => x && typeof x.name === "string")
      .map((x: any) => ({ name: String(x.name), total: x.total }));
    for (const room of rooms) {
      const type = types.length ? matchRoomType(room.name, types) : null;
      const src = type ? { ...j, total: type.total } : types.length ? null : j;
      if (!src) continue;
      const r = nightlyFrom(src, { nights: s.nights, currency });
      rows.push({
        ...base,
        room_id: room.id,
        nightly_pence: r.nightly,
        available: r.available,
        note: r.note,
      });
    }
  };
  // A few pages at a time: quicker than one by one, gentle on the sites and the account.
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: Math.min(READ_AT_ONCE, queue.length) }, async () => {
      for (let j = queue.shift(); j; j = queue.shift()) await one(j);
    }),
  );
  if (rows.length) {
    const { error } = await sb.from("rate_readings").insert(rows);
    if (error)
      throw new Error(
        /rate_readings/.test(error.message)
          ? "Smart pricing needs the latest update (migration 0107)."
          : error.message,
      );
  }
  // Older readings go.
  await sb
    .from("rate_readings")
    .delete()
    .eq("property_id", propertyId)
    .lt("seen_at", new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString());
  return { pages, found: rows.filter((r) => r.nightly_pence).length, problems: [...problems] };
}

/** From the calendar sync: reads prices for properties whose schedule says today (a few per run). */
export async function readDuePrices(limit = 2): Promise<number> {
  if (!(await canReadPrices())) return 0;
  const sb = await db();
  const { data, error } = await sb
    .from("properties")
    .select("id, host_id, timezone, smart_pricing, is_demo")
    .not("smart_pricing", "is", null)
    .neq("active", false)
    .limit(500);
  if (error) return 0;
  let done = 0;
  for (const p of (data ?? []) as any[]) {
    if (done >= limit) break;
    if (p.is_demo) continue;
    const s = normaliseSmartPricing(p.smart_pricing);
    if (!s.on) continue;
    const { data: last } = await sb
      .from("rate_readings")
      .select("seen_at")
      .eq("property_id", p.id)
      .order("seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastDay = last?.seen_at
      ? new Intl.DateTimeFormat("en-CA", { timeZone: p.timezone ?? "Europe/London" }).format(
          new Date(last.seen_at),
        )
      : null;
    if (!readDue(s.schedule, lastDay, todayIn(p.timezone))) continue;
    try {
      await readPricesFor(p.id, { hostId: p.host_id });
    } catch (e) {
      console.error("Smart pricing read failed", p.id, e instanceof Error ? e.message : e);
    }
    done++;
  }
  return done;
}
