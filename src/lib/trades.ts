/**
 * Finding local tradespeople for property work.
 *
 * One search that reliably works everywhere: Google Maps, with the job and
 * the property's area, showing the nearest firms with hours, reviews and
 * phone numbers. Alongside it, a short researched list per country of the
 * sites people there use, with what each is best for, linking to the site
 * itself. (Site searches on most directories don't take free words and an
 * area, so Latchkey no longer pretends they do.)
 *
 * None of these sites publish an API, and their terms forbid automated
 * extraction of listings, so Latchkey links out rather than copying.
 */

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

/** Google Maps, searching for the job near the area. */
export function mapsSearch(term: string, area: string): string {
  return `https://www.google.com/maps/search/${q(`${term} near ${area}`)}`;
}

/** The Maps search for a service category (used by suggested trades too). */
export function mapsLink(category: string, area: string) {
  return { name: "Google Maps", url: mapsSearch(tradeTerm(category), area.trim() || "me") };
}

export type LocalSite = {
  id: string;
  name: string;
  /** Who it's best for, in a few words. */
  bestFor: string;
  /** The site's own page (home, or its find-a-pro page). */
  url: string;
  /** An official register: check anyone doing this work is on it. */
  official?: boolean;
};

/**
 * Researched October 2026: the sites people in each country use to find and
 * check tradespeople, with what each is best for. Official registers come
 * first where the law requires registration (gas, electrics).
 */
export const LOCAL_SITES: Record<string, LocalSite[]> = {
  GB: [
    {
      id: "gas_safe",
      name: "Gas Safe Register",
      bestFor: "Check any gas or boiler engineer is registered (the law requires it)",
      url: "https://www.gassaferegister.co.uk/",
      official: true,
    },
    {
      id: "niceic",
      name: "NICEIC",
      bestFor: "Find or check a certified electrician",
      url: "https://niceic.com/find-a-tradesperson/",
      official: true,
    },
    {
      id: "checkatrade",
      name: "Checkatrade",
      bestFor: "Vetted trades with verified reviews; good for emergencies",
      url: "https://www.checkatrade.com/",
    },
    {
      id: "which",
      name: "Which? Trusted Traders",
      bestFor: "Traders assessed by Which?; the most careful choice",
      url: "https://trustedtraders.which.co.uk/",
    },
    {
      id: "mybuilder",
      name: "MyBuilder",
      bestFor: "Post a job and get quotes, from small repairs to building work",
      url: "https://www.mybuilder.com/",
    },
    {
      id: "rated_people",
      name: "Rated People",
      bestFor: "Up to three quotes per job, with past customers' ratings",
      url: "https://www.ratedpeople.com/",
    },
    {
      id: "trustatrader",
      name: "TrustATrader",
      bestFor: "Well-reviewed local independents; a second price",
      url: "https://www.trustatrader.com/",
    },
    {
      id: "taskrabbit",
      name: "Taskrabbit",
      bestFor: "Quick small jobs: furniture, hanging, odd jobs",
      url: "https://www.taskrabbit.co.uk/",
    },
    {
      id: "bark",
      name: "Bark",
      bestFor: "Cleaners, laundry and services the trade sites don't cover",
      url: "https://www.bark.com/en/gb/",
    },
  ],
  IE: [
    {
      id: "rgi",
      name: "Register of Gas Installers (RGI)",
      bestFor: "Check any gas installer is registered (the law requires it)",
      url: "https://www.rgi.ie/",
      official: true,
    },
    {
      id: "safe_electric",
      name: "Safe Electric",
      bestFor: "Find a registered electrical contractor",
      url: "https://www.safeelectric.ie/",
      official: true,
    },
    {
      id: "goldenpages",
      name: "Golden Pages",
      bestFor: "Ireland's business directory, by trade and county",
      url: "https://www.goldenpages.ie/",
    },
    {
      id: "bark_ie",
      name: "Bark",
      bestFor: "Quotes for cleaners, handymen and one-off help",
      url: "https://www.bark.com/en/ie/",
    },
  ],
  US: [
    {
      id: "angi",
      name: "Angi",
      bestFor: "Reviewed pros in every trade; bigger repairs and projects",
      url: "https://www.angi.com/",
    },
    {
      id: "thumbtack",
      name: "Thumbtack",
      bestFor: "Compare several quotes: cleaning, painting, handyman",
      url: "https://www.thumbtack.com/",
    },
    {
      id: "taskrabbit_us",
      name: "Taskrabbit",
      bestFor: "Quick, clearly defined small jobs, often same day",
      url: "https://www.taskrabbit.com/",
    },
    {
      id: "yelp",
      name: "Yelp",
      bestFor: "Local reviews and phone numbers for nearby firms",
      url: "https://www.yelp.com/",
    },
    {
      id: "nextdoor",
      name: "Nextdoor",
      bestFor: "Neighbours' recommendations for trusted local trades",
      url: "https://nextdoor.com/",
    },
  ],
  CA: [
    {
      id: "homestars",
      name: "HomeStars",
      bestFor: "Canada's reviewed contractors; post a project for replies",
      url: "https://homestars.com/",
    },
    {
      id: "trustedpros",
      name: "TrustedPros",
      bestFor: "Reviewed Canadian trades; a second set of quotes",
      url: "https://trustedpros.ca/",
    },
    {
      id: "taskrabbit_ca",
      name: "Taskrabbit",
      bestFor: "Quick small jobs in larger Canadian cities",
      url: "https://www.taskrabbit.ca/",
    },
    {
      id: "yelp_ca",
      name: "Yelp",
      bestFor: "Local reviews and phone numbers",
      url: "https://www.yelp.ca/",
    },
  ],
  AU: [
    {
      id: "hipages",
      name: "hipages",
      bestFor: "Licensed tradies for plumbing, electrics and repairs",
      url: "https://hipages.com.au/",
    },
    {
      id: "airtasker",
      name: "Airtasker",
      bestFor: "Small defined jobs: cleaning, moving, assembly",
      url: "https://www.airtasker.com/",
    },
    {
      id: "serviceseeking",
      name: "ServiceSeeking",
      bestFor: "Free quotes from local businesses across trades",
      url: "https://www.serviceseeking.com.au/",
    },
  ],
  NZ: [
    {
      id: "builderscrack",
      name: "Builderscrack",
      bestFor: "New Zealand's largest trade marketplace, with reviews",
      url: "https://builderscrack.co.nz/",
    },
    {
      id: "nocowboys",
      name: "NoCowboys",
      bestFor: "Kiwi ratings of trades from past customers",
      url: "https://nocowboys.co.nz/",
    },
    {
      id: "trademe",
      name: "Trade Me Services",
      bestFor: "Local services listed by area",
      url: "https://www.trademe.co.nz/a/services",
    },
  ],
};

/** The sites for a country, or a short international list for anywhere else. */
export function localSites(country: string | null | undefined): LocalSite[] {
  return (
    LOCAL_SITES[(country ?? "GB").toUpperCase()] ?? [
      {
        id: "bark_any",
        name: "Bark",
        bestFor: "Quotes from local services in many countries",
        url: "https://www.bark.com/",
      },
      {
        id: "taskrabbit_any",
        name: "Taskrabbit",
        bestFor: "Quick small jobs where it operates",
        url: "https://www.taskrabbit.com/",
      },
    ]
  );
}
