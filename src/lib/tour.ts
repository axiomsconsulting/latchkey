/**
 * The guided tour of the host dashboard: journeys through what a host does
 * (a guest arriving, setting up self check-in, the stay guide, housekeeping…),
 * each a list of steps that point at a part of the page, say what it is,
 * and either wait for a click there or ask the guest to look. Quick journeys
 * keep only the steps marked `quick`.
 *
 * Steps never point at demo data, only at parts of the page that are always
 * there (named with data-tour, the menu, Today's cards, Settings' sections),
 * so they keep working as the demo's stays change. tests/tour.test.ts checks
 * every target still exists in the code, so the tour fails a test rather
 * than falling out of date. Progress is kept per browser (the demo is one
 * shared account). Pure.
 */

export type TourTarget = string;

export type TourStep = {
  id: string;
  /** The page the step happens on. */
  page: string;
  /** Search on that page (a Settings tab, the Properties Extras tab). */
  search?: Record<string, string>;
  /**
   * What to point at: "nav:<menu id>", "today:<card id>", "settings:<section id>",
   * "settings-tab:<group>", or a data-tour name. None: a note in the middle.
   */
  target?: TourTarget;
  title: string;
  body: string;
  /** "click": wait for a click on the target (Next works too); "look": just Next. */
  action: "click" | "look";
  /** Other parts to outline while looking. */
  related?: TourTarget[];
  /** Kept in the quick version. */
  quick?: boolean;
};

export type Journey = { id: string; title: string; blurb: string; icon: string; steps: TourStep[] };
export type TourMode = "quick" | "full";

export const JOURNEYS: Journey[] = [
  {
    id: "today",
    title: "Your day at a glance",
    blurb: "Who's arriving, staying and leaving, what's waiting on you, and where everything lives.",
    icon: "layout-dashboard",
    steps: [
      { id: "guests", page: "/app/today", target: "today:guests", action: "look", quick: true, title: "Today's guests", body: "Everyone arriving, staying and leaving today, from every booking site, in one place. Tap a group to see the list on Bookings." },
      { id: "messages", page: "/app/today", target: "today:messages", action: "look", quick: true, title: "Guest messages", body: "Conversations waiting on a reply, newest first. Each opens the thread in your inbox." },
      { id: "requests", page: "/app/today", target: "today:requests", action: "look", title: "Waiting on you", body: "Requests guests made from their stay guide (towels, a late check-out, breakfast) and anything that needs approving." },
      { id: "cleaning", page: "/app/today", target: "today:cleaning", action: "look", title: "Cleaning today", body: "Rooms to turn round and when they must be ready by. The full board is on Housekeeping." },
      { id: "kiosk", page: "/app/today", target: "today:kiosk", action: "look", title: "Your door tablet", body: "The check-in screen for your front door: open it, and choose what it shows when nobody's using it." },
      { id: "settings", page: "/app/today", target: "today:settings", action: "look", quick: true, title: "Useful settings", body: "Shortcuts to the settings you'll change most, grouped by what they're about." },
      { id: "search", page: "/app/today", target: "search", action: "look", title: "Search anything", body: "Find a guest, a booking, a setting or a feature from anywhere. Ctrl or ⌘ K opens it too." },
      { id: "inbox", page: "/app/today", target: "inbox", action: "look", quick: true, title: "Your inbox", body: "Every guest message, from the stay guide and the booking sites you forward, in one place." },
      { id: "cards", page: "/app/today", action: "look", title: "Make Today yours", body: "Drag any card by the bar on its top edge to move it, tap the bar to fold it, and use the arrows button to make it full width or one column." },
    ],
  },
  {
    id: "arrival",
    title: "A guest arrives",
    blurb: "From the booking to the guest's own guide and a welcome on the door tablet.",
    icon: "door-open",
    steps: [
      { id: "go", page: "/app/today", target: "nav:bookings", action: "click", quick: true, title: "Open Bookings", body: "Every stay from every site is here. Click Bookings in the menu." },
      { id: "views", page: "/app/bookings", target: "bookings-view", action: "look", quick: true, title: "A list or a timeline", body: "See every stay as a list grouped by what's happening now (here, arriving, leaving, upcoming), or as a timeline with each room a row and each stay a bar." },
      { id: "main", page: "/app/bookings", target: "bookings-main", action: "look", title: "Your stays", body: "Sort any column or zoom the timeline from a day to a month. Filters for rooms and sites remember your choice." },
      { id: "row", page: "/app/bookings", target: "booking-row", action: "click", quick: true, title: "Open a guest", body: "Click a guest's name to open their card." },
      { id: "guide", page: "/app/bookings", target: "guest-guide-link", action: "look", quick: true, title: "Their own stay guide", body: "Copy the guest's private guide link and send it however you like: their times, Wi-Fi, how things work, extras and messages." },
      { id: "welcome", page: "/app/bookings", target: "guest-kiosk-welcome", action: "look", title: "A welcome on the door tablet", body: "Put a personal welcome on your door tablet for this guest's arrival." },
      { id: "add", page: "/app/bookings", target: "bookings-add", action: "look", title: "Adding a stay yourself", body: "Phone and direct bookings go in here. Stays from Airbnb, Booking.com and the rest arrive from their calendars." },
    ],
  },
  {
    id: "checkin",
    title: "Self check-in",
    blurb: "How guests check themselves in, what you ask for, and the door tablet.",
    icon: "key-round",
    steps: [
      { id: "go", page: "/app/today", target: "nav:settings", action: "click", quick: true, title: "Open Settings", body: "Click Settings in the menu." },
      { id: "tab", page: "/app/settings", target: "settings-tab:checkin", action: "click", quick: true, title: "Check-in and records", body: "Everything about checking guests in has its own tab. Click it." },
      { id: "methods", page: "/app/settings", search: { focus: "checkin" }, target: "settings:checkin", action: "look", quick: true, title: "How guests check in", body: "The door tablet, the guest's own phone from a QR code, or the property PIN, and which checks guests go through." },
      { id: "records", page: "/app/settings", search: { focus: "records" }, target: "settings:records", action: "look", title: "Who's staying and ID", body: "Ask for every adult and child, check each adult's photo ID, and choose how long copies are kept." },
      { id: "rooms", page: "/app/settings", search: { focus: "stayAccess" }, target: "settings:stayAccess", action: "look", title: "Room QR codes and Wi-Fi", body: "Let the QR code in each room open the guest's own guide, and choose how they get on the Wi-Fi." },
      { id: "kiosk", page: "/app/today", target: "today:kiosk", action: "look", quick: true, title: "Open your door tablet", body: "From Today, open the check-in screen on the tablet by your front door. Guests tap it to check in, any hour." },
    ],
  },
  {
    id: "guide",
    title: "The stay guide",
    blurb: "Write how your place works once, for every guest and every room.",
    icon: "book-open",
    steps: [
      { id: "go", page: "/app/today", target: "nav:guides", action: "click", quick: true, title: "Open Stay guides", body: "Click Stay guides in the menu." },
      { id: "sections", page: "/app/guides", target: "guides-sections", action: "look", quick: true, title: "The guide's sections", body: "Getting in, your room, Wi-Fi, house rules, check-out and your own sections. Drag to reorder, pin the important ones to \"Good to know\"." },
      { id: "tiles", page: "/app/guides", target: "guide-tiles", action: "look", title: "Quick tiles", body: "The buttons at the top of every guest's guide: Wi-Fi, extras, messages or your own content." },
      { id: "qr", page: "/app/guides", target: "guides-room-qr", action: "look", quick: true, title: "QR codes for each room", body: "Print a card for each room, with three easy words. Guests scan it for the room's guide, or their own stay." },
    ],
  },
  {
    id: "housekeeping",
    title: "Housekeeping",
    blurb: "Turnovers, who's cleaning what, and rooms ready on time.",
    icon: "spray-can",
    steps: [
      { id: "go", page: "/app/today", target: "nav:housekeeping", action: "click", quick: true, title: "Open Housekeeping", body: "Click Housekeeping in the menu." },
      { id: "board", page: "/app/housekeeping", target: "housekeeping-timeline", action: "look", quick: true, title: "The cleaning board", body: "Each room's turnovers on the timeline: when the guest leaves and when the room must be ready. Click one to set its state or who's on it." },
      { id: "schedule", page: "/app/housekeeping", target: "housekeeping-schedule", action: "look", quick: true, title: "Cleaning times", body: "Weekly and one-off times rooms or the house are closed for cleaning; guests see them in their guide." },
    ],
  },
  {
    id: "extras",
    title: "Extras, early check-in and payments",
    blurb: "What guests can add to their stay, and how you get paid.",
    icon: "shopping-basket",
    steps: [
      { id: "go", page: "/app/today", target: "nav:properties", action: "click", quick: true, title: "Open Properties", body: "Click Properties in the menu." },
      { id: "tab", page: "/app/properties", target: "properties-extras-tab", action: "click", quick: true, title: "The Extras tab", body: "Everything guests can add to their stay. Click Extras." },
      { id: "times", page: "/app/properties", search: { tab: "extras" }, target: "property-times", action: "look", quick: true, title: "Early check-in and late check-out", body: "Sold in blocks of hours at your price, never closer than your buffer to the next guest." },
      { id: "list", page: "/app/properties", search: { tab: "extras" }, target: "extras-price-list", action: "look", title: "Your price list", body: "Towels, luggage storage, breakfast and anything else, free or paid, approved by you or straight away." },
      { id: "pay", page: "/app/settings", search: { focus: "payments" }, target: "settings:payments", action: "look", quick: true, title: "Getting paid", body: "Guests pay by card straight into your own Stripe account. Bank details and tax are on the same tab." },
    ],
  },
  {
    id: "direct",
    title: "Direct bookings",
    blurb: "Your own booking page, rates and offers, and guests coming back to you.",
    icon: "calendar-heart",
    steps: [
      { id: "go", page: "/app/today", target: "nav:direct", action: "click", quick: true, title: "Open Direct stays", body: "Click Direct stays in the menu." },
      { id: "page", page: "/app/direct", target: "direct-page-link", action: "look", quick: true, title: "Your booking page", body: "Share this link anywhere: guests see your rooms, prices and offers, and book with you directly." },
      { id: "tabs", page: "/app/direct", target: "direct-tabs", action: "look", title: "Bookings, enquiries and past guests", body: "What came in from your page, and the past guests who'd like to hear from you." },
      { id: "rates", page: "/app/direct", target: "direct-rates", action: "look", title: "Rates and offers", body: "Each room's nightly rate and seasonal offers, shown to guests with the saving." },
      { id: "book", page: "/app/direct", target: "direct-booking-settings", action: "look", quick: true, title: "Book and pay here", body: "Let guests book a free room straight away, refundable or non-refundable, and choose how they pay." },
    ],
  },
  {
    id: "services",
    title: "Requests and repairs",
    blurb: "Guest requests, jobs and local tradespeople in one place.",
    icon: "wrench",
    steps: [
      { id: "go", page: "/app/today", target: "nav:services", action: "click", quick: true, title: "Open Requests", body: "Click the requests and repairs page in the menu." },
      { id: "tabs", page: "/app/services", target: "services-tabs", action: "look", quick: true, title: "Inbox, planned work and trades", body: "Guest requests and your own jobs share one inbox; planned work and local tradespeople have their own tabs." },
      { id: "new", page: "/app/services", target: "services-new", action: "look", title: "Log a job", body: "Note a repair or a task yourself, and send it to a tradesperson when you're ready." },
    ],
  },
  {
    id: "calendars",
    title: "Booking site calendars",
    blurb: "Bring every site's bookings in, and keep them from double-booking.",
    icon: "calendar-sync",
    steps: [
      { id: "go", page: "/app/today", target: "nav:connections", action: "click", quick: true, title: "Open Connections", body: "Click Connections in the menu." },
      { id: "add", page: "/app/connections", target: "connections-add", action: "look", quick: true, title: "Add a calendar link", body: "Paste each booking site's calendar link for a room; stays then arrive by themselves." },
      { id: "feeds", page: "/app/connections", target: "connections-room-feeds", action: "look", title: "Share your rooms' calendars", body: "Give each booking site your rooms' Latchkey calendars too, so a direct or manual booking blocks those nights there." },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    blurb: "Occupancy, arrivals, requests and how fast you reply.",
    icon: "chart-line",
    steps: [
      { id: "go", page: "/app/today", target: "nav:reports", action: "click", quick: true, title: "Open Reports", body: "Click Reports in the menu." },
      { id: "range", page: "/app/reports", target: "reports-range", action: "look", quick: true, title: "Pick a period", body: "This month, last month or your own dates; every figure follows." },
      { id: "download", page: "/app/reports", target: "reports-download", action: "look", title: "Take it with you", body: "Download the figures as a spreadsheet." },
    ],
  },
];

/** The steps for a journey in the chosen mode (quick keeps the steps marked quick). */
export function stepsFor(j: Journey, mode: TourMode): TourStep[] {
  if (mode === "full") return j.steps;
  const quick = j.steps.filter((s) => s.quick);
  return quick.length ? quick : j.steps.slice(0, 3);
}

/** The CSS selector for a target, or null for a note in the middle of the screen. */
export function selectorFor(target: TourTarget | undefined): string | null {
  if (!target) return null;
  const [kind, id] = target.includes(":") ? (target.split(":", 2) as [string, string]) : ["", target];
  if (kind === "nav") return `[data-tour="nav-${id}"]`;
  if (kind === "today") return `#today-${id}`;
  if (kind === "settings") return `#settings-${id}, #section-${id}`;
  if (kind === "settings-tab") return `[data-tour="settings-tab-${id}"]`;
  return `[data-tour="${target}"]`;
}

export type TourProgress = {
  mode: TourMode;
  /** Per journey: the next step to show (in the mode it was started in) and whether it's been finished. */
  journeys: Record<string, { at: number; done: boolean; mode: TourMode }>;
  /** The journey under way, if any. */
  active: string | null;
  /** The picker has been offered automatically once. */
  offered: boolean;
};

export const EMPTY_PROGRESS: TourProgress = { mode: "quick", journeys: {}, active: null, offered: false };

/** Saved progress → something safe: unknown journeys dropped, steps kept in range. */
export function readProgress(raw: unknown): TourProgress {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: TourProgress = { mode: r["mode"] === "full" ? "full" : "quick", journeys: {}, active: null, offered: r["offered"] === true };
  const js = (r["journeys"] && typeof r["journeys"] === "object" ? r["journeys"] : {}) as Record<string, unknown>;
  for (const j of JOURNEYS) {
    const v = js[j.id] as { at?: unknown; done?: unknown; mode?: unknown } | undefined;
    if (!v || typeof v !== "object") continue;
    const mode: TourMode = v.mode === "full" ? "full" : "quick";
    const max = stepsFor(j, mode).length;
    const at = typeof v.at === "number" && Number.isFinite(v.at) ? Math.min(Math.max(0, Math.floor(v.at)), max - 1) : 0;
    out.journeys[j.id] = { at, done: v.done === true, mode };
  }
  out.active = typeof r["active"] === "string" && JOURNEYS.some((j) => j.id === r["active"]) ? (r["active"] as string) : null;
  return out;
}

/** Start (or pick up) a journey: where it stopped, unless it was finished or the mode changed. */
export function startJourney(p: TourProgress, id: string, mode: TourMode): TourProgress {
  const prev = p.journeys[id];
  const resume = prev && !prev.done && prev.mode === mode ? prev.at : 0;
  return { ...p, mode, active: id, journeys: { ...p.journeys, [id]: { at: resume, done: prev?.done ?? false, mode } } };
}

/** Move within the active journey; past the last step it's finished. */
export function moveStep(p: TourProgress, by: 1 | -1): TourProgress {
  if (!p.active) return p;
  const j = JOURNEYS.find((x) => x.id === p.active);
  const cur = p.journeys[p.active];
  if (!j || !cur) return p;
  const n = stepsFor(j, cur.mode).length;
  const at = cur.at + by;
  if (at >= n) return { ...p, active: null, journeys: { ...p.journeys, [j.id]: { at: 0, done: true, mode: cur.mode } } };
  return { ...p, journeys: { ...p.journeys, [j.id]: { ...cur, at: Math.max(0, at) } } };
}

/** How many journeys are finished, of how many. */
export function coverage(p: TourProgress): { done: number; total: number } {
  return { done: JOURNEYS.filter((j) => p.journeys[j.id]?.done).length, total: JOURNEYS.length };
}

/** The next journey to suggest: the first not finished. */
export function nextJourney(p: TourProgress): Journey | null {
  return JOURNEYS.find((j) => !p.journeys[j.id]?.done) ?? null;
}
