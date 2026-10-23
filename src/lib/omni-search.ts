/**
 * The dashboard's search (OmniSearch, top right before the bell). Two halves:
 * what Latchkey itself has (pages, settings, features, logos, built-in guide
 * sections), filtered here in the browser; and the business's own data
 * (guests, stays, guide text, extras, jobs, tradespeople, calendar links),
 * searched on the server for the one business being viewed only
 * (search.functions.ts). Pure: no network or database access.
 */

export type SearchKind =
  | "page"
  | "setting"
  | "feature"
  | "logo"
  | "integration"
  | "guide"
  | "guest"
  | "property"
  | "room"
  | "extra"
  | "job"
  | "trade"
  | "connection"
  | "look"
  | "enquiry";

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle?: string;
  /** Where it opens: an app path with its search params (lands on the item). */
  href: string;
  /** Opening it switches the dashboard to this property first. */
  propertyId?: string;
  /** Extra words it answers to ("wifi" for the Wi-Fi section). */
  keywords?: string;
};

/** Letters, numbers and simple punctuation only, so the text is safe inside a database filter. */
export function cleanQuery(q: string): string {
  return q
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}@.' +-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/**
 * How well the text answers the query: 0 = not at all. Every word of the
 * query must appear; a title starting with the query ranks first, then a
 * word in the title starting with it, then anywhere.
 */
export function matchScore(query: string, hit: Pick<SearchHit, "title" | "subtitle" | "keywords">): number {
  const q = cleanQuery(query).toLowerCase();
  if (!q) return 0;
  const title = hit.title.toLowerCase();
  const all = `${title} ${(hit.subtitle ?? "").toLowerCase()} ${(hit.keywords ?? "").toLowerCase()}`;
  const words = q.split(" ").filter(Boolean);
  if (!words.every((w) => all.includes(w))) return 0;
  if (title.startsWith(q)) return 4;
  if (title.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(words[0]!))) return 3;
  if (title.includes(words[0]!)) return 2;
  return 1;
}

/** The best matches first, at most `limit`, keeping the order given among equals. */
export function rankHits(query: string, hits: SearchHit[], limit = 8): SearchHit[] {
  return hits
    .map((h, i) => ({ h, i, s: matchScore(query, h) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.h);
}

/** Which page each changelog area lives on, so a feature opens where it is used. */
export const AREA_PAGES: Record<string, string> = {
  "Check-in": "/app/settings?focus=checkin",
  "Guest guide": "/app/guides",
  Bookings: "/app/bookings",
  Housekeeping: "/app/housekeeping",
  Reports: "/app/reports",
  Calendar: "/app/connections",
  Services: "/app/services",
  Team: "/app/settings?focus=team",
  Settings: "/app/settings",
  Invoices: "/app/settings?focus=invoices",
  "Guest register": "/app/register",
  Demo: "/app/today",
  Website: "/about",
  Security: "/app/settings?focus=privacy",
};

/** Settings sections that only Latchkey's admins see. */
export const ADMIN_SETTINGS = new Set(["adminLink"]);

/** A stay's dates for a result line: "12 Oct – 14 Oct 2026". */
export function stayLine(checkIn: string, checkOut: string): string {
  const f = (d: string, year: boolean) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  return `${f(checkIn, false)} – ${f(checkOut, true)}`;
}
