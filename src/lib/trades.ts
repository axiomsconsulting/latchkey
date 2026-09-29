/**
 * Finding a trade for property work.
 *
 * Contra is a marketplace for creative, tech and marketing freelancers, so it
 * has no plumbers, electricians or cleaners. Property jobs go to the UK trade
 * directories below: Latchkey builds a pre-filled search link for the job's
 * category and the property's postcode, so the host lands on real, reviewed
 * local firms instead of invented ones.
 *
 * None of these directories publish an API, and their terms forbid automated
 * extraction of member listings, so Latchkey links out rather than copying.
 */

import { region as regionFor } from "./regions";


export type Directory = {
  id: string;
  name: string;
  blurb: string;
  /** How the host is charged or contacted. */
  note: string;
  search: (term: string, postcode: string) => string;
};


/** Plain search words for each service category used across Latchkey. */
export const TRADE_TERMS: Record<string, string> = {
  cleaning: "cleaner",
  linen: "laundry service",
  bathroom: "plumber",
  plumbing: "plumber",
  heating: "gas safe heating engineer",
  aircon: "air conditioning engineer",
  kitchenette: "handyman",
  appliance: "appliance repair",
  electrical: "electrician",
  boiler_service: "boiler service gas safe",
  pat_testing: "pat testing",
  deep_clean: "deep cleaning",
  handyman: "handyman",
  breakfast: "local bakery delivery",
  cycle: "cycle hire",
  taxi: "taxi",
  luggage: "luggage storage",
  late_checkout: "cleaner",
};

export function tradeTerm(category: string): string {
  return TRADE_TERMS[category] ?? "handyman";
}

const q = (s: string) => encodeURIComponent(s.trim());

export const DIRECTORIES: Directory[] = [
  {
    id: "checkatrade",
    name: "Checkatrade",
    blurb: "Vetted trades with verified reviews. Strongest for gas, electrics and emergencies.",
    note: "Free to search. Members are background-checked.",
    search: (t, p) => `https://www.checkatrade.com/search?what=${q(t)}&where=${q(p)}`,
  },
  {
    id: "mybuilder",
    name: "MyBuilder",
    blurb: "Post the job, get quotes back from local tradespeople within hours.",
    note: "Free to post. Good for small repairs and one-off jobs.",
    search: (t, p) => `https://www.mybuilder.com/search?q=${q(t)}&location=${q(p)}`,
  },
  {
    id: "rated_people",
    name: "Rated People",
    blurb: "Up to three quotes per job, with ratings from previous customers.",
    note: "Free to post a job.",
    search: (t, p) => `https://www.ratedpeople.com/find-a-tradesman?q=${q(t)}&postcode=${q(p)}`,
  },
  {
    id: "bark",
    name: "Bark",
    blurb: "Broadest coverage, including cleaners, laundry, drivers and one-off help.",
    note: "Free to post; sellers pay to reply, so expect quick contact.",
    search: (t, p) => `https://www.bark.com/en/gb/search/?q=${q(t)}&location=${q(p)}`,
  },
  {
    id: "trustatrader",
    name: "TrustATrader",
    blurb: "Smaller, well-reviewed independents. Useful as a second opinion on price.",
    note: "Free to search.",
    search: (t, p) => `https://www.trustatrader.com/search?trade=${q(t)}&location=${q(p)}`,
  },
  {
    id: "angi",
    name: "Angi",
    blurb: "Large US network of reviewed home-service pros.",
    note: "Free to search and request quotes.",
    search: (t, p) => `https://www.angi.com/companylist/us/${q(p)}/${q(t)}.htm`,
  },
  {
    id: "thumbtack",
    name: "Thumbtack",
    blurb: "Quick quotes from local US pros, good for cleaning and handyman work.",
    note: "Free to request quotes.",
    search: (t, p) => `https://www.thumbtack.com/search?query=${q(t)}&zip_code=${q(p)}`,
  },
  {
    id: "yelp",
    name: "Yelp",
    blurb: "Reviews and phone numbers for nearby businesses across the US and Canada.",
    note: "Free to search.",
    search: (t, p) => `https://www.yelp.com/search?find_desc=${q(t)}&find_loc=${q(p)}`,
  },
  {
    id: "homestars",
    name: "HomeStars",
    blurb: "Canada's reviewed home-improvement and repair directory.",
    note: "Free to search.",
    search: (t, p) => `https://homestars.com/companies?q=${q(t)}&location=${q(p)}`,
  },
  {
    id: "hipages",
    name: "hipages",
    blurb: "Australia's largest tradie marketplace, with quick job posting.",
    note: "Free to post a job.",
    search: (t, p) => `https://hipages.com.au/find/${q(t)}/${q(p)}`,
  },
  {
    id: "airtasker",
    name: "Airtasker",
    blurb: "Good for one-off Australian jobs: cleaning, moving, small repairs.",
    note: "Free to post; taskers bid.",
    search: (t, p) => `https://www.airtasker.com/tasks/?q=${q(t)}&location=${q(p)}`,
  },
  {
    id: "buildercrack",
    name: "Buildercrack",
    blurb: "New Zealand trade marketplace covering repairs and maintenance.",
    note: "Free to post a job.",
    search: (t, p) => `https://buildercrack.co.nz/search?q=${q(`${t} ${p}`)}`,
  },
  {
    id: "google_maps",
    name: "Google Maps",
    blurb: "Nearest firms with opening hours and phone numbers, handy late at night.",
    note: "Free to search. Copying listings into Latchkey is not allowed, so it opens in a new tab.",
    search: (t, p) => `https://www.google.com/maps/search/${q(`${t} near ${p}`)}`,
  },
];

/** Only the directories that actually operate in the property's country. */
export function directoryLinks(category: string, postcode: string, country = "GB") {
  const term = tradeTerm(category);
  const where = postcode.trim() || "UK";
  const ids = new Set(regionFor(country).directoryIds);
  return DIRECTORIES.filter((d) => ids.has(d.id)).map((d) => ({ ...d, url: d.search(term, where) }));
}


/* ----------------------------- Contra (creative) -------------------------- */

export type ContraCategory = {
  id: string;
  label: string;
  blurb: string;
  /** Sub-searches, each opening Contra pre-filled. */
  subcategories: { id: string; label: string; term: string }[];
};

const contraSearch = (term: string) => `https://contra.com/search?q=${q(term)}`;

export function contraLink(term: string): string {
  return contraSearch(term);
}

/**
 * What Contra is actually good for: the work that fills rooms, not the work
 * that fixes them.
 */
export const CONTRA_CATEGORIES: ContraCategory[] = [
  {
    id: "photography",
    label: "Photography and video",
    blurb: "New listing photos, a room walkthrough and a short reel for social.",
    subcategories: [
      { id: "interiors", label: "Interior photography", term: "interior photographer airbnb" },
      { id: "video", label: "Room walkthrough video", term: "short form property video editor" },
      { id: "retouch", label: "Photo editing and retouching", term: "real estate photo retoucher" },
      { id: "drone", label: "Exterior and drone", term: "drone property photographer" },
    ],
  },
  {
    id: "copy",
    label: "Listing copy and guidebooks",
    blurb: "Listing descriptions that rank, plus a welcome guide guests actually read.",
    subcategories: [
      { id: "listing", label: "Listing descriptions", term: "airbnb listing copywriter" },
      { id: "guidebook", label: "Guest guidebook writing", term: "travel guidebook writer" },
      { id: "translation", label: "Translation", term: "english to french hospitality translator" },
      { id: "seo", label: "SEO and search copy", term: "seo copywriter hospitality" },
    ],
  },
  {
    id: "brand",
    label: "Branding and signage",
    blurb: "A name, a mark and the printed pieces guests see at the door.",
    subcategories: [
      { id: "logo", label: "Logo and identity", term: "logo designer hospitality brand" },
      { id: "print", label: "Door signs and welcome cards", term: "print designer signage" },
      { id: "qr", label: "QR and kiosk artwork", term: "graphic designer qr signage" },
    ],
  },
  {
    id: "web",
    label: "Direct-booking website",
    blurb: "Take bookings without a platform fee.",
    subcategories: [
      { id: "site", label: "Website build", term: "webflow developer booking site" },
      { id: "booking", label: "Booking engine setup", term: "direct booking engine developer" },
      { id: "analytics", label: "Analytics and tracking", term: "ga4 analytics consultant" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing and social",
    blurb: "Fill the quiet midweek nights.",
    subcategories: [
      { id: "social", label: "Social media manager", term: "social media manager travel" },
      { id: "ads", label: "Local ads", term: "google ads freelancer local business" },
      { id: "email", label: "Email and repeat guests", term: "email marketing freelancer" },
    ],
  },
];
