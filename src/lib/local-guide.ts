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
  /** A photo the place itself publishes on OpenStreetMap (image or Wikimedia Commons), shown straight from there. */
  image?: string | null;
  /** By road and path from the property's postcode (OpenStreetMap routing): metres and seconds. */
  walkM?: number | null;
  walkS?: number | null;
  driveM?: number | null;
  driveS?: number | null;
  /** UK food hygiene rating (Food Standards Agency): "0"–"5", or Scotland's "Pass". */
  hygiene?: string | null;
  /** The FSA's id for the business: its page on ratings.food.gov.uk. */
  hygieneId?: number | null;
  /** OpenStreetMap's Wikidata link (Q…), for a photo when the place has none of its own. */
  wikidata?: string | null;
  /** The venue's logo from its own website (shown whole, not cropped), when there's no photo. */
  logo?: string | null;
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
  /** The organiser's own picture, shown straight from their site (never stored or passed through Latchkey). */
  image?: string | null;
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
      image: placeImage(tags),
      wikidata: /^Q\d{1,12}$/.test(tags["wikidata"] ?? "") ? tags["wikidata"]! : null,
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
      image: ticketmasterImage(e["images"]),
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
      .slice(0, 40),
  };
}

/** A short summary for the receptionist: a few of each kind with how far. */
export function localText(places: Place[], events: LocalEvent[]): string {
  const lines = PLACE_CATEGORIES.map((c) => {
    const ps = places.filter((p) => p.category === c).slice(0, 5);
    return ps.length
      ? `${c}: ${ps
          .map((p) => {
            const m = placeMetres(p);
            return `${p.name}${m !== null ? ` (${distanceIn(m, true)} / ${distanceText(m)})` : ""}${p.hygiene ? `, food hygiene ${p.hygiene}` : ""}${p.note ? ` - ${p.note}` : ""}`;
          })
          .join("; ")}`
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
      image: placeImage(obj(e["extratags"]) as Record<string, string>),
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
  untilDate: string | null = null,
) {
  const until =
    untilDate ??
    new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
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
      image: imageUrl(e["largeimageurl"]) ?? imageUrl(e["imageurl"]),
    });
  }
  return out
    .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")))
    .slice(0, max);
}

/* ---------------------------- pictures, straight from the source ---------------------------- */

/** An https picture link as given (never fetched, stored or passed through Latchkey). */
export function imageUrl(v: unknown): string | null {
  const u = httpsUrl(v);
  return u && !/\s/.test(u) ? u : null;
}

/** A place's own photo on OpenStreetMap: image=https://…, or wikimedia_commons=File:… (a small copy from Wikimedia). */
export function placeImage(tags: Record<string, string>): string | null {
  const commons = (tags["wikimedia_commons"] ?? "").trim();
  if (/^File:.+\.(jpe?g|png|webp)$/i.test(commons))
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(commons.slice(5))}?width=320`;
  const img = (tags["image"] ?? "").trim();
  const commonsImg = /^https:\/\/commons\.wikimedia\.org\/wiki\/(File:.+)$/.exec(img);
  if (commonsImg)
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(decodeURIComponent(commonsImg[1]!).slice(5))}?width=320`;
  return /\.(jpe?g|png|webp)(\?.*)?$/i.test(img) ? imageUrl(img) : null;
}

/** Ticketmaster's pictures: a wide one about 640 px across. */
export function ticketmasterImage(v: unknown): string | null {
  if (!Array.isArray(v)) return null;
  const imgs = v
    .map(obj)
    .filter((i) => imageUrl(i["url"]))
    .map((i) => ({
      url: i["url"] as string,
      w: Number(i["width"]) || 0,
      wide: i["ratio"] === "16_9",
    }));
  imgs.sort((a, b) => Number(b.wide) - Number(a.wide) || Math.abs(a.w - 640) - Math.abs(b.w - 640));
  return imgs[0]?.url ?? null;
}

/* --------------------------------- when an event is --------------------------------- */

const DAY_MS = 86_400_000;
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** The badge on an event: Today, Tonight (from 5pm), Tomorrow, Tomorrow night, a weekday this week, else the date. */
export function whenBadge(
  date: string,
  time: string | null,
  today: string,
): { label: string; soon: boolean } {
  const evening = !!time && time >= "17:00";
  if (date === today) return { label: evening ? "Tonight" : "Today", soon: true };
  if (date === addDays(today, 1))
    return { label: evening ? "Tomorrow night" : "Tomorrow", soon: true };
  const d = new Date(`${date}T12:00:00Z`);
  if (date > today && date <= addDays(today, 6))
    return {
      label: d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }),
      soon: false,
    };
  return {
    label: d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }),
    soon: false,
  };
}

/** Days ahead a stay counts as arriving, for fetching events. */
export const EVENTS_LOOKAHEAD_DAYS = 7;
/** Events are never read further ahead than this. */
export const EVENTS_MAX_DAYS = 30;

/**
 * Up to which date events are worth reading: the last check-out of guests staying now or
 * arriving in the next week (real stays only). Null when nobody is: then nothing is fetched.
 */
export function eventWindow(
  stays: Array<{ check_in_date: string; check_out_date: string; status: string | null }>,
  today: string,
): string | null {
  const soon = addDays(today, EVENTS_LOOKAHEAD_DAYS);
  let until: string | null = null;
  for (const b of stays) {
    if (["cancelled", "blocked", "checked_out"].includes(b.status ?? "")) continue;
    if (b.check_out_date <= today || b.check_in_date > soon) continue;
    if (!until || b.check_out_date > until) until = b.check_out_date;
  }
  if (!until) return null;
  const cap = addDays(today, EVENTS_MAX_DAYS);
  return until > cap ? cap : until;
}

/** Events still worth keeping: from today, and up to the window's end when there is one. */
export function keepEvents(
  events: LocalEvent[],
  today: string,
  until: string | null,
): LocalEvent[] {
  return events.filter((e) => e.date >= today && (!until || e.date <= until));
}

/* ------------------------- real walking and driving distances ------------------------- */

/**
 * OpenStreetMap routing (FOSSGIS's free OSRM servers, fair use with a named User-Agent): one
 * table request per way of travelling, from the property to every place.
 */
export function routeTableUrl(
  mode: "foot" | "car",
  from: { lat: number; lng: number },
  to: Array<{ lat: number; lng: number }>,
): string {
  const pts = [from, ...to].map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  return `https://routing.openstreetmap.de/routed-${mode}/table/v1/driving/${pts}?sources=0&annotations=duration,distance`;
}

/** The table's first row as [metres, seconds] for each place (null where there's no route). */
export function readRouteTable(body: unknown, n: number): Array<[number, number] | null> {
  const b = obj(body);
  const d = (b["distances"] as unknown[][] | undefined)?.[0] ?? [];
  const t = (b["durations"] as unknown[][] | undefined)?.[0] ?? [];
  const out: Array<[number, number] | null> = [];
  for (let i = 1; i <= n; i++) {
    const m = Number(d[i]);
    const s = Number(t[i]);
    out.push(
      Number.isFinite(m) && Number.isFinite(s) && d[i] !== null && t[i] !== null ? [m, s] : null,
    );
  }
  return out;
}

/** Minutes for the guest: by road where known, else the rough estimate (marked "about"). */
export function travelMinutes(
  p: Place,
  mode: "walk" | "drive",
): { min: number; exact: boolean } | null {
  const s = mode === "walk" ? p.walkS : p.driveS;
  if (typeof s === "number" && s >= 0)
    return { min: Math.max(1, Math.round(s / 60) + (mode === "drive" ? 2 : 0)), exact: true };
  if (p.metres < 0) return null;
  return { min: mode === "walk" ? walkMinutes(p.metres) : driveMinutes(p.metres), exact: false };
}

/* -------------------------------- food hygiene (UK) -------------------------------- */

/** The Food Standards Agency's open ratings near a point (free, no key; England, Wales, NI and Scotland). */
export function hygieneUrl(at: { lat: number; lng: number }, miles = 1): string {
  const q = new URLSearchParams({
    latitude: at.lat.toFixed(5),
    longitude: at.lng.toFixed(5),
    maxDistanceLimit: String(miles),
    pageSize: "1500",
    sortOptionKey: "distance",
  });
  return `https://api.ratings.food.gov.uk/Establishments?${q}`;
}

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(the|ltd|limited|restaurant|cafe|café|bar|pub)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

/** Each food place's hygiene rating: the same name (or one inside the other) within 150 m. */
export function withHygiene(places: Place[], body: unknown): Place[] {
  const list = (obj(body)["establishments"] as unknown[] | undefined) ?? [];
  const rated = list.map(obj).flatMap((e) => {
    const g = obj(e["geocode"]);
    const lat = Number(g["latitude"]);
    const lng = Number(g["longitude"]);
    const value = text(e["RatingValue"], 30);
    const name = squash(text(e["BusinessName"], 120));
    const id = Number(e["FHRSID"]);
    return Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      name.length >= 3 &&
      /^([0-5]|Pass)$/.test(value)
      ? [{ name, lat, lng, value, id: Number.isInteger(id) && id > 0 ? id : null }]
      : [];
  });
  return places.map((p) => {
    if (!["food", "cafe", "pub"].includes(p.category)) return p;
    const n = squash(p.name);
    if (n.length < 3) return p;
    const hit = rated.find(
      (r) =>
        (r.name === n || r.name.includes(n) || n.includes(r.name)) &&
        metresBetween({ lat: p.lat, lng: p.lng }, r) <= 150,
    );
    return hit ? { ...p, hygiene: hit.value, hygieneId: hit.id } : p;
  });
}

/* ------------------------------- what the guest sees first ------------------------------- */

export type PlaceTab = "recommended" | "picks" | PlaceCategory | "all";

/** A place's standing for "Recommended": hygiene 5 best, then a photo, a website, nearer. */
function score(p: Place): number {
  const h =
    p.hygiene === "5" || p.hygiene === "Pass" ? 3 : p.hygiene === "4" ? 1.5 : p.hygiene ? -3 : 0;
  const m = travelMinutes(p, "walk")?.min ?? 30;
  return h + (p.image ? 1 : 0) + (p.website ? 0.7 : 0) - m / 10;
}

/** The best of each kind (the host's picks count first), one each, in the usual order of kinds. */
export function recommended(places: Place[]): Place[] {
  return PLACE_CATEGORIES.flatMap((c) => {
    const of = places.filter((p) => p.category === c);
    const pick = of.find((p) => p.pick);
    const best = pick ?? [...of].sort((a, b) => score(b) - score(a))[0];
    return best ? [best] : [];
  });
}

/** The tabs in order: Recommended, Host picks (when there are any), each kind, All last. */
export function placeTabs(places: Place[]): PlaceTab[] {
  const kinds = PLACE_CATEGORIES.filter((c) => places.some((p) => p.category === c));
  return [
    ...(places.length ? (["recommended"] as const) : []),
    ...(places.some((p) => p.pick) ? (["picks"] as const) : []),
    ...kinds,
    ...(places.length ? (["all"] as const) : []),
  ];
}

export function placesInTab(places: Place[], tab: PlaceTab): Place[] {
  if (tab === "recommended") return recommended(places);
  if (tab === "picks") return places.filter((p) => p.pick);
  if (tab === "all") return places;
  return places.filter((p) => p.category === tab);
}

/** The FSA's official rating badge (0–5, England, Wales and Northern Ireland), shown from their site. */
export function hygieneBadge(value: string | null | undefined): string | null {
  return value && /^[0-5]$/.test(value)
    ? `https://ratings.food.gov.uk/images/badges/fhrs/3/fhrs-badge-${value}.svg`
    : null;
}

/** The business's page on the FSA's ratings site. */
export const hygienePage = (id: number | null | undefined) =>
  id ? `https://ratings.food.gov.uk/business/${id}` : null;

/** Wikidata's entities for these ids (one request for up to 50). */
export function wikidataUrl(ids: string[]): string {
  const q = new URLSearchParams({
    action: "wbgetentities",
    ids: ids.slice(0, 50).join("|"),
    props: "claims",
    format: "json",
  });
  return `https://www.wikidata.org/w/api.php?${q}`;
}

/** Each entity's main photo (P18) as a small Wikimedia Commons link. */
export function wikidataImages(body: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, ent] of Object.entries(obj(obj(body)["entities"]))) {
    const p18 = (obj(obj(ent)["claims"])["P18"] as unknown[] | undefined)?.[0];
    const file = obj(obj(obj(p18)["mainsnak"])["datavalue"])["value"];
    if (typeof file === "string" && /\.(jpe?g|png|webp)$/i.test(file))
      out[id] =
        `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=320`;
  }
  return out;
}

/* ------------------------------- distance, for the guest ------------------------------- */

/** Countries that measure road distances in miles. */
const MILES = ["GB", "US", "LR", "MM"];
export const usesMiles = (country: string | null | undefined) =>
  MILES.includes((country ?? "GB").toUpperCase());

/** How far: on foot by path where known, else by road, else as the crow flies. */
export function placeMetres(p: Place): number | null {
  return p.walkM ?? p.driveM ?? (p.metres >= 0 ? p.metres : null);
}

/** "0.4 mi", "12 mi", "350 m", "1.2 km". */
export function distanceIn(metres: number, miles: boolean): string {
  if (!miles) return distanceText(metres);
  const mi = metres / 1609.344;
  return mi < 0.1 ? "0.1 mi" : mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

/* ------------------------------- a map as the picture ------------------------------- */

/** Which OpenStreetMap tile holds a point at this zoom, and where in it (0–1). */
export function tileOf(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x: Math.floor(x), y: Math.floor(y), fx: x - Math.floor(x), fy: y - Math.floor(y) };
}

/** Places saved before road distances, ratings and pictures were read are read again once. */
export const PLACES_FORMAT_FROM = "2026-11-14";
export const placesNeedNewFormat = (places: Place[], fetchedAt: string | null) =>
  places.length > 0 &&
  !places.some((p) => "walkS" in p || "hygiene" in p || "logo" in p) &&
  (!fetchedAt || fetchedAt < PLACES_FORMAT_FROM);

const attr = (tag: string, name: string) =>
  new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
    .exec(tag)
    ?.slice(1)
    .find((x) => x !== undefined) ?? null;

const absolute = (u: string | null, base: string): string | null => {
  if (!u) return null;
  try {
    const url = new URL(u.replace(/&amp;/g, "&").trim(), base);
    return url.protocol === "https:" ? url.toString().slice(0, 400) : null;
  } catch {
    return null;
  }
};

/**
 * A venue's own preview picture and logo from its home page: the picture it sets for link
 * previews (og:image, twitter:image), and its touch icon or largest icon as the logo. Only the
 * links are kept; the guest's browser loads them from the venue's site.
 */
export function previewFromHtml(
  html: string,
  base: string,
): { image: string | null; logo: string | null } {
  const head = html.slice(0, 200_000);
  let image: string | null = null;
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? "").toLowerCase();
    if (["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"].includes(key)) {
      image = absolute(attr(tag, "content"), base);
      if (image) break;
    }
  }
  let logo: string | null = null;
  let best = -1;
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    if (!/\b(apple-touch-icon|icon)\b/.test(rel)) continue;
    const href = absolute(attr(tag, "href"), base);
    if (!href || /\.ico(\?|$)/i.test(href)) continue;
    const size = Number(
      /(\d+)x\d+/.exec(attr(tag, "sizes") ?? "")?.[1] ??
        (rel.includes("apple") ? 180 : /\.svg/i.test(href) ? 256 : 32),
    );
    if (size > best) {
      best = size;
      logo = href;
    }
  }
  return { image, logo: best >= 64 ? logo : null };
}
