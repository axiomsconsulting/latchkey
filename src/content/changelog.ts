import { branded } from "@/lib/brand";

/**
 * What changed in Latchkey, newest first. Add an entry with every change
 * (see AGENTS.md): "new" items also make up the features log on the About
 * page, so there is one list to keep up to date.
 *
 * Versions are major.minor.fix: bump the first for a big change in how
 * Latchkey works, the second for new features or improvements, the last
 * for fixes only. Hosts see each release once in a "What's new" pop-up and
 * always on the What's new page; items marked admin are for super admins only.
 */

export type ChangeKind = "new" | "improved" | "fixed";

export type ChangeItem = {
  /** Only for Latchkey's super admins (their own tools); hosts never see it. */
  admin?: true;
  kind: ChangeKind;
  /** Which part of Latchkey: shown as a tag and used to group features. */
  area: "Check-in" | "Guest guide" | "Bookings" | "Housekeeping" | "Reports" | "Calendar" | "Services" | "Team" | "Settings" | "Invoices" | "Guest register" | "Demo" | "Website" | "Security";
  text: string;
};

export type Release = {
  version: string;
  date: string;
  title: string;
  items: ChangeItem[];
};

// Read through the white label (src/lib/brand.ts), so release notes carry the product's own name.
export const RELEASES: Release[] = branded([
  {
    version: "0.52.1",
    date: "2026-10-21",
    title: "Home page fix",
    items: [
      { kind: "fixed", area: "Website", text: "The home page's “On the way” list no longer shows the housekeeping board, reports and direct stays, which are all available now." },
    ],
  },
  {
    version: "0.52.0",
    date: "2026-10-21",
    title: "Repeat direct stays",
    items: [
      { kind: "new", area: "Bookings", text: "Direct stays: your own enquiry page for each property, where past guests (or anyone) ask about dates. You reply from your own email and can turn an enquiry into a direct stay in one tap. Guests who've stayed before are marked as returning." },
      { kind: "new", area: "Guest guide", text: "“Stay with us again” on the guest guide: guests can ask about future dates, or tick a box to hear from you about future stays. Their exact words and the date are kept, and every email you send from Latchkey includes their link to stop. Nothing is sent automatically." },
    ],
  },
  {
    version: "0.51.0",
    date: "2026-10-21",
    title: "Operations reports",
    items: [
      { kind: "new", area: "Reports", text: "Reports, built from every stay whichever site it came from: occupancy night by night, arrivals and departures, how many guests checked in, rooms ready on arrival, nights by booking site, how fast guests get a reply, guest requests, maintenance and extras paid. Pick a property or all of them and any period, and download the days as a spreadsheet." },
    ],
  },
  {
    version: "0.50.0",
    date: "2026-10-21",
    title: "Housekeeping board",
    items: [
      { kind: "new", area: "Housekeeping", text: "Housekeeping board: every room for the day, whether it's a turnover, a departure, an arrival or staying, what time it must be ready by, and where cleaning has got to (to clean, cleaning, clean, ready). Assign it to someone, leave a note, or take a room out of service. Rooms with someone arriving that aren't ready stand out." },
      { kind: "improved", area: "Team", text: "Cleaners on your team can update the housekeeping board, and nothing else." },
      { kind: "improved", area: "Settings", text: "On phones, menu items that don't fit in the bottom bar are in the ⋯ menu; Settings always stays in the bar." },
    ],
  },
  {
    version: "0.49.1",
    date: "2026-10-21",
    title: "A clearer home page",
    items: [
      { kind: "improved", area: "Website", text: "The home page now explains what Latchkey is for: hotel-grade guest operations for independent accommodation, working alongside your booking sites. It shows the guest journey, what Latchkey does and doesn't replace, and lets you try the guest or host side straight away." },
      { admin: true, kind: "improved", area: "Website", text: "Sections added to a page in a later release now appear next to their neighbours, even where a page layout was saved before." },
    ],
  },
  {
    version: "0.49.0",
    date: "2026-10-20",
    title: "Search everything, and a quicker Settings",
    items: [
      { kind: "new", area: "Settings", text: "Search from the top of every dashboard page (or press Ctrl K / ⌘K): guests and bookings, rooms, your guide, extras, jobs, tradespeople, calendar links, pages, settings, features and logos. Only your own business's data shows, and nothing you've removed or hidden." },
      { kind: "improved", area: "Settings", text: "Settings is grouped into Business, Guests, Money, Look, Alerts and apps, with a see-through list of sections that slides in at the side while you scroll, so you can jump to any of them." },
      { kind: "fixed", area: "Guest guide", text: "Your logo and name now show on the guest guide's cover photo, not only when there's no photo." },
    ],
  },
  {
    version: "0.48.0",
    date: "2026-10-20",
    title: "Your own quick tiles, room photos and privacy choices",
    items: [
      { kind: "new", area: "Guest guide", text: "Choose up to 8 quick tiles at the top of your guest and room guides (Stay guides → Quick tiles): sections, Wi-Fi, extras, messages, stay times, check-in, or your own text, web page, photo or PDF, which opens inside the guide. They share the full width of a phone screen." },
      { kind: "new", area: "Guest guide", text: "Give each room's guide its own cover photo; rooms without one use the property's cover." },
      { kind: "new", area: "Settings", text: "Privacy and retention: choose how long guests' details (30 days to 1 year) and messages are kept after check-out, and see what else is kept and for how long." },
      { kind: "improved", area: "Settings", text: "Demo / live switches are now set by Latchkey's team. You can still remove sample data from your account." },
      { admin: true, kind: "new", area: "Settings", text: "Demo / live switches and loading sample data are super admin only (Settings while viewing a business); the database refuses other changes to the switches." },
    ],
  },
  {
    version: "0.47.0",
    date: "2026-10-20",
    title: "Logos to choose from",
    items: [
      { kind: "new", area: "Settings", text: "Three Latchkey marks join the logo collection in Look and feel (antique key, doorway and keyhole, serif L), drawn in your colours, plus “Site logo”, which is used until you pick your own." },
      { kind: "improved", area: "Website", text: "The website menu has an icon beside every item." },
      { admin: true, kind: "new", area: "Website", text: "Latchkey admin → Brand: choose the site logo (one of the three marks, the name's first letter, or an upload). The header, sign-in, browser tab, installed app icon and “Powered by” follow it." },
    ],
  },
  {
    version: "0.46.0",
    date: "2026-10-20",
    title: "A new logo",
    items: [
      { kind: "new", area: "Website", text: "Latchkey has a logo: an antique key in forest green and terracotta, on the website header, the browser tab and the installed app's icon." },
      { admin: true, kind: "new", area: "Website", text: "Two more marks for marketing (a Georgian doorway with a keyhole, and a serif L with a key), as SVG and 1024px PNG in /brand." },
    ],
  },
  {
    version: "0.45.3",
    date: "2026-10-20",
    title: "Room guide after check-in",
    items: [
      { kind: "fixed", area: "Guest guide", text: "The in-room guide only asks guests to check in while nobody has checked in to that room today; a guest who has opens their own stay instead." },
    ],
  },
  {
    version: "0.45.2",
    date: "2026-10-20",
    title: "Template fixes",
    items: [
      { kind: "fixed", area: "Guest guide", text: "Desert Star's ready-made cover is now a photo of the room, not a picture of a screen." },
      { kind: "fixed", area: "Check-in", text: "Palace Heritage's corner notes only show on wide screens, so they never sit over the welcome on a tablet." },
    ],
  },
  {
    version: "0.45.1",
    date: "2026-10-20",
    title: "The room guide gets the new look",
    items: [
      { kind: "improved", area: "Guest guide", text: "The in-room guide (the QR code on the wall) now opens like the stay guide: quick links, the cover photo with “Staying here? Check in, or open your stay”, and the Wi-Fi in one line." },
      { kind: "fixed", area: "Guest guide", text: "On a phone, the in-room guide no longer squeezes its words into a narrow column beside the button." },
    ],
  },
  {
    version: "0.45.0",
    date: "2026-10-20",
    title: "Guest guide with a cover photo",
    items: [
      { kind: "new", area: "Guest guide", text: "Every look now comes with its own cover photo on the guest guide, used until you upload your own." },
      { kind: "improved", area: "Guest guide", text: "The guide opens with your welcome words, and the quick buttons sit in one swipeable row on phones." },
    ],
  },
  {
    version: "0.44.1",
    date: "2026-10-20",
    title: "Tidier on phones",
    items: [
      { kind: "improved", area: "Bookings", text: "On a phone, the Bookings buttons, switches and filters sit in clear rows that use the full width: search on its own line, then the three filters side by side." },
      { kind: "fixed", area: "Services", text: "The Services tabs no longer run off the side of narrow phones." },
      { kind: "improved", area: "Settings", text: "The phone header keeps your business name in full: What's new, the guest register, activity, subscription, feedback and sign-out are now in one menu." },
      { kind: "improved", area: "Settings", text: "The extras price list is easy to edit on a phone, one item per card." },
      { kind: "improved", area: "Guest guide", text: "The in-room QR card on Guides is shorter on a phone, with “Why it helps” one tap away." },
      { kind: "improved", area: "Settings", text: "On dual-screen phones opened across both screens, the menu sits on one screen and the page on the other, clear of the hinge." },
    ],
  },
  {
    version: "0.44.0",
    date: "2026-10-20",
    title: "A grand welcome in the guest guide",
    items: [
      { kind: "new", area: "Guest guide", text: "The guest guide opens with a cover banner (your photo, or your colours, logo and line art) beside an invitation to add extras." },
      { kind: "new", area: "Guest guide", text: "Guests see their stay at a glance: check-in and check-out times and Wi-Fi in one line, then their dates, nights and room." },
      { kind: "new", area: "Guest guide", text: "“Need something?” and a quick “Message host” tile open a message to you straight away." },
    ],
  },
  {
    version: "0.43.0",
    date: "2026-10-20",
    title: "Your whole look, not just colours",
    items: [
      { kind: "new", area: "Settings", text: "Look and feel now covers everything guests see: button and card corners (square to fully round), button style, heading lettering and spacing, icon weight and style, a gradient background, a frame, line art (skyline, palace, dunes, coast, hills), a band of colour with your name, and a cover photo." },
      { kind: "new", area: "Settings", text: "Set the words on your welcome screens: a line under your name, a small heading, your own welcome, up to three features, a footer line and “Powered by”." },
      { kind: "new", area: "Settings", text: "Four new hotel-style templates (Grand Crimson, Express Green, Palace Heritage, Desert Star) and three new logo marks (sunburst, crest, leaf)." },
      { kind: "new", area: "Settings", text: "Save any look as a template to start from later. Use any Google font by typing its name." },
      { kind: "new", area: "Settings", admin: true, text: "Latchkey admin: share a template with every host." },
      { kind: "fixed", area: "Guest guide", text: "Your chosen fonts now show on every guest page and the kiosk." },
      { kind: "improved", area: "Guest guide", text: "The guest guide has quick links at the top to Wi-Fi, the first guide sections and extras, in your icon style." },
    ],
  },
  {
    version: "0.42.0",
    date: "2026-10-20",
    title: "Hotel-style looks",
    items: [
      { kind: "new", area: "Website", text: "Four hotel-style looks to start from: Grand Crimson, Express Green, Palace Heritage and Desert Star, each with its own colours, fonts and corner style." },
      { kind: "improved", area: "Website", text: "Five more fonts to choose from: Cinzel, Marcellus, Lato, Nunito Sans and Mulish." },
    ],
  },
  {
    version: "0.41.1",
    date: "2026-10-19",
    title: "A menu that fits any screen",
    items: [
      { kind: "improved", area: "Settings", text: "On shorter or narrower screens, the menu tightens up, then scrolls with small arrows instead of scrollbars. Today stays at the top and your profile at the bottom." },
      { kind: "improved", area: "Settings", text: "With very little room, the menu folds into two drawers: the main pages, and the extras from the guest register to feedback." },
    ],
  },
  {
    version: "0.41.0",
    date: "2026-10-19",
    title: "Photos and documents in your guide",
    items: [
      { kind: "new", area: "Guest guide", text: "Attach photos, PDFs and Word, Excel or PowerPoint files to any section of your stay guide. Guests open them right inside their guide." },
      { kind: "improved", area: "Guest guide", text: "Removing a section from your guide also removes its photos and documents." },
      { kind: "fixed", area: "Settings", admin: true, text: "Latchkey admin: the tabs no longer slide under the page on narrow screens." },
      { kind: "new", area: "Settings", admin: true, text: "Latchkey admin: arrange the menu for every host, hide items, and add your own links with icons from a starter set or your own upload." },
      { kind: "new", area: "Settings", admin: true, text: "Latchkey admin: arrange or hide the sections of the home page, Today and Settings for every host." },
      { kind: "new", area: "Settings", admin: true, text: "Latchkey admin: choose the starter guide sections new hosts begin with; hosts already here keep theirs." },
      { kind: "new", area: "Settings", admin: true, text: "Latchkey admin: connect the Google Drive that guide attachments are kept in, a private folder per host." },
    ],
  },
  {
    version: "0.40.1",
    date: "2026-10-18",
    title: "Kiosk timers fixed",
    items: [
      { kind: "fixed", area: "Check-in", text: "An unused kiosk now goes back to its welcome screen, and then to the screensaver, at the times set, even if the tablet dimmed or slept in between." },
      { kind: "fixed", area: "Check-in", text: "Changes to the kiosk timings reach kiosks that are already running, within two minutes." },
    ],
  },
  {
    version: "0.40.0",
    date: "2026-10-18",
    title: "Your own web address",
    items: [
      { kind: "new", area: "Settings", text: "Give your guests your own web address, like stay.yourhotel.co.uk. Check-in, guest guides and every page there carry your name." },
      { kind: "improved", area: "Website", text: "A shorter, clearer home page." },
      { kind: "new", area: "Settings", admin: true, text: "Latchkey admin: one brand setting for the product's name, tagline and footer, used on every page, email, alert and the installed app." },
      { kind: "new", area: "Settings", admin: true, text: "Latchkey admin: see hosts' own web addresses and switch each on once it's connected on the hosting." },
    ],
  },
  {
    version: "0.39.0",
    date: "2026-10-18",
    title: "Full screen on Android, and a clearer home page",
    items: [
      { kind: "improved", area: "Check-in", text: "On Android tablets, the kiosk's full screen also hides the bottom navigation bar where the browser allows it, and the install tips explain how to run it as its own full-screen app." },
      { kind: "improved", area: "Website", text: "On tablets and other touch screens, the Host and Guest buttons at the top of the home page are bigger and easier to tap." },
      { kind: "new", area: "Website", text: "The home page shows where Latchkey takes over from the booking sites, and what Latchkey offers developers: an open API and a server for AI assistants." },
    ],
  },
  {
    version: "0.38.1",
    date: "2026-10-18",
    title: "Typing on the kiosk",
    items: [
      { kind: "fixed", area: "Check-in", text: "On a tablet, opening the keyboard to type a name no longer shrinks the check-in screen. The box you're typing in moves into view, and the screen goes back to full size when you're done." },
    ],
  },
  {
    version: "0.38.0",
    date: "2026-10-18",
    title: "Simpler kiosk icons",
    items: [
      { kind: "improved", area: "Check-in", text: "The kiosk's phone icon is now a phone with a QR code on it, without the words underneath." },
      { kind: "improved", area: "Check-in", text: "The time-of-day icon is now a simple sunrise, sun, sunset or moon." },
      { kind: "new", area: "Settings", admin: true, text: "Latchkey admin: choose whether door tablets show the full “check in on your phone” panel beside the welcome, or just the small phone icon at the top." },
    ],
  },
  {
    version: "0.37.2",
    date: "2026-10-18",
    title: "The guest tour is the real kiosk",
    items: [
      { kind: "fixed", area: "Demo", text: "The guest tour now shows exactly what guests see: on a tablet or computer, the door-tablet screen with the phone square, the day icon, the screensaver and the fitted screens; on a phone, the phone version." },
    ],
  },
  {
    version: "0.37.1",
    date: "2026-10-18",
    title: "Steadier check-in screens",
    items: [
      { kind: "fixed", area: "Check-in", text: "On phones, the screen no longer shakes while choosing the first letter of your surname." },
      { kind: "fixed", area: "Check-in", text: "The top bar (logo, name, time and date, and the icon beside them) now stays in exactly the same place on every check-in screen." },
    ],
  },
  {
    version: "0.37.0",
    date: "2026-10-18",
    title: "Everyone checks in together, and every screen fits",
    items: [
      { kind: "new", area: "Check-in", text: "When the check-in reaches the other guests, they can scan a square and fill in their own details on their own phones at the same time. Each picks adult or child, and the check-in waits until everyone's done." },
      { kind: "improved", area: "Check-in", text: "Every check-in screen now fits the display, on a tablet or a phone, either way up, with nothing below the bottom edge." },
      { kind: "improved", area: "Check-in", text: "When it's time to photograph an ID, a faint outline of a driving licence and then a passport shows for a moment, so guests know what to hold up." },
      { kind: "improved", area: "Check-in", text: "The phone square sits beside the time, with a few words saying what it's for. On phones, the date is shortened when the property's name is long." },
      { kind: "fixed", area: "Settings", text: "Tapping the logo in your dashboard opens the home page and stays there." },
      { kind: "improved", area: "Settings", text: "Signed in on this device, Latchkey goes straight to your dashboard without showing the home page first." },
    ],
  },
  {
    version: "0.36.0",
    date: "2026-10-18",
    title: "Unique guest links and door PINs, and a tidier kiosk top bar",
    items: [
      { kind: "new", area: "Settings", text: "New properties get a guest link made from the property's own name (without words like “hotel” or “guest house”) and a random door PIN, both unique on Latchkey." },
      { kind: "new", area: "Settings", text: "Change either one and Latchkey checks straight away whether it's free. If a guest link is taken, you get up to three free ones like it." },
      { kind: "improved", area: "Check-in", text: "The kiosk's rest-screen button now sits beside the time and shows how far through the day it is, from dawn to night. Tap it to rest the screen." },
      { kind: "improved", area: "Check-in", text: "The “use your phone” QR button sits in the same place beside the time once check-in starts." },
    ],
  },
  {
    version: "0.35.0",
    date: "2026-10-18",
    title: "Kiosk fits every screen, and ID photos in the register",
    items: [
      { kind: "improved", area: "Check-in", text: "On its side, the check-in screen sizes itself to fit: smaller on a phone, larger on a tablet, with nothing cut off." },
      { kind: "new", area: "Guest register", text: "Under each stay in the guest register, open “ID photos and check-in details” to preview or download each guest's ID photographs and see everything they gave at check-in." },
    ],
  },
  {
    version: "0.34.0",
    date: "2026-10-18",
    title: "A brighter, adjustable screensaver",
    items: [
      { kind: "improved", area: "Check-in", text: "The kiosk screensaver is brighter, so the clocks are easy to read." },
      { kind: "new", area: "Check-in", text: "On the screensaver, touch and slide the left edge to change brightness, or the right edge to make the clocks and text bigger or smaller. Your choice is kept for all your kiosks." },
      { kind: "new", area: "Check-in", text: "A welcome you put on the kiosk now closes by itself if nobody taps it." },
      { kind: "new", area: "Settings", admin: true, text: "Latchkey admin: set every kiosk's starting brightness and clock size, the smallest and largest size hosts can choose, and when the check-in resets, the screensaver starts and a welcome closes." },
    ],
  },
  {
    version: "0.33.1",
    date: "2026-10-17",
    title: "Check-in screen fixes",
    items: [
      { kind: "fixed", area: "Check-in", text: "Old check-in links (/p/…) open the full check-in screen again, with the phone QR code beside the welcome." },
      { kind: "fixed", area: "Check-in", text: "The moon button that rests the screen now sits at the bottom right of the welcome screen." },
    ],
  },
  {
    version: "0.33.0",
    date: "2026-10-17",
    title: "What's new, in Latchkey",
    items: [
      { kind: "new", area: "Settings", text: "A What's new page in Latchkey with every update, newest first, marked as a major update, new features or fixes." },
      { kind: "new", area: "Settings", text: "After each update, a short “What's new” note shows once when you open Latchkey." },
    ],
  },
  {
    version: "0.32.0",
    date: "2026-10-17",
    title: "A simpler sign-in",
    items: [
      { kind: "improved", area: "Settings", text: "Sign in with Google, Apple or email: the email and password boxes only open when you choose email. “Email me a magic link” signs you in without a password." },
      { kind: "improved", area: "Settings", text: "Creating an account says “Sign up with Google / Apple / email”." },
      { kind: "improved", area: "Settings", text: "Returning on the same device? The sign-in page shows your business's own logo and name." },
    ],
  },
  {
    version: "0.31.0",
    date: "2026-10-17",
    title: "One check-in screen",
    items: [
      { kind: "improved", area: "Check-in", text: "Guests checking in on their own phone now get the new check-in screen, the same as the front-door tablet, without the tablet's screensaver or time-outs." },
      { kind: "improved", area: "Check-in", text: "Old check-in links and printed QR codes still work: they open the new screen." },
    ],
  },
  {
    version: "0.30.0",
    date: "2026-10-17",
    title: "Welcome guests by name on the kiosk",
    items: [
      { kind: "new", area: "Check-in", text: "From Today, put a full-screen welcome on the front-door kiosk for an arriving guest (“Welcome, Priya!”). Change every word, see when they tap it, update or remove it any time." },
      { kind: "new", area: "Check-in", text: "During quiet hours the kiosk's screensaver asks guests, kindly, to keep noise and movement down, and says when quiet hours end." },
      { kind: "new", area: "Check-in", text: "A small moon on the kiosk's welcome screen rests the screen straight away." },
    ],
  },
  {
    version: "0.29.0",
    date: "2026-10-17",
    title: "A front-door kiosk that rests well",
    items: [
      { kind: "new", area: "Check-in", text: "On a tablet or computer, the kiosk shows a QR code beside the welcome so guests can check in on their own phone; once someone starts, it tucks into a corner button." },
      { kind: "new", area: "Check-in", text: "Today's date and time at the top of the kiosk, in the property's time zone." },
      { kind: "improved", area: "Check-in", text: "After 5 minutes with no taps, the kiosk cancels any check-in in progress and goes back to the welcome." },
      { kind: "new", area: "Check-in", text: "After 5 more minutes, a dim black screensaver with five world clocks: your own time in the middle, two cities behind on the left and two ahead on the right. It drifts slowly to prevent screen burn. Touch to wake." },
      { kind: "fixed", area: "Check-in", text: "Tablets on their side always show the phone QR code, whatever size the browser reports." },
    ],
  },
  {
    version: "0.28.0",
    date: "2026-10-17",
    title: "Sign in with Google or Apple; a trial that starts with your property",
    items: [
      { kind: "new", area: "Settings", text: "Sign in or save your trial with Google or Apple. The way you signed in last time is marked “Last used”, and your email is filled in." },
      { kind: "improved", area: "Settings", text: "The free trial starts with your property, rooms and arrival times; only then do you save it, with Google, Apple or an email link. No password needed." },
      { kind: "new", area: "Settings", text: "Saved your trial by email? Once you've confirmed it, choose a password, or keep using email links." },
    ],
  },
  {
    version: "0.27.0",
    date: "2026-10-17",
    title: "One guide list, a cleaner bookings table",
    items: [
      { kind: "improved", area: "Guest guide", text: "The guide is one list in the order guests read it: drag the grip to move a section (mouse, touch or arrow keys), and sections stay folded until you open them." },
      { kind: "new", area: "Guest guide", text: "Add your own sections, rename them, remove any section (Latchkey's can be added back), and pin sections to the reminder card from the same list." },
      { kind: "improved", area: "Bookings", text: "A roomier bookings table: one Stay column with both dates and nights, platform and status as icons with tooltips, and quick icons beside the guest instead of repeated labels." },
    ],
  },
  {
    version: "0.26.0",
    date: "2026-10-16",
    title: "Install Latchkey, and alerts wherever you are",
    items: [
      { kind: "new", area: "Website", text: "Install Latchkey as an app on phones, tablets and computers. It keeps working through patchy Wi-Fi and shows a friendly reconnecting page." },
      { kind: "new", area: "Check-in", text: "Install the kiosk on the front-door tablet as its own full-screen app for that property." },
      { kind: "new", area: "Settings", text: "Alerts by push to your devices, Telegram, email or text: choose any mix, with texts for urgent alerts only by default, and a test button." },
      { kind: "new", area: "Bookings", text: "Forward Airbnb and Booking.com message emails to your private address and each message lands in that guest's conversation; reply by email from your own mailbox." },
      { admin: true, kind: "new", area: "Settings", text: "Latchkey admin: an Integrations page for email, push, Telegram, SMS and inbound email, with each channel switchable in Routines." },
    ],
  },
  {
    version: "0.25.0",
    date: "2026-10-16",
    title: "Quicker tidying on Bookings",
    items: [
      { kind: "improved", area: "Bookings", text: "Stays without a guest name show “To confirm” with quick icons: add the name, not a booking (close the nights) or hide." },
      { kind: "improved", area: "Bookings", text: "Closed nights have quick icons to reopen or hide; nights mirroring another site's booking open that booking." },
      { kind: "improved", area: "Bookings", text: "“Archive” is now called Hide. Hidden stays stay hidden on later calendar syncs unless the platform changes them: new dates, a guest books, or it's reopened." },
      { kind: "fixed", area: "Calendar", text: "A named guest booked on the platform now replaces nights you'd marked as not a booking." },
    ],
  },
  {
    version: "0.24.0",
    date: "2026-10-16",
    title: "In-room guides and guest messages at a glance",
    items: [
      { kind: "new", area: "Guest guide", text: "In-room guides: print a QR code for each room. Guests scan it in the room for how that room works, wifi, today's closed times and a way to reach you. Door codes are never shown." },
      { kind: "new", area: "Bookings", text: "Guest messages on Today: every stay's conversation, extras and requests, with what's new, awaiting your reply, to approve, unpaid or to deliver. Filter staying now, arriving soon or past." },
      { kind: "improved", area: "Bookings", text: "Move and fold Today's sections with the same grab bar as the menu: drag to move, tap to fold. Remembered on this device." },
      { kind: "improved", area: "Calendar", text: "Calendar connections on Today group by platform first, folded, with ticks, warnings and crosses counting what works, what isn't set up and what's broken." },
      { kind: "improved", area: "Guest guide", text: "The guide card on Today links to the whole-property guide and each room's guide, with each room's QR code." },
    ],
  },
  {
    version: "0.23.0",
    date: "2026-10-15",
    title: "Invoices from Today, tidier settings",
    items: [
      { kind: "new", area: "Invoices", text: "Guests leaving today show Email invoice and Download, with a tick once emailed and a cross when there's no email to send to." },
      { kind: "new", area: "Invoices", text: "Add a guest's postal address on the booking; it's printed under their name on the invoice." },
      { kind: "improved", area: "Calendar", text: "Calendar connections on Today group by room or by platform, with a filter for links that need a look." },
      { kind: "improved", area: "Settings", text: "Currency, time zone and phone pickers for every country, with symbols, UTC offsets and phone number checks." },
      { kind: "improved", area: "Services", text: "The price list is one compact line per item: drag to reorder, delete at the end." },
      { kind: "improved", area: "Services", text: "Local tradespeople: one Google Maps search that works, plus who's best for what in your country, including the official gas and electrical registers." },
      { kind: "improved", area: "Team", text: "Activity stays within the page; long changes open in a window with wrap and copy." },
      { kind: "fixed", area: "Bookings", text: "Today only shows alerts for your own business, and Mark as seen now works or says why it can't." },
      { kind: "fixed", area: "Website", text: "Links from Today land in view once the page has loaded, including API & MCP and Guest payments." },
    ],
  },
  {
    version: "0.22.0",
    date: "2026-10-14",
    title: "Today, at a glance",
    items: [
      { kind: "improved", area: "Bookings", text: "Today is now a dashboard: guests arriving, staying and leaving, stays needing details, guest requests, cleaning times, maintenance, calendar connections, the guest guide, kiosk and QR, and key settings." },
      { kind: "new", area: "Bookings", text: "Hover, or press and hold on a phone, any number, name or card on Today to see the details behind it; tap to go straight to it." },
      { kind: "new", area: "Bookings", text: "Links land on exactly what you tapped: a guest's card, a calendar link, a job, a guide section or a settings section, highlighted when you arrive." },
      { kind: "improved", area: "Bookings", text: "Stays that need details and possible double bookings now sit at the top of Bookings, with the full list and timeline." },
    ],
  },
  {
    version: "0.21.0",
    date: "2026-10-14",
    title: "Launch offer: £1 for your first month",
    items: [
      { kind: "new", area: "Website", text: "Launch offer for new hosts who join by 31 December 2026: 30 days free, then £1 for your first month, then the usual price." },
      { kind: "new", area: "Settings", text: "Your subscription page shows the offer price for your first paid month and what you'll pay after." },
      { admin: true, kind: "new", area: "Settings", text: "Latchkey admin: set the offer's price, name, first day and last day to join; accounts keep the offer they joined with." },
    ],
  },
  {
    version: "0.20.0",
    date: "2026-10-14",
    title: "API, MCP server and plans",
    items: [
      { kind: "new", area: "Website", text: "Latchkey's API and MCP server: connect Claude, ChatGPT, Cursor or your own tools to see arrivals, add direct bookings and message guests. One key works for both." },
      { kind: "new", area: "Website", text: "Developer docs at /developers, generated from the live API so they're always up to date, with copy-paste set-up for each AI assistant." },
      { kind: "new", area: "Settings", text: "API keys in Settings → API & MCP: read-only or read-and-change, shown once, with this month's usage." },
      { kind: "new", area: "Settings", text: "Three plans (Start, Grow, Pro) with rooms included and a small charge per extra room, plus an API add-on for Start and Grow." },
      { admin: true, kind: "new", area: "Settings", text: "Latchkey admin: a pricing studio with break-even recommendations, projections against real months and calibration from Lovable's usage." },
      { admin: true, kind: "new", area: "Settings", text: "Latchkey admin: switches, schedules and run-now for every routine that uses Lovable Run credits." },
      { admin: true, kind: "new", area: "Settings", text: "Latchkey admin: visitor analytics with pages, time on site, where visitors are from, devices, bots filtered out, and anonymous visitors matched to their account when they sign in." },
    ],
  },
  {
    version: "0.19.0",
    date: "2026-10-14",
    title: "Closed nights explain themselves",
    items: [
      { kind: "improved", area: "Bookings", text: "Closed nights show why they're closed (booked on another site, or blocked) instead of asking for a guest name." },
      { kind: "improved", area: "Demo", text: "The demo property is now The Hill Suites in Amersham." },
    ],
  },
  {
    version: "0.18.0",
    date: "2026-10-13",
    title: "A clearer bookings list and per-night invoices",
    items: [
      { kind: "new", area: "Bookings", text: "Bookings as a table you can sort by any column, with search and show/hide filters for stays, rooms and platforms. Past stays are hidden until you ask for them." },
      { kind: "improved", area: "Bookings", text: "A host-friendly order: staying now, arriving and leaving today, coming up, then past stays." },
      { kind: "new", area: "Invoices", text: "Invoices list each night on its own line with its share of the price, then the total (can be switched off site-wide)." },
      { kind: "fixed", area: "Invoices", text: "An invoice picks up the price as soon as you change it on the booking." },
      { admin: true, kind: "new", area: "Settings", text: "Latchkey admin sits under Settings for super admins, with all of Latchkey's own settings, and super admins can add more super admins." },
    ],
  },
  {
    version: "0.17.0",
    date: "2026-10-13",
    title: "Your own Stripe account",
    items: [
      { kind: "new", area: "Settings", text: "Connect your own Stripe account from Settings: we start it with your email and Stripe asks the rest. Guests' card payments go straight to you." },
      { kind: "improved", area: "Security", text: "Latchkey's own Stripe account now only collects subscriptions, never hosts' guest payments." },
    ],
  },
  {
    version: "0.16.0",
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
    version: "0.15.0",
    date: "2026-10-13",
    title: "Start a free trial without signing up",
    items: [
      { kind: "new", area: "Website", text: "Start a free trial straight away: tell us your name and email, set up your property and rooms, and save your account by email link when you're ready." },
      { kind: "new", area: "Website", text: "Sign in with an emailed link instead of a password." },
      { kind: "improved", area: "Website", text: "Host and Guest shortcuts show as separate bubbles under the menu; on phones the bottom bar adds Demo and Free trial." },
    ],
  },
  {
    version: "0.14.0",
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
    version: "0.13.0",
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
    version: "0.12.0",
    date: "2026-10-13",
    title: "The Hill Suites demo",
    items: [
      { kind: "improved", area: "Demo", text: "The demo property is now The Hill Suites." },
      { kind: "improved", area: "Demo", text: "The demo's guidance banner follows each check-in step, even when steps are skipped or added." },
    ],
  },
  {
    version: "0.11.0",
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
    version: "0.10.0",
    date: "2026-10-12",
    title: "Calendar in room colours",
    items: [
      { kind: "improved", area: "Calendar", text: "Each stay is one continuous block in its room's colour, so names fit." },
      { kind: "new", area: "Calendar", text: "Hover a short stay for its details on a computer; press and hold on a phone." },
      { kind: "fixed", area: "Bookings", text: "The guest panel refreshes after an edit and closes after a delete." },
    ],
  },
  {
    version: "0.9.0",
    date: "2026-10-12",
    title: "Guest register and menu layouts",
    items: [
      { kind: "new", area: "Guest register", text: "UK guest register: name and nationality of everyone 16 or over, kept 12 months, ready to show an inspecting officer." },
      { kind: "new", area: "Settings", text: "Drag the menu's edge to show it in full, as icons, or along the top." },
      { kind: "new", area: "Team", text: "Your photo and name next to Sign out, one tap from your profile." },
    ],
  },
  {
    version: "0.8.0",
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
    version: "0.7.0",
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
    version: "0.6.0",
    date: "2026-10-10",
    title: "A safer demo",
    items: [
      { kind: "new", area: "Demo", text: "One-tap demo for hosts and guests, with a kiosk lock." },
      { kind: "improved", area: "Security", text: "The shared demo account can look around but not change settings." },
    ],
  },
  {
    version: "0.5.0",
    date: "2026-10-02",
    title: "Pricing, email and security",
    items: [
      { kind: "new", area: "Website", text: "Pricing and the demo on the home page." },
      { kind: "new", area: "Settings", text: "Latchkey-branded sign-in emails." },
      { kind: "fixed", area: "Security", text: "Fixes from a security review." },
    ],
  },
  {
    version: "0.4.0",
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
    version: "0.3.0",
    date: "2026-09-28",
    title: "All your bookings in one place",
    items: [
      { kind: "new", area: "Bookings", text: "Calendar links from Airbnb, Booking.com, Homestay.com and more, in one list." },
      { kind: "new", area: "Bookings", text: "The same stay on several sites is recognised as one, with blocked nights shown separately." },
      { kind: "new", area: "Website", text: "Home page." },
    ],
  },
]);

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

/* ------------------------------ versions -------------------------------- */

export type Level = "major" | "minor" | "fix";

const parts = (v: string) => v.split(".").map((n) => Number(n) || 0).concat([0, 0, 0]).slice(0, 3) as [number, number, number];

/** -1, 0 or 1, comparing major.minor.fix. */
export function compareVersions(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! < y[i]! ? -1 : 1;
  return 0;
}

/** A release's kind, from how its number moved on from the one before. */
export function releaseLevel(version: string, previous: string | null): Level {
  if (!previous) return "minor";
  const [a, b] = [parts(version), parts(previous)];
  if (a[0] !== b[0]) return "major";
  if (a[1] !== b[1]) return "minor";
  return "fix";
}

export type HostRelease = Release & { level: Level };

/**
 * The releases a host sees: super-admin items left out (and releases left
 * empty by that), each with its level. Super admins see everything.
 */
export function releasesFor(opts: { admin: boolean }, releases: Release[] = RELEASES): HostRelease[] {
  return releases
    .map((r, i) => ({ ...r, level: releaseLevel(r.version, releases[i + 1]?.version ?? null), items: r.items.filter((it) => opts.admin || !it.admin) }))
    .filter((r) => r.items.length > 0);
}

export const LATEST_VERSION = RELEASES[0]!.version;

/** What's new since the version someone last saw (nothing if they're new: they've seen it all). */
export function unseen(seen: string | null, releases: HostRelease[]): HostRelease[] {
  if (!seen) return [];
  return releases.filter((r) => compareVersions(r.version, seen) > 0);
}
