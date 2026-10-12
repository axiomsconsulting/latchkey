/**
 * Finding local tradespeople for property work.
 *
 * Latchkey points the host at the directories where trades in their country
 * are vetted and reviewed, already narrowed to the job and the property's
 * area. Most of these sites have no search link that takes free words and a
 * postcode (some only have per-city pages, others block anything but a
 * browser), so each card opens a web search limited to that site, which
 * always works and always includes the area, plus a link to the site itself.
 *
 * None of the directories publish an API, and their terms forbid automated
 * extraction of member listings, so Latchkey links out rather than copying.
 */

import { region as regionFor } from "./regions";


export type Directory = {
  id: string;
  name: string;
  blurb: string;
  /** How the host is charged or contacted. */
  note: string;
  /** The site's own page to browse or post a job (checked to load). */
  site: string;
  search: (term: string, area: string) => string;
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

/** A web search limited to one directory, for the job near the area. */
const onSite = (domain: string) => (term: string, area: string) =>
  `https://www.google.com/search?q=${q(`${term} ${area} site:${domain}`)}`;

export const DIRECTORIES: Directory[] = [
  {
    id: "checkatrade",
    name: "Checkatrade",
    blurb: "Vetted trades with verified reviews. Strongest for gas, electrics and emergencies.",
    note: "Free to search. Members are background-checked.",
    site: "https://www.checkatrade.com/",
    search: onSite("checkatrade.com"),
  },
  {
    id: "mybuilder",
    name: "MyBuilder",
    blurb: "Post the job, get quotes back from local tradespeople within hours.",
    note: "Free to post. Good for small repairs and one-off jobs.",
    site: "https://www.mybuilder.com/",
    search: onSite("mybuilder.com"),
  },
  {
    id: "rated_people",
    name: "Rated People",
    blurb: "Up to three quotes per job, with ratings from previous customers.",
    note: "Free to post a job.",
    site: "https://www.ratedpeople.com/post-a-job",
    search: onSite("ratedpeople.com"),
  },
  {
    id: "bark",
    name: "Bark",
    blurb: "Broadest coverage, including cleaners, laundry, drivers and one-off help.",
    note: "Free to post; sellers pay to reply, so expect quick contact.",
    site: "https://www.bark.com/en/gb/",
    search: onSite("bark.com"),
  },
  {
    id: "trustatrader",
    name: "TrustATrader",
    blurb: "Smaller, well-reviewed independents. Useful as a second opinion on price.",
    note: "Free to search.",
    site: "https://www.trustatrader.com/",
    search: (t, p) => `https://www.trustatrader.com/search?trade=${q(t)}&location=${q(p)}`,
  },
  {
    id: "angi",
    name: "Angi",
    blurb: "Large US network of reviewed home-service pros.",
    note: "Free to search and request quotes.",
    site: "https://www.angi.com/",
    search: onSite("angi.com"),
  },
  {
    id: "thumbtack",
    name: "Thumbtack",
    blurb: "Quick quotes from local US pros, good for cleaning and handyman work.",
    note: "Free to request quotes.",
    site: "https://www.thumbtack.com/",
    search: (t, p) => `https://www.thumbtack.com/search?query=${q(t)}&zip_code=${q(p)}`,
  },
  {
    id: "yelp",
    name: "Yelp",
    blurb: "Reviews and phone numbers for nearby businesses across the US and Canada.",
    note: "Free to search.",
    site: "https://www.yelp.com/",
    search: (t, p) => `https://www.yelp.com/search?find_desc=${q(t)}&find_loc=${q(p)}`,
  },
  {
    id: "homestars",
    name: "HomeStars",
    blurb: "Canada's reviewed home-improvement and repair directory.",
    note: "Free to search.",
    site: "https://www.homestars.com/",
    search: onSite("homestars.com"),
  },
  {
    id: "hipages",
    name: "hipages",
    blurb: "Australia's largest tradie marketplace, with quick job posting.",
    note: "Free to post a job.",
    site: "https://hipages.com.au/",
    search: onSite("hipages.com.au"),
  },
  {
    id: "airtasker",
    name: "Airtasker",
    blurb: "Good for one-off Australian jobs: cleaning, moving, small repairs.",
    note: "Free to post; taskers bid.",
    site: "https://www.airtasker.com/",
    search: (t, p) => `https://www.airtasker.com/tasks/?q=${q(t)}&location=${q(p)}`,
  },
  {
    id: "builderscrack",
    name: "Builders Crack",
    blurb: "New Zealand trade marketplace covering repairs and maintenance.",
    note: "Free to post a job.",
    site: "https://builderscrack.co.nz/",
    search: onSite("builderscrack.co.nz"),
  },
  {
    id: "google_maps",
    name: "Google Maps",
    blurb: "Nearest firms with opening hours and phone numbers, handy late at night.",
    note: "Free to search. Copying listings into Latchkey is not allowed, so it opens in a new tab.",
    site: "https://www.google.com/maps",
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
