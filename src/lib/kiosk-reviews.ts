/**
 * Reviews on the door tablet while an ID or selfie is being checked (IdCamera's progress
 * bar): the property's best reviews from its own listing pages (and its direct stays),
 * quoted word for word, with the reviewer's first name, the rating and the date. Pure;
 * tested in tests/kiosk-reviews.test.ts. Fetching: kiosk-reviews.functions.ts.
 */

export type KioskReview = {
  id: string;
  site: string;
  firstName: string;
  /** As the site gives it: 4.8 out of 5, or 9.6 out of 10. */
  rating: number;
  outOf: 5 | 10;
  /** YYYY-MM-DD, or YYYY-MM when the site only gives the month. */
  date: string | null;
  text: string;
};

/** Only the top: 5 out of 5 (or 4.8 and up), or 9 out of 10 and up. */
export function isTopRating(rating: number, outOf: 5 | 10): boolean {
  return outOf === 5 ? rating >= 4.8 : rating >= 9;
}

const squash = (s: string) =>
  s.normalize("NFKC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/**
 * The quote shown: the reader's positive part of a review, only when it appears word for
 * word in the review (so nothing is reworded or invented), between 20 and 280 characters.
 */
export function verbatimQuote(review: string, quote: string | null | undefined): string | null {
  if (!quote) return null;
  const q = squash(quote).replace(/^["'\s]+|["'\s]+$/g, "");
  if (q.length < 20 || q.length > 280) return null;
  return squash(review).toLowerCase().includes(q.toLowerCase()) ? q : null;
}

/** "Maria José G." → "Maria"; nothing for "Anonymous" or a blank. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  const clean = first.replace(/[^\p{L}'-]/gu, "");
  if (clean.length < 2 || /^(anonymous|guest|user)$/i.test(clean)) return null;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** "2026-03-14", "March 2026", "14 March 2026" → a date we can show; anything else, nothing. */
export function reviewDate(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(v);
  if (iso) return iso[3] ? `${iso[1]}-${iso[2]}-${iso[3]}` : `${iso[1]}-${iso[2]}`;
  const m = /(?:(\d{1,2})\s+)?([a-z]+)\s+(\d{4})/.exec(v);
  if (!m) return null;
  const month = MONTHS.findIndex((x) => x.startsWith(m[2]!.slice(0, 3)));
  if (month < 0) return null;
  const mm = String(month + 1).padStart(2, "0");
  return m[1] ? `${m[3]}-${mm}-${m[1].padStart(2, "0")}` : `${m[3]}-${mm}`;
}

/** One review from a listing page, as the reader returned it, tidied; null when it doesn't qualify. */
export function fromScraped(
  raw: {
    reviewer?: unknown;
    rating?: unknown;
    out_of?: unknown;
    date?: unknown;
    text?: unknown;
    positive_quote?: unknown;
  },
  site: string,
): Omit<KioskReview, "id"> | null {
  const text = typeof raw.text === "string" ? raw.text : "";
  const rating = typeof raw.rating === "number" ? raw.rating : Number(raw.rating);
  const outOf = raw.out_of === 10 || raw.out_of === "10" ? 10 : 5;
  if (!Number.isFinite(rating) || rating <= 0 || rating > outOf) return null;
  if (!isTopRating(rating, outOf)) return null;
  const firstName = firstNameOf(typeof raw.reviewer === "string" ? raw.reviewer : null);
  const quote = verbatimQuote(
    text,
    typeof raw.positive_quote === "string" ? raw.positive_quote : null,
  );
  if (!firstName || !quote) return null;
  return {
    site,
    firstName,
    rating: Math.round(rating * 10) / 10,
    outOf,
    date: reviewDate(typeof raw.date === "string" ? raw.date : null),
    text: quote,
  };
}

/** The same review seen twice (two room pages, a second fetch) is kept once. */
export function reviewKey(r: { firstName: string; text: string }): string {
  return `${r.firstName.toLowerCase()}|${squash(r.text).toLowerCase().slice(0, 80)}`;
}

/**
 * How long each review stays: quick with plenty, so the wait feels short, slower when there
 * are only a few so they don't flash round; one review just stays.
 */
export function reviewPace(count: number): number | null {
  if (count <= 1) return null;
  if (count === 2) return 3200;
  if (count === 3) return 2500;
  return 1700;
}

/** A shuffled order for one wait (seeded, so a test can repeat it). */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** "★★★★★" for 5, "4.8 ★" for anything else out of 5, "9.6/10" out of 10. */
export function ratingLabel(rating: number, outOf: 5 | 10): string {
  if (outOf === 10) return `${rating % 1 ? rating.toFixed(1) : rating}/10`;
  return rating === 5 ? "★★★★★" : `${rating.toFixed(1)} ★`;
}

/** "March 2026" or "14 Mar 2026". */
export function dateLabel(date: string | null): string {
  if (!date) return "";
  const [y, m, d] = date.split("-");
  const month = MONTHS[Number(m) - 1];
  if (!y || !month) return "";
  const name = month.charAt(0).toUpperCase() + month.slice(1);
  return d ? `${Number(d)} ${name.slice(0, 3)} ${y}` : `${name} ${y}`;
}

/** Pages to read reviews from for one listing link: the listing itself, and its reviews page where there is one. */
export function reviewPages(url: string): string[] {
  try {
    const u = new URL(url);
    const pages = [u.toString()];
    if (/airbnb\./.test(u.hostname) && /\/rooms\/\d+/.test(u.pathname)) {
      pages.push(`${u.origin}${u.pathname.replace(/\/$/, "")}/reviews`);
    }
    return pages;
  } catch {
    return [];
  }
}

/** The reader's instructions and schema for one page. */
export const REVIEW_PROMPT =
  "List the guest reviews shown on this page. For each: the reviewer's name as shown, the rating they gave and " +
  "what it is out of (5 or 10; for sites with stars use 5), the date as shown, and the review text exactly as written. " +
  "Also give positive_quote: one or two whole sentences copied exactly from that review that only say good things " +
  "about the stay (no complaints, no 'but'), or null if there are none. Never reword, translate or invent anything. " +
  "Leave out reviews with no rating.";

export const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object",
        properties: {
          reviewer: { type: ["string", "null"] },
          rating: { type: ["number", "null"] },
          out_of: { type: ["number", "null"] },
          date: { type: ["string", "null"] },
          text: { type: ["string", "null"] },
          positive_quote: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

/** Whether a property's reviews are due to be read again: never read, or `days` since the last read. */
export function reviewsDue(lastFetched: string | null, days: number, now = Date.now()): boolean {
  if (!lastFetched) return true;
  const at = Date.parse(lastFetched);
  return !Number.isFinite(at) || now - at >= days * 86_400_000 - 60_000;
}
