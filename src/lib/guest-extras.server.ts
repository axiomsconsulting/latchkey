/* eslint-disable @typescript-eslint/no-explicit-any -- columns and tables from migration 0109 */
/**
 * Server only: the guest guide's extra cards (property information, around here, the way to
 * your room) and the reads behind them. Places come from OpenStreetMap's Overpass API (free; a
 * named User-Agent as its rules ask) and are kept a week per property; events from Ticketmaster's
 * Discovery API when Latchkey admin has set TICKETMASTER_API_KEY. Rules in property-info.ts,
 * local-guide.ts and floor-plans.ts.
 */
import {
  houseNotes,
  inside,
  nameOf,
  reachableAreas,
  sortFloors,
  type HouseNotes,
  type Point,
} from "./floor-map";
import { directionsTo, mapFloors, normalisePins, type FloorPlan } from "./floor-plans";
import {
  eventsFromTicketmaster,
  PLACE_CATEGORIES,
  eventsFromCalendar,
  eventsFromSkiddle,
  guestLocal,
  hygieneUrl,
  keepEvents,
  nominatimUrl,
  readRouteTable,
  routeTableUrl,
  withHygiene,
  normaliseLocalGuide,
  overpassQuery,
  placesFromNominatim,
  placesFromOverpass,
  skiddleUrl,
  type LocalEvent,
  type Place,
} from "./local-guide";
import { normalisePropertyInfo } from "./property-info";
import { secret } from "@/lib/secrets";

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
/**
 * OpenStreetMap's usage policies: a User-Agent naming the app and where to find it, results kept
 * (a week per property), one Overpass query a read and at most one Nominatim search a second.
 */
const ua = () =>
  `Latchkey/1.0 (guest guide: places near the property; +${(secret("PUBLIC_SITE_URL") ?? "https://latchkey.omsestates.uk").replace(/\/$/, "")})`;
const WEEK = 7 * 86_400_000;

export async function db(): Promise<any> {
  const { admin } = await import("./checkin.server");
  return admin();
}

const todayIn = (tz: string | null) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? "Europe/London" }).format(new Date());

/** Where the property is: its UK postcode (postcodes.io), else OpenStreetMap's search of its address, else a paired door tablet's position. */
export async function propertySpot(
  sb: any,
  p: {
    id: string;
    postcode?: string | null;
    country_code?: string | null;
    address?: string | null;
  },
): Promise<{ lat: number; lng: number } | null> {
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
      { headers: { "User-Agent": ua() }, signal: AbortSignal.timeout(6000) },
    );
    const body = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = body[0];
    if (hit?.lat && hit.lon) return { lat: Number(hit.lat), lng: Number(hit.lon) };
  } catch {
    // Not found by postcode or address: a paired door tablet's position, if any.
  }
  const { data: dev } = await sb
    .from("kiosk_devices")
    .select("lat, lng")
    .eq("property_id", p.id)
    .not("lat", "is", null)
    .limit(1)
    .maybeSingle();
  if (dev?.lat != null && dev?.lng != null) return { lat: dev.lat, lng: dev.lng };
  return null;
}

/** Up to which date events are worth reading for this property (guests staying or arriving soon), or null. */
export async function eventsUntil(
  sb: any,
  propertyId: string,
  today: string,
): Promise<string | null> {
  const { eventWindow, EVENTS_LOOKAHEAD_DAYS } = await import("./local-guide");
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + EVENTS_LOOKAHEAD_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data } = await sb
    .from("bookings")
    .select("check_in_date, check_out_date, status")
    .eq("property_id", propertyId)
    .is("archived_at", null)
    .is("mirror_of", null)
    .gt("check_out_date", today)
    .lte("check_in_date", soon)
    .limit(200);
  return eventWindow((data ?? []) as any[], today);
}

/** Events near the property up to `until`: Ticketmaster, Skiddle (UK) and the host's calendars, each once. */
async function readEvents(
  p: { country_code?: string | null; timezone?: string | null },
  g: ReturnType<typeof normaliseLocalGuide>,
  at: { lat: number; lng: number },
  today: string,
  until: string,
): Promise<LocalEvent[]> {
  if (!g.eventsOn) return [];
  let events: LocalEvent[] = [];
  const key = (secret("TICKETMASTER_API_KEY") ?? "").trim();
  if (key) {
    try {
      const q = new URLSearchParams({
        apikey: key,
        latlong: `${at.lat.toFixed(4)},${at.lng.toFixed(4)}`,
        radius: "15",
        unit: "km",
        size: "40",
        sort: "date,asc",
        startDateTime: new Date().toISOString().slice(0, 19) + "Z",
        endDateTime: `${until}T23:59:59Z`,
      });
      const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${q}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) events = eventsFromTicketmaster(await res.json(), 30);
    } catch {
      // Events are a bonus: places still show.
    }
  }
  // Skiddle (free key, UK): gigs, theatre, comedy, festivals, family days, arts, exhibitions.
  const skiddle = (secret("SKIDDLE_API_KEY") ?? "").trim();
  if (skiddle && (p.country_code ?? "GB") === "GB") {
    try {
      const res = await fetch(skiddleUrl(skiddle, at, today, 14, until), {
        headers: { "User-Agent": ua(), Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) events.push(...eventsFromSkiddle(await res.json(), 40));
    } catch {
      // Events are a bonus: places still show.
    }
  }
  // The host's own event calendars (iCal links): free, and as local as the host chooses.
  const { parseIcs } = await import("./ical");
  for (const c of g.calendars) {
    try {
      const res = await fetch(c.url, {
        headers: { "User-Agent": ua(), Accept: "text/calendar, */*" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const ics = (await res.text()).slice(0, 3_000_000);
      events.push(
        ...eventsFromCalendar(
          parseIcs(ics, p.timezone ?? "Europe/London", { noEndOk: true }),
          today,
          c.id,
        ),
      );
    } catch {
      // One calendar not answering never stops the rest.
    }
  }
  // The same event from two sources once, soonest first, only while guests are here.
  const seen = new Set<string>();
  return keepEvents(events, today, until)
    .filter((e) => {
      const k = `${e.name.toLowerCase().replace(/[^a-z0-9]/g, "")}|${e.date}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")))
    .slice(0, 60);
}

/** Places by road and path from the property (two table requests, a second apart), and UK food hygiene ratings. */
async function enrichPlaces(
  places: Place[],
  at: { lat: number; lng: number },
  country: string,
): Promise<Place[]> {
  let out = places;
  const located = out.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  for (const mode of ["foot", "car"] as const) {
    try {
      const res = await fetch(routeTableUrl(mode, at, located), {
        headers: { "User-Agent": ua(), Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const rows = readRouteTable(await res.json(), located.length);
        const by = new Map(located.map((p, i) => [p.id, rows[i] ?? null]));
        out = out.map((p) => {
          const r = by.get(p.id);
          if (!r) return p;
          return mode === "foot"
            ? { ...p, walkM: Math.round(r[0]), walkS: Math.round(r[1]) }
            : { ...p, driveM: Math.round(r[0]), driveS: Math.round(r[1]) };
        });
      }
    } catch {
      // The rough estimate stays (marked "about").
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
  if (country === "GB") {
    try {
      const res = await fetch(hygieneUrl(at, 1), {
        headers: { "x-api-version": "2", Accept: "application/json", "User-Agent": ua() },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) out = withHygiene(out, await res.json());
    } catch {
      // No ratings this time.
    }
  }
  return out;
}

/**
 * Reads places (weekly) and/or events (daily, only while guests are staying or arriving within a
 * week, up to their last check-out) near a property, and keeps them.
 */
export async function refreshPlaces(
  propertyId: string,
  what: { places?: boolean; events?: boolean } = { places: true, events: true },
): Promise<{ places: number; events: number }> {
  const sb = await db();
  const { data: p } = await sb
    .from("properties")
    .select("id, postcode, country_code, address, local_guide, timezone")
    .eq("id", propertyId)
    .maybeSingle();
  if (!p) throw new Error("Property not found.");
  const g = normaliseLocalGuide(p.local_guide);
  const today = todayIn(p.timezone ?? null);
  const { data: before } = await sb
    .from("local_places")
    .select("lat, lng, places")
    .eq("property_id", propertyId)
    .maybeSingle();
  const known =
    !what.places && before?.lat != null && before?.lng != null
      ? { lat: before.lat as number, lng: before.lng as number }
      : null;
  const at = known ?? (await propertySpot(sb, p));
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
  const row: Record<string, unknown> = { property_id: propertyId, lat: at.lat, lng: at.lng };
  let places: Place[] = Array.isArray(before?.places) ? before.places : [];
  let error: string | null = null;
  if (what.places) {
    places = [];
    // Overpass first (one request for everything); its public servers are often busy, so then
    // OpenStreetMap's own search, one kind of place a second (their usage policy).
    const query = overpassQuery(at, PLACE_CATEGORIES);
    for (const url of OVERPASS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": ua(),
            Accept: "application/json",
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`OpenStreetMap answered ${res.status}`);
        places = placesFromOverpass(await res.json(), at);
        error = null;
        break;
      } catch (e) {
        error = e instanceof Error ? e.message.slice(0, 200) : "failed";
      }
    }
    if (!places.length) {
      const found: Place[] = [];
      for (const c of PLACE_CATEGORIES) {
        try {
          const res = await fetch(nominatimUrl(c, at), {
            headers: { "User-Agent": ua(), Accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) found.push(...placesFromNominatim(await res.json(), at, c));
        } catch {
          // That kind of place is left out this time.
        }
        await new Promise((r) => setTimeout(r, 1100));
      }
      if (found.length) {
        places = found;
        error = null;
      }
    }
    if (places.length) places = await enrichPlaces(places, at, (p.country_code ?? "GB") as string);
    row["fetched_at"] = new Date().toISOString();
    row["error"] = error;
    // A failed read keeps the places read before.
    if (!error) row["places"] = places;
  }
  let events: LocalEvent[] = [];
  if (what.events) {
    const until = await eventsUntil(sb, propertyId, today);
    // Nobody staying or arriving soon: nothing is fetched, and nothing kept.
    events = until ? await readEvents(p, g, at, today, until) : [];
    row["events"] = events;
    row["events_at"] = new Date().toISOString();
  }
  let { error: e } = await sb.from("local_places").upsert(row);
  // Before migration 0112 there's no events_at column.
  if (e && /events_at/.test(e.message)) {
    delete row["events_at"];
    ({ error: e } = await sb.from("local_places").upsert(row));
  }
  if (e)
    throw new Error(
      /local_places/.test(e.message) ? "This needs the latest update (migration 0109)." : e.message,
    );
  if (error)
    throw new Error("OpenStreetMap didn't answer just now. Please try again in a few minutes.");
  return { places: places.length, events: events.length };
}

const DAY = 86_400_000;

/** Places and events for a property: places read again weekly, events daily while guests are due (the guest waits at most a few seconds). */
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
  const placesStale = !row || Date.now() - Date.parse(row.fetched_at) > WEEK;
  const eventsStale = !row?.events_at || Date.now() - Date.parse(row.events_at) > DAY;
  if (placesStale || eventsStale) {
    await Promise.race([
      refreshPlaces(propertyId, { places: placesStale, events: eventsStale }).catch(
        () => undefined,
      ),
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

/**
 * Daily house-keeping: events already past (or past every guest's check-out) are dropped, and
 * events are read again for properties with guests due (at most `max` a day, oldest first).
 */
export async function sweepLocalEvents(max = 15): Promise<void> {
  const sb = await db();
  const { data: rows, error } = await sb
    .from("local_places")
    .select("property_id, events, events_at, properties(timezone, local_guide)");
  if (error || !rows) return;
  const due: Array<{ id: string; at: number }> = [];
  for (const r of rows as any[]) {
    const today = todayIn(r.properties?.timezone ?? null);
    const until = await eventsUntil(sb, r.property_id, today);
    const list = (Array.isArray(r.events) ? r.events : []) as LocalEvent[];
    const kept = keepEvents(list, today, until ?? today);
    const keepNone = !until;
    if (keepNone ? list.length : kept.length !== list.length)
      await sb
        .from("local_places")
        .update({ events: keepNone ? [] : kept })
        .eq("property_id", r.property_id);
    const g = normaliseLocalGuide(r.properties?.local_guide);
    if (until && g.on && g.eventsOn)
      due.push({ id: r.property_id, at: r.events_at ? Date.parse(r.events_at) : 0 });
  }
  due.sort((a, b) => a.at - b.at);
  for (const d of due.filter((x) => Date.now() - x.at > DAY * 0.8).slice(0, max))
    await refreshPlaces(d.id, { events: true }).catch(() => {});
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

/** One floor as the guest's map draws it: the plan, the way across it, the room, and what's marked. */
export type GuestFloor = {
  id: string;
  level: number;
  url: string | null;
  route: Point[] | null;
  room: Point[] | null;
  at: Point | null;
  areas: Array<{ poly: Point[]; access: string; kind: string; label?: string | null }>;
  lines: Array<{ kind: string; pts: Point[] }>;
  items: Array<{ kind: string; at: Point }>;
  /** "" for the main house, else the annex's name. */
  building?: string;
};

export type GuestExtras = {
  info: Array<ReturnType<typeof normalisePropertyInfo>[number] & { imageUrls: string[] }>;
  local: { places: Place[]; events: LocalEvent[]; today: string } | null;
  directions: {
    steps: string[];
    planUrl: string | null;
    at: { x: number; y: number };
    level: number;
    roomName: string;
    heating: string[];
    floors: GuestFloor[];
  } | null;
  /** Shared spaces, what's private and where useful things are, from the floor maps. */
  house: HouseNotes | null;
  /**
   * Every floor with a map, for the guest to open: areas they can reach named and lit, their own
   * room marked, and everything else (private, behind a curtain or barred door, other guests'
   * rooms) shaded without a name.
   */
  plans: GuestFloor[];
};

/** The property's room names (for naming bedrooms on the map). */
async function roomNamesFor(sb: any, propertyId: string): Promise<Record<string, string>> {
  const { data } = await sb
    .from("rooms")
    .select("id, display_name, public_title")
    .eq("property_id", propertyId);
  return Object.fromEntries(
    ((data ?? []) as any[]).map((r) => [r.id, (r.public_title || r.display_name) as string]),
  );
}

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
  if (!p) return { info: [], local: null, directions: null, house: null, plans: [] };
  const items = normalisePropertyInfo(p.property_info, propertyId);
  const g = normaliseLocalGuide(p.local_guide);
  const [links, near, plans, names] = await Promise.all([
    signed(
      items.flatMap((i) => i.images),
      60 * 60 * 6,
    ),
    g.on ? placesFor(propertyId).catch(() => null) : Promise.resolve(null),
    plansFor(sb, propertyId),
    roomNamesFor(sb, propertyId),
  ]);
  const notes = houseNotes(mapFloors(plans as FloorPlan[]), names);
  const house =
    notes.shared.length || notes.private.length || notes.barriers.length || notes.useful.length
      ? notes
      : null;
  const floorsMapped = mapFloors(plans as FloorPlan[]);
  const reach = reachableAreas(floorsMapped);
  const mapped = floorsMapped.filter((f) => f.map.areas.length);
  const planUrls = mapped.length
    ? await signed(
        mapped.map((f) => plans.find((x) => x.id === f.id)!.imagePath),
        60 * 60 * 6,
      )
    : {};
  const planList: GuestFloor[] = sortFloors(mapped).map((f) => {
    const src = plans.find((x) => x.id === f.id)!;
    return {
      id: f.id,
      level: f.level,
      building: f.building ?? "",
      url: planUrls[src.imagePath] ?? null,
      route: null,
      room: null,
      at: null,
      areas: f.map.areas.map((a) => {
        const mine = !!room && a.roomId === room.id;
        const open = a.access === "shared" && (!reach || reach.has(`${f.id}:${a.id}`));
        return {
          poly: a.poly,
          kind: a.kind,
          access: mine
            ? "yours"
            : open
              ? "shared"
              : a.access === "guest_room"
                ? "guest_room"
                : "private",
          label: mine || open ? nameOf(a, names) : null,
        };
      }),
      lines: f.map.lines.map((l) => ({ kind: l.kind, pts: l.pts })),
      // Items in places guests can't go aren't shown.
      items: f.map.items
        .filter((it) => {
          const a = f.map.areas.find((x) => inside(it.at, x.poly));
          return (
            !a ||
            (a.access === "shared" && (!reach || reach.has(`${f.id}:${a.id}`))) ||
            (!!room && a.roomId === room.id)
          );
        })
        .map((i) => ({ kind: i.kind, at: i.at })),
    };
  });
  let directions: GuestExtras["directions"] = null;
  if (room) {
    const d = directionsTo(plans as FloorPlan[], room.id, room.name, names);
    if (d) {
      // Each floor the way crosses (or just the room's floor, with the older marks).
      const ids = d.route?.length ? d.route.map((r) => r.planId) : [d.planId];
      const shown = ids
        .map((id) => plans.find((x) => x.id === id))
        .filter((x): x is (typeof plans)[number] => !!x);
      const urls = await signed(
        shown.map((x) => x.imagePath),
        60 * 60 * 6,
      );
      const floors: GuestFloor[] = shown.map((x) => ({
        id: x.id,
        level: x.level,
        url: urls[x.imagePath] ?? null,
        route: d.route?.find((r) => r.planId === x.id)?.points ?? null,
        room: x.id === d.planId ? (d.area ?? null) : null,
        at: x.id === d.planId ? d.at : null,
        areas: (x.pins.areas ?? []).map((a) => ({
          poly: a.poly,
          access: a.roomId === room.id ? "yours" : a.access,
          kind: a.kind,
        })),
        lines: (x.pins.lines ?? []).map((l) => ({ kind: l.kind, pts: l.pts })),
        items: (x.pins.items ?? []).map((i) => ({ kind: i.kind, at: i.at })),
      }));
      directions = {
        steps: d.steps,
        planUrl: floors[floors.length - 1]?.url ?? null,
        at: d.at,
        level: d.level,
        roomName: room.name,
        heating: d.heating ?? [],
        floors,
      };
    }
  }
  return {
    info: items.map((i) => ({
      ...i,
      imageUrls: i.images.map((x) => links[x]).filter(Boolean) as string[],
    })),
    local: near
      ? {
          ...guestLocal(g, near.places, near.events, near.at, todayIn(p.timezone)),
          today: todayIn(p.timezone),
        }
      : null,
    directions,
    house,
    plans: planList,
  };
}
