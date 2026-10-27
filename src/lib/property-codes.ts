/**
 * Each property's guest link (properties.short_code, used at /kiosk/<code>
 * and /<code>) and door PIN (check_in_pin, typed at /checkin to find the
 * property and to unlock the kiosk) are unique across every host. Pure
 * rules here; the server checks them against the database
 * (property-codes.functions.ts).
 *
 * Guest links are made the way sign-up forms suggest usernames: start from
 * the most distinctive word in the property's name, leaving out the words
 * that only say what kind of place it is ("The Grange Guest House" → grange),
 * then add other words from the name, the area, and finally numbers, and
 * only ever offer ones that are free.
 */

import { RESERVED_SLUGS } from "./theme";

/** Little words, in English and the languages hosts most often name places in. */
const ARTICLES = [
  "the",
  "a",
  "an",
  "and",
  "of",
  "at",
  "on",
  "in",
  "by",
  "to",
  "for",
  "with",
  "n",
  "le",
  "la",
  "les",
  "l",
  "el",
  "los",
  "las",
  "il",
  "lo",
  "de",
  "du",
  "des",
  "d",
  "der",
  "die",
  "das",
  "het",
  "den",
  "y",
  "e",
  "et",
  "und",
];

/**
 * Words that describe the kind of place rather than name it. From
 * VisitEngland's categories (hotels, guest accommodation, B&Bs, farmhouses,
 * inns, restaurants with rooms, serviced apartments, hostels, self-catering,
 * holiday parks, glamping, chalets), serviced accommodation ("SA") and
 * short-let terms, and the common words abroad.
 */
const DESCRIPTORS = [
  // Hotels
  "hotel",
  "hotels",
  "motel",
  "motels",
  "aparthotel",
  "aparthotels",
  "apart",
  "boutique",
  "resort",
  "resorts",
  "spa",
  "suites",
  "suite",
  "townhouse",
  "metro",
  "grand",
  "luxury",
  "premier",
  "plaza",
  "palace",
  // Guest accommodation
  "guest",
  "guests",
  "guesthouse",
  "guesthouses",
  "house",
  "houses",
  "home",
  "homes",
  "homestay",
  "homestays",
  "b",
  "bb",
  "bnb",
  "bandb",
  "bed",
  "beds",
  "breakfast",
  "inn",
  "inns",
  "tavern",
  "pub",
  "arms",
  "restaurant",
  "rooms",
  "room",
  "farmhouse",
  "farm",
  "manor",
  "hall",
  "court",
  "lodge",
  "lodges",
  "lodging",
  "lodgings",
  "pension",
  // Serviced accommodation and short lets
  "sa",
  "serviced",
  "service",
  "accommodation",
  "accommodations",
  "accom",
  "apartment",
  "apartments",
  "apts",
  "apt",
  "flat",
  "flats",
  "studio",
  "studios",
  "residence",
  "residences",
  "residency",
  "stay",
  "stays",
  "staycation",
  "let",
  "lets",
  "lettings",
  "letting",
  "rental",
  "rentals",
  "holiday",
  "holidays",
  "vacation",
  "vacations",
  "short",
  "property",
  "properties",
  "living",
  // Hostels, self-catering, outdoors
  "hostel",
  "hostels",
  "backpackers",
  "bunkhouse",
  "cottage",
  "cottages",
  "cabin",
  "cabins",
  "chalet",
  "chalets",
  "villa",
  "villas",
  "barn",
  "barns",
  "retreat",
  "retreats",
  "camping",
  "campsite",
  "glamping",
  "caravan",
  "caravans",
  "park",
  "parks",
  "lodgepark",
  // Abroad
  "hote",
  "hostal",
  "albergo",
  "locanda",
  "pensione",
  "gasthaus",
  "gasthof",
  "pousada",
  "posada",
  "hacienda",
  "riad",
  "ryokan",
  "auberge",
  "chambres",
  "maison",
  "casa",
  "domus",
  "haus",
  "hof",
  // Business words
  "ltd",
  "limited",
  "llc",
  "llp",
  "plc",
  "co",
  "company",
  "group",
  "collection",
  "hospitality",
  "uk",
];

const SKIP = new Set([...ARTICLES, ...DESCRIPTORS]);

/** Words that only make sense with the next one ("Old Rectory", "St Ives", "Little Barn"). */
const MODIFIERS = new Set([
  "old",
  "olde",
  "ye",
  "new",
  "royal",
  "little",
  "great",
  "big",
  "upper",
  "lower",
  "north",
  "south",
  "east",
  "west",
  "st",
  "saint",
  "no",
  "number",
  "sir",
  "lady",
  "lord",
  "king",
  "kings",
  "queen",
  "queens",
]);

export const LINK = { min: 3, max: 40 } as const;

/** Lower case ASCII words from any name: accents dropped, "Mary's" → marys, "&" → and. */
export function nameWords(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The words that name this place rather than describe it, in order. */
export function distinctiveWords(name: string): string[] {
  const words = nameWords(name);
  const kept = words.filter((w) => !SKIP.has(w));
  // Nothing but descriptors ("The Guest House"): those words together are the name.
  if (kept.length) return kept;
  const all = words.filter((w) => !ARTICLES.includes(w));
  return all.length ? [all.join("-")] : [];
}

/** A guest link made safe: lower case, single hyphens, no hyphen at either end, within the length. */
export function cleanLink(raw: string): string {
  const s = nameWords(raw).join("-").slice(0, LINK.max);
  return s.replace(/-+$/g, "");
}

export type LinkProblem = "too_short" | "too_long" | "characters" | "reserved";

/** Why a guest link can't be used, before asking whether it's free. */
export function linkProblem(code: string): LinkProblem | null {
  if (code.length < LINK.min) return "too_short";
  if (code.length > LINK.max) return "too_long";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(code)) return "characters";
  if (RESERVED_SLUGS.has(code)) return "reserved";
  return null;
}

/** The outward part of a postcode ("BA1 2AB" → ba1), or a short ZIP; empty when there's nothing usable. */
export function areaCode(postcode: string | null | undefined): string {
  const p = (postcode ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!p) return "";
  const out = p.includes(" ")
    ? p.split(" ")[0]!
    : p.length > 4 && /^[a-z]{1,2}\d/.test(p)
      ? p.slice(0, -3)
      : p;
  return out.replace(/[^a-z0-9]/g, "").slice(0, 5);
}

/** The town from a free-text address: the last part that has letters and isn't a postcode. */
export function townFrom(address: string | null | undefined): string {
  const parts = (address ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const words = nameWords(parts[i]!).filter((w) => !/\d/.test(w));
    if (words.length && words.length <= 3 && !/^\d/.test(parts[i]!)) return words.join("-");
  }
  return "";
}

export type LinkContext = {
  name: string;
  address?: string | null | undefined;
  postcode?: string | null | undefined;
};

const dedupe = (xs: string[]) => [...new Set(xs.filter((x) => x && !linkProblem(x)))];

/**
 * Guest links to try for a new property, best first: the distinctive word,
 * then with the next words, the town, the postcode area, then numbers.
 */
export function linkCandidates(ctx: LinkContext): string[] {
  const words = distinctiveWords(ctx.name);
  // A short or leading word ("St Ives", "No 5", "Old Rectory") reads better joined to the next.
  const first =
    words[0] && (words[0].length < LINK.min || MODIFIERS.has(words[0])) && words[1]
      ? `${words[0]}-${words[1]}`
      : (words[0] ?? "stay");
  const rest = words.slice(first.includes("-") ? 2 : 1);
  const town = townFrom(ctx.address);
  const area = areaCode(ctx.postcode);
  const join = (...xs: string[]) => cleanLink(xs.filter(Boolean).join("-"));
  return dedupe([
    first,
    join(first, rest[0] ?? ""),
    join(first, rest[0] ?? "", rest[1] ?? ""),
    join(first, town),
    join(first, area),
    join(first, rest[0] ?? "", town),
    ...Array.from({ length: 8 }, (_, i) => join(first, String(i + 2))),
  ]);
}

/**
 * Up to `count` other links for one the host typed that's taken: other
 * words from the name, the town, the postcode area, the year, then numbers.
 * `isFree` says which are free; only those are offered.
 */
export function linkAlternatives(
  desired: string,
  ctx: LinkContext,
  isFree: (code: string) => boolean,
  count = 3,
  year = new Date().getFullYear(),
): string[] {
  const base = cleanLink(desired) || linkCandidates(ctx)[0] || "stay";
  const used = new Set(base.split("-"));
  const words = distinctiveWords(ctx.name).filter((w) => !used.has(w));
  const town = townFrom(ctx.address);
  const area = areaCode(ctx.postcode);
  const join = (...xs: string[]) => cleanLink(xs.filter(Boolean).join("-"));
  const tries = dedupe([
    ...words.slice(0, 2).map((w) => join(base, w)),
    town && !used.has(town) ? join(base, town) : "",
    area ? join(base, area) : "",
    join(base, String(year)),
    ...Array.from({ length: 30 }, (_, i) => join(base, String(i + 2))),
  ]).filter((c) => c !== base);
  return tries.filter(isFree).slice(0, count);
}

/* -------------------------------- door PIN -------------------------------- */

/** PINs people guess first: one digit, runs (123456, 987654), repeated pairs or halves, two digits only. */
export function weakPin(pin: string): boolean {
  if (!/^\d{6}$/.test(pin)) return true;
  const d = [...pin].map(Number);
  if (new Set(d).size <= 2) return true;
  const steps = d.slice(1).map((x, i) => (x - d[i]! + 10) % 10);
  if (steps.every((s) => s === 1) || steps.every((s) => s === 9)) return true;
  if (pin.slice(0, 3) === pin.slice(3)) return true;
  if (pin.slice(0, 2) === pin.slice(2, 4) && pin.slice(2, 4) === pin.slice(4)) return true;
  return false;
}

/** A random 6-digit PIN that isn't an easy guess. `random` returns 0 ≤ x < 1 (crypto on the server). */
export function randomPin(random: () => number): string {
  for (let i = 0; i < 50; i++) {
    const pin = String(Math.floor(random() * 1_000_000)).padStart(6, "0");
    if (!weakPin(pin)) return pin;
  }
  return "482915";
}
