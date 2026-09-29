/**
 * Finding a trade for property work.
 *
 * Contra is a marketplace for creative, tech and marketing freelancers, so it
 * has no plumbers, electricians or cleaners. Property jobs go to the UK trade
 * directories below: Latchkey builds a pre-filled search link for the job's
 * category and the property's postcode, so the host lands on real, reviewed
 * local firms instead of invented ones.
 */

export type Directory = {
  id: "checkatrade" | "mybuilder" | "rated_people" | "bark" | "trustatrader" | "google_maps";
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
    id: "google_maps",
    name: "Google Maps",
    blurb: "Nearest firms with opening hours and phone numbers, handy late at night.",
    note: "Free to search. Copying listings into Latchkey is not allowed, so it opens in a new tab.",
    search: (t, p) => `https://www.google.com/maps/search/${q(`${t} near ${p}`)}`,
  },
];

export function directoryLinks(category: string, postcode: string) {
  const term = tradeTerm(category);
  return DIRECTORIES.map((d) => ({ ...d, url: d.search(term, postcode || "High Wycombe") }));
}

/** Contra still fits these: creative and marketing work for the listing itself. */
export const CONTRA_USES = [
  { id: "photography", label: "Listing photography and editing" },
  { id: "copy", label: "Listing copy and guidebook writing" },
  { id: "brand", label: "Logo, signage and welcome-card design" },
  { id: "web", label: "Direct-booking website and landing pages" },
  { id: "marketing", label: "Social posts and local ads" },
];
