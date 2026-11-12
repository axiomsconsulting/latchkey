/* eslint-disable @typescript-eslint/no-explicit-any -- columns and tables from migration 0109 */
/**
 * Server only: the guest guide's extra cards (property information, around here, the way to
 * your room) and the reads behind them. Places come from OpenStreetMap's Overpass API (free; a
 * named User-Agent as its rules ask) and are kept a week per property; events from Ticketmaster's
 * Discovery API when Latchkey admin has set TICKETMASTER_API_KEY. Rules in property-info.ts,
 * local-guide.ts and floor-plans.ts.
 */
import { directionsTo, normalisePins, type FloorPlan } from "./floor-plans";
import {
  eventsFromTicketmaster,
  guestLocal,
  normaliseLocalGuide,
  overpassQuery,
  placesFromOverpass,
  type LocalEvent,
  type Place,
} from "./local-guide";
import { normalisePropertyInfo } from "./property-info";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const UA = "Latchkey guest guide (local places for guests)";
const WEEK = 7 * 86_400_000;

export async function db(): Promise<any> {
  const { admin } = await import("./checkin.server");
  return admin();
}

const todayIn = (tz: string | null) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? "Europe/London" }).format(new Date());

/** Where the property is: a paired door tablet's position, else its UK postcode, else OpenStreetMap's search of its address. */
export async function propertySpot(
  sb: any,
  p: {
    id: string;
    postcode?: string | null;
    country_code?: string | null;
    address?: string | null;
  },
): Promise<{ lat: number; lng: number } | null> {
  const { data: dev } = await sb
    .from("kiosk_devices")
    .select("lat, lng")
    .eq("property_id", p.id)
    .not("lat", "is", null)
    .limit(1)
    .maybeSingle();
  if (dev?.lat != null && dev?.lng != null) return { lat: dev.lat, lng: dev.lng };
  const { ukPostcode } = await import("./weather");
  const pc = (p.country_code ?? "GB") === "GB" ? ukPostcode(p.postcode ?? null) : null;
  try {
    if (pc) {
      const res = await fetch(`https://api.postcodes.io/postcodes/${pc}`, {
        signal: AbortSignal.timeout(5000),
      });
      const body = (await res.json()) as { result?: { latitude?: number; longitude?: number } };
      if (typeof body.result?.latitude === "number" && typeof body.result.longitude === "number")
        return { lat: body.result.latitude, lng: body.result.longitude };
    }
    const q = [p.address, p.postcode].filter(Boolean).join(", ");
    if (!q) return null;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}${p.country_code ? `&countrycodes=${p.country_code.toLowerCase()}` : ""}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) },
    );
    const body = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = body[0];
    if (hit?.lat && hit.lon) return { lat: Number(hit.lat), lng: Number(hit.lon) };
  } catch {
    // No position: no local card.
  }
  return null;
}

/** Reads places (and events) near a property now and keeps them. */
export async function refreshPlaces(
  propertyId: string,
): Promise<{ places: number; events: number }> {
  const sb = await db();
  const { data: p } = await sb
    .from("properties")
    .select("id, postcode, country_code, address, local_guide")
    .eq("id", propertyId)
    .maybeSingle();
  if (!p) throw new Error("Property not found.");
  const g = normaliseLocalGuide(p.local_guide);
  const at = await propertySpot(sb, p);
  if (!at) {
    await sb.from("local_places").upsert({
      property_id: propertyId,
      error: "no_location",
      fetched_at: new Date().toISOString(),
    });
    throw new Error(
      "Latchkey couldn't find where the property is. Check its postcode and address.",
    );
  }
  let places: Place[] = [];
  let error: string | null = null;
  try {
    const res = await fetch(OVERPASS, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
      body: `data=${encodeURIComponent(overpassQuery(at, ["food", "cafe", "pub", "shop", "shopping", "sights", "transport"]))}`,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`OpenStreetMap answered ${res.status}`);
    places = placesFromOverpass(await res.json(), at);
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 200) : "failed";
  }
  let events: LocalEvent[] = [];
  const key = (process.env["TICKETMASTER_API_KEY"] ?? "").trim();
  if (key && g.eventsOn) {
    try {
      const start = new Date().toISOString().slice(0, 19) + "Z";
      const end = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 19) + "Z";
      const q = new URLSearchParams({
        apikey: key,
        latlong: `${at.lat.toFixed(4)},${at.lng.toFixed(4)}`,
        radius: "15",
        unit: "km",
        size: "30",
        sort: "date,asc",
        startDateTime: start,
        endDateTime: end,
      });
      const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${q}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) events = eventsFromTicketmaster(await res.json());
    } catch {
      // Events are a bonus: places still show.
    }
  }
  const row: Record<string, unknown> = {
    property_id: propertyId,
    lat: at.lat,
    lng: at.lng,
    events,
    fetched_at: new Date().toISOString(),
    error,
  };
  // A failed read keeps the places read before.
  if (!error) row["places"] = places;
  const { error: e } = await sb.from("local_places").upsert(row);
  if (e)
    throw new Error(
      /local_places/.test(e.message) ? "This needs the latest update (migration 0109)." : e.message,
    );
  if (error)
    throw new Error("OpenStreetMap didn't answer just now. Please try again in a few minutes.");
  return { places: places.length, events: events.length };
}

/** Places and events for a property, read again when older than a week (the guest waits at most a few seconds). */
export async function placesFor(propertyId: string): Promise<{
  at: { lat: number; lng: number } | null;
  places: Place[];
  events: LocalEvent[];
  fetchedAt: string | null;
}> {
  const sb = await db();
  const read = async () => {
    const { data } = await sb
      .from("local_places")
      .select("*")
      .eq("property_id", propertyId)
      .maybeSingle();
    return data;
  };
  let row = await read();
  if (!row || Date.now() - Date.parse(row.fetched_at) > WEEK) {
    await Promise.race([
      refreshPlaces(propertyId).catch(() => undefined),
      new Promise((r) => setTimeout(r, row ? 1500 : 12_000)),
    ]);
    row = (await read()) ?? row;
  }
  return {
    at: row?.lat != null && row?.lng != null ? { lat: row.lat, lng: row.lng } : null,
    places: (Array.isArray(row?.places) ? row.places : []) as Place[],
    events: (Array.isArray(row?.events) ? row.events : []) as LocalEvent[],
    fetchedAt: row?.fetched_at ?? null,
  };
}

/** Signed links to private "guides" bucket files, for this long. */
export async function signed(paths: string[], seconds: number): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.from("guides").createSignedUrls(paths, seconds);
  const out: Record<string, string> = {};
  for (const x of data ?? []) if (x.path && x.signedUrl) out[x.path] = x.signedUrl;
  return out;
}

export async function plansFor(sb: any, propertyId: string) {
  const { data, error } = await sb
    .from("floor_plans")
    .select("id, level, label, image_path, pins")
    .eq("property_id", propertyId)
    .order("level");
  if (error) return [];
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id as string,
    level: r.level as number,
    label: (r.label as string | null) ?? null,
    imagePath: r.image_path as string,
    pins: normalisePins(r.pins),
  }));
}

export type GuestExtras = {
  info: Array<ReturnType<typeof normalisePropertyInfo>[number] & { imageUrls: string[] }>;
  local: { places: Place[]; events: LocalEvent[] } | null;
  directions: {
    steps: string[];
    planUrl: string | null;
    at: { x: number; y: number };
    level: number;
    roomName: string;
  } | null;
};

/** Everything the extra cards need for one property (and, on a stay, its room). */
export async function extrasFor(
  propertyId: string,
  room: { id: string; name: string } | null,
): Promise<GuestExtras> {
  const sb = await db();
  const { data: p } = await sb
    .from("properties")
    .select("id, timezone, property_info, local_guide")
    .eq("id", propertyId)
    .maybeSingle();
  if (!p) return { info: [], local: null, directions: null };
  const items = normalisePropertyInfo(p.property_info, propertyId);
  const g = normaliseLocalGuide(p.local_guide);
  const [links, near, plans] = await Promise.all([
    signed(
      items.flatMap((i) => i.images),
      60 * 60 * 6,
    ),
    g.on ? placesFor(propertyId).catch(() => null) : Promise.resolve(null),
    room ? plansFor(sb, propertyId) : Promise.resolve([]),
  ]);
  let directions: GuestExtras["directions"] = null;
  if (room) {
    const d = directionsTo(plans as FloorPlan[], room.id, room.name);
    if (d) {
      const plan = plans.find((x) => x.id === d.planId)!;
      const url = (await signed([plan.imagePath], 60 * 60 * 6))[plan.imagePath] ?? null;
      directions = { steps: d.steps, planUrl: url, at: d.at, level: d.level, roomName: room.name };
    }
  }
  return {
    info: items.map((i) => ({
      ...i,
      imageUrls: i.images.map((x) => links[x]).filter(Boolean) as string[],
    })),
    local: near ? guestLocal(g, near.places, near.events, near.at, todayIn(p.timezone)) : null,
    directions,
  };
}
