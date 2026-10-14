/**
 * What changed in Latchkey, newest first. Add an entry with every change
 * (see AGENTS.md): "new" items also make up the features log on the About
 * page, so there is one list to keep up to date.
 */

export type ChangeKind = "new" | "improved" | "fixed";

export type ChangeItem = {
  kind: ChangeKind;
  /** Which part of Latchkey: shown as a tag and used to group features. */
  area: "Check-in" | "Guest guide" | "Bookings" | "Calendar" | "Services" | "Team" | "Settings" | "Invoices" | "Guest register" | "Demo" | "Website" | "Security";
  text: string;
};

export type Release = {
  version: string;
  date: string;
  title: string;
  items: ChangeItem[];
};

export const RELEASES: Release[] = [
  {
    version: "0.19",
    date: "2026-10-14",
    title: "Closed nights explain themselves",
    items: [
      { kind: "improved", area: "Bookings", text: "Closed nights show why they're closed (booked on another site, or blocked) instead of asking for a guest name." },
      { kind: "improved", area: "Demo", text: "The demo property is now The Hill Suites in Amersham." },
    ],
  },
  {
    version: "0.18",
    date: "2026-10-13",
    title: "A clearer bookings list and per-night invoices",
    items: [
      { kind: "new", area: "Bookings", text: "Bookings as a table you can sort by any column, with search and show/hide filters for stays, rooms and platforms. Past stays are hidden until you ask for them." },
      { kind: "improved", area: "Bookings", text: "A host-friendly order: staying now, arriving and leaving today, coming up, then past stays." },
      { kind: "new", area: "Invoices", text: "Invoices list each night on its own line with its share of the price, then the total (can be switched off site-wide)." },
      { kind: "fixed", area: "Invoices", text: "An invoice picks up the price as soon as you change it on the booking." },
      { kind: "new", area: "Settings", text: "Latchkey admin sits under Settings for super admins, with all of Latchkey's own settings, and super admins can add more super admins." },
    ],
  },
  {
    version: "0.17",
    date: "2026-10-13",
    title: "Your own Stripe account",
    items: [
      { kind: "new", area: "Settings", text: "Connect your own Stripe account from Settings: we start it with your email and Stripe asks the rest. Guests' card payments go straight to you." },
      { kind: "improved", area: "Security", text: "Latchkey's own Stripe account now only collects subscriptions, never hosts' guest payments." },
    ],
  },
  {
    version: "0.16",
    date: "2026-10-13",
    title: "Subscriptions, support and feedback",
    items: [
      { kind: "new", area: "Settings", text: "Subscription page: add a card during your trial, and Stripe starts the monthly payment the moment it ends. Update your card or cancel at any time." },
      { kind: "new", area: "Settings", text: "Support access: let Latchkey support make changes for 30 days, and stop it whenever you like." },
      { kind: "new", area: "Website", text: "Rate Latchkey, suggest a feature or report a bug from the Feedback button." },
      { kind: "new", area: "Guest guide", text: "Guests can rate their stay; their stars and comments go to their host." },
      { kind: "new", area: "Bookings", text: "What guests said, with the average rating, on Today." },
      { kind: "improved", area: "Security", text: "When a trial or subscription ends, changes and guest check-in stop at once; the guest register and invoices stay readable." },
    ],
  },
  {
    version: "0.15",
    date: "2026-10-13",
    title: "Start a free trial without signing up",
    items: [
      { kind: "new", area: "Website", text: "Start a free trial straight away: tell us your name and email, set up your property and rooms, and save your account by email link when you're ready." },
      { kind: "new", area: "Website", text: "Sign in with an emailed link instead of a password." },
      { kind: "improved", area: "Website", text: "Host and Guest shortcuts show as separate bubbles under the menu; on phones the bottom bar adds Demo and Free trial." },
    ],
  },
  {
    version: "0.14",
    date: "2026-10-13",
    title: "Menus, About page and switching property",
    items: [
      { kind: "new", area: "Website", text: "About page with this change log and a list of every feature." },
      { kind: "new", area: "Website", text: "Host and Guest shortcuts hang off the menu button, and sit along the bottom on phones." },
      { kind: "improved", area: "Website", text: "Hosts and managers who are already signed in go straight to their dashboard." },
      { kind: "new", area: "Settings", text: "Switch property from the menu: hosts pick from their properties, guests enter another property's PIN." },
    ],
  },
  {
    version: "0.13",
    date: "2026-10-13",
    title: "Invoices for direct stays",
    items: [
      { kind: "new", area: "Invoices", text: "Guests on direct bookings can make, download and email an invoice from their guest guide, correcting their email and address first." },
      { kind: "new", area: "Invoices", text: "Hosts can make an invoice on demand or edit any invoice from the guest card." },
      { kind: "new", area: "Settings", text: "Invoice settings: switch invoices on, add your VAT, GST, ABN or other tax number, and choose the number prefix." },
      { kind: "new", area: "Bookings", text: "Record the amount a guest paid on each booking, with or without tax." },
      { kind: "improved", area: "Website", text: "The home page talks about today, whatever day it is." },
    ],
  },
  {
    version: "0.12",
    date: "2026-10-13",
    title: "The Hill Suites demo",
    items: [
      { kind: "improved", area: "Demo", text: "The demo property is now The Hill Suites." },
      { kind: "improved", area: "Demo", text: "The demo's guidance banner follows each check-in step, even when steps are skipped or added." },
    ],
  },
  {
    version: "0.11",
    date: "2026-10-12",
    title: "Friendlier checking in",
    items: [
      { kind: "new", area: "Guest guide", text: "A private guest guide link at the end of checking in, to copy, share or bookmark, with a QR code for another phone." },
      { kind: "new", area: "Check-in", text: "Guests can hand over to their host at any step." },
      { kind: "improved", area: "Check-in", text: "Each step leads with a plain question; the legal detail sits behind \"Why do we ask?\"." },
      { kind: "improved", area: "Check-in", text: "The back camera is used for ID photos and the front camera for face photos." },
      { kind: "improved", area: "Check-in", text: "Guest screens say \"checking in\" and \"guest guide\"." },
    ],
  },
  {
    version: "0.10",
    date: "2026-10-12",
    title: "Calendar in room colours",
    items: [
      { kind: "improved", area: "Calendar", text: "Each stay is one continuous block in its room's colour, so names fit." },
      { kind: "new", area: "Calendar", text: "Hover a short stay for its details on a computer; press and hold on a phone." },
      { kind: "fixed", area: "Bookings", text: "The guest panel refreshes after an edit and closes after a delete." },
    ],
  },
  {
    version: "0.9",
    date: "2026-10-12",
    title: "Guest register and menu layouts",
    items: [
      { kind: "new", area: "Guest register", text: "UK guest register: name and nationality of everyone 16 or over, kept 12 months, ready to show an inspecting officer." },
      { kind: "new", area: "Settings", text: "Drag the menu's edge to show it in full, as icons, or along the top." },
      { kind: "new", area: "Team", text: "Your photo and name next to Sign out, one tap from your profile." },
    ],
  },
  {
    version: "0.8",
    date: "2026-10-12",
    title: "Who's staying and booking sites",
    items: [
      { kind: "new", area: "Check-in", text: "Guests say who's staying; every adult can show photo ID; children give their age only." },
      { kind: "new", area: "Check-in", text: "Optional small ID and face photos, kept 7 to 30 days once you confirm data registration." },
      { kind: "new", area: "Settings", text: "Add your own booking sites with names and icons." },
      { kind: "new", area: "Services", text: "Local tradespeople directory, with links checked to work." },
      { kind: "improved", area: "Check-in", text: "\"Is this your Airbnb booking?\" when the platform question is skipped." },
    ],
  },
  {
    version: "0.7",
    date: "2026-10-11",
    title: "Teams",
    items: [
      { kind: "new", area: "Team", text: "Invite managers and viewers; each sees what their access allows." },
      { kind: "new", area: "Team", text: "Profile cards with photo and name; change your own email." },
      { kind: "new", area: "Team", text: "Activity history of who changed what." },
      { kind: "new", area: "Bookings", text: "Archive, delete and re-sync stays, with a full guest card." },
      { kind: "improved", area: "Check-in", text: "The platform question is skipped when it's not needed; guests can add a missing name." },
      { kind: "fixed", area: "Security", text: "Only owners can add members to a business." },
    ],
  },
  {
    version: "0.6",
    date: "2026-10-10",
    title: "A safer demo",
    items: [
      { kind: "new", area: "Demo", text: "One-tap demo for hosts and guests, with a kiosk lock." },
      { kind: "improved", area: "Security", text: "The shared demo account can look around but not change settings." },
    ],
  },
  {
    version: "0.5",
    date: "2026-10-02",
    title: "Pricing, email and security",
    items: [
      { kind: "new", area: "Website", text: "Pricing and the demo on the home page." },
      { kind: "new", area: "Settings", text: "Latchkey-branded sign-in emails." },
      { kind: "fixed", area: "Security", text: "Fixes from a security review." },
    ],
  },
  {
    version: "0.4",
    date: "2026-09-29",
    title: "Guest guides, extras and payments",
    items: [
      { kind: "new", area: "Check-in", text: "Guests check themselves in by surname initial and check-out day, with a touch PIN pad and QR card." },
      { kind: "new", area: "Guest guide", text: "Step-by-step guest guides with photos, per room or for the whole house." },
      { kind: "new", area: "Guest guide", text: "Extras and a price list guests can order and pay for by card." },
      { kind: "new", area: "Guest guide", text: "Messages between guest and host." },
      { kind: "new", area: "Services", text: "Guest requests and maintenance in one inbox." },
    ],
  },
  {
    version: "0.3",
    date: "2026-09-28",
    title: "All your bookings in one place",
    items: [
      { kind: "new", area: "Bookings", text: "Calendar links from Airbnb, Booking.com, Homestay.com and more, in one list." },
      { kind: "new", area: "Bookings", text: "The same stay on several sites is recognised as one, with blocked nights shown separately." },
      { kind: "new", area: "Website", text: "Home page." },
    ],
  },
];

export type Feature = ChangeItem & { version: string; date: string };

/** Every feature, grouped by area, oldest first within each area. */
export function featuresByArea(releases: Release[] = RELEASES): Array<{ area: ChangeItem["area"]; features: Feature[] }> {
  const map = new Map<ChangeItem["area"], Feature[]>();
  for (const r of [...releases].reverse()) {
    for (const i of r.items) {
      if (i.kind !== "new") continue;
      const list = map.get(i.area) ?? [];
      list.push({ ...i, version: r.version, date: r.date });
      map.set(i.area, list);
    }
  }
  return [...map.entries()].map(([area, features]) => ({ area, features }));
}
