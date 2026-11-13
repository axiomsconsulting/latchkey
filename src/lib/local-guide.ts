/**
 * Around here (properties.local_guide, local_places, migration 0109): places near the property
 * from OpenStreetMap (free, through the Overpass API: restaurants, cafés, pubs, shops, a shopping
 * centre, sights) and what's on (Ticketmaster's Discovery API when Latchkey admin has added a
 * key, plus the host's own events), with the host's own picks first and anything they hide left
 * out. Each place opens walking or driving directions from where the guest is, in their phone's
 * maps app. Pure; tested in tests/guest-guide-extras.test.ts.
 */

export type PlaceCategory = "food" | "cafe" | "pub" | "shop" | "shopping" | "sights" | "transport";
export const PLACE_CATEGORIES: PlaceCategory[] = [
  "food",
  "cafe",
  "pub",
  "shop",
  "shopping",
  "sights",
  "transport",
];

export type Place = {
  id: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  /** Metres from the property, as the crow flies. */
  metres: number;
  address: string | null;
  website: string | null;
  /** The host's own words, for their picks. */
  note?: string | null;
  pick?: boolean;
};

export type LocalEvent = {
  id: string;
  name: string;
  /** ISO date and, when known, time (property's local). */
  date: string;
  time: string | null;
  venue: string | null;
  url: string | null;
  lat: number | null;
  lng: number | null;
};

export type Pick = {
  id: string;
  name: string;
  category: PlaceCategory;
  note: string;
  lat: number | null;
  lng: number | null;
  url: string | null;
};

export type LocalGuide = {
  on: boolean;
  categories: PlaceCategory[];
  /** OpenStreetMap places the host doesn't want shown. */
  hidden: string[];
  picks: Pick[];
  /** The host's own events (dates they know about). */
  events: Array<Omit<LocalEvent, "lat" | "lng">>;
  /** Show events from Ticketmaster when Latchkey has a key. */
  eventsOn: boolean;
  /** Local event calendars the host subscribes to (iCal links from the council, venues, tourist boards). */
  calendars: Array<{ id: string; name: string; url: string }>;
};

export const DEFAULT_LOCAL_GUIDE: LocalGuide = {
  on: true,
  categories: ["food", "cafe", "pub", "shop", "shopping", "sights"],
  hidden: [],
  picks: [],
  events: [],
  eventsOn: true,
  calendars: [],
};

const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const text = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        // eslint-disable-next-line no-control-regex -- strips control characters
        .replace(/[\u0000-\u001f<>]/g, "")
        .trim()
        .slice(0, max)
    : "";
const coord = (v: unknown, lim: number) =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim ? v : null;
const httpsUrl = (v: unknown) =>
  typeof v === "string" && /^https:\/\/[^\s<>"]+$/.test(v) ? v.slice(0, 400) : null;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function normaliseLocalGuide(raw: unknown): LocalGuide {
  const r = obj(raw);
  const cats = Array.isArray(r["categories"])
    ? r["categories"].filter((c): c is PlaceCategory =>
        PLACE_CATEGORIES.includes(c as PlaceCategory),
      )
    : DEFAULT_LOCAL_GUIDE.categories;
  return {
    on: r["on"] !== false,
    categories: [...new Set(cats)],
    hidden: (Array.isArray(r["hidden"]) ? r["hidden"] : [])
      .filter((x): x is string => typeof x === "string" && /^[a-z]+\/\d+$/.test(x))
      .slice(0, 300),
    picks: (Array.isArray(r["picks"]) ? r["picks"] : [])
      .map((x, i) => {
        const p = obj(x);
        return {
          id:
            typeof p["id"] === "string" && /^[a-z0-9-]{4,40}$/.test(p["id"])
              ? p["id"]
              : `pick-${i}`,
          name: text(p["name"], 80),
          category: PLACE_CATEGORIES.includes(p["category"] as PlaceCategory)
            ? (p["category"] as PlaceCategory)
            : "sights",
          note: text(p["note"], 300),
          lat: coord(p["lat"], 90),
          lng: coord(p["lng"], 180),
          url: httpsUrl(p["url"]),
        };
      })
      .filter((p) => p.name)
      .slice(0, 30),
    events: (Array.isArray(r["events"]) ? r["events"] : [])
      .map((x, i) => {
        const e = obj(x);
        return {
          id:
            typeof e["id"] === "string" && /^[a-z0-9-]{4,40}$/.test(e["id"])
              ? e["id"]
              : `event-${i}`,
          name: text(e["name"], 100),
          date: typeof e["date"] === "string" && ISO.test(e["date"]) ? e["date"] : "",
          time: typeof e["time"] === "string" && /^\d{2}:\d{2}$/.test(e["time"]) ? e["time"] : null,
          venue: text(e["venue"], 100) || null,
          url: httpsUrl(e["url"]),
        };
      })
      .filter((e) => e.name && e.date)
      .slice(0, 30),
    eventsOn: r["eventsOn"] !== false,
    calendars: (Array.isArray(r["calendars"]) ? r["calendars"] : [])
      .map((x, i) => {
        const c = obj(x);
        return {
          id:
            typeof c["id"] === "string" && /^[a-z0-9-]{4,40}$/.test(c["id"]) ? c["id"] : `cal-${i}`,
          name: text(c["name"], 60),
          url: calendarUrl(c["url"]) ?? "",
        };
      })
      .filter((c) => c.url)
      .slice(0, 5),
  };
}

/** An iCal link as Latchkey reads it: https (webcal:// links are the same address). */
export function calendarUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/^webcals?:\/\//i, "https://");
  return /^https:\/\/[^\s]+$/i.test(s) && s.length <= 500 ? s : null;
}

/** A subscribed calendar's events as ours: from today for `days`, soonest first, cancelled left out. */
export function eventsFromCalendar(
  events: Array<{
    uid: string;
    summary: string;
    startDate: string;
    endDate: string;
    startTime: string | null;
    allDay: boolean;
    url: string | null;
    status: string | null;
    location?: string | null;
  }>,
  today: string,
  calendarId: string,
  days = 21,
  max = 15,
): LocalEvent[] {
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return (
    events
      .filter((e) => e.status !== "CANCELLED" && e.summary.trim())
      // Still on today (a festival running all week counts) and starting within the window.
      .filter((e) => e.endDate >= today && e.startDate <= until)
      .map((e) => ({
        id: `${calendarId}-${e.uid}`.replace(/[^a-z0-9-]/gi, "").slice(0, 60) || calendarId,
        name: text(e.summary, 100),
        date: e.startDate < today ? today : e.startDate,
        time: e.allDay || e.startDate < today ? null : e.startTime,
        venue: text(e.location ?? "", 100) || null,
        url: httpsUrl(e.url),
        lat: null,
        lng: null,
      }))
      .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")))
      .slice(0, max)
  );
}

/* ------------------------------ distances ------------------------------ */

export function metresBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** About how long on foot (streets wind: 1.3× the straight line, 80 m a minute). */
export const walkMinutes = (metres: number) => Math.max(1, Math.round((metres * 1.3) / 80));
/** About how long by car in town (1.4× the straight line, 25 km/h, plus parking). */
export const driveMinutes = (metres: number) => Math.max(2, Math.round((metres * 1.4) / 420) + 2);

/** "350 m" / "1.2 km" */
export function distanceText(metres: number): string {
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;
}

/**
 * Directions from wherever the guest is, in their maps app: Google Maps' universal link (opens
 * the app on Android and iPhone when installed, the website otherwise), or Apple Maps on iPhone.
 */
export function directionsLink(
  to: { lat: number; lng: number; name?: string },
  mode: "walking" | "driving",
  app: "google" | "apple" = "google",
): string {
  const dest = `${to.lat.toFixed(6)},${to.lng.toFixed(6)}`;
  if (app === "apple")
    return `https://maps.apple.com/?daddr=${dest}&dirflg=${mode === "walking" ? "w" : "d"}${to.name ? `&q=${encodeURIComponent(to.name)}` : ""}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${mode}`;
}

/* ------------------------------ OpenStreetMap ------------------------------ */

/** How far to look for each kind of place (shops and food on foot; a shopping centre or sights a drive). */
export const RADIUS: Record<PlaceCategory, number> = {
  food: 1500,
  cafe: 1200,
  pub: 1500,
  shop: 1500,
  shopping: 8000,
  sights: 6000,
  transport: 2000,
};

const TAGS: Record<PlaceCategory, string[]> = {
  food: ['"amenity"="restaurant"', '"amenity"="fast_food"'],
  cafe: ['"amenity"="cafe"'],
  pub: ['"amenity"="pub"', '"amenity"="bar"'],
  shop: ['"shop"="supermarket"', '"shop"="convenience"', '"amenity"="pharmacy"', '"shop"="bakery"'],
  shopping: ['"shop"="mall"', '"shop"="department_store"'],
  sights: [
    '"tourism"="attraction"',
    '"tourism"="museum"',
    '"tourism"="gallery"',
    '"leisure"="park"',
    '"tourism"="viewpoint"',
    '"historic"="castle"',
  ],
  transport: ['"railway"="station"', '"amenity"="bus_station"'],
};

/** One Overpass query for every chosen kind of place, each within its own distance. */
export function overpassQuery(
  at: { lat: number; lng: number },
  categories: PlaceCategory[],
): string {
  const parts = categories.flatMap((c) =>
    TAGS[c].map(
      (t) => `nwr[${t}]["name"](around:${RADIUS[c]},${at.lat.toFixed(5)},${at.lng.toFixed(5)});`,
    ),
  );
  return `[out:json][timeout:25];(${parts.join("")});out center tags 400;`;
}

function categoryOf(tags: Record<string, string>): PlaceCategory | null {
  const a = tags["amenity"];
  const s = tags["shop"];
  if (a === "restaurant" || a === "fast_food") return "food";
  if (a === "cafe") return "cafe";
  if (a === "pub" || a === "bar") return "pub";
  if (s === "supermarket" || s === "convenience" || s === "bakery" || a === "pharmacy")
    return "shop";
  if (s === "mall" || s === "department_store") return "shopping";
  if (tags["railway"] === "station" || a === "bus_station") return "transport";
  if (tags["tourism"] || tags["leisure"] === "park" || tags["historic"]) return "sights";
  return null;
}

/** Overpass's answer as places, nearest first, at most `per` of each kind (parks need a name, all need a position). */
export function placesFromOverpass(
  body: unknown,
  at: { lat: number; lng: number },
  per = 8,
): Place[] {
  const els = Array.isArray(obj(body)["elements"]) ? (obj(body)["elements"] as unknown[]) : [];
  const all: Place[] = [];
  const seen = new Set<string>();
  for (const x of els) {
    const e = obj(x);
    const tags = obj(e["tags"]) as Record<string, string>;
    const lat = coord(e["lat"], 90) ?? coord(obj(e["center"])["lat"], 90);
    const lng = coord(e["lon"], 180) ?? coord(obj(e["center"])["lon"], 180);
    const name = text(tags["name"], 80);
    const category = categoryOf(tags);
    if (lat === null || lng === null || !name || !category) continue;
    const key = `${category}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
    all.push({
      id: `${String(e["type"] ?? "node")}/${String(e["id"] ?? "0")}`,
      name,
      category,
      lat,
      lng,
      metres: metresBetween(at, { lat, lng }),
      address: street || null,
      website: httpsUrl(tags["website"]),
    });
  }
  all.sort((a, b) => a.metres - b.metres);
  const out: Place[] = [];
  for (const c of PLACE_CATEGORIES) out.push(...all.filter((p) => p.category === c).slice(0, per));
  return out;
}

/** Ticketmaster Discovery events as ours: soonest first, the next 14 days, each once. */
export function eventsFromTicketmaster(body: unknown, max = 12): LocalEvent[] {
  const list = obj(obj(body)["_embedded"])["events"];
  if (!Array.isArray(list)) return [];
  const out: LocalEvent[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    const e = obj(x);
    const start = obj(obj(e["dates"])["start"]);
    const date =
      typeof start["localDate"] === "string" && ISO.test(start["localDate"])
        ? start["localDate"]
        : null;
    const name = text(e["name"], 100);
    if (!date || !name || seen.has(`${name}|${date}`)) continue;
    seen.add(`${name}|${date}`);
    const venue = obj((obj(e["_embedded"])["venues"] as unknown[] | undefined)?.[0]);
    const loc = obj(venue["location"]);
    out.push({
      id: text(e["id"], 40) || `tm-${out.length}`,
      name,
      date,
      time: typeof start["localTime"] === "string" ? start["localTime"].slice(0, 5) : null,
      venue: text(venue["name"], 100) || null,
      url: httpsUrl(e["url"]),
      lat: loc["latitude"] ? coord(Number(loc["latitude"]), 90) : null,
      lng: loc["longitude"] ? coord(Number(loc["longitude"]), 180) : null,
    });
    if (out.length >= max) break;
  }
  return out.sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`));
}

/** What the guest sees: the host's picks first, then the places read (less hidden ones, only chosen kinds), events from today. */
export function guestLocal(
  g: LocalGuide,
  places: Place[],
  events: LocalEvent[],
  at: { lat: number; lng: number } | null,
  today: string,
): { places: Place[]; events: LocalEvent[] } {
  // The host's picks always show, whatever kinds of place are chosen; without a position they have no directions (lat/lng NaN).
  const picks: Place[] = g.picks.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    lat: p.lat ?? NaN,
    lng: p.lng ?? NaN,
    metres:
      at && p.lat !== null && p.lng !== null ? metresBetween(at, { lat: p.lat, lng: p.lng }) : -1,
    address: null,
    website: p.url,
    note: p.note || null,
    pick: true,
  }));
  const rest = places.filter((p) => g.categories.includes(p.category) && !g.hidden.includes(p.id));
  const own: LocalEvent[] = g.events.map((e) => ({ ...e, lat: null, lng: null }));
  return {
    places: [...picks, ...rest],
    events: [...own, ...(g.eventsOn ? events : [])]
      .filter((e) => e.date >= today)
      .sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`))
      .slice(0, 20),
  };
}

/** A short summary for the receptionist: a few of each kind with how far. */
export function localText(places: Place[], events: LocalEvent[]): string {
  const lines = PLACE_CATEGORIES.map((c) => {
    const ps = places.filter((p) => p.category === c).slice(0, 5);
    return ps.length
      ? `${c}: ${ps.map((p) => `${p.name}${p.metres >= 0 ? ` (${distanceText(p.metres)}, ${walkMinutes(p.metres)} min walk)` : ""}${p.note ? ` - ${p.note}` : ""}`).join("; ")}`
      : "";
  }).filter(Boolean);
  if (events.length)
    lines.push(
      `events: ${events
        .slice(0, 8)
        .map(
          (e) =>
            `${e.name} on ${e.date}${e.time ? ` at ${e.time}` : ""}${e.venue ? ` at ${e.venue}` : ""}`,
        )
        .join("; ")}`,
    );
  return lines.join("\n");
}

/** "51.5, -0.12" or a Google/Apple Maps link with coordinates in it → a position. */
export function readWhere(v: string): { lat: number; lng: number } | null {
  let t = v;
  try {
    t = decodeURIComponent(v);
  } catch {
    // Not encoded.
  }
  const m = /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/.exec(t);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/**
 * OpenStreetMap's own search (Nominatim), used when the Overpass servers are busy or refuse us:
 * one search per kind of place, inside a box round the property (their usage policy allows one
 * request a second, which the caller keeps to).
 */
export const NOMINATIM_SEARCHES: Record<PlaceCategory, Record<string, string>> = {
  food: { amenity: "restaurant" },
  cafe: { amenity: "cafe" },
  pub: { amenity: "pub" },
  shop: { q: "supermarket" },
  shopping: { q: "shopping centre" },
  sights: { q: "museum" },
  transport: { q: "railway station" },
};

/** The search link for one kind of place within its usual distance of the property. */
export function nominatimUrl(category: PlaceCategory, at: { lat: number; lng: number }): string {
  const r = RADIUS[category];
  const dLat = r / 111_320;
  const dLng = r / (111_320 * Math.max(0.2, Math.cos((at.lat * Math.PI) / 180)));
  const q = new URLSearchParams({
    format: "jsonv2",
    limit: "20",
    bounded: "1",
    addressdetails: "1",
    extratags: "1",
    viewbox: [at.lng - dLng, at.lat + dLat, at.lng + dLng, at.lat - dLat]
      .map((n) => n.toFixed(5))
      .join(","),
    ...NOMINATIM_SEARCHES[category],
  });
  return `https://nominatim.openstreetmap.org/search?${q}`;
}

/** Nominatim's results for one kind of place, as ours: nearest first, named, each once. */
export function placesFromNominatim(
  body: unknown,
  at: { lat: number; lng: number },
  category: PlaceCategory,
  per = 8,
): Place[] {
  const rows = Array.isArray(body) ? body : [];
  const out: Place[] = [];
  const seen = new Set<string>();
  for (const x of rows) {
    const e = obj(x);
    const lat = coord(Number(e["lat"]), 90);
    const lng = coord(Number(e["lon"]), 180);
    const name = text(e["name"], 80);
    if (lat === null || lng === null || !name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const a = obj(e["address"]) as Record<string, string>;
    const street = [a["house_number"], a["road"]].filter(Boolean).join(" ");
    out.push({
      id: `${String(e["osm_type"] ?? "node")}/${String(e["osm_id"] ?? "0")}`,
      name,
      category,
      lat,
      lng,
      metres: metresBetween(at, { lat, lng }),
      address: street || null,
      website: httpsUrl((obj(e["extratags"]) as Record<string, string>)["website"]),
    });
  }
  return out.sort((a, b) => a.metres - b.metres).slice(0, per);
}

/** Skiddle's kinds of event (UK): every kind a guest might go to. */
export const SKIDDLE_KINDS = [
  "LIVE",
  "THEATRE",
  "COMEDY",
  "FEST",
  "KIDS",
  "ARTS",
  "EXHIB",
  "CLUB",
  "BARPUB",
  "SPORT",
];

/** Skiddle's events search near the property for the next `days` (free key, UK events). */
export function skiddleUrl(
  key: string,
  at: { lat: number; lng: number },
  today: string,
  days = 14,
) {
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const q = new URLSearchParams({
    api_key: key,
    latitude: at.lat.toFixed(4),
    longitude: at.lng.toFixed(4),
    radius: "10",
    minDate: today,
    maxDate: until,
    order: "date",
    limit: "60",
    description: "0",
  });
  return `https://www.skiddle.com/api/v1/events/search/?${q}`;
}

/** Skiddle's events as ours: soonest first, cancelled left out, each once. */
export function eventsFromSkiddle(body: unknown, max = 20): LocalEvent[] {
  const list = obj(body)["results"];
  if (!Array.isArray(list)) return [];
  const out: LocalEvent[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    const e = obj(x);
    if (e["cancelled"] === "1" || e["cancelled"] === 1 || e["cancelled"] === true) continue;
    const name = text(e["eventname"], 100);
    const date = typeof e["date"] === "string" && ISO.test(e["date"]) ? e["date"] : "";
    if (!name || !date || seen.has(`${name}|${date}`)) continue;
    seen.add(`${name}|${date}`);
    const start = typeof e["startdate"] === "string" ? e["startdate"] : "";
    const opening = obj(e["openingtimes"])["doorsopen"];
    const time =
      typeof opening === "string" && /^\d{2}:\d{2}/.test(opening)
        ? opening.slice(0, 5)
        : (/T(\d{2}:\d{2})/.exec(start)?.[1] ?? null);
    const v = obj(e["venue"]);
    out.push({
      id: `sk-${String(e["id"] ?? out.length)}`.replace(/[^a-z0-9-]/gi, "").slice(0, 40),
      name,
      date,
      time: time === "00:00" ? null : time,
      venue: [text(v["name"], 80), text(v["town"], 40)].filter(Boolean).join(", ") || null,
      url: httpsUrl(e["link"]),
      lat: coord(Number(v["latitude"]), 90),
      lng: coord(Number(v["longitude"]), 180),
    });
  }
  return out
    .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")))
    .slice(0, max);
}
