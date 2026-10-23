/**
 * Listing import (experimental): read a host's own public listing pages on
 * the booking sites Latchkey knows (through Firecrawl, server side) and turn
 * what they show into the property and its rooms. Everything here is pure:
 * recognising each site's links, what each site shows to the public, the
 * shape Firecrawl is asked to fill, cleaning up what comes back, and planning
 * which rooms to add or update. Tested in tests/listing-import.test.ts.
 */

export type ListingPlatform = "airbnb" | "booking_com" | "vrbo" | "agoda" | "homestay";

/** What a public visitor (not signed in) can see on each site, from looking at their listing pages. */
export type PlatformProfile = {
  key: ListingPlatform;
  label: string;
  /** One link is one bookable unit (a room or a whole home), or a whole property with its room types. */
  shape: "unit" | "property";
  /** Shown publicly without dates. */
  shows: string[];
  /** Not public, or needs something the visitor doesn't have. */
  hidden: string[];
  /** Prices only appear for chosen dates; these are the date parameters the site reads. */
  priceDates: { checkIn: string; checkOut: string; extra?: Record<string, string> } | null;
  /** Shown beside the link: how to find the right link, and what to expect. */
  tip: string;
  /** Extra guidance for reading this site's page. */
  hint: string;
};

export const PLATFORM_PROFILES: Record<ListingPlatform, PlatformProfile> = {
  airbnb: {
    key: "airbnb",
    label: "Airbnb",
    shape: "unit",
    shows: ["title", "description", "photos", "guests, bedrooms, beds and bathrooms", "amenities", "check-in and check-out times", "house rules", "area (not the exact address)"],
    hidden: ["exact address", "Wi-Fi details", "door codes"],
    priceDates: { checkIn: "check_in", checkOut: "check_out", extra: { adults: "2" } },
    tip: "Open the listing on airbnb.com and copy the link (airbnb.com/rooms/…). Each Airbnb listing is one room or home, so add one link per room you list separately.",
    hint: "An Airbnb listing is one bookable unit. If it is a private room in a home, return it as a single room; if it is an entire home, return the bedrooms listed under 'Where you'll sleep' as rooms only when they are let separately, otherwise one room for the whole home.",
  },
  booking_com: {
    key: "booking_com",
    label: "Booking.com",
    shape: "property",
    shows: ["property name", "full address", "description", "photos", "room types with sleeps, beds and facilities", "facilities", "check-in and check-out times", "house rules"],
    hidden: ["Wi-Fi details", "door codes"],
    priceDates: { checkIn: "checkin", checkOut: "checkout", extra: { group_adults: "2", no_rooms: "1" } },
    tip: "Open your property on booking.com and copy the link (booking.com/hotel/…). One link brings in every room type.",
    hint: "Booking.com shows the property with a table of room types: return each room type as a room with its maximum occupancy, bed types and room facilities. Check-in and check-out times are under 'House rules'.",
  },
  vrbo: {
    key: "vrbo",
    label: "Vrbo",
    shape: "unit",
    shows: ["title", "description", "photos", "sleeps, bedrooms and bathrooms", "amenities", "check-in and check-out times", "house rules", "area"],
    hidden: ["exact address", "Wi-Fi details", "door codes"],
    priceDates: { checkIn: "startDate", checkOut: "endDate", extra: { adults: "2" } },
    tip: "Open the property on vrbo.com and copy the link (vrbo.com/1234567). One link is one home.",
    hint: "A Vrbo listing is one whole home. Return one room for the home unless its bedrooms are clearly let separately; list the bedroom arrangements in the room description.",
  },
  agoda: {
    key: "agoda",
    label: "Agoda",
    shape: "property",
    shows: ["property name", "address", "description", "photos", "room types with sleeps, beds and size", "facilities", "check-in and check-out times"],
    hidden: ["Wi-Fi details", "door codes"],
    priceDates: { checkIn: "checkIn", checkOut: "checkOut", extra: { adults: "2", rooms: "1" } },
    tip: "Open your property on agoda.com and copy the link (agoda.com/…/hotel/…). One link brings in every room type.",
    hint: "Agoda lists room types with maximum occupancy, bed types and room size: return each as a room. Check-in and check-out times are in 'Useful info' or 'Policies'.",
  },
  homestay: {
    key: "homestay",
    label: "Homestay.com",
    shape: "unit",
    shows: ["title", "description", "photos", "room type and who it suits", "amenities", "nightly price", "area", "house rules"],
    hidden: ["exact address", "Wi-Fi details", "door codes"],
    priceDates: null,
    tip: "Open the room on homestay.com and copy its link. Each Homestay listing is one room in your home.",
    hint: "A Homestay listing is one room in the host's home: return it as one room. Homestay shows a nightly price without dates.",
  },
};

export const LISTING_PLATFORMS = Object.keys(PLATFORM_PROFILES) as ListingPlatform[];

const HOSTS: Array<[RegExp, ListingPlatform]> = [
  [/(^|\.)airbnb\.[a-z.]+$/i, "airbnb"],
  [/(^|\.)booking\.com$/i, "booking_com"],
  [/(^|\.)(vrbo|homeaway)\.[a-z.]+$/i, "vrbo"],
  [/(^|\.)agoda\.com$/i, "agoda"],
  [/(^|\.)homestay\.com$/i, "homestay"],
];

/** Which site a link is on, or null for anything else. */
export function detectPlatform(url: string): ListingPlatform | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return HOSTS.find(([re]) => re.test(u.hostname))?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Does the link look like a listing page (not a search or the home page)? */
export function looksLikeListing(url: string): boolean {
  const p = detectPlatform(url);
  if (!p) return false;
  const path = new URL(url).pathname;
  switch (p) {
    case "airbnb":
      return /\/rooms\/(plus\/)?\d+/.test(path);
    case "booking_com":
      return /\/hotel\/[a-z]{2}\/[^/]+\.html/.test(path);
    case "vrbo":
      return /\/\d{5,}(ha)?\b/.test(path);
    case "agoda":
      return /\/hotel\//.test(path) || /\/[^/]+\/hotel\/[^/]+\.html/.test(path);
    case "homestay":
      return /\/\d{3,}/.test(path);
  }
}

/**
 * The link Firecrawl reads: https, no tracking or search noise, and the
 * site's own date parameters when the host wants prices for some dates.
 */
export function listingUrl(url: string, dates?: { checkIn: string; checkOut: string } | null): string {
  const u = new URL(url.trim());
  u.protocol = "https:";
  u.hash = "";
  const p = detectPlatform(u.toString());
  for (const k of [...u.searchParams.keys()]) u.searchParams.delete(k);
  const d = p ? PLATFORM_PROFILES[p].priceDates : null;
  if (d && dates) {
    u.searchParams.set(d.checkIn, dates.checkIn);
    u.searchParams.set(d.checkOut, dates.checkOut);
    for (const [k, v] of Object.entries(d.extra ?? {})) u.searchParams.set(k, v);
  }
  return u.toString();
}

/** Every distinct http(s) link in what the host pasted (one per line, or mixed with text). */
export function parseLinks(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"')]+/gi) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of found) {
    const clean = raw.replace(/[.,;]+$/, "");
    try {
      const key = listingUrl(clean);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    } catch {
      // Not a usable link.
    }
  }
  return out.slice(0, 20);
}

/* ---------------------------- what to extract ---------------------------- */

/** The JSON shape Firecrawl fills from the page (its json format with this schema). */
export const LISTING_SCHEMA = {
  type: "object",
  properties: {
    propertyName: { type: "string", description: "The listing's or property's name as shown on the page" },
    propertyType: { type: "string", description: "e.g. guest house, B&B, apartment, entire home, private room, hotel" },
    description: { type: "string", description: "The main description, as written, up to about 1500 characters" },
    address: { type: "string", description: "Street address if shown; otherwise the area or neighbourhood shown" },
    city: { type: "string" },
    postcode: { type: "string", description: "Postal code if shown" },
    country: { type: "string", description: "Country name or ISO code" },
    checkInFrom: { type: "string", description: "Earliest check-in time, 24h HH:MM" },
    checkOutBy: { type: "string", description: "Latest check-out time, 24h HH:MM" },
    houseRules: { type: "array", items: { type: "string" } },
    amenities: { type: "array", items: { type: "string" }, description: "Property-wide amenities and facilities" },
    parking: { type: "string", description: "What the page says about parking, if anything" },
    photos: { type: "array", items: { type: "string" }, description: "Absolute URLs of the listing's own photos (largest size available), in page order, not icons, maps or host avatars" },
    price: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Price per night as a number, if shown" },
        currency: { type: "string", description: "ISO currency code, e.g. GBP, EUR, USD" },
        per: { type: "string", description: "What the price is for, e.g. night, total stay" },
      },
    },
    rooms: {
      type: "array",
      description: "Each separately bookable room or room type",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          maxGuests: { type: "number" },
          beds: { type: "string", description: "Bed types and counts, e.g. 1 king bed" },
          ensuite: { type: "boolean", description: "Has its own private bathroom" },
          sizeM2: { type: "number" },
          amenities: { type: "array", items: { type: "string" } },
          photos: { type: "array", items: { type: "string" }, description: "Absolute URLs of this room's photos, if the page groups them" },
          pricePerNight: { type: "number" },
        },
      },
    },
  },
} as const;

/** What Firecrawl is told, for this site. */
export function promptFor(platform: ListingPlatform): string {
  return [
    `This is a public ${PLATFORM_PROFILES[platform].label} listing page for a short-stay property.`,
    "Extract the property and its rooms exactly as shown on the page; never invent anything that isn't there, and leave fields out when the page doesn't show them.",
    PLATFORM_PROFILES[platform].hint,
    "Times as 24-hour HH:MM. Photos as absolute image URLs of the listing itself.",
  ].join(" ");
}

/* --------------------------- cleaning the result -------------------------- */

export type ListingRoom = {
  name: string;
  description: string | null;
  maxGuests: number | null;
  beds: string | null;
  ensuite: boolean | null;
  amenities: string[];
  photos: string[];
  pricePerNight: number | null;
};

export type Listing = {
  platform: ListingPlatform;
  url: string;
  propertyName: string | null;
  propertyType: string | null;
  description: string | null;
  address: string | null;
  postcode: string | null;
  country: string | null;
  checkInFrom: string | null;
  checkOutBy: string | null;
  houseRules: string[];
  amenities: string[];
  parking: string | null;
  photos: string[];
  price: { amount: number; currency: string | null; per: string | null } | null;
  rooms: ListingRoom[];
};

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};
const list = (v: unknown, max: number, each = 120): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => str(x, each)).filter((x): x is string => !!x))].slice(0, max) : [];
const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : NaN;
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

/** "3pm", "15:00", "From 14:00" → "15:00"; anything else → null. */
export function cleanTime(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i.exec(v);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Only real photo links (https images), without the sites' small thumbnail sizes, no duplicates. */
export function cleanPhotos(v: unknown, max = 30): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of Array.isArray(v) ? v : []) {
    if (typeof raw !== "string") continue;
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue;
    if (/\.(svg|gif)(\?|$)/i.test(url.pathname) || /avatar|icon|logo|map|sprite|static\/images/i.test(url.pathname)) continue;
    // Ask for a larger size where the site puts it in the link.
    if (/muscache\.com/.test(url.hostname)) url.searchParams.set("im_w", "1200");
    if (/bstatic\.com/.test(url.hostname)) url.pathname = url.pathname.replace(/\/(max|square)\d+(x\d+)?\//, "/max1024x768/");
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= max) break;
  }
  return out;
}

/** What Firecrawl returned, made safe and tidy. */
export function normaliseListing(raw: unknown, platform: ListingPlatform, url: string): Listing {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const price = (r["price"] && typeof r["price"] === "object" ? r["price"] : {}) as Record<string, unknown>;
  const amount = num(price["amount"], 1, 1_000_000);
  const rooms = (Array.isArray(r["rooms"]) ? r["rooms"] : [])
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
    .map((x) => ({
      name: str(x["name"], 80) ?? "",
      description: str(x["description"], 1500),
      maxGuests: num(x["maxGuests"], 1, 30),
      beds: str(x["beds"], 120),
      ensuite: typeof x["ensuite"] === "boolean" ? x["ensuite"] : null,
      amenities: list(x["amenities"], 30, 80),
      photos: cleanPhotos(x["photos"], 12),
      pricePerNight: num(x["pricePerNight"], 1, 1_000_000),
    }))
    .filter((x) => x.name)
    .slice(0, 40);
  const city = str(r["city"], 80);
  const address = str(r["address"], 200);
  return {
    platform,
    url,
    propertyName: str(r["propertyName"], 120),
    propertyType: str(r["propertyType"], 60),
    description: str(r["description"], 2000),
    address: address && city && !address.toLowerCase().includes(city.toLowerCase()) ? `${address}, ${city}` : (address ?? city),
    postcode: str(r["postcode"], 20),
    country: str(r["country"], 60),
    checkInFrom: cleanTime(r["checkInFrom"]),
    checkOutBy: cleanTime(r["checkOutBy"]),
    houseRules: list(r["houseRules"], 20, 200),
    amenities: list(r["amenities"], 40, 80),
    parking: str(r["parking"], 300),
    photos: cleanPhotos(r["photos"]),
    price: amount ? { amount, currency: str(price["currency"], 3)?.toUpperCase() ?? null, per: str(price["per"], 30) } : null,
    rooms,
  };
}

/** What was found on one page, in the order the progress list shows it. */
export function gathered(l: Listing): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  if (l.propertyName) out.push({ key: "name", label: l.propertyName });
  if (l.address) out.push({ key: "address", label: l.address });
  if (l.description) out.push({ key: "description", label: "Description" });
  if (l.photos.length) out.push({ key: "photos", label: l.photos.length === 1 ? "1 photo" : `${l.photos.length} photos` });
  if (l.rooms.length) out.push({ key: "rooms", label: l.rooms.length === 1 ? "1 room" : `${l.rooms.length} rooms` });
  const sleeps = l.rooms.reduce((n, r) => n + (r.maxGuests ?? 0), 0);
  if (sleeps) out.push({ key: "sleeps", label: `Sleeps ${sleeps}` });
  if (l.checkInFrom || l.checkOutBy) out.push({ key: "times", label: [l.checkInFrom ? `In from ${l.checkInFrom}` : null, l.checkOutBy ? `out by ${l.checkOutBy}` : null].filter(Boolean).join(", ") });
  if (l.amenities.length) out.push({ key: "amenities", label: `${l.amenities.length} amenities` });
  if (l.houseRules.length) out.push({ key: "rules", label: `${l.houseRules.length} house rules` });
  if (l.price) out.push({ key: "price", label: `${l.price.currency ?? ""} ${l.price.amount}${l.price.per ? ` per ${l.price.per}` : ""}`.trim() });
  return out;
}

/* --------------------------------- planning ------------------------------- */

export type PlannedRoom = {
  /** An existing room with the same name (it's updated), or null (it's added). */
  existingId: string | null;
  name: string;
  description: string | null;
  maxGuests: number;
  ensuite: boolean;
  amenities: string[];
  photos: string[];
  /** Where it came from, for the review list. */
  from: ListingPlatform;
  /** The listing page it came from, when that page is this one room (kept as the room's link). */
  url: string | null;
  pricePerNight: number | null;
};

export type ImportPlan = {
  property: {
    name: string | null;
    description: string | null;
    address: string | null;
    postcode: string | null;
    country: string | null;
    checkInFrom: string | null;
    checkOutBy: string | null;
    parking: string | null;
    houseRules: string[];
    amenities: string[];
  };
  photos: string[];
  rooms: PlannedRoom[];
  /** Pages for the whole property (kept as the property's links). */
  propertyLinks: string[];
  prices: Array<{ platform: ListingPlatform; amount: number; currency: string | null; per: string | null }>;
};

export const roomKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * All the pages read, as one plan: the property from the page that says the
 * most (a whole-property page first), every room once (matched by name to the
 * host's existing rooms, which are then updated rather than added again), and
 * a single-unit listing with no room list becomes one room named after it.
 */
export function planImport(listings: Listing[], existingRooms: Array<{ id: string; display_name: string }>): ImportPlan {
  const score = (l: Listing) => (PLATFORM_PROFILES[l.platform].shape === "property" ? 100 : 0) + [l.propertyName, l.address, l.description, l.checkInFrom, l.postcode].filter(Boolean).length;
  const best = [...listings].sort((a, b) => score(b) - score(a))[0];
  const first = <K extends keyof Listing>(k: K) => (best?.[k] ?? listings.map((l) => l[k]).find((v) => v !== null && v !== undefined && v !== "")) ?? null;
  const existing = new Map(existingRooms.map((r) => [roomKey(r.display_name), r.id]));
  const rooms = new Map<string, PlannedRoom>();
  for (const l of listings) {
    const source: ListingRoom[] = l.rooms.length
      ? l.rooms
      : PLATFORM_PROFILES[l.platform].shape === "unit" && l.propertyName
        ? [{ name: l.propertyName, description: l.description, maxGuests: null, beds: null, ensuite: null, amenities: l.amenities, photos: l.photos, pricePerNight: l.price?.amount ?? null }]
        : [];
    for (const r of source) {
      const key = roomKey(r.name);
      if (!key || rooms.has(key)) continue;
      const description = [r.description, r.beds && !(r.description ?? "").includes(r.beds) ? r.beds : null].filter(Boolean).join("\n\n") || null;
      rooms.set(key, {
        existingId: existing.get(key) ?? null,
        name: r.name,
        description,
        maxGuests: Math.round(r.maxGuests ?? 2),
        ensuite: r.ensuite ?? false,
        amenities: r.amenities.length ? r.amenities : [],
        photos: r.photos.length ? r.photos : [],
        from: l.platform,
        url: PLATFORM_PROFILES[l.platform].shape === "unit" ? l.url : null,
        pricePerNight: r.pricePerNight,
      });
    }
  }
  const photos = [...new Set(listings.flatMap((l) => l.photos))].slice(0, 40);
  return {
    property: {
      name: first("propertyName") as string | null,
      description: first("description") as string | null,
      address: first("address") as string | null,
      postcode: first("postcode") as string | null,
      country: first("country") as string | null,
      checkInFrom: first("checkInFrom") as string | null,
      checkOutBy: first("checkOutBy") as string | null,
      parking: first("parking") as string | null,
      houseRules: [...new Set(listings.flatMap((l) => l.houseRules))].slice(0, 20),
      amenities: [...new Set(listings.flatMap((l) => l.amenities))].slice(0, 40),
    },
    photos,
    rooms: [...rooms.values()],
    propertyLinks: listings.filter((l) => PLATFORM_PROFILES[l.platform].shape === "property").map((l) => l.url),
    prices: listings.filter((l) => l.price).map((l) => ({ platform: l.platform, ...l.price! })),
  };
}

/** A country name or code from a listing as an ISO code Latchkey knows, if it can tell. */
export function countryCode(v: string | null, known: Array<{ code: string; country: string }>): string | null {
  if (!v) return null;
  const t = v.trim().toLowerCase();
  const aliases: Record<string, string> = { uk: "GB", "united kingdom": "GB", england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB", "great britain": "GB", usa: "US", "united states": "US", "united states of america": "US" };
  if (aliases[t]) return aliases[t]!;
  const byCode = known.find((c) => c.code.toLowerCase() === t);
  if (byCode) return byCode.code;
  return known.find((c) => c.country.toLowerCase() === t)?.code ?? null;
}

/**
 * Photos are copied into Latchkey only from the booking sites' own image
 * servers, so a link in an import can never make the server fetch anything else.
 */
const PHOTO_HOSTS = ["muscache.com", "bstatic.com", "trvl-media.com", "vrbo.com", "agoda.net", "agoda.com", "homestay.com"];
export function photoHostAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && PHOTO_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}
