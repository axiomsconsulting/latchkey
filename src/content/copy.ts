import { branded, currentBrand } from "@/lib/brand";

/**
 * All user-facing copy lives here so it can be reviewed and later translated.
 * UK English throughout.
 */

/** The product's name and tagline: the super admin's white label (src/lib/brand.ts). */
export const brand = {
  get name() {
    return currentBrand().name;
  },
  get tagline() {
    return currentBrand().tagline;
  },
};

export const demoCopy = branded({
  cta: "Try the demo",
  title: "Try Latchkey",
  body: "No sign-up or PIN needed. Pick a side to explore.",
  guestTitle: "As a guest",
  guestBody: "Check in, read the stay guide and order extras.",
  hostTitle: "As a host",
  hostBody: "See arrivals, bookings, calendars and requests.",
  resetNote: "This is a demo. Its data is shared and resets every day.",
  tryAgain: "Try again",
  tourLabel: "Demo · resets daily · Back to Latchkey",
  openingGuest: "Opening the guest journey…",
  openingHost: "Opening the host dashboard…",
  pageTitle: "See it for yourself",
  regionsTitle: "Around the world",
  regionsBody:
    "Four fictional properties, one on each hotel theme, with local rooms, guests, prices and breakfast menus.",
  asGuest: "As a guest",
  asHost: "As the host",
  pageBody:
    "No sign-up needed. Walk through a guest's check-in and stay, or look around the host's dashboard.",
  error: "The demo couldn't start just now. Please try again.",
});

export const siteMenu = branded({
  open: "Open menu",
  title: "Menu",
  demo: "Try the demo",
  pricing: "Pricing",
  guest: "Guest check-in demo",
  signIn: "Host sign in",
  trial: "Start free trial",
  dashboard: "Host dashboard",
  bookings: "Bookings",
  services: "Services",
  admin: "Settings and admin",
  signOut: "Sign out",
  home: "Home",
  about: "About and what's new",
  developers: "API & MCP for developers",
  switchProperty: "Switch property",
  guestPin: "Check in somewhere else (enter a PIN)",
  shortcuts: "Shortcuts",
  host: "Host",
  guestShort: "Guest",
  hostHint: "Your dashboard",
  guestHint: "Check in with a PIN",
  demoShort: "Demo",
  trialShort: "Free trial",
});

export const about = branded({
  title: "About Latchkey",
  intro:
    "Latchkey lets guests check themselves in, read their guest guide and ask for what they need, while hosts keep every booking, request and record in one place.",
  tabChanges: "What's new",
  tabFeatures: "All features",
  kinds: { new: "New", improved: "Improved", fixed: "Fixed" } as Record<string, string>,
  version: (v: string) => `Version ${v}`,
  since: (v: string) => `since ${v}`,
});

export const marketing = branded({
  /** The category, above the headline. */
  category: "Guest operations system for independent accommodation",
  headline: "Hotel-grade guest operations for the stays you run yourself.",
  subhead:
    "Booking sites confirm the reservation. Latchkey runs everything after it: self check-in, a branded stay guide, requests and extras, guest records and alerts, for serviced accommodation, guest houses, B&Bs and Airbnb and Booking.com hosts.",
  primaryCta: "See the guest journey",
  hostCta: "Explore the host dashboard",
  secondaryCta: "Start a 30-day free trial",
  trust: "Works alongside",
  trustTail: "and any iCal calendar",
  footer: "© 2026 Latchkey. Guest operations for independent accommodation.",
  privacyLink: "Privacy policy",
  /** The three outcomes, right under the hero. */
  benefits: [
    {
      title: "Fewer late-night arrivals",
      body: "Guests check themselves in at your door tablet or on their own phone, at any hour. No waiting up, no key handovers.",
    },
    {
      title: "Fewer messages across apps",
      body: "Arrivals, requests, extras and repairs from every booking site land in one calm workspace, with alerts where you want them.",
    },
    {
      title: "A more professional stay",
      body: "Your logo, colours and guide from the first tap, so the stay feels like your business, not just the booking platform's.",
    },
  ],
  audience: {
    title: "Built for independent accommodation",
    body: "From one owner-run property to a small portfolio with a team, without a front desk or an enterprise hotel system.",
    kinds: [
      "Serviced accommodation",
      "Guest houses and B&Bs",
      "Boutique stays",
      "Airbnb and Booking.com hosts",
      "Multi-property operators",
      "Short-stay shared houses",
    ],
  },
  journey: {
    eyebrow: "The guest journey",
    title: "From booking to check-out, in one flow.",
    steps: [
      {
        title: "A booking arrives",
        body: "On any site. Its calendar link brings it into one list, with the same stay matched across sites.",
      },
      {
        title: "The guest checks in",
        body: "At your door tablet or on their own phone, any hour, the whole group on their own phones if you like.",
      },
      {
        title: "A branded stay guide",
        body: "Wi-Fi, getting in, house rules and room details, in your look, with a QR guide in every room.",
      },
      {
        title: "Help and extras",
        body: "Towels, a late check-out or a repair: asked from the stay page, paid by card when you charge.",
      },
      {
        title: "You see it all",
        body: "Arrivals, requests and messages on Today, with alerts by push, Telegram, email or text.",
      },
    ],
  },
  pillars: {
    eyebrow: "What it does",
    title: "Four things, done properly.",
    items: [
      {
        title: "Arrivals and guest records",
        points: [
          "Self check-in at a front-door tablet or on the guest's phone",
          "Groups check in together on their own phones",
          "ID checks and photos, according to your settings",
          "Supports UK guest-register record keeping for applicable accommodation",
        ],
      },
      {
        title: "Guest experience",
        points: [
          "Branded stay and room guides, on your own web address if you like",
          "Room QR codes, quick tiles, photos and PDFs",
          "Messages and requests from the guest's stay page",
          "Invoices for direct stays, on a link guests keep",
          "Your own enquiry page, so past guests can come back to you directly",
        ],
      },
      {
        title: "In-house operations",
        points: [
          "One bookings list across Airbnb, Booking.com, Homestay, direct and iCal",
          "Requests, extras and service jobs in one shared flow",
          "A housekeeping board: turnovers, cleaning progress and “ready for guest”",
          "Maintenance with your own trades, and local ones found fast",
          "Card payments for extras, straight to your own account",
        ],
      },
      {
        title: "Multi-property control",
        points: [
          "A Today dashboard for arrivals, departures and what needs you",
          "Switch between properties; teams with owner, manager, cleaner and viewer roles",
          "Operations reports across every booking site: occupancy, check-ins, service, extras",
          "Alerts by push, Telegram, email and text",
          "Open API and MCP server for your own tools and AI assistants",
        ],
      },
    ],
  },
  beforeAfter: {
    beforeTitle: (day: string) => `${day}, before`,
    before: [
      "Waiting up for a late arrival",
      "Three apps to find who's coming",
      "A paper register nobody fills in",
      "Towels requested at 11pm, seen at 7am",
    ],
    afterTitle: (day: string) => `${day}, with Latchkey`,
    after: [
      "Guests let themselves in, any hour",
      "One arrivals list for every site",
      "Register details recorded as guests check in",
      "Requests and extras land in one inbox",
    ],
  },
  /** Booking platforms vs Latchkey, and what it does not replace. */
  gap: {
    eyebrow: "Booking platforms vs Latchkey",
    title:
      "Booking platforms help guests find you. Latchkey runs the stay, and helps them return to you.",
    theyLabel: "Booking platforms",
    usLabel: "Latchkey",
    rows: [
      {
        topic: "Arrival",
        they: "Notes buried in their app",
        us: "Self check-in at your door or on the guest's phone",
      },
      {
        topic: "Identity",
        they: "Check the person who booked",
        us: "Checks each adult at check-in, as you choose",
      },
      {
        topic: "Records",
        they: "Not their job",
        us: "Supports the UK guest register, kept 12 months",
      },
      {
        topic: "Calendars",
        they: "One each, dates only",
        us: "One list, the same stay matched across sites",
      },
      {
        topic: "During the stay",
        they: "A message thread",
        us: "Requests, paid extras and repairs in one flow",
      },
      {
        topic: "Your brand",
        they: "Their brand, their app",
        us: "Your logo, guide and web address on every stay",
      },
      {
        topic: "Coming back",
        they: "Through the platform again",
        us: "Your own enquiry page, and past guests who asked to hear from you",
      },
    ],
    keepTitle: "Keep using your booking sites for",
    keep: [
      "Listings and being found",
      "Rates, availability and distribution",
      "Taking the booking and its payment",
      "Their own inbox (forward it to Latchkey if you like)",
    ],
    oursTitle: "Latchkey runs what happens after the booking",
    ours: [
      "Arrivals and self check-in",
      "Stay and room guides",
      "Requests, extras and repairs",
      "Guest records and the register",
      "Operations across every site",
    ],
    note: "Latchkey works alongside your booking sites and any channel manager. It isn't a channel manager, a booking engine or a hotel PMS.",
  },
  next: {
    eyebrow: "On the way",
    title: "Next for your guest journey",
    body: "Built around the work that starts after the booking. Not available yet.",
    items: [
      {
        title: "Automated stay messages",
        body: "Your own pre-arrival, arrival-day and check-out reminders, on the stay page and by email.",
      },
    ],
  },
  developers: {
    eyebrow: "For developers",
    title: "Open API. MCP server for AI assistants.",
    body: "Connect your own tools, or ask Claude or ChatGPT who's arriving today. Read-only or full keys, revoke any time.",
    cta: "Developer docs",
  },
});

export const auth = branded({
  signInTitle: "Welcome back",
  signInBody: "Sign in to see today's arrivals and keep your calendars in step.",
  signUpTitle: "Set up your rooms",
  signUpBody: "Create a host account. It takes a minute and you can explore with demo rooms first.",
  emailLabel: "Email address",
  passwordLabel: "Password",
  signInCta: "Sign in",
  signUpCta: "Create account",
  switchToSignUp: "New here? Create a host account",
  switchToSignIn: "Already have an account? Sign in",
  checkInbox: "Check your inbox to confirm your email address, then sign in.",
  genericError: "Something went wrong. Please try again.",
  signOut: "Sign out",
  magicCta: "Email me a magic link",
  magicSent: (email: string) =>
    `We've sent a magic link to ${email}. Open it on this device to sign in.`,
  magicNeedsEmail: "Type your email address first.",
  orPassword: "or sign in with your password",
  partnerSignInTitle: "Commission Partner sign in",
  partnerSignInBody:
    "Sign in to your Commission Partner account to apply, share your link or see your commission.",
  partnerSignUpTitle: "Create your Commission Partner account",
  partnerSignUpBody:
    "This account is only for introducing hosts. It isn't a host account and has no rooms. Next you'll fill in your application.",
  partnerSwitchToSignUp: "New Commission Partner? Create an account",
});

/** The free trial: straight into setting up, account saved at the end. */
/** Google / Apple sign-in, last used, saving a trial, setting a password. */
export const authExtraCopy = branded({
  google: "Continue with Google",
  apple: "Continue with Apple",
  googleSignUp: "Sign up with Google",
  appleSignUp: "Sign up with Apple",
  email: "Continue with email",
  emailSignUp: "Sign up with email",
  magicNoPassword: "No password needed: we email you a link that signs you in.",
  orEmail: "or with email",
  lastUsed: "Last used",
  socialFailed: "Signing in didn't finish. Please try again.",
  trialSaved: "Your trial is saved to your account. Everything you set up is here.",
  saveTitle: "Save your trial",
  saveBody:
    "Your property is set up. Save it to your account so you can come back to it on any device. No password needed.",
  yourName: "Your name",
  emailTitle: "Or use your email",
  emailHint: "We'll send a link to confirm it. You can choose a password afterwards.",
  sendLink: "Email me a link",
  linkSent: (email: string) =>
    `Check ${email} and open the link. Everything you've set up stays as it is.`,
  later: "Skip for now",
  passwordTitle: "Choose a password",
  passwordBody:
    "Your email is confirmed. Add a password to sign in quickly next time, or keep using email links.",
  password: "Password",
  passwordConfirm: "Type it again",
  passwordMismatch: "The two passwords don't match.",
  passwordShort: "Use at least 8 characters.",
  passwordSave: "Save password",
  passwordSaved: "Password saved.",
  useLinks: "Keep using email links",
});

export const trial = branded({
  starting: "Setting up your free trial…",
  closed: "New free trials are paused for the moment. Please check back soon.",
  aboutTitle: "About you",
  aboutBody:
    "So we can save your setup and send you your sign-in link later. No password needed now.",
  name: "Your name",
  email: "Your email address",
  emailHint: "We'll only use it for your Latchkey account.",
  needName: "Please type your name.",
  needEmail: "Please type a valid email address.",
  bannerTitle: "You're on a free trial",
  bannerBody: (email: string | null) =>
    email
      ? `Save your account to keep everything you set up. We'll email a sign-in link to ${email}.`
      : "Save your account to keep everything you set up. We'll email you a sign-in link.",
  bannerCta: "Save my account",
  bannerEmail: "Email address",
  bannerSend: "Send my sign-in link",
  bannerSent: (email: string) =>
    `Check ${email} and open the link to finish saving your account. Everything you've set up stays as it is.`,
  bannerTaken:
    "That email already has a Latchkey account. Sign in to it instead, or use another email.",
  bannerLater: "Later",
  setupDone: "Your property is ready. Save your account any time from the bar at the top.",
  next: "Next: your property",
});

export const hostNav = branded({
  version: (v: string) => `Latchkey v${v}`,
  menuDrawer: "Menu",
  moreDrawer: "More",
  today: "Today",
  bookings: "Bookings",
  housekeeping: "Housekeeping",
  direct: "Direct stays",
  reports: "Reports",
  properties: "Properties",
  connections: "Connections",
  services: "Services",
  guides: "Guides",
  settings: "Settings",
  activity: "Activity",
  register: "Guest register",
  yourProfile: (name: string) => `Your profile: ${name}`,
  /** Bottom bar on narrow phones; full names stay as the accessible label. */
  short: {
    today: "Today",
    bookings: "Bkgs",
    housekeeping: "Clean",
    reports: "Reports",
    direct: "Direct",
    services: "Svcs",
    guides: "Guides",
    properties: "Props",
    connections: "Conns",
    settings: "Sett.",
  } as Record<string, string>,
  menuGrab: "Menu size: drag, or use the arrow keys",
  menuModes: { full: "Full menu", rail: "Icons only", top: "Menu along the top" } as Record<
    string,
    string
  >,
  menuToSide: "Show the menu down the side",
});

export const statuses = branded({
  needs_details: "Needs details",
  upcoming: "Upcoming",
  checked_in: "In stay",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  blocked: "Blocked, not a booking",
  mirror: "Echo of another platform",
  flagged: "Needs a look",
  arriving_today: "Arriving today",
  in_stay: "In stay",
  departing_today: "Departing today",
  past: "Past",
});

export const channels = branded({
  airbnb: "Airbnb",
  booking_com: "Booking.com",
  homestay: "Homestay.com",
  vrbo: "Vrbo",
  agoda: "Agoda",
  direct: "Direct",
  other: "Other website (.ics link)",
});

/**
 * Where a host finds the calendar export link on each platform.
 * Kept here so the steps can be updated without touching code.
 * `screenshot` is a placeholder for an image to be added later.
 */
export const calendarGuides: Record<
  string,
  {
    title: string;
    steps: string[];
    helpUrl: string | null;
    helpLabel: string;
    note?: string;
    screenshot: string | null;
  }
> = branded({
  airbnb: {
    title: "Where do I find my Airbnb calendar link?",
    steps: [
      "Open Calendar and choose the listing.",
      "Go to Availability.",
      "Choose Connect calendars, then Connect to another website.",
      "Copy the Airbnb calendar link.",
    ],
    note: "One link per listing.",
    helpUrl: "https://www.airbnb.co.uk/help/article/99",
    helpLabel: "Airbnb help: sync calendars",
    screenshot: null,
  },
  booking_com: {
    title: "Where do I find my Booking.com calendar link?",
    steps: [
      "Sign in to the Extranet.",
      "Go to Rates & Availability, then Sync calendars.",
      "Choose Add calendar connection.",
      "Copy the Booking.com calendar link.",
    ],
    note: "Calendar sync may not be available for hotel-type properties, or if you already use a channel manager.",
    helpUrl: "https://partner.booking.com/en-gb/help/rates-availability/calendar-sync",
    helpLabel: "Booking.com help: calendar sync",
    screenshot: null,
  },
  vrbo: {
    title: "Where do I find my Vrbo calendar link?",
    steps: [
      "Open your owner dashboard and go to Calendar.",
      "Choose Import/Export.",
      "Choose Export calendar.",
      "Copy the .ics link.",
    ],
    helpUrl: "https://help.vrbo.com/articles/How-do-I-sync-my-calendars",
    helpLabel: "Vrbo help: sync calendars",
    screenshot: null,
  },
  homestay: {
    title: "Where do I find my Homestay.com calendar link?",
    steps: [
      "Open your host dashboard and go to Calendar.",
      "Choose Sync calendar.",
      "Copy the export link.",
    ],
    helpUrl: "https://www.homestay.com/help",
    helpLabel: "Homestay help: synchronise your calendar with a 3rd party",
    screenshot: null,
  },
  agoda: {
    title: "Where do I find my Agoda calendar link?",
    steps: [
      "Sign in to YCS or the Agoda Homes portal.",
      "Go to Calendar.",
      "Choose Calendar sync.",
      "Copy the export link.",
    ],
    helpUrl: "https://ycs.agoda.com",
    helpLabel: "Agoda YCS",
    screenshot: null,
  },
  other: {
    title: "Where do I find my calendar link?",
    steps: [
      "Look for Calendar sync, iCal or Export calendar in your platform's settings.",
      "Copy the export link. It usually ends in .ics.",
    ],
    helpUrl: null,
    helpLabel: "",
    screenshot: null,
  },
  direct: {
    title: "Direct bookings",
    steps: [
      "Direct bookings are added by hand in Latchkey, so there is no calendar link to paste.",
    ],
    helpUrl: null,
    helpLabel: "",
    screenshot: null,
  },
});

export const today = branded({
  title: "Today",
  subtitle: "Arrivals, departures and anything waiting on you.",
  arriving: "Arriving today",
  inStay: "In stay",
  departing: "Departing today",
  actionRequired: "Needs your details",
  actionBody: "These bookings arrived from a channel without a guest name. Add what you know.",
  noArrivals: "Nobody is arriving today. Enjoy the quiet.",
  noDepartures: "No departures today.",
  noStays: "No guests in the house right now.",
  allClear: "Nothing is waiting on you. Everything is up to date.",
  saveDetails: "Save details",
  doubleBookedTitle: "Possible double-booking",
  doubleBookedBody:
    "Two platforms show different guests in the same room on the same nights. Check both and cancel one.",
  maybeBlock: "Dates you closed yourself?",
  markBlocked: "Not a booking, mark as blocked",
  cleaningToday: "Cleaning window today",
});

/** Installing Latchkey as an app. */
export const pwaCopy = branded({
  offline: "You're offline. Latchkey reconnects by itself as soon as the Wi-Fi is back.",
  installApp: "Install the Latchkey app",
  installKiosk: "Install the kiosk on this tablet",
  installed: "Installed on this device",
  iosStep1: "Tap the Share button at the bottom (or top) of Safari.",
  iosStep2: "Choose “Add to Home Screen”, then Add.",
  iosStep3:
    "Open Latchkey from your home screen. Alerts on iPhone and iPad need it opened this way.",
  iosKiosk:
    "Open the check-in icon from the home screen: it runs full screen. Turn on Guided Access (Settings → Accessibility) to keep it on the kiosk.",
  menuInstall: "Open your browser's menu and choose “Install app” or “Add to Home screen”.",
  androidKiosk:
    "Then open the check-in icon from the home screen: it runs full screen, without the bottom navigation bar. If your tablet's own browser can't install apps, use Chrome. To keep the tablet on the kiosk, turn on screen pinning (Settings → Security → App pinning) and pin it.",
});

/** Settings: where the host's alerts go. */
export const notifyCopy = branded({
  title: "App and alerts",
  body: "Get alerts the moment a guest is locked out, asks for something or messages you. Pick as many ways as you like; they're all free except texts.",
  install:
    "Install Latchkey on your phone or tablet for one-tap access and alerts on the lock screen.",
  channels: {
    push: ["Alerts on this device", "Free. Shows on your lock screen, like a text."],
    telegram: ["Telegram", "Free. Alerts from the Latchkey bot, with a button to open the stay."],
    email: ["Email", "To your business email address."],
    sms: ["Text messages (SMS)", "About 4p a text. Urgent alerts only, unless you choose all."],
  } as Record<string, [string, string]>,
  smsUrgentOnly:
    "Only urgent alerts by text (locked out, wants you to check them in, more guests than booked)",
  thisDevice: "This device",
  turnOn: "Turn on here",
  turnOff: "Turn off here",
  on: "On",
  pushNeedsApp: "Open Latchkey in its own tab or as an installed app to turn on alerts here.",
  pushBlocked:
    "Alerts are blocked for Latchkey in this browser's settings. Allow notifications, then try again.",
  pushIos:
    "On iPhone and iPad, install Latchkey to your home screen first, then turn alerts on from there.",
  pushOn: "Alerts turned on for this device.",
  pushOff: "Alerts turned off for this device.",
  devices: (n: number) => `${n} device${n === 1 ? "" : "s"} getting alerts`,
  removeDevice: "Remove",
  connectTelegram: "Connect Telegram",
  telegramOpened: "Telegram opened: tap Start in the chat to finish.",
  telegramLinked: (n: number) => `${n} chat${n === 1 ? "" : "s"} linked`,
  unlink: "Unlink",
  notReady: "Not available yet: Latchkey's team is setting this up.",
  emailDemo:
    "Email alerts are in demo mode for this business. Switch host email to live to receive them.",
  noEmail: "Add a business email above first.",
  noPhone: "Add a mobile number above (with its country) to get texts.",
  test: "Send a test alert",
  testResult: (parts: string[]) =>
    parts.length
      ? `Test sent by ${parts.join(", ")}.`
      : "Nothing was sent: switch on at least one way above.",
  saved: "Saved",
});

/** Settings: booking-site messages forwarded by email. */
export const platformMsgCopy = branded({
  title: "Airbnb and Booking.com messages",
  body: "Booking sites don't let other apps read your guest chats, but they email you each message. Forward those emails to Latchkey and each message lands in that guest's conversation here, next to their requests and payments. Free.",
  address: "Your private forwarding address",
  copy: "Copy",
  copied: "Copied",
  make: "Create my forwarding address",
  notReady: "Not available yet: Latchkey's team is setting up inbound email.",
  stepsTitle: "Set up in two minutes",
  gmail: [
    "In Gmail on a computer: Settings (cog) → See all settings → Forwarding and POP/IMAP → Add a forwarding address. Paste the address above.",
    "Gmail sends a confirmation code. It appears below within a minute: copy it into Gmail, or open the link.",
    "Create a filter: in the search box type from:(airbnb.com OR booking.com OR vrbo.com OR expedia.com), then Create filter → Forward it to → your Latchkey address.",
  ],
  outlook:
    "Outlook: Settings → Mail → Rules → Add new rule: when the sender address includes airbnb.com or booking.com, forward to your Latchkey address.",
  reply:
    "To reply, use the Reply by email button in the conversation: it opens your own email with the platform's reply address, so the guest gets it on Airbnb or Booking.com.",
  privacy:
    "Only emails you forward reach Latchkey. Messages are kept with the stay and follow its privacy rules.",
  confirm: "Gmail asked you to confirm forwarding",
  confirmOpen: "Open Gmail's confirmation",
  recent: "Recently received",
  matched: "Added to the stay",
  unmatched: "Not matched to a stay",
  none: "Nothing received yet.",
});

/** Latchkey admin: platform-wide integrations. */
export const integrationsCopy = branded({
  firecrawl: {
    title: "Listing import (Firecrawl, experimental)",
    body: "Hosts paste links to their own listings on Airbnb, Booking.com, Vrbo, Agoda or Homestay, and Latchkey reads the public page through Firecrawl to fill in their property, rooms and photos for them to check. Each page read costs Firecrawl credits. Add FIRECRAWL_API_KEY in Lovable Cloud → Secrets, then switch it on here (or in Routines).",
    on: "On for every host",
    off: "Off",
    needsKey: "Add FIRECRAWL_API_KEY first.",
    switched: (on: boolean) => (on ? "Listing import is on for hosts." : "Listing import is off."),
  },
  title: "Integrations",
  body: "Keys live in Lovable Cloud → Secrets, never here. This shows what's set up and the one-time steps left. Each paid or free channel can also be switched off in Routines.",
  ready: "Set up",
  missing: "Not set up",
  email: {
    title: "Sending email (receipts, alerts, invites)",
    body: "Lovable's managed email sends from your verified domain. Add the DNS records Lovable gives you (Cloud → Emails) at your domain provider; nothing to set here.",
  },
  push: {
    title: "Push alerts (free)",
    body: "Web Push to hosts' phones, tablets and computers. Make a key pair once, then add both as secrets: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (optionally VAPID_SUBJECT, e.g. mailto:you@domain).",
    make: "Make a key pair",
    warn: "Copy these into Lovable Cloud secrets now; the private key isn't shown again. Changing keys later means hosts turn alerts on again.",
  },
  telegram: {
    title: "Telegram alerts (free)",
    body: "In Telegram, message @BotFather → /newbot, name it (e.g. Latchkey Alerts) and copy the token into the secret TELEGRAM_BOT_TOKEN. Then connect the webhook here.",
    connect: "Connect webhook",
    connected: (bot: string) => `Webhook connected to @${bot}`,
    bot: (bot: string) => `Bot: @${bot}`,
  },
  sms: {
    title: "SMS alerts (Twilio, pay as you go)",
    body: "Create a Twilio account, top up £10, buy a UK number (or use a Messaging Service), then add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM (the number, a sender name, or the MG… service id). About 4p per UK text.",
    test: "Send a test text",
    to: "Your mobile, with country code",
    sent: "Test text sent.",
  },
  inbound: {
    title: "Booking-site messages by email (free)",
    body: "Easiest: a free Postmark account → Servers → Inbound stream. Postmark gives you an address like abc123@inbound.postmarkapp.com: enter it below with +{code} before the @. Set the inbound webhook to the URL below (with your secret), and add the secret INBOUND_EMAIL_SECRET (any long random text). Or use Cloudflare Email Routing with the worker in docs/inbound-email-worker.js.",
    address: "Forwarding address pattern",
    placeholder: "abc123+{code}@inbound.postmarkapp.com",
    webhook: "Webhook URL (add your secret at the end)",
    save: "Save",
    saved: "Saved",
  },
});

/** Today: the in-house conversation with every guest. */
export const guestMessagesCopy = branded({
  title: "Guest messages",
  usp: "Only in Latchkey: one recorded conversation per stay. Messages, extras, charges and requests sit together with the booking, so there's always a record of what was asked, agreed and paid, whichever site the guest booked on.",
  showLabel: "Show",
  scopes: { now: "Staying now", upcoming: "Arriving soon", past: "Past 30 days" } as Record<
    string,
    string
  >,
  onlyWaiting: "Only what's waiting on me",
  empty: {
    now: "Nobody is staying today.",
    upcoming: "No arrivals in the next 30 days.",
    past: "No stays in the last 30 days.",
  } as Record<string, string>,
  nothingWaiting: "Nothing is waiting on you.",
  newCount: (n: number) => `${n} new`,
  waitingCount: (n: number) => `${n} waiting`,
  guest: "Guest",
  stay: "Stay",
  messages: "Messages",
  unpaid: "Unpaid",
  extras: "Extras",
  them: "Guest",
  you: "You",
  noMessages: "No messages yet. Tap to write to them.",
  chips: {
    unread: (n: number) => `${n} new`,
    reply: () => "Awaiting your reply",
    approve: (n: number) => `${n} to approve`,
    unpaid: (n: number) => `${n} unpaid`,
    deliver: (n: number) => `${n} to deliver`,
    jobs: (n: number) => `${n} request${n === 1 ? "" : "s"} open`,
    unseen: () => "Not seen by guest",
    sorted: () => "All sorted",
  } as Record<string, (n: number) => string>,
  requestStatus: {
    requested: "To approve",
    suggested: "Time suggested",
    approved: "Approved",
    awaiting_payment: "Unpaid",
    confirmed: "Paid",
    delivered: "Delivered",
    declined: "Declined",
    cancelled: "Cancelled",
  } as Record<string, string>,
  jobStatus: {
    new: "New",
    acknowledged: "Seen",
    booked: "Booked",
    in_progress: "In progress",
    done: "Done",
    declined: "Declined",
    cancelled: "Cancelled",
  } as Record<string, string>,
});

/** Today: a welcome on the front-door kiosk for an arriving guest. */
export const kioskWelcomeCopy = branded({
  title: "Welcome a guest on the kiosk",
  forGuest: "For",
  anyone: "Anyone arriving",
  headline: "Big words",
  body: "Smaller words (optional)",
  for: "Show for",
  defaultHeadline: (first: string) => (first ? `Welcome, ${first}` : "Welcome"),
  defaultBody:
    "We're so glad you're here. Tap anywhere to check in and we'll get you to your room.",
  durations: {
    "30": "30 minutes",
    "60": "1 hour",
    "120": "2 hours",
    "240": "4 hours",
    "480": "8 hours",
  } as Record<string, string>,
  show: "Show on the kiosk",
  update: "Update the kiosk",
  shown: "Showing on the kiosk now.",
  updated: "Updated on the kiosk.",
  showing: (since: string, until: string) =>
    `On the kiosk since ${since}, until ${until} unless the guest taps it.`,
  tapped: (at: string) => `The guest tapped it at ${at} and went on to check in.`,
  edit: "Change it",
  remove: "Remove",
  removed: "Taken off the kiosk.",
  notReady: "Kiosk welcomes need the latest update (migration 0034).",
});

/** What's new: Latchkey's own updates, for hosts. */
export const whatsNewCopy = branded({
  navLabel: "What's new",
  title: "What's new",
  subtitle: "Every Latchkey update, newest first.",
  popupTitle: "What's new in Latchkey",
  popupBody: "Here's what changed since you last looked.",
  gotIt: "Got it",
  seeAll: "See every update",
  levels: { major: "Major update", minor: "New features", fix: "Fixes" } as Record<string, string>,
  kinds: { new: "New", improved: "Better", fixed: "Fixed" } as Record<string, string>,
  versionLine: (version: string, date: string) => `Version ${version} · ${date}`,
});

/** Moving and folding Today's sections. */
export const dashboardCopy = branded({
  grab: (title: string, folded: boolean) =>
    `${title}: drag onto another card or a column to move it, tap to ${folded ? "unfold" : "fold"}. Up and down arrows move it, left and right pick the column, Enter ${folded ? "unfolds" : "folds"} it.`,
  grabHint: "Drag to move (onto a card or into a column) · tap to fold",
  widen: (title: string) => `Make ${title} full width`,
  narrow: (title: string) => `Make ${title} one column wide`,
  widenHint: "Full width",
  narrowHint: "One column",
  fold: (title: string) => `Fold ${title}`,
  unfold: (title: string) => `Unfold ${title}`,
  reset: "Put Today's sections back in their usual order",
});

/** The Today dashboard: everything at a glance, each item a link to where it lives. */
export const todayDash = branded({
  subtitle: "Everything at a glance. Tap anything to go straight to it.",
  hint: "Hover, or press and hold, for details.",
  guestsTitle: "Guests today",
  arriving: "Arriving",
  staying: "Staying",
  leaving: "Leaving",
  needsDetails: "Need details",
  doubleBooked: "Double booked?",
  seeAll: (n: number) => `See all ${n}`,
  noneArriving: "Nobody arriving",
  noneStaying: "Nobody staying",
  noneLeaving: "Nobody leaving",
  noneNeeds: "All details in",
  guestNoName: "Name to confirm",
  checkedIn: "Checked in",
  notCheckedIn: "Not checked in yet",
  arrives: "Arrives",
  leaves: "Leaves",
  room: "Room",
  guests: "Guests",
  bookedOn: "Booked on",
  reference: "Reference",
  nights: "Nights",
  openCard: "Open guest card",
  leavingTitle: "Leaving today",
  emailInvoice: "Email invoice",
  downloadInvoice: "Download",
  invoiceSent: "Invoice emailed to the guest.",
  invoiceNoEmail: "No email for this guest yet. Add it on their booking, then send.",
  invoiceDemo:
    "Guest messages are in demo mode, so nothing was emailed. Switch them to live in Settings.",
  invoiceFailed: "The email didn't go. Try again, or download it and send it yourself.",
  invoiceByPlatform: "Invoiced by the booking site",
  emailedOn: (when: string) => `Emailed ${when}`,
  noEmailFix: "No email: add one on the booking",
  waitingTitle: "Waiting on you",
  waitingEmpty: "No guest requests waiting.",
  requestNew: "New",
  requestSeen: "Seen",
  requestBooked: "Booked",
  requestDoing: "In progress",
  extrasLabel: "Extras",
  asked: "Asked",
  note: "Note",
  total: "Total",
  openServices: "Open Services",
  openBoard: "Housekeeping board",
  cleaningTitle: "Cleaning and closed times today",
  cleaningEmpty: "No cleaning or closed times today.",
  wholeHouse: "Whole house",
  turnaround: (room: string, gap: number) =>
    `${room}: only ${gap < 0 ? 0 : gap} minutes between guests`,
  setTimes: "Cleaning times",
  maintenanceTitle: "Maintenance booked",
  maintenanceEmpty: "Nothing booked for the next 7 days.",
  bookMaintenance: "Book maintenance",
  status: "Status",
  trade: "Tradesperson",
  connectionsTitle: "Calendar connections",
  connectionsEmpty: "No calendars connected yet.",
  connect: "Connect a calendar",
  lastChecked: "Last checked",
  allWorking: (n: number) => `All ${n} working`,
  mixed: (ok: number, waiting: number) => `${ok} working · ${waiting} not checked yet`,
  groupBy: "Group calendar links",
  byRoom: "By room",
  byPlatform: "By platform",
  filterStates: "Show links that are",
  noneMatch: "No links match the filter.",
  countOk: (n: number) => `${n} working`,
  countWaiting: (n: number) => `${n} not checked yet or not set up`,
  countBroken: (n: number) => `${n} not working`,
  notSetUp: "Not set up",
  notCheckedOrSetUp: "Not checked yet or not set up",
  someProblems: (bad: number, n: number) => `${bad} of ${n} need a look`,
  guideTitle: "Guest guide",
  guideProgress: (done: number, all: number) => `${done} of ${all} sections written`,
  guideMissing: "Still to write",
  guideComplete: "Every section is written.",
  guideToday: "Send today's arrivals their guide",
  guideTodayBody:
    "Copy each guest's private guide link and send it however you usually message them.",
  welcomeTitle: "Guest welcome",
  welcomeBody: "Greet an arriving guest by name, full screen on the kiosk, until they tap it.",
  wholeProperty: "Whole property",
  roomOwnSections: (n: number) =>
    `${n} section${n === 1 ? "" : "s"} written just for this room; the rest come from the whole-property guide.`,
  roomUsesHouse:
    "Uses the whole-property guide. Add this room's own heating, shower or layout notes.",
  roomOwnShort: (n: number) => `${n} own`,
  roomHouseShort: "house guide",
  roomQrPeek: "Print this room's QR code: guests scan it in the room for how everything works.",
  roomQrLabel: (room: string) => `Print the QR code for ${room}`,
  roomQrNudge:
    "Put each room's QR code by the bed or on the door: the guide guests use without asking.",
  printRoomQrs: "Print room QR codes",
  editGuide: "Edit guide",
  kioskTitle: "Kiosk and QR code",
  kioskBody:
    "Guests check themselves in on a tablet by the door, or by scanning the QR code with their phone.",
  openKiosk: "Open kiosk",
  guestPage: "Guest check-in page",
  printQr: "Print QR code",
  checkinSettings: "Check-in settings",
  kioskPeek: "Opens full screen in a new tab. Leave it running on a tablet by the front door.",
  pagePeek: (path: string) => `The page guests reach from the QR code: ${path}`,
  qrPeek: "A printable sign with your QR code and simple steps for guests.",
  settingsTitle: "Useful settings",
  settingsBody: "Shortcuts to the settings you'll change most often.",
  settingsGroups: {
    property: "Property and rooms",
    guests: "Guests and check-in",
    messages: "Messages and alerts",
    money: "Payments and billing",
    team: "Team and connected apps",
  } as Record<string, string>,
  settingsLinks: {
    property: ["Property details", "Address, check-in and check-out times, wifi, door PIN."],
    checkin: ["Check-in methods", "Kiosk, QR code, PIN and which checks guests go through."],
    records: [
      "Guest records and ID",
      "Asking about adults and children, photo ID and how long it's kept.",
    ],
    rooms: ["Rooms", "Names, numbers, guests per room and calendar links per room."],
    cleaning: ["Cleaning times", "Times rooms or the house are closed each week."],
    team: ["Team", "Invite people and choose what they can do."],
    payments: ["Guest payments", "Your Stripe account for extras and direct stays."],
    invoices: ["Invoices", "Your business details and tax on invoices for direct stays."],
    api: ["API & MCP keys", "Make keys to connect AI assistants and other apps."],
    alerts: ["App and alerts", "Install the app; get alerts by push, Telegram, email or text."],
    platformMessages: [
      "Airbnb and Booking.com messages",
      "Forward their message emails so each lands in the guest's conversation.",
    ],
    apiGuide: [
      "API & MCP guide",
      "Step-by-step set-up for Claude, ChatGPT, Cursor and your own tools, with every action explained.",
    ],
    billing: ["Subscription", "Your plan, card and invoices from Latchkey."],
    register: ["Guest register", "The UK record of every guest aged 16 or over."],
  } as Record<string, [string, string]>,
});

export const bookings = branded({
  phoneFull: "Guest's phone",
  phoneLast4Only: "Or only the last 4 digits (enough for check-in)",
  title: "Bookings",
  subtitle: "Every stay across your channels, in one place.",
  guestEmail: "Guest email (optional)",
  guestEmailHint: "Lets the guest confirm who they are at check-in",
  guestAddress: "Guest's postal address (optional)",
  guestAddressHint: "Printed under their name on invoices",
  mirrorNote:
    "Another platform is showing this stay as closed. It is linked to the real booking, so it is not counted twice.",
  listing: "Listing",
  tentative: "The platform marks this stay as not yet confirmed.",
  openOnPlatform: "Open on the platform",
  alsoClosedOn: "Also closed on",
  blockedCell: "Closed",
  listView: "List",
  timelineView: "Timeline",
  addBooking: "Add booking",
  importCsv: "Import bookings",
  empty: "No bookings yet. Add one by hand, import a file, or connect a calendar.",
  filtersRoom: "Room",
  filtersChannel: "Channel",
  filtersStatus: "Status",
  allRooms: "All rooms",
  allChannels: "All channels",
  allStatuses: "All statuses",
  guestUnknown: "Guest name to confirm",
  nights: "nights",
  night: "night",
  editBooking: "Edit booking",
  undoCheckIn: "Undo check-in",
  undoCheckInHelp: "This guest is checked in.",
  undoCheckInConfirm:
    "Undo this check-in? The guest's stay link stops working and they'll need to check in again.",
  undoCheckInDone: "Check-in undone. The booking is back to upcoming.",
  manualNote: "Fields you change here are kept, even when the channel calendar updates.",
  importTitle: "Import bookings from a file",
  importBody: "Upload a CSV export from a channel or spreadsheet, then match the columns.",
  importChoose: "Choose CSV file",
  importConfirm: "Import bookings",
  importedToast: "bookings imported",
});

export const properties = branded({
  title: "Properties",
  subtitle: "Your property, its details and its rooms.",
  addProperty: "Add property",
  tabsLabel: "Property sections",
  tabProperty: "Property and rooms",
  tabExtras: "Extras",
  elsewhereTitle: "Also for this property",
  elsewhere: {
    checkin: ["Check-in journey", "Settings → Guests"],
    records: ["Who's staying and ID records", "Settings → Guests"],
    stayAccess: ["Room QR codes and Wi-Fi", "Settings → Guests"],
    kioskRest: ["Screen saver (night light, clocks, screen off)", "Settings → Look"],
    schedule: ["Cleaning and unavailable times", "Housekeeping → Schedule"],
    calendars: ["Calendar links and each room's shared calendar", "Connections"],
  } as Record<string, [string, string]>,
  feedTitle: "Room calendars",
  addRoom: "Add room",
  noProperties: "No properties yet. Add one, or load the demo rooms to have a look around.",
  noRooms: "No rooms in this property yet.",
  guestLink: "Guest link",
  doorPin: "Door PIN",
  quietHours: "Quiet hours",
  checkInWindow: "Check-in and check-out",
  wifi: "Wi-Fi",
  cleaning: "Cleaning and unavailable times",
  addWindow: "Add cleaning window",
  wholeHouse: "Whole house",
  weekly: "Every",
  noWindows: "No cleaning windows set.",
});

export const connections = branded({
  title: "Connections",
  subtitle: "Calendar links that keep your bookings in step.",
  byRoomTitle: "Each room across platforms",
  byRoomBody:
    "Link every platform that lets the same room. Latchkey matches the entries so one stay is never counted twice.",
  noLinks: "No calendars linked to this room yet.",
  add: "Add calendar link",
  test: "Test link",
  syncNow: "Sync now",
  syncAll: "Sync all",
  lastSynced: "Last checked",
  never: "Not checked yet",
  empty: "No calendars connected. Paste an iCal link from a channel to start.",
  linkLabel: "Calendar link (iCal)",
  linkHelp: "Your link is stored privately on the server. Only a shortened version is shown here.",
  roomLabel: "Room this calendar belongs to",
  listingLabel: "What the channel calls this listing",
  history: "Recent checks",
  noHistory: "No sync history yet.",
  testOk: "That link works.",
  managerTitle: "Channel manager (Beds24, Smoobu, Hostaway)",
  managerBody:
    "Latchkey works alongside channel managers through calendar links. It doesn't sync rates or availability with them.",
  comingSoon: "Coming soon",
  conflictTitle: "Something needs your eye",
  syncedToast: "Calendar checked",
  removeConfirm: "Remove this calendar link? Bookings already imported are kept.",
});

export const settings = branded({
  title: "Settings",
  subtitle: "Your business details and demo content.",
  business: "Your business",
  businessName: "Business name",
  contactEmail: "Contact email",
  contactPhone: "Contact phone",
  currency: "Currency",
  timezone: "Timezone",
  save: "Save changes",
  saved: "Saved",
  demoTitle: "Demo content",
  demoBody:
    "Load The Hill Suites in Amersham: three rooms, bookings across four channels, and Tuesday and Thursday cleaning windows.",
  demoOwnerBody:
    "Your business still has the sample rooms and bookings from the demo. Remove them when you're ready to run your own.",
  loadDemo: "Load demo rooms",
  resetDemo: "Reset demo dates",
  removeDemo: "Remove demo data",
  demoBanner: "You are looking at demo content.",
  removing: "Removing…",
  channelsTitle: "What you call each booking site",
  channelsBody:
    'Guests see these names and icons when they check in. Rename any of them — for example "Booked directly" to "Our website" — tap an icon to upload your own, and add new sites as you start using them. Leave a name blank to keep the standard one. Your calendars and reports are unaffected.',
  channelsSaved: "Booking sites saved",
  channelsAdd: "Add a booking site",
  channelsNewName: "Site name",
  channelsNewPlaceholder: "For example Expedia",
  channelsIcon: "Icon",
  channelsUploadIcon: (name: string) => `Upload an icon for ${name}`,
  channelsRemoveIcon: "Use the standard icon",
  channelsRemove: (name: string) => `Remove ${name}`,
  channelsIconHelp: "Square images work best. We shrink them to fit on one line.",
  channelsIconBad: "Please choose a PNG, JPG, WebP or ICO image.",
  channelsNeedName: "Give each site you add a name.",
});

export const onboarding = branded({
  title: "Let's set up your rooms",
  subtitle: "Three short steps. You can change anything later.",
  step1: "Property",
  step2: "Rooms",
  step3: "Arrivals",
  next: "Continue",
  back: "Back",
  finish: "Finish setup",
  orDemo: "Or explore with demo rooms first",
});

export const common = branded({
  save: "Save",
  cancel: "Cancel",
  remove: "Remove",
  edit: "Edit",
  add: "Add",
  loading: "Loading…",
  errorTitle: "Something went wrong",
  errorBody: "We could not load this just now. Try again in a moment.",
  notFound: "We could not find that page.",
  retry: "Try again",
});

export const kioskRestCopy = branded({
  title: "Screen saver",
  body: "What the door tablet shows when nobody is using it. Any touch wakes it, ready to check in.",
  nightLight: "Night light",
  nightLightHelp:
    "Bright, softly changing colours that light the hallway at night, instead of the clock screensaver. A fine shimmer keeps every pixel changing, so nothing burns in.",
  when: "When",
  whenOptions: { always: "Whenever the kiosk rests", quiet: "Only during quiet hours" },
  quietBetween: (start: string, end: string) =>
    `${start} to ${end}, from the property's quiet hours`,
  style: "Style",
  modes: {
    glow: { label: "Glow", help: "One colour at a time, gently swelling" },
    flow: { label: "Flow", help: "Bands of colour drifting across" },
    aurora: { label: "Aurora", help: "Soft glows wandering" },
  },
  colours: "Colours",
  palettes: {
    candle: "Candlelight",
    ember: "Ember",
    moonlight: "Moonlight",
    meadow: "Meadow",
    pearl: "Pearl",
  },
  speed: "Speed",
  speedEnds: ["Slow", "Lively"],
  speedValue: (n: number) =>
    ["Very slow", "Slow", "Gentle", "Lively", "Very lively"][n - 1] ?? "Gentle",
  otherwise: "At rest",
  otherwiseOff: "When the night light is off",
  otherwiseQuiet: "Outside quiet hours",
  otherwiseOptions: {
    clock: {
      label: "Clock screensaver",
      help: "World clocks, dimmed, with the date and quiet hours.",
    },
    blank: { label: "Screen off", help: "A dark screen until someone touches it." },
  },
  clockQr: "Check-in QR code while the kiosk rests",
  clockQrHelp:
    "Shown on the clock screensaver, the night light and with the screen off, so guests can scan it without touching the kiosk. It's never a white block (light on dark, or dark on the night light) and moves every few minutes so nothing burns in.",
  preview: "Preview",
  previewQuiet: "Quiet hours",
  previewDay: "Rest of the day",
  previewShowing: {
    night: "Night light",
    clock: "Clock screensaver",
    blank: "Screen off",
  } as Record<string, string>,
  bandsNote:
    "On the kiosk, slide the left edge for brightness and the right edge for colour depth.",
  saved: "Screen saver saved. The kiosk has been told.",
  quickTitle: "Screen saver",
  quick: { night: "Night light", clock: "Clocks", blank: "Screen off" },
  quickDone: {
    night: "Night light on. An idle kiosk lights up now.",
    clock: "The kiosk shows the clocks at rest.",
    blank: "The kiosk's screen goes dark at rest.",
  },
  quickQuiet: (start: string, end: string, otherwise: string) =>
    `Night light from ${start} to ${end}; ${otherwise.toLowerCase()} otherwise.`,
});

export const checkinSettings = branded({
  title: "Guest check-in",
  body: "Choose how guests confirm who they are when they check themselves in.",
  printQr: "Print QR card",
  openKiosk: "Open front-door kiosk",
  methods: {
    photo_id: "Photo ID check",
    last4: "Booking details check",
    self_declare: "Guest self-declaration",
  } as Record<string, string>,
  methodHelp: {
    photo_id:
      "Guest photographs their ID. We read the name, keep only the result and never store the photo.",
    last4:
      "Guest enters the last 4 of their booking reference or phone, or their email, whichever the booking has.",
    self_declare:
      "Always offered as the last resort so no one is stuck at the door. You'll get an alert to check ID in person.",
  } as Record<string, string>,
  primary: "Ask first",
  fallbackNote:
    "If the camera won't start or a guest needs more than 2 photo tries, Latchkey moves to the next option automatically.",
  listFlowNote:
    "ID checks are off: guests choose their platform, then pick their booking from a list showing first name and initial only.",
  saved: "Check-in settings saved",
  records: {
    title: "Who's staying and ID records",
    body: "Ask how many people arrived, check every adult's ID, and choose what you keep. Children only give their age.",
    askWhoIsStaying: "Ask who's staying",
    askWhoIsStayingHelp:
      "Guests say how many adults and children arrived. You're told if it differs from the booking or the room's size.",
    checkEveryAdult: "Check every adult's ID",
    checkEveryAdultHelp:
      "After the lead guest, each adult photographs their own photo ID. Anyone without one can carry on, and you're told.",
    idPhoto: "Keep a small copy of each ID",
    idPhotoHelp:
      "Low-resolution, still readable on your phone. Without this, only the main details are kept: name, date of birth, ID type, country and last 4 of the number.",
    facePhoto: "Take a face photo",
    facePhotoHelp: "Each adult takes a quick photo so you can see it matches their ID.",
    keepDays: "Keep details and photos for",
    keepDaysOption: (n: number) => `${n} days after check-out`,
    regulator:
      "I'm registered with the ICO (or my country's data regulator) and my privacy notice tells guests about ID photos",
    regulatorHelp:
      "Keeping photos of IDs and faces is personal data. In the UK you normally need to pay the ICO data protection fee and tell guests why you keep them and for how long. Photo options stay off until you tick this.",
    regulatorNeeded: "Tick the registration box above to keep photos.",
    stepsInJourney:
      "Which steps ask for these (who's staying, every adult's ID, keeping the ID photo, the face photo) is set in the Check-in journey above. Photos are only kept once you tick the box above.",
    askRequiredUk: "Always on in the UK: the guest register needs to know who's staying.",
    lawNoteUk:
      "UK guest register: everyone aged 16 or over gives their full name and nationality at check-in, and guests who aren't British, Irish or Commonwealth citizens also give their passport or ID number, where it was issued and where they're going next (Immigration (Hotel Records) Order 1972). This is always on, kept for 12 months from arrival whatever you choose above, and found under Guest register.",
    lawNoteElsewhere:
      "This property isn't in the UK, so the UK guest register doesn't apply. Check what your local law asks you to record.",
  },
  journey: {
    title: "Check-in journey",
    body: "What a guest goes through at the door tablet or on their phone. Tick the steps you want; the boxes show the order.",
    quick: "Quick",
    quickHelp: "Photo ID finds the stay, then a face photo. About a minute.",
    thorough: "Thorough",
    thoroughHelp: 'Adds "Is this you?", every adult\'s ID and the booking-reference fallback.',
    followLatchkey: "Use Latchkey's journey",
    followingLatchkey: "Following Latchkey's journey. Change anything to make it your own.",
    ownJourney: "Your own journey for this property.",
    lanes: {
      welcome: "You put a welcome on the tablet for them",
      find: "No welcome (a busy door)",
      everyone: "Then, for everyone",
      fallback: "If the photo ID can't be used",
    } as Record<string, string>,
    done: "Checked in: guide opens",
    steps: {
      welcome_go: "Check in from the welcome",
      find_id: "Photo ID finds the booking",
      find_letter: "Surname initial",
      find_checkout: "Check-out day",
      find_confirm: '"Is this you?"',
      party: "Who's checking in",
      lead_id: "Photo ID",
      keep_id: "Keep the ID photo",
      every_adult_id: "Every adult's ID",
      selfie: "Face photo",
      register: "UK guest register",
      last4: "Booking reference or phone digits",
      self_declare: "Guest's own word",
    } as Record<string, string>,
    help: {
      welcome_go:
        "Their name is already on the screen, so the Check in button opens their stay: nothing to type or pick.",
      find_id:
        "They photograph their ID first; the name on it finds their booking and counts as their ID check. If it can't, the next two steps ask.",
      find_letter: "Only if the ID didn't find them: the first letter of their surname.",
      find_checkout: "Pick their check-out day, shown with its number of nights.",
      find_confirm: '"Hi Priya, is this your Airbnb booking?" before going on.',
      party:
        "How many adults and children arrived. Skipped when the booking already says how many; guests can still add someone at the end.",
      lead_id: "The lead guest photographs their passport or licence.",
      keep_id:
        "A small copy is kept for you, even when it can't be read automatically, so you can check it yourself.",
      every_adult_id: "Each other adult photographs their own ID (or on their own phone).",
      selfie: "A quick face photo, so you can see it matches the ID.",
      register:
        "Everyone 16 or over (UK law), filled in from their ID without asking. Only what an ID doesn't show is asked (nationality on a UK driving licence; next destination for guests who aren't British, Irish or Commonwealth). An ID that can't be read is skipped and listed for you to add from the photo.",
      last4: "The last 4 of their booking reference or phone, or their email.",
      self_declare: "They confirm it's them and you're told to check ID in person.",
    } as Record<string, string>,
    checkoutThree: "3 close choices",
    checkoutWeek: "The coming week",
    locks: {
      always: "Always on",
      uk: "Always on in the UK",
      required: "Required by Latchkey",
      removed: "Removed by Latchkey",
      needs: "Needs the step before",
    } as Record<string, string>,
    needsRegulator: "Tick the ICO registration in ID records below to keep photos.",
    readingLive: "Details read automatically",
    readingDemo: "Demo: sample details, nothing read",
    readingOff: "Automatic reading is off: the photo is kept for you to check",
    readingOffNoKeep:
      "Automatic reading is off: turn on Keep the ID photo, or this step is skipped",
    cameras: "Cameras on the door tablet",
    camerasHelp:
      "On a guest's own phone the back camera reads the ID and the front one takes the face photo. Guests can switch camera on the screen either way.",
    idCamera: "Photo ID",
    selfieCamera: "Face photo",
    front: "Front",
    back: "Back",
    saved: "Check-in journey saved",
    adminTitle: "Check-in journey (Latchkey)",
    adminBody:
      "The journey new properties start with. Required steps are switched on for every property and removed ones are taken out for every property, whatever the host chose.",
    adminChoice: {
      off: "Off to start",
      on: "On to start",
      required: "Required for everyone",
      removed: "Removed for everyone",
    } as Record<string, string>,
    adminSaved: "Latchkey's check-in journey saved",
    unavailable: "The check-in journey needs the latest database update (migration 0065).",
  },
  calibration: {
    title: "Door tablet screen",
    body: "Line up the kiosk on the tablet: move it, pull its edges in or out, or zoom. Watch the tablet: it changes as you go, and stays like this until you reset it.",
    none: "No paired door tablet yet. Open the kiosk on the tablet while signed in (or unlock it with your PIN) to pair it.",
    pick: "Tablet",
    unnamed: (n: number) => `Door tablet ${n}`,
    seen: (when: string) => `Last seen ${when}`,
    never: "Not seen yet",
    rename: "Name",
    renamePlaceholder: "Front door",
    learned: "Learning by itself",
    calibrated: "Calibrated",
    wayUp: { landscape: "On its side", portrait: "Upright" } as Record<string, string>,
    noDisplay: "Waiting for the tablet to report its screen. Make sure the kiosk is open on it.",
    drag: "Drag the area to move it, its edges to resize, pinch or scroll to zoom.",
    move: "Move",
    up: "Up",
    down: "Down",
    left: "Left",
    right: "Right",
    size: "Size",
    smaller: "Smaller",
    larger: "Larger",
    zoom: "Zoom",
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    fine: "Fine steps",
    reset: "Reset: learn by itself",
    resetDone: "Reset. The tablet learns its screen again.",
    savedAuto: "Saved automatically",
    saving: "Saving…",
    readout: (w: number, h: number, x: number, y: number, z: number) =>
      `${w} × ${h} px, moved ${x}, ${y}, zoom ${Math.round(z * 100)}%`,
    open: "Calibrate the door tablet screen",
  },
  back: "Back to properties",
  print: "Print",
  cardHeadline: "Scan to check yourself in",
  cardOrVisit: "Or visit",
  cardPin: "Property PIN",
  qrAlt: "QR code for guest check-in",
});

export const goodbyeCopy = branded({
  title: "Check-out cards",
  body: "On check-out day the door tablet says goodbye to each guest leaving: a personal goodbye, safe travels and where the keys go. Their guest guide puts the check-out things first too.",
  unavailable: "The check-out goodbye needs the latest database update (migration 0068).",
  on: "Say goodbye on the door tablet on check-out day",
  message: "Goodbye message",
  messageHelp: "{name} becomes the guest's first name.",
  keyDrop: "Where the keys go",
  lockDoor: "Remind them to lock the front door",
  lockLine: "Please make sure the front door is locked behind you.",
  startBefore: "Start showing it",
  minutesBefore: (m: number) =>
    m < 60 ? `${m} min before check-out` : `${m / 60} hour${m === 60 ? "" : "s"} before check-out`,
  lateLead: "With a late check-out, start",
  lateLeadOption: (m: number) =>
    m === 0 ? "At the standard check-out time" : `${m} min before the standard check-out`,
  howItEnds:
    "It shows until their check-out time (their late one, if they booked it). It goes earlier when they tap Express check-out, when you dismiss it on Today, or when you mark them checked out.",
  preview: "On the door tablet",
  sampleName: "Priya",
  express: "Express check-out",
  saved: "Check-out goodbye saved",
  todayTitle: "Leaving today",
  todayEmpty: "Nobody checks out today.",
  todayShowing: "Goodbye on the tablet",
  todayDismissed: "Goodbye taken off",
  todayLeft: "Checked out",
  dismiss: "Take goodbye off",
  dismissed: "Taken off the tablet.",
});

export const updateCopy = branded({
  update: "Update",
  updateTo: (v: string) => (v ? `Update to v${v}` : "Update"),
  scheduled: (when: string) =>
    `Latchkey updates at ${when}. This page reloads by itself once you've left it alone for 15 minutes.`,
  adminTitle: "App updates",
  adminBody:
    "Ask every host dashboard or every door tablet to load the newest version. Each one reloads by itself once nobody has used it for 15 minutes (a tablet also waits while a welcome or goodbye shows or someone is checking in). Schedule it to tell every business ahead in their alerts.",
  running: (v: string) => `This server runs v${v}.`,
  hosts: "Host dashboards",
  kiosks: "Door tablets",
  now: "Update now",
  whenIdle: "When not in use",
  modesHelp:
    "Update now: reloads within a minute or two, even mid-use. When not in use: once nobody has used it for 15 minutes (a tablet also waits for a check-in or your welcome to finish). Scheduled: reloads at that time.",
  modeName: { now: "straight away", idle: "when not in use" } as Record<string, string>,
  at: "At",
  schedule: "Schedule",
  cancel: "Cancel",
  none: "Nothing asked for",
  asked: (when: string, how: string) => `Asked for ${when}, ${how}`,
  saved: (n: number) => (n ? `Scheduled. ${n} businesses told in their alerts.` : "Done."),
  tabletsTitle: "Update tablets",
  tabletsNow: "Update all tablets",
  tabletsHelp:
    "Each tablet reloads with the newest version once nobody has used it for 15 minutes and no welcome or goodbye is showing.",
  tabletsAsked: "Tablets will update once nobody is using them.",
  tabletsNowDone: "Tablets are updating now.",
  tabletsScheduled: "Scheduled.",
  outOfDate: (v: string) => `Older version (newest v${v})`,
});

export const kioskCardsCopy = branded({
  title: "Door tablet: welcome and goodbye",
  body: "Each guest arriving or leaving today gets a card on the door tablet, on the timings in Settings → Kiosk. Show one now, or take it off.",
  tabIn: (n: number) => `Check-in (${n})`,
  tabOut: (n: number) => `Check-out (${n})`,
  noName: "Guest (no name yet)",
  state: {
    showing: "On the tablet now",
    later: "Shows later today",
    off: "Taken off",
    done: "Done",
  } as Record<string, string>,
  showNow: "Show now",
  takeOff: "Take off",
  shownNow: "On the tablet now.",
  takenOff: "Taken off the tablet.",
  noneIn: "Nobody arrives today.",
  noneOut: "Nobody checks out today.",
  custom: "Write a custom welcome",
  settingsIn: "Check-in card settings",
  settingsOut: "Check-out card settings",
  settingsTitle: "Check-in cards",
  settingsBody:
    "On arrival day the door tablet welcomes each guest by name. Its Check in button starts with their photo ID, which finds their booking, so a card never skips the ID check.",
  on: "Welcome arriving guests on the door tablet",
  startBefore: "Start showing it",
  minutesBefore: (m: number) =>
    m < 60 ? `${m} min before check-in` : `${m / 60} hour${m === 60 ? "" : "s"} before check-in`,
  earlyLead: "With an early check-in, start",
  earlyLeadOption: (m: number) =>
    m === 0 ? "At their early check-in time" : `${m} min before their early check-in`,
  howItEnds:
    "It shows until they check in or the day ends, and goes earlier when you take it off here or on Today. While any check-in or check-out card is up, the screensaver doesn't start. A custom welcome you write joins the cards: it replaces that guest's card (never a second one) or adds a card.",
  saved: "Check-in cards saved",
  checkIn: "Check in",
  atSetTime: "At a set time of day",
  colour: "Card colour",
  anyColour: "Any colour",
  todayList: "Arriving today: take a card off, or show it now",
  todayListOut: "Leaving today: take a card off, or show it now",
});

export const kioskPreviewCopy = branded({
  open: "Preview tablets",
  title: "What the door tablets show now",
  body: "Each tablet's screen as it is now, page by page when cards turn. Updates every 15 seconds while open.",
  allTablets: "Every tablet",
  cardsLine: (n: number, pages: number) =>
    `${n} card${n === 1 ? "" : "s"}${pages > 1 ? `, ${pages} screens turning every 5 seconds` : ""}`,
  welcomeLine: "Your welcome, full screen",
  startLine: "The usual start screen",
  screenOf: (n: number, of: number) => `Screen ${n} of ${of}`,
  checkIn: "Check in",
  startTitle: "Welcome",
  startBody: "The usual check-in start screen (or the screensaver when nobody's about).",
});

export const doorTabletsCopy = branded({
  title: "Door tablets",
  body: "Every tablet at this property, by number. A tablet joins when it opens the kiosk: by itself on this property's Wi-Fi (if allowed below), or with the six-digit code it shows. Give each a name, line its screen up, and send a welcome to one tablet or all of them.",
  pairTitle: "Code shown on the tablet",
  pair: "Pair tablet",
  pairHelp:
    'Open the kiosk on the tablet: a new one shows "Set up this tablet: code 123 456" in its bottom corner. Type the code here. The host PIN on the tablet works too.',
  paired: (n: number) => `Tablet ${n} is paired.`,
  autoPair: "Tablets on this property's Wi-Fi join by themselves",
  autoPairHelp:
    "A tablet that opens the kiosk on the same Wi-Fi as a tablet already in use (or right beside it) joins straight away and you're told. Turn this off to pair every tablet with its code. Anyone on that Wi-Fi with a laptop could join this way, so remove any tablet you don't recognise.",
  none: "No tablets yet. Open the kiosk on a tablet at the property and it appears here.",
  unavailable: "Door tablets need the latest database update (migration 0067).",
  waiting: "Waiting for its code",
  waitingShort: "needs its code",
  waitingHelp: "Type the code shown in this tablet's bottom corner above to pair it.",
  online: "On now",
  justNow: "Seen just now",
  minutesAgo: (m: number) => `Seen ${m} min ago`,
  hoursAgo: (h: number) => `Seen ${h} h ago`,
  never: "Not seen yet",
  name: "Name",
  namePlaceholder: "Front door",
  screen: (w: number, h: number, o: string) =>
    `${w} × ${h} px, ${o === "portrait" ? "upright" : "on its side"}`,
  camera: "Camera view for you",
  cameraTitle: "Let me view this tablet's camera",
  cameraBody:
    "You'll see a picture from the tablet's front camera every few seconds while you have the camera view open: nothing is recorded, and the tablet says \"Camera on: your host is viewing\" the whole time. It pauses while a guest is checking in. Cameras that see guests are CCTV: in the UK, put up a clear notice by the tablet saying it has a camera and who to contact, mention it in your privacy notice, and only use it for security.",
  cameraTold: "Guests are told: there's a notice by the tablet and it's in my privacy notice.",
  cameraOn: "Turn the camera view on",
  calibrate: "Screen",
  remove: "Remove",
  removeConfirm: (name: string) =>
    `Remove ${name}? If it opens the kiosk again it joins as a new tablet.`,
  viewCameras: (n: number) => (n === 1 ? "View camera" : `View ${n} cameras`),
  wallTitle: "Door tablet cameras",
  wallBody:
    "A new picture every few seconds. The tablets show they're being viewed; when you close this they stop and the pictures are deleted.",
  wallAlt: (name: string) => `Camera picture from ${name}`,
  connecting: "Connecting…",
  welcomeTarget: "Show on",
  allTablets: "All tablets",
});

export const alerts = branded({
  title: "Needs your attention",
  dismiss: "Mark as seen",
});

export const guest = branded({
  welcomeDismiss: "Touch to check in",
  welcomeTap: "Tap here to check in",
  welcomeCheckIn: "Check in",
  welcomeNotMe: "Someone else? Check in here",
  welcomeRestTouch: "Touch the screen to see the welcome again",
  welcomeOthers: "Arriving too? Scan to check in on your phone",
  calibrating: "Screen calibration: these are the edges",
  stepCheckoutPick: "Which is your check-out day?",
  stepCheckoutPickHint: "One of these is yours.",
  nights: (n: number) => (n === 1 ? "1 night" : `${n} nights`),
  cameraFlip: "Switch camera",
  fullscreenOn: "Full screen (hold for 3 seconds)",
  fullscreenOff: "Leave full screen (hold for 3 seconds)",
  holdHint: "Hold for 3 seconds",
  holdToUpdate: "Hold for 3 seconds to update",
  newVersion: (v: string) => `new v${v}`,
  updateNow: (v: string) => (v ? `Update to v${v}` : "Update now"),
  goodbyeTitle: (n: number) => (n === 1 ? "Leaving today" : `${n} guests leaving today`),
  cardsTitle: (arriving: number, leaving: number) =>
    [arriving ? `${arriving} arriving` : null, leaving ? `${leaving} leaving` : null]
      .filter(Boolean)
      .join(" · ")
      .replace(/^/, "Today: "),
  arrivalFrom: (t: string) => `Check-in from ${t}`,
  arrivalCheckIn: "Check in",
  goodbyeSafe: "Safe travels.",
  goodbyeBy: (t: string) => `Check-out by ${t}`,
  goodbyeExpress: "Express check-out",
  goodbyeCheckIn: "Checking in? Start here",
  goodbyePage: (p: number, n: number) => `${p} of ${n}`,
  expressTitle: (name: string) =>
    name ? `Thank you, ${name}. Safe travels!` : "Thank you. Safe travels!",
  expressKeys: "Keys",
  expressDoor: "Please make sure the front door is locked behind you.",
  expressReview: "Enjoyed your stay? A quick review means a lot. Scan to leave one:",
  expressDone: "Done",
  expressCloses: "This screen closes by itself in a few minutes.",
  guideLeavingTitle: "Checking out today",
  guideLeavingBy: (t: string) => `Check-out is by ${t}.`,
  guideKeys: "Where the keys go",
  guideDoor: "Please make sure the front door is locked behind you.",
  guideCheckout: "I've checked out",
  guideCheckedOut: "You're checked out. Thank you for staying, and safe travels!",
  cameraOn: "Camera on: your host is viewing",
  tabletSetup: (code: string) => `Set up this tablet: code ${code}`,
  idFirstTitle: "Let's find your booking",
  idFirstLead:
    "Take a photo of your passport or driving licence. The name on it finds your booking and checks you in.",
  idFirstOther: "No ID with me: find my booking another way",
  idFirstNoMatch:
    "We couldn't find your booking from your ID, so a couple of quick questions instead. You won't need to photograph it again.",
  doneAddGuest: "Someone else with you? Add their ID",
  doneFinished: "I'm done",
  doneTakeLink: "Scan this, or type the link, to open your guide on your phone:",
  shortLinkGone:
    "That link isn't working: it may be mistyped, or the stay has ended. Check the words, or ask your host for a new link.",
  saverStart: "Rest the screen",
  quietTitle: (until: string) => `Quiet hours until ${until}`,
  quietBody:
    "Other guests are sleeping. Please keep noise and movement to a minimum, close doors gently and keep voices low. Thank you.",
  saverHere: "Here",
  tomorrow: "tomorrow",
  yesterday: "yesterday",
  saverWake: "Touch to start checking in",
  saverTouch: "Touch the screen to check in",
  dayPhases: {
    night: "Night",
    dawn: "Dawn",
    morning: "Morning",
    midday: "Midday",
    afternoon: "Afternoon",
    dusk: "Dusk",
    evening: "Evening",
  } as Record<string, string>,
  attachmentOpen: (name: string) => `Open ${name}`,
  attachmentPrev: "Previous",
  attachmentNext: "Next",
  attachmentClose: "Close",
  saverBrightness: "Brightness",
  saverSize: "Clock size",
  saverBandHint: "Slide up or down",
  saverQr: "Scan to check in on your phone",
  nightWake: "Touch to wake the screen",
  nightDepth: "Colour depth",
  kioskQrTitle: "Check in on your phone",
  kioskQrBody:
    "Scan with your phone's camera to check in there instead. Your details stay on your phone.",
  propertyName: "The Hill Suites",
  location: "Amersham",
  welcome: "Welcome to The Hill Suites",
  welcomeBody:
    "Check yourself in, find your room and ask for anything you need. It takes about a minute and there is nothing to download.",
  startCta: "Start checking in",
  switchProperty: "Checking in somewhere else?",
  helpCta: "I need help",
  stayWindow: (from: string, by: string) => `Rooms are ready from ${from}. Check-out is by ${by}.`,
  // Flow
  welcomeTo: (name: string) => `Welcome to ${name}.`,
  letsCheckIn: "Let's get you checked in.",
  back: "Back",
  startAgain: "Start again",
  stepLetter: "What does your surname start with?",
  stepLetterHint: "Your family name, as on your booking.",
  stepCheckout: "Which day do you check out?",
  stepPlatform: "Where did you book?",
  stepPickBooking: "Which booking is yours?",
  noArrivals:
    "We can't see any arrivals on that platform today. Please try another, or call your host.",
  platforms: {
    airbnb: "Airbnb",
    booking_com: "Booking.com",
    homestay: "Homestay.com",
    direct: "Booked directly",
    other: "Somewhere else",
  } as Record<string, string>,
  noMatchTitle: "We couldn't find that booking",
  noMatchBody:
    "Please check your answers and try again. If it still doesn't work, your host is happy to help.",
  welcomeBack: (name: string) => `Welcome back, ${name}`,
  welcomeBackBody:
    "You're already checked in. Just confirm it's you and we'll open your guest guide, where you can reread the house rules or ask for anything you need.",
  lockedTitle: "Let's pause for a moment",
  lockedBody: (time: string) =>
    `We've let your host know you're here. You can try again at ${time}, or give them a call.`,
  callHost: "Call your host",
  hi: (name: string) => `Hi ${name}`,
  confirmBody: "Is this your booking?",
  /** Shown as: Is this your [icon] Airbnb booking? */
  confirmOnSite: { before: "Is this your", after: "booking?" },
  confirmDirect: "direct",
  confirmYes: "Yes, that's me",
  confirmNo: "No, start again",
  idTitle: "A quick ID check",
  idConsent: "We only check your name matches your booking. We don't keep a copy of your ID.",
  idConsentDetails: (days: number) =>
    `We check your name matches your booking. Your host keeps your name, date of birth and the type of ID for ${days} days after you leave, then it's deleted. We don't keep a copy of the photo.`,
  idConsentPhoto: (days: number) =>
    `We check your name matches your booking. For everyone's safety, your host keeps a small copy of your ID and its main details for ${days} days after you leave, then it's deleted.`,
  idNotPhotoId:
    "That doesn't look like a photo ID. Please use a passport, driving licence or ID card that shows your photo.",
  idConsentAgree: "I'm happy to continue",
  idConsentLead: "We'll check the name on your ID matches your booking.",
  companionConsentLead: "We'll just check it's a real photo ID.",
  whyAsk: "Why do we ask?",
  whyAskClose: "Got it",
  // Handing over to the host, from any step
  handoverCta: "Check in with my host instead",
  handoverTitle: "No problem, your host will check you in",
  handoverBody: "We've let them know you're here. Give them a call if you like, or wait nearby.",
  handoverResume: "Carry on checking in myself",
  idUseOther: "Use another way",
  idCameraHelp:
    "Hold your passport, driving licence or ID card flat, with the name clearly visible.",
  idTakePhoto: "Take photo",
  idChecking: "Checking your name…",
  idRetry: (left: number) =>
    `We couldn't read that clearly. Try again with more light and less glare (${left} ${left === 1 ? "try" : "tries"} left).`,
  idCameraFailed: "The camera didn't start, so let's try another way.",
  idRetryPlain: "We couldn't read that clearly. Try again with more light and less glare.",
  idTriesLeft: (left: number) => `${left} ${left === 1 ? "try" : "tries"} left.`,
  last4Title: "Confirm a few details",
  last4Kinds: {
    reference: "Last 4 characters of your booking reference",
    phone: "Last 4 digits of the phone number on your booking",
    email: "The email address on your booking",
  } as Record<string, string>,
  last4Submit: "Check",
  last4Retry: (left: number) => `That doesn't match. ${left} ${left === 1 ? "try" : "tries"} left.`,
  selfTitle: "Nearly there",
  selfBody: "Please confirm you are the guest named on this booking.",
  selfConfirm: "I confirm I'm the guest on this booking",
  selfNote:
    "Thank you. Your host will say hello and check your ID in person during your stay. Nothing more to do for now.",
  continue: "Continue",
  doneTitle: (name: string) => `You're all checked in, ${name}`,
  roomLine: (room: string, title: string | null) =>
    `You're in ${room}${title ? `, ${title}` : ""}.`,
  noRoom: "Your host will show you to your room.",
  stayGuideCta: "Open your guest guide",
  guideLinkTitle: "Your guest guide link",
  guideLinkBody:
    "This link is just for your booking. Bookmark it or add it to your home screen, and you can open your guide any time without checking in again.",
  guideLinkCopy: "Copy link",
  guideLinkCopied: "Link copied",
  guideLinkShare: "Share or save",
  guideLinkQrShow: "Show QR code",
  guideLinkQrHide: "Hide QR code",
  guideLinkQrBody: "Scan with another phone's camera to open your guide there.",
  guideLinkBookmarkKeys: (mac: boolean) => `Tip: press ${mac ? "⌘" : "Ctrl"} + D to bookmark it.`,
  kioskResetting: "Starting over for the next guest…",
  kioskExitTitle: "Host access",
  kioskExitBody: "Enter the door PIN to leave kiosk mode.",
  kioskExitCta: "Unlock",
  kioskWrongPin: "That PIN isn't right.",
  pinTitle: "Enter the property PIN",
  pinNote: "For guests with a booking PIN from their host.",
  nameTitle: "What's your full name?",
  nameHint: "Your booking reached us without a name. Type it as it appears on your booking.",
  nameCta: "Continue",
  /** The guidance banner in the public demo, one line per screen. */
  demo: {
    welcome: (name: string) => `Demo: you're checking in as ${name}. Tap Start checking in.`,
    letter: (letter: string) => `Demo: tap ${letter}.`,
    checkout: (date: string) => `Demo: tap ${date}.`,
    platform: (platform: string) => `Demo: tap ${platform}.`,
    pick: (name: string) => `Demo: tap ${name}${name.endsWith(".") ? "" : "."}`,
    noMatch: (letter: string, date: string) =>
      `Demo: that wasn't the demo booking. Tap Start again, then ${letter} and ${date}.`,
    guestName: "Demo: type any first name and surname, then tap Continue.",
    confirm: "Demo: tap Yes, that's me.",
    party:
      "Demo: try adding a guest or a child to see how the room's size is checked, then tap Continue.",
    idConsent: "Demo: tap I'm happy to continue. Nothing you photograph is kept.",
    idCamera: "Demo: photograph anything. The demo treats it as a passport with the booking name.",
    last4: (ref: string | null, phone: string | null) =>
      [
        "Demo:",
        ref ? `booking reference ends ${ref}` : null,
        ref && phone ? "or" : null,
        phone ? `phone ends ${phone}` : null,
      ]
        .filter(Boolean)
        .join(" ") + ".",
    selfDeclare: "Demo: tap I confirm I'm the guest on this booking.",
    register:
      "Demo: check the details and pick a nationality. Try one outside the UK, Ireland and the Commonwealth to see the extra questions. Nothing is saved.",
    companionReady:
      "Demo: tap I'm ready, or They don't have ID with them to see what your host is told.",
    companionCamera: "Demo: photograph anything for the other guest's ID.",
    face: "Demo: take any photo, or tap Skip this. Nothing is kept.",
    handover:
      "Demo: in a real stay your host gets an alert now. Tap Carry on checking in myself to continue.",
    done: "Demo: that's the end. Open the guest guide, or copy its link or QR code to open it on another phone.",
  },
  pinBody: "You'll find the 6-digit PIN in your booking message or by the front door.",
  pinWrong: "We couldn't find a property with that PIN.",
  clear: "Clear",
  backspace: "Delete last digit",
  notFound: "We couldn't find that property. Please check the link or ask your host.",
  checkinPaused:
    "Online check-in isn't available here at the moment. Please contact your host to check in.",
  error: "Something went wrong. Please try again, or call your host.",
  // Who's staying
  partyTitle: "Who's staying?",
  partyBody: "Count everyone sleeping here tonight, including you.",
  partyAdults: "Adults",
  partyAdultsHint: "18 and over",
  partyChildren: "Children",
  partyChildrenHint: "Under 18",
  partyLess: (what: string) => `One fewer ${what.toLowerCase()}`,
  partyMore: (what: string) => `One more ${what.toLowerCase()}`,
  partyAdultsOnly: "This room is for adults only.",
  partyChildAge: (n: number) => `Age of child ${n}`,
  partyChildAgeHint: "Just their age. Children don't need ID.",
  partyChildAgeHintRegister:
    "Just their age. Children don't need ID. If they're 16 or 17, we'll ask their name and nationality next, as UK law requires.",
  partyAgePick: "Age",
  partyBooked: (n: number) => `Your booking is for ${n} ${n === 1 ? "guest" : "guests"}.`,
  partyDiffers: (booked: number, total: number) =>
    `Your booking says ${booked}, and you've said ${total}. That's fine, we'll let your host know.`,
  partyOver: (capacity: number) =>
    `This room sleeps ${capacity}. We'll let your host know so they can help.`,
  partyChildrenNotAllowed:
    "This room is for adults only. We'll let your host know so they can help.",
  partyContinue: "Continue",
  partyAgesMissing: "Please choose each child's age.",
  // Everyone else's ID
  companionTitle: (n: number, total: number) => `Now adult ${n} of ${total}`,
  // Other guests on their own phones
  othersHeading: "Others can use their own phone",
  othersBlurb:
    "Everyone else on this booking can scan this square and fill in their own details at the same time. No need to pass this phone around.",
  onTheirPhone: (who: string) => `${who} is filling this in on their own phone.`,
  guestLabel: (kind: "adult" | "child", n: number) =>
    kind === "adult" ? `Adult ${n}` : `Child ${n}`,
  waitingTitle: "Nearly there",
  waitingBody: "Waiting for the others to finish on their phones. This screen moves on by itself.",
  slotPhone: "Filling in on their phone",
  slotDone: "Done",
  slotOpen: "Not started",
  waitingSkip: "Carry on without them",
  joinTitle: (lead: string | null, place: string) =>
    lead ? `Checking in with ${lead} at ${place}` : `Checking in at ${place}`,
  joinBody: "Fill in your own details here while the others carry on. Who are you filling in for?",
  joinAdult: "Me (an adult)",
  joinChild: "A child with me",
  joinLeft: (n: number) => `${n} still to fill in`,
  joinFull:
    "Everyone on this booking has been filled in already. If someone is missing, ask the person who started the check-in to change how many are staying.",
  joinNameTitle: (n: number) => `Adult ${n}: your name`,
  joinChildTitle: "About the child",
  joinName: "Full name",
  joinChildName: "Child's full name",
  joinChildAge: "Age",
  joinNext: "Next",
  joinNoId: "I don't have my ID with me",
  joinDoneTitle: "Thank you, you're all done",
  joinDoneBody: "Your details are with the others' check-in. You can close this page.",
  joinAnother: "Fill in someone else",
  companionBody:
    "Please pass the device over so they can photograph their own passport, driving licence or ID card.",
  companionReady: "I'm ready",
  companionThanks: (name: string) => (name ? `Thanks, ${name}.` : "Thanks."),
  companionUnder18: "Thanks. They're under 18, so no ID is needed.",
  companionSkip: "They don't have ID with them",
  companionSkipped: "No problem. Your host will check it when they say hello.",
  companionKept: "Thanks. We kept the photo for your host to check.",
  registerAskTitle: "One more thing",
  registerAskLead: (name: string) =>
    name
      ? `We read the rest from ${name}'s ID. The law also asks for this:`
      : "We read the rest from the ID. The law also asks for this:",
  // UK guest register
  registerTitleYou: "Is this you?",
  registerTitleBlank: "Just a couple of details",
  registerTitleAdult: (n: number) => `And guest ${n}?`,
  registerTitleChild: "And your 16 or 17 year old?",
  registerLead: "Just your name and nationality.",
  registerLeadOther: "Just their name and nationality.",
  registerWhy:
    "UK law asks every place you stay to record the full name and nationality of everyone aged 16 or over. Your host keeps it for 12 months and only shows it to the police or immigration officers if they ask.",
  registerFromId: "Filled in from the ID. Just check it's right.",
  registerName: "Full name",
  registerNameHint: "As on the passport or ID card",
  registerNationality: "Nationality",
  registerPick: "Choose a nationality",
  registerAlienLead: "A few more details for this nationality.",
  registerAlienWhy:
    "As this isn't a British, Irish or Commonwealth nationality, the law also asks for the passport or ID details and where you're going next.",
  registerDocNumber: "Passport or ID card number",
  registerPlace: "Place of issue",
  registerPlaceHint: "As printed on it, for example the city, country or issuing office",
  registerNext: "Where are you going after this stay?",
  registerNextHint: "A town and country is fine",
  registerAddress: "Address there, if you know it (optional)",
  registerSave: "Save and continue",
  registerMissing: {
    name: "Please type a first name and surname.",
    nationality: "Please choose a nationality.",
    document: "Please type the passport or ID card number.",
    place: "Please type where the passport or ID card was issued.",
    destination: "Please tell us where you're going next.",
  } as Record<string, string>,
  // Face photo
  faceTitle: "And a quick photo of your face",
  faceTitleOther: (n: number) => `A quick photo of adult ${n}`,
  faceBody: "Look at the screen. It's only shared with your host and deleted after your stay.",
  faceTake: "Take photo",
  faceSkip: "Skip this",
  faceSaving: "Saving…",
  // Stay page
  stayTitle: (name: string) => `Welcome, ${name}`,
  stayWifi: "Wi-Fi",
  stayNetwork: "Network",
  stayPassword: "Password",
  stayCheckout: "Check-out",
  stayQuiet: "Quiet hours",
  stayParking: "Parking",
  stayHost: "Your host",
  stayRules: "House rules",
  stayRulesList: ["Shoes off indoors, please.", "Please keep the shared kitchenette tidy."],
  stayGone: "This guest guide link has expired. We hope you enjoyed your stay.",
  // Carrying on somewhere else
  qrHeading: "Carry on with your phone",
  qrBlurb: "Point your camera at this square. You will pick up exactly where you are now.",
  qrDoneHeading: "Your guest guide",
  qrDoneBlurb: "Scan this to keep your door code, Wi-Fi and house notes on your phone.",
  qrSwitch: "Use another phone",
  qrOpen: "Show a square to scan with another phone",
  qrAlt: "Square code to scan with a phone camera",
  qrResuming: "Picking up where you left off…",
  // Messages and past requests
  inboxTitle: "Messages",
  inboxOpen: "Messages and requests",
  inboxEmpty: "No messages yet. Write below and your host will see it.",
  inboxSend: "Send",
  inboxPlaceholder: "Type your message to your host",
  inboxSent: "Sent. Your host has been told.",
  inboxHistory: "What you have asked for",
  inboxHistoryEmpty: "Nothing yet.",
  inboxYou: "You",
  inboxHost: "Your host",
});

export const hostPlaceholders = branded({
  comingSoon: "Coming in a later stage",
});

export const services = branded({
  title: "Services",
  subtitle: "Guest requests, problems and maintenance, and where to find someone to do the work.",
  tabInbox: "Requests",
  tabScheduled: "Maintenance",
  emptyInbox: "No requests yet. When a guest asks for something on their stay page, it lands here.",
  emptyScheduled: "No maintenance booked. Plan a boiler service, deep clean or handyman visit.",
  acknowledge: "Acknowledge",
  recommend: "Find someone",
  appoint: "Appoint",
  decline: "Decline",
  markDone: "Mark done",
  inProgress: "Start",
  recommendedTitle: "Who can come",
  noProviders:
    "Latchkey doesn't hold a list of trades. Open Local tradespeople to search the directories near this property.",
  bookMaintenance: "Book maintenance",
  demoBadge: "Demo",
  liveBadge: "Live",
  guestTold: "Guest has been told the arrival time.",
  statuses: {
    new: "New",
    acknowledged: "Acknowledged",
    booked: "Booked",
    in_progress: "In progress",
    done: "Done",
    declined: "Declined",
    cancelled: "Cancelled",
  } as Record<string, string>,
});

export const stayServices = branded({
  title: "Need something?",
  subtitle: "Tap what you need. Your host will confirm and tell you when it's coming.",
  issues: "Report a problem",
  extras: "Extras",
  notePlaceholder: "Anything we should know? (optional)",
  urgent: "It's urgent",
  send: "Send to host",
  sent: "Sent. Your host will be in touch here.",
  yourRequests: "Your requests",
  updates: "Updates from your host",
  expected: (t: string) => `Expected ${t}`,
  price: (p: string) => `${p}, paid to your host`,
  priceOnRequest: "Price confirmed by your host",
});

export const themeStudio = branded({
  title: "Look and feel",
  subtitle:
    "Your whole look for guests: colours, type, shapes, icons, backdrop and words on the kiosk, guest guide and your page. Start from a template; changes preview instantly.",
  presets: "Templates",
  colours: "Colours",
  primary: "Main colour",
  accent: "Highlight",
  background: "Background",
  surface: "Cards",
  foreground: "Text",
  fonts: "Fonts",
  heading: "Headings",
  body: "Body text",
  uploadFont: "Upload your own font (.ttf, .otf, .woff, .woff2)",
  logo: "Logo",
  logoHelp: "“Site logo” follows Latchkey's own logo until you pick one of these or upload yours.",
  logoNames: {
    site: "Site logo",
    "antique-key": "Antique key",
    portico: "Doorway and keyhole",
    "serif-l": "Serif L with key",
    key: "Key",
    arch: "Arch",
    fern: "Fern",
    knot: "Knot",
    lantern: "Lantern",
    monogram: "Your initials",
    sunburst: "Sunburst",
    crest: "Crest",
    leaf: "Leaf",
  } as Record<string, string>,
  uploadLogo: "Upload a logo",
  removeUpload: "Use a built-in logo",
  corners: "Shapes: corners, buttons and cards",
  cardCorners: "Card and panel corners",
  buttonCorners: "Button corners",
  square: "Square",
  pill: "Fully round",
  buttonFill: "Buttons",
  solid: "Solid",
  gradient: "Gradient",
  outlined: "Outline",
  buttonColour: "Button colour",
  buttonCase: "Button lettering",
  caseNormal: "As written",
  caseUpper: "CAPITALS",
  caseSmall: "Small capitals",
  cardStyle: "Cards",
  shadow: "Soft shadow",
  flat: "Flat",
  headingCase: "Heading lettering",
  tracking: "Letter spacing",
  weight: "Weight",
  anyGoogleFont: "Any Google font, by name",
  useForHeadings: "Use for headings",
  useForText: "Use for text",
  googleFontHelp:
    "Type the name exactly as on fonts.google.com. It loads for guests straight from Google Fonts.",
  usingFont: (name: string) => `Using “${name}” for headings`,
  stopFont: "Stop using uploaded font",
  icons: "Icons",
  iconWeight: "Line weight",
  iconColour: "Colour",
  iconFrame: "Behind each icon",
  none: "Nothing",
  circle: "A circle",
  squareShape: "A square",
  backdrop: "Backdrop",
  background_style: "Background",
  plain: "Plain",
  artwork: "Line art",
  artworks: {
    none: "None",
    skyline: "Town skyline",
    palace: "Palace and lamp",
    dunes: "Desert dunes",
    coast: "Coast and lighthouse",
    hills: "Hills and cottage",
  } as Record<string, string>,
  artworkStrength: "Line art strength",
  frame: "Frame",
  lineFrame: "A fine line",
  ornate: "Ornate corners",
  headerBand: "Name on a band of colour",
  headerBandHelp:
    "Your logo and name across the top of your guest guide and page, on your main colour.",
  cover: "Cover photo",
  uploadCover: "Upload a photo",
  removeCover: "Remove",
  coverHelp:
    "Shown on your guest page and guest guide. Landscape JPG or PNG, at least 1600 px wide, under 3 MB.",
  words: "Words",
  layout: "Welcome layout",
  layoutLeft: "Name and logo to the left",
  layoutCentred: "Crest and name centred",
  subname: "Line under your name",
  eyebrow: "Small heading above the welcome",
  welcomeTitleLabel: "Welcome headline ({property} for your name)",
  welcomeBodyLabel: "Welcome line",
  sideLeft: "Note, top left (wide screens)",
  sideRight: "Note, top right (wide screens)",
  features: "Up to three features",
  featurePlaceholder: "Right in the heart of town",
  tagline: "Footer line",
  poweredBy: "Show “Powered by Latchkey”",
  kioskGroup: "Door tablet",
  kioskTouch: "Button size on the door tablet",
  kioskTouchHelp: "Guests' own phones always keep the standard size.",
  kioskTouches: {
    standard: { label: "Standard", help: "Buttons as designed, centred on the screen." },
    expanded: {
      label: "Expanded",
      help: "Uses the whole screen with a thin margin: bigger letters, dates, number pads, buttons and corner icons, easy to press with any finger.",
    },
  },
  sharedBadge: "Shared",
  yoursBadge: "Yours",
  templateName: "Name this look to save it as a template",
  saveTemplate: "Save as template",
  shareTemplate: "Share with every host",
  templateHelp:
    "Templates keep the whole look so you (or every host, if shared) can start from it. Shared templates leave out your own logo and photo.",
  templatesNotReady:
    "Saving templates becomes available once the latest database update is applied.",
  templateSaved: "Saved as one of your templates",
  templateShared: "Shared with every host",
  deleteTemplate: "Delete template",
  link: "Your guest link",
  linkHelp: "Guests and you can bookmark this. It opens your fully branded page.",
  preview: "Preview",
  save: "Save look",
  saved: "Look saved",
});

export const integrations = branded({
  title: "Integrations: demo or live (Latchkey admin)",
  subtitle:
    "Only Latchkey's admins see this. Test each of this business's connections in demo mode, then switch it live once it's set up.",
  demo: "Demo",
  live: "Live",
  ready: "Ready",
  needsSetup: "Needs setup",
  items: {
    id_check: {
      name: "Photo ID reading",
      demo: "Any photo passes as a match, no AI call.",
      live: "AI reads the name on the ID and compares it.",
    },
    host_email: {
      name: "Email alerts to you",
      demo: "Alerts show on Today only.",
      live: "Also emails you. Needs a sender email address.",
    },
    guest_messages: {
      name: "Guest updates",
      demo: "Updates show on the guest's stay page.",
      live: "Stay page plus email to the guest when a sender address is set up.",
    },
  },
  saved: "Switches saved",
});

/** Guides page: the in-room guide nudge. */
export const inRoomCopy = branded({
  why: "Why it helps",
  whyHide: "Hide",
  title: "Put a QR code in every room",
  body: "Booking sites keep their guidebooks inside their own app, and only for that booking. Latchkey's in-room guide is on the wall of the room itself: one scan shows how that room works and lets the guest reach you, whichever site they booked on.",
  points: [
    "This room's own heating, shower and wifi, not the whole house",
    "Today's cleaning and closed times, kept up to date",
    "Message you, ask for extras and pay, all recorded with the stay",
    "No app or login; door codes are never shown",
  ],
  preview: "Preview",
  printQr: "Print QR",
  printAll: (n: number) => `Print all ${n} rooms`,
  askOwner: "An owner or manager makes this room's code",
  notReady:
    "Room QR codes need the latest update. Lovable applies it on the next sync (migration 0031).",
});

/** Printing each room's QR code. */
export const roomQrCopy = branded({
  back: "Back to guides",
  print: "Print",
  printAll: (n: number) => `Print all ${n}`,
  headline: "Scan for your room guide",
  textLabel: "What the cards say under the code",
  textHint: "The same on every room's card. Keep it short: what guests will find.",
  textSaved: "Saved for every room's card.",
  newWords: "New words",
  newWordsTitle: (room: string) => `New words for ${room}?`,
  newWordsBody:
    "This room gets three new words. The words on its current card (and any older code) stop working straight away, so print the new card and replace the old one. Guests who already have their stay open aren't affected.",
  newWordsConfirm: "Make new words",
  newWordsDone: (code: string) => `New words: ${code}. Print the new card.`,
  qrAlt: (room: string) => `QR code for the ${room} guide`,
  notReady:
    "Room QR codes need the latest update. Lovable applies it on the next sync (migration 0031).",
  none: "No rooms yet. Add rooms to this property first.",
});

/** The guide behind a room's own QR code (/room/<code>). */
export const roomGuideCopy = branded({
  eyebrow: "Your room guide",
  subtitle: (place: string) => `How everything in this room works at ${place}. No app, no login.`,
  yourStay: "Message your host, order extras or see your stay details.",
  needSomething: "Staying here? Check in or open your stay to message your host and order extras.",
  openStay: "Open your stay",
  checkIn: "Check in or find your stay",
  stayingHere: "Staying here?",
  stayEyebrow: "Your stay",
  checkInTitle: "Check in, or open your stay",
  checkInBody: "Message your host and order extras from your own stay page. No app, no login.",
  gone: "This room guide isn't available any more. Please ask your host.",
  footer: "This guide is for this room. Your host keeps it up to date.",
});

export const guideCopy = branded({
  checkoutSteps: "Check-out steps",
  quickTitle: "Jump to",
  quickExtras: "Extras",
  listHelp:
    "Guests read these in this order. Drag the grip to move a section; open one to write it. The pin puts it on the reminder card at the top of their guide.",
  listHelpRoom:
    "This room uses the whole-property guide unless you write its own version of a section. The order is the same for every room.",
  dragTip: "Drag to move (or use the arrow keys)",
  dragLabel: (title: string) => `Move ${title}: drag, or use the arrow keys`,
  pinTip: "Put on the reminder card",
  unpinTip: "Take off the reminder card",
  removeTip: "Remove from the guide (you can add it back)",
  deleteTip: "Delete this section",
  openTip: (title: string) => `Open ${title}`,
  foldTip: (title: string) => `Fold ${title}`,
  removedToast: (title: string) => `${title} removed. Add it back any time with Add a section.`,
  addSection: "Add a section",
  ownSection: "Your own section",
  ownSectionPlaceholder: "e.g. Bins and recycling",
  add: "Add",
  addedToast: "Section added. Write it below.",
  addBack: "Add back",
  addedBack: (title: string) => `${title} is back in the guide.`,
  yourSection: "Yours",
  emptyBadge: "Empty",
  sectionName: "Section name",
  renamed: "Renamed",
  deleteTitle: (title: string) => `Delete “${title}”?`,
  deleteBody:
    "This removes the section and everything written in it, for the whole property and every room. It can't be undone.",
  removeWithFiles:
    "This takes the section out of the guide. You can add it back later, but not its attachments.",
  filesGoToo: (n: number) =>
    `Its ${n === 1 ? "attachment is" : `${n} attachments are`} deleted too.`,
  removeConfirm: "Remove",
  deleteConfirm: "Delete section",
  deletedToast: "Section deleted",
  navLabel: "Guides",
  title: "Stay guides",
  subtitle: "Step-by-step guides guests see on their private link, from arrival day to check-out.",
  scopeHouse: "Whole house",
  scopeHelp: "House sections apply to every room. Pick a room to add its own version of a section.",
  modeLabel: "Guide style for this room",
  basic: "Basic",
  detailed: "Detailed",
  basicHelp:
    "Basic shows one short line per section, no photos. Detailed shows every step and photo.",
  summary: "Short summary (shown in basic and detailed)",
  addStep: "Add step",
  stepHeading: "Step title",
  stepBody: "What to do",
  addPhoto: "Add photo",
  removePhoto: "Remove photo",
  save: "Save section",
  saved: "Section saved",
  useHouse: "Use the house version",
  roomOwn: "This room has its own version",
  inherits: "Using the house version. Edit to give this room its own.",
  starterBadge: "Starter text: replace with your own",
  addStarter: "Add starter text",
  starterAdded: (n: number) => `Starter text added to ${n} sections`,
  doorLocked: (when: string) => `Door and lock details appear here from ${when}.`,
  readOnly:
    "Your stay has ended. This guide stays open for 24 hours in case you left something behind.",
  forgetTitle: "Good to know for a comfortable stay",
  guideLink: "Copy guide link",
  guideLinkCopied: "Guide link copied. It opens on arrival day and stops at check-out.",
  notYet: (when: string) => `Your guide opens on ${when}. See you soon!`,
  photoAlt: (step: string) => `Photo: ${step}`,
  showMore: "More",
  showLess: "Less",
  amenitiesTitle: "Already in your room",
  amenitiesBody: "No need to ask for these — they're waiting for you.",
  pinLabel: 'Show on "Good to know"',
  pinHelp:
    'Pick the few things that matter most for a comfortable stay. Whatever you pin appears in the "Good to know for a comfortable stay" card at the top of the guide, and is left out of the list below so it\'s never said twice.',
  pinnedBadge: 'On "Good to know"',
  pinLimit: "Four reminders is about as many as anyone reads.",
  orderTitle: "Running order",
  orderHelp: "Move sections so the guide reads the way you'd explain it in person.",
  moveUp: "Move up",
  moveDown: "Move down",
  orderSaved: "Order saved",
  amenitiesLabel: "What's already in this room",
  amenitiesHelp: "One per line, for example: Kettle, Hair dryer, Iron and board, Fresh towels.",
});

export const extrasCopy = branded({
  guestTitle: "Request extras",
  guestSubtitle: "Towels, late check-out, luggage storage and more. Free items cost nothing.",
  free: "Free",
  basket: "Your request",
  empty: "Tap items above to add them.",
  when: "When?",
  windows: {
    asap: "As soon as possible",
    evening: "This evening (18:00–21:00)",
    morning: "Tomorrow morning (08:00–10:00)",
    door: "Leave it outside my door",
  } as Record<string, string>,
  hostOut: (t: string) => `Your host is out until ${t}`,
  lateTitle: "Late check-out",
  earlyTitle: "Early check-in",
  lateNone: "Not available: someone arrives in your room that day.",
  earlyNone: "Not available: someone leaves your room that day.",
  until: (t: string) => `Until ${t}`,
  from: (t: string) => `From ${t}`,
  bagSize: "Bag size",
  loanNote: "Please leave it in the room at check-out.",
  send: "Send request",
  sent: "Request sent",
  cartButton: (n: number, t: string) =>
    `Basket · ${n} item${n === 1 ? "" : "s"}${t ? ` · ${t}` : ""}`,
  cartTitle: "Your basket",
  cartClose: "Keep browsing",
  cartEmpty: "Nothing in your basket yet. Tap items to add them.",
  cartRemove: "Remove",
  cartFreeNote: "Free items cost nothing — you can send them on their own.",
  payAndSend: "Send and pay",
  sendFree: "Send request",
  added: (name: string) => `${name} added to your basket`,
  payTitle: "Payment",
  payTrouble: "Card not working?",
  payTroubleBody:
    "You can pay your host directly instead. Nothing is confirmed until your host has the money, so please let them know.",
  payBank: "Pay by bank transfer",
  payCash: "Pay cash to the host",
  payBankTitle: "Bank transfer",
  payCashTitle: "Paying cash",
  payCashBody:
    "Hand the money to your host and they will confirm it here. Until then this request is not guaranteed.",
  payRefNote: (ref: string) => `Please use ${ref} as the payment reference.`,
  payChosenBank: "You have chosen to pay by bank transfer.",
  payChosenCash: "You have chosen to pay in cash.",
  payNotGuaranteed: "Not guaranteed until your host confirms payment.",
  noBankDetails: "Your host has not added bank details. Please speak to them.",
  receipt: "Receipt",
  receiptTitle: "Receipt",
  receiptFor: (p: string) => `${p}`,
  receiptNo: (n: string) => `Receipt ${n}`,
  receiptPrint: "Print or save as PDF",
  receiptEmail: "Email it to me",
  receiptEmailed: "Receipt emailed.",
  receiptEmailOff: "Email is not set up yet — please print or save this receipt instead.",
  receiptNoAddress: "We do not have an email address for you. Please print or save this receipt.",
  receiptPaidBy: { card: "Card", bank: "Bank transfer", cash: "Cash" } as Record<string, string>,
  receiptTotal: "Total paid",
  total: "Total",
  yours: "Your requests",
  payLeft: (m: number) => `${m} min left to pay`,
  accept: "Accept new time",
  cancel: "Cancel",
  suggested: (w: string) => `Your host suggested: ${w}`,
  statuses: {
    requested: "Waiting for host",
    approved: "Approved",
    awaiting_payment: "Awaiting payment",
    suggested: "New time suggested",
    confirmed: "Booked",
    delivered: "Delivered",
    declined: "Declined",
    cancelled: "Cancelled",
    expired: "Expired",
  } as Record<string, string>,
  // host
  priceList: "Extras price list",
  priceListSub: "What guests can request. Free items still need your OK unless auto-approve is on.",
  autoApprove: "Auto-approve",
  active: "Offered",
  max: "Max",
  units: { item: "each", hour: "per hour", bag_day: "per bag per day", pack: "per pack" } as Record<
    string,
    string
  >,
  money: "Tax, bank and availability",
  taxTitle: "Sales tax",
  taxRegistered: "Registered for sales tax (e.g. VAT, GST)",
  taxLabel: "Tax name",
  taxRate: "Rate %",
  taxStandard: (name: string, rate: string) => `Use the standard ${name} (${rate}%)`,
  pricesInclude: "Prices include tax",
  bankTitle: "Bank details for guests paying by transfer",
  bank: "Other payment notes (optional)",
  bankNotesPlaceholder: "e.g. please use your booking reference",
  awayTitle: "Away",
  outUntil: "I'm away until (shown to guests beside 'As soon as possible')",
  awayDate: "Date",
  awayTime: "Time",
  awayClear: "Not away",
  save: "Save",
  saved: "Saved",
  inbox: "Extras requests",
  inboxEmpty:
    "No extras requests yet. When guests ask for towels or late check-out, they'll appear here.",
  approve: "Approve",
  decline: "Decline",
  suggest: "Suggest another time",
  delivered: "Mark delivered",
  markPaid: "Payment received",
  payingBank: "Guest is paying by bank transfer",
  payingCash: "Guest is paying cash",
});

/** Calendar connection help, validation messages and the outbound feed. */
export const calendarUi = branded({
  stepsChecked: "Steps last checked: Sep 2026",
  openHelp: "Open the platform's help page",
  howItWorks:
    "Latchkey checks this calendar every 30 minutes. Airbnb and Booking.com only share dates, and sometimes a reservation code, so you'll add guest names for some bookings on the Today page.",
  helpTitle: "Calendar help",
  helpSubtitle: "Where to find the calendar link on each platform.",
  managerTitle: "Channel manager API",
  managerBody:
    "Expedia and hotel-style listings connect through a channel manager rather than a calendar link. Add the channel manager's calendar link here instead.",
  errors: {
    https: "The link must start with https://",
    notCalendar: "This link looks like a web page, not a calendar.",
    noEvents: "The link returned no events. Check you copied the export link, not the import box.",
  },
});

export const listingImportCopy = branded({
  open: "Import from your listings",
  openHint: "Experimental: fill in this property and its rooms from your own public listings.",
  title: "Import from your listings",
  experimental: "Experimental",
  intro:
    "Paste the links to your own listings. Latchkey reads each public page, the way a guest would see it, and shows you what it found before anything is added.",
  linksLabel: "Links to your listings (one per line, or several at once)",
  linksPlaceholder:
    "https://www.airbnb.co.uk/rooms/12345678\nhttps://www.booking.com/hotel/gb/your-place.html",
  add: "Add links",
  sites: "Works with",
  notListing: "This looks like a search or home page, not your listing.",
  unknown: "Not a booking site Latchkey reads. It will be skipped.",
  shows: "Shows publicly",
  hidden: "Not public (add these yourself)",
  remove: "Remove link",
  prices: "Also read prices for these dates",
  pricesHelp:
    "Most sites only show a price for chosen dates. Prices are shown for reference; Latchkey doesn't manage your rates.",
  checkIn: "Arriving",
  checkOut: "Leaving",
  read: (n: number) => (n === 1 ? "Read 1 page" : `Read ${n} pages`),
  reading: (platform: string) => `Reading your ${platform} page with Firecrawl`,
  usually: "usually 10 to 40 seconds",
  queued: "Waiting",
  done: "Read",
  failed: "Couldn't read this page",
  retry: "Try again",
  overall: (done: number, total: number) => `${done} of ${total} pages read`,
  found: "Found",
  nothingFound: "Nothing useful on this page. Check it's your listing and that it's public.",
  review: "Review what was found",
  back: "Back",
  propertyTitle: "Your property",
  current: (v: string) => `Now: ${v}`,
  empty: "not set",
  fields: {
    name: "Name",
    address: "Address",
    postcode: "Postcode",
    country: "Country",
    checkIn: "Check-in from",
    checkOut: "Check-out by",
    parking: "Parking notes",
  } as Record<string, string>,
  rules: (n: number) => `Add ${n} house rules to your stay guide`,
  rulesHelp: "Only if your guide's House rules section is still empty.",
  coverTitle: "Cover photo for your guest pages",
  noCover: "Keep my cover",
  roomsTitle: "Rooms",
  roomNew: "New room",
  roomUpdate: (name: string) => `Updates your room "${name}"`,
  roomName: "Room name",
  sleeps: "Sleeps",
  ensuite: "En-suite",
  description: "Description",
  amenities: (n: number) => (n === 1 ? "1 amenity" : `${n} amenities`),
  photo: "Room photo",
  noPhoto: "No photo",
  price: (amount: string, site: string) =>
    `Listed at ${amount} on ${site}. For reference only: Latchkey doesn't store rates.`,
  apply: (n: number) => (n === 1 ? "Add 1 change" : `Add ${n} changes`),
  applying: "Adding to your property…",
  applied: (r: { roomsAdded: number; roomsUpdated: number; photos: number }) =>
    [
      r.roomsAdded ? `${r.roomsAdded} room${r.roomsAdded === 1 ? "" : "s"} added` : null,
      r.roomsUpdated ? `${r.roomsUpdated} updated` : null,
      r.photos ? `${r.photos} photo${r.photos === 1 ? "" : "s"} saved` : null,
    ]
      .filter(Boolean)
      .join(", ") || "Your property is up to date",
  photosSkipped: (n: number) =>
    `${n} photo${n === 1 ? "" : "s"} couldn't be copied; add ${n === 1 ? "it" : "them"} on Stay guides.`,
  finished: "Done. Check your rooms below; you can change anything at any time.",
  close: "Close",
});

export const saveCopy = branded({
  unsaved: "Changes not saved yet",
});

export const listingLinksCopy = branded({
  label: "Your listings on booking sites",
  placeholder: "https://www.airbnb.co.uk/rooms/12345678",
  propertyHint:
    "Links to this property's own pages (one per line). Their icons open them straight from Properties.",
  roomHint: "Links to this room's own listings (one per line), e.g. its Airbnb listing.",
  otherSite: "Website",
  open: (site: string) => `Open on ${site}`,
});

export const feedCopy = branded({
  title: "Share each room's Latchkey calendar",
  body: "Only needed if you take direct bookings in Latchkey. If your platforms already sync with each other, leave this off.",
  detail:
    "The feed includes direct bookings and whole-day blocks you created here. It never repeats bookings imported from a platform, and it doesn't include cleaning or late check-out times.",
  enable: "Share this calendar",
  copy: "Copy feed link",
  copied: "Feed link copied",
  regenerate: "Make a new link",
  regenerated: "New feed link created. Update it anywhere you pasted the old one.",
});

/** One-tap notes the host can send with a decision. */
export const responseNotes = branded({
  label: "Add a note for the guest",
  custom: "Write your own note",
  approve: [
    "Left outside your door",
    "Will bring it at 18:30",
    "Ready to collect from the hallway",
  ],
  decline: [
    "Room needed for an arrival",
    "Sorry, we've run out today",
    "Outside our service hours",
  ],
  suggest: ["This is the earliest I can manage", "Cleaner is in the house until then"],
  fromHost: (note: string) => `Note from your host: ${note}`,
  send: "Send",
});

/** Guest requests waiting on the host, shown on Today. */
export const todayRequests = branded({
  title: "Guest requests",
  empty: "No requests waiting.",
  viewAll: "See all requests",
  tightTurnaround: (mins: number) =>
    `Tight turnaround: only ${mins} minutes between check-out and the next arrival.`,
});

/** Adding and editing price list items. */
export const priceListUi = branded({
  currencyLine: (cur: string, host: string) =>
    cur === host
      ? `Prices in ${cur}, your business's currency. A property abroad can charge in its own:`
      : `Prices in ${cur} for this property (your business uses ${host}).`,
  currencySaved: "Currency saved for this property.",
  addItem: "Add an item",
  editItem: "Edit item",
  name: "Name",
  price: "Price",
  isFree: "Free on request",
  unit: "Charged",
  maxQty: "Most a guest can ask for",
  isLoan: "Lent, not kept",
  moveUp: "Move up",
  moveDown: "Move down",
  auto: "Auto",
  offered: "Offered",
  dragHint: (name: string) => `Move ${name}: drag, or use the arrow keys`,
  remove: "Remove from the list",
  removeConfirm: "Remove this item? Past requests keep their details.",
  removed: "Item removed",
  added: "Item added",
});

/** Card payments through Stripe. */
export const payments = branded({
  title: "Card payments (Stripe)",
  body: "Guests pay for approved extras by card on their stay page, straight into your own Stripe account. Latchkey never holds your money.",
  notConnected: "Not connected",
  testBadge: "Test mode",
  liveBadge: "Live payments",
  readyBadge: "Taking payments",
  pendingBadge: "Finish setting up",
  connectTitle: "Connect your Stripe account",
  connectBody: (email: string | null) =>
    `Stripe is where guests' card payments go. We'll start a Stripe account for you${email ? ` with ${email}` : ""}; Stripe then asks a few questions to confirm who you are and where to pay you. It takes about five minutes. Already have Stripe? Sign in to it there instead.`,
  connectCta: "Connect Stripe",
  pendingBody: "Stripe still needs a few details before you can take payments.",
  continueCta: "Continue with Stripe",
  checkAgain: "Check again",
  connectedTo: (name: string) => `Payments go to your Stripe account: ${name}.`,
  connectedUnnamed: "Payments go to your Stripe account.",
  openDashboard: "Open Stripe",
  unlink: "Unlink",
  unlinked: "Stripe account unlinked. Guests can't pay by card until you connect again.",
  backDone: "Thanks. Your Stripe account is connected and ready for payments.",
  backPending: "Stripe still needs a few details. Pick up where you left off any time.",
  platformTitle: "Payments go to Latchkey's own Stripe account",
  platformBody:
    "As the super admin, your businesses can use Latchkey's account for guest payments. Connect a separate account any time to keep them apart.",
  usePlatform: "Use Latchkey's Stripe account instead",
  useOwn: "Connect a separate Stripe account",
  notAvailable: "Card payments aren't available yet. Please contact Latchkey support.",
  webhookMissing: "Almost there: add the webhook signing secret so payments confirm automatically.",
  syncButton: "Send price list to Stripe",
  syncedCount: (n: number) =>
    n === 0
      ? "No items sent to Stripe yet."
      : `${n} paid item${n === 1 ? "" : "s"} set up in Stripe.`,
  synced: (created: number, updated: number) =>
    `Sent to Stripe: ${created} new, ${updated} updated.`,
  syncFailed: "Stripe wouldn't accept that. Please try again.",
  ownerOnly: "Only the owner can connect Stripe.",
  connectFailed: "Stripe couldn't be connected",
  payNow: "Pay now",
  payFailed: "We couldn't open the payment page. Please try again.",
  paidToast: "Thank you, that's paid and confirmed.",
});

/** Which Stripe account takes payments (hosts on Settings → Card payments; super admins in Latchkey admin). */
export const stripeAccountCopy = branded({
  title: "Your Stripe account",
  platformTitle: "Latchkey's Stripe account",
  name: "Name",
  accountId: "Account ID",
  email: "Email",
  country: "Country and currency",
  statement: "On guests' card statements",
  status: "Status",
  live: "Live",
  test: "Test mode",
  charges: "Taking payments",
  noCharges: "Can't take payments yet",
  payouts: "Paying out to the bank",
  noPayouts: "Payouts not set up",
  checked: (when: string) => `Checked with Stripe ${when}`,
  checkNow: "Check with Stripe",
  checkedOk: "Stripe confirmed these details.",
  copied: "Account ID copied.",
  copyId: "Copy the account ID",
  openStripe: "Open in Stripe",
  unreachable: "Stripe didn't answer just now, so these details may be out of date.",
  howTitle: "How to check it's yours",
  how: "Sign in to Stripe, open Settings → Business → Account details, and compare the account ID there with the one above. They must match exactly. In your Stripe payments list, guest payments show the same statement name.",
  howAdmin:
    "In Latchkey's Stripe dashboard, Connect → Accounts lists every business's account by this ID. Open in Stripe goes straight to it.",
  keyKind: (kind: string) => (kind === "restricted" ? "Restricted key (rk_)" : "Secret key (sk_)"),
  key: "Key in Secrets",
  webhooks: "Webhook secrets",
  webhookSet: (main: boolean, connect: boolean) =>
    [
      main ? "platform ✓" : "platform missing",
      connect ? "connected accounts ✓" : "connected accounts missing",
    ].join(" · "),
  notSet: "No Stripe key in Secrets yet.",
  needsTitle: "This restricted key must allow",
  needsBody:
    "Hosts never paste keys: Latchkey's key creates each host's Stripe account and takes guest payments in it. In Stripe → Developers → API keys, edit this key and give it these permissions (or use a full secret key), and switch on Connect for the account.",
  colStripe: "Stripe",
  modeNone: "Not connected",
  modePlatform: "Latchkey's account",
  modePending: "Setting up",
});

/** ErrorReport: errors hosts can act on. */
export const errorReportCopy = branded({
  nextSteps: "What to do next",
  details: "Technical details",
  copy: "Copy",
  copied: "Copied. Paste it wherever you need it.",
  send: "Send to Latchkey support",
  sent: "Sent to Latchkey support. We'll reply by email.",
  sendFailed: "Couldn't send that. Use Copy and email it to us instead.",
  open: "Open",
  close: "Close",
});

/** The guest pages' Wi-Fi card. */
export const wifiCopy = branded({
  title: "Wi-Fi",
  network: "Network",
  password: "Password",
  open: "No password needed",
  copy: "Copy the password",
  copied: "Password copied. Paste it when your phone asks.",
  join: "Join Wi-Fi",
  iosHelp:
    "Tap Join, then Allow. Open Settings, tap Profile Downloaded and Install: your phone joins straight away and whenever you're here.",
  androidHelp: "We'll copy the password and open your Wi-Fi: pick the network and paste it.",
  androidOpenHelp: "We'll open your Wi-Fi: pick the network.",
  qrHelp: "Point your phone's camera at this code and tap the Wi-Fi prompt to join.",
  qrAlt: (name: string) => `Code to join ${name}`,
  locked:
    "The Wi-Fi password appears here once you've checked in. It only takes a couple of minutes.",
  checkIn: "Check in",
});

/** The stay guide's "your stay" line, the host's mid-stay message and the check-in nudge. */
export const stayProgressCopy = branded({
  before: (nights: number) => `${nights} ${nights === 1 ? "night" : "nights"} with us`,
  arrival: (nights: number) =>
    `Welcome! ${nights} ${nights === 1 ? "night" : "nights"} with us, starting tonight`,
  during: (night: number, nights: number, left: number) =>
    `Night ${night} of ${nights} · ${left <= 1 ? "your last night" : `${left - 1} ${left - 1 === 1 ? "night" : "nights"} to go`}`,
  leaving: "Today's your last day: safe travels",
  dates: (from: string, to: string) => `${from} to ${to}`,
  nudgeTitle: (name: string | null) =>
    name ? `${name}, please finish checking in` : "Please finish checking in",
  nudgeBody: "Two minutes on your phone: your details for the guest register, and you're all set.",
  nudgeCta: "Finish now",
  nudgeFailed: "That didn't open. Please try again, or ask us at the property.",
  messageUs: "Message us",
  needElse: "Need something else?",
  weather: (temp: number, label: string, high: number | null, low: number | null) =>
    `${temp}°C, ${label.toLowerCase()}${high !== null && low !== null ? ` (${low}° to ${high}° today)` : ""}`,
  nudgeLater: "Later",
  roomTitle: "Staying in this room?",
  roomBody: "Opening your own guide…",
  roomAway:
    "To open your own guide, connect to the Wi-Fi here, or let us check you're at the property.",
  roomLocate: "Check I'm here",
  roomLocating: "Checking…",
  roomNotHere: "We couldn't tell you're at the property. Please check in to open your guide.",
  roomLocateHelp: "Your location is only compared with the property's and isn't kept.",
});

/** Settings → Guests → Room QR codes and Wi-Fi. */
export const stayAccessCopy = branded({
  title: "Room QR codes and Wi-Fi",
  body: "What guests can open from the QR code in their room, and how they get on the Wi-Fi.",
  notReady: "These settings appear once the latest database update (migration 0057) is applied.",
  early: "Open the guest's own guide from their room's QR code before they've checked in",
  earlyHelp:
    "Whoever is booked into that room today (with a name on the stay) gets their own guide: their name, dates, messages and extras. A banner keeps asking them to finish checking in for the guest register. It only opens when their phone is shown to be here; otherwise they check in first.",
  presence: "How a phone is shown to be here",
  presenceNetwork: "On your Wi-Fi",
  presenceNetworkHelp:
    "Same internet connection as your door tablet. Works on a separate guest network too. Nothing to tap for the guest.",
  presenceBoth: "On your Wi-Fi, or close by",
  presenceBothHelp:
    "Also lets a guest on mobile data confirm they're within about 150 m of the door tablet. Locations can be faked by someone determined, so choose Wi-Fi only if that matters to you.",
  tablets: "Door tablets",
  tabletsNone:
    'No door tablet is paired yet. On the tablet, press and hold the top-right corner and enter your PIN once (or open the kiosk while signed in). Allow its location when asked if you\'d like the "close by" check.',
  tabletLine: (seen: string | null, located: boolean, by: string) =>
    `${seen ? `Last seen ${seen}` : "Not seen yet"} · ${located ? "location known" : "no location"} · paired ${by}`,
  pairedBy: { pin: "with your PIN", host: "while signed in" } as Record<string, string>,
  forget: "Remove",
  forgotten: "Tablet removed.",
  message: '"Need something else?" on the guide',
  messageHelp:
    'Invites questions the guide doesn\'t answer, with a Message us button, just before "How was your stay?". Feedback has its own card, so keep this about asking.',
  wifiTitle: "Wi-Fi",
  wifiAfter: "Show the Wi-Fi password only after check-in",
  wifiAfterHelp:
    "Guests see the network and a Check in button; the password (and one-tap join) appears once their details are in. Room networks are set on each room in Properties.",
  saved: "Saved.",
});

export const roomWifiCopy = branded({
  title: "This room's own Wi-Fi (optional)",
  hint: "Leave empty to use the property's network. Guests in this room see only one network.",
  name: "Network name",
  password: "Password",
});

/** Latchkey admin → Site settings → Home page pictures. */
export const homeArtCopy = branded({
  title: "Home page pictures",
  body: "Photos of happy guests arriving, checking in and settling in, each one a faint full-width background behind the headline or a section. Choose how faint below so the words always stay easy to read.",
  lookTitle: "How faint the photos are",
  transparency: "Photo strength",
  dimming: "Dimming",
  greyness: "Less colour",
  tint: "Colour tint",
  tintColour: "Tint colour",
  tintStrength: "Tint strength",
  lookReset: "Back to Latchkey's settings",
  previewEyebrow: "Preview",
  previewTitle: "Hotel-grade guest operations",
  previewBody: "How the words read over the first photo with these settings.",
  previewBox: "A box on the home page, as it will look.",
  glassTitle: "Glass boxes",
  glassBody:
    "The home page's boxes as frosted glass, like an iPhone: each keeps its own colour as a light tint and the photo behind shows through softly. Off makes them solid.",
  glassClear: "See-through",
  glassBlur: "Blur",
  glassSaturate: "Colour behind",
  notReady:
    "Home page pictures can be changed once the latest database update (migration 0058) is applied. Until then the defaults show.",
  where: "Where",
  side: "Keep in view",
  right: "Right of the photo",
  left: "Left of the photo",
  strength: "This photo's strength",
  alt: "Description",
  altPlaceholder: "What it shows (for your own reference)",
  remove: "Remove this picture",
  none: "No pictures: the home page shows text only.",
  addTitle: "Add a picture",
  upload: "Upload your own",
  uploadHint:
    "JPEG, PNG or WebP photo (royalty-free or your own), under 2 MB. Portrait shapes look best. Latchkey's own set is free to use with no credit needed.",
  reset: "Back to Latchkey's pictures",
  saved: "Home page pictures saved.",
  slots: {
    hero: "Behind the headline",
    benefits: "Behind: three outcomes",
    audience: "Behind: who it's for",
    journey: "Behind: the guest journey",
    pillars: "Behind: four pillars",
    beforeAfter: "Behind: before and after",
    pricing: "Behind: pricing",
    why: "Behind: booking sites vs Latchkey",
    next: "Behind: on the way",
    developers: "Behind: developers",
  } as Record<string, string>,
});

/** The last day's review nudge on the stay guide. */
export const reviewNudgeCopy = branded({
  title: (site: string) => `A review on ${site} would mean a lot`,
  titleDirect: "How was your stay?",
  onSite: (site: string) =>
    `${site} will send you a short email or app message after you leave: that's where your review goes. Thank you!`,
  scoreLabel: "Your score out of 10",
  low: "1 · not good",
  high: "10 · loved it",
  comment: "What made your stay? Anything we could do better? (optional)",
  publicOk: (place: string) =>
    `Show my score and words, with my first name, on ${place}'s booking page.`,
  optional: "(optional)",
  send: "Send my review",
  thanks: "Thank you! Your review means a lot to us.",
});

/** Settings → Guests → Reviews. */
export const reviewSettingsCopy = branded({
  title: "Reviews",
  body: "On the last day of a stay, guests see a short, friendly ask for a review next to the logo of the site they booked with.",
  notReady: "These settings appear once the latest database update (migration 0057) is applied.",
  ask: "Ask guests for a review on their last day",
  askHelp:
    "Booked on a site: we remind them that site will ask for their review. Booked directly: they score their stay out of 10 right on their guide, and only you see it unless they agree to share it.",
  text: "What it says",
  textHelp: "Shown under the five stars. Keep it warm and short.",
  show: "Show direct guests' reviews on your booking page",
  showHelp:
    "Only reviews scoring 9 or more out of 10, from guests who booked directly and ticked to share theirs, with their first name and the month. You can hide any review from the list on Today.",
  saved: "Saved.",
});

/** The booking page's reviews from direct guests. */
export const pageReviewsCopy = branded({
  title: "What our guests say",
  note: "From guests who booked directly with us.",
  score: (n: number) => `${n}/10`,
  guest: "A guest",
});

/** Properties → Extras → Early check-in and late check-out. */
export const stayTimesCopy = branded({
  title: "Early check-in and late check-out",
  body: "Guests buy extra time in blocks from their guide. They're only offered times that leave your buffer free before the next guest arrives in the room, or after the last one leaves.",
  earlyTitle: "Early check-in",
  lateTitle: "Late check-out",
  block: "Sold in blocks of",
  hours: (h: number) => `${h} ${h === 1 ? "hour" : "hours"}`,
  pricePerBlock: (symbol: string) => `Price a block (${symbol})`,
  latest: "Latest check-out",
  earliest: "Earliest check-in",
  maxBlocks: "Most blocks a guest can buy",
  autoApprove: "Confirm straight away (otherwise you approve each one)",
  previewLate: "With nobody arriving that day, a guest leaving at 11:00 can pick:",
  previewEarly: "With nobody leaving that day, a guest arriving at 15:00 can pick:",
  noneOffered: "nothing (the limit leaves no whole block)",
  free: "free",
  buffer: "Buffer between guests",
  bufferHelp:
    "Kept free in a room between one guest leaving and the next arriving, for cleaning. Applies to everything guests can buy, and warns you if you set a time by hand that eats into it.",
  minutes: (m: number) =>
    m === 0
      ? "None"
      : m < 60
        ? `${m} minutes`
        : m % 60 === 0
          ? `${m / 60} ${m === 60 ? "hour" : "hours"}`
          : `${Math.floor(m / 60)} h ${m % 60} min`,
  override:
    "To give one guest a different time, edit their stay in Bookings and change the check-in or check-out time: they're told in their messages, and the timelines, housekeeping and the next guest's choices all follow.",
  saved: "Saved.",
});

/** Finding tradespeople for property work. */
export const trades = branded({
  tabLabel: "Local tradespeople",
  intro:
    "Pick what needs doing and search Google Maps for the nearest firms, with reviews, opening hours and phone numbers. Below, the sites people in your country use, and what each is best for.",
  mapsSearch: (term: string, area: string) => `Search Google Maps for “${term}” near ${area}`,
  whoTitle: (country: string) => `Who's best for what in ${country}`,
  whoBody:
    "Opens each site in a new tab. A tick marks an official register: check anyone doing gas or electrical work is on it.",
  official: "Official register",
  jobLabel: "What needs doing",
  termLabel: "Search words",
  areaLabel: "Postcode or town",
  needArea:
    "Add a postcode to this property, or type a town above, and the searches will open for that area.",
  searching: (term: string, area: string) => `Searching for “${term}” near ${area}.`,
  searchNow: (name: string) => `Search ${name} now`,
  openOn: (name: string) => `Search ${name}`,
  visit: (name: string) => `Go to ${name}`,
  legalNote:
    "These sites don't offer a way to pull their listings into other apps, and copying them automatically isn't allowed, so Latchkey links out instead. Once you've found someone you like, add them to a job so their details stay with the property.",
});

export const hostInbox = branded({
  via: (platform: string) => `From ${platform}`,
  platformReplyHint: (platform: string) =>
    `Replying here sends it in Latchkey. To answer on ${platform}, reply by email from your own mailbox.`,
  replyByEmail: "Reply by email",
  title: "Guest messages",
  open: "Open guest messages",
  empty: "No guest messages yet. Anything a guest sends from their stay page lands here.",
  pick: "Choose a guest to read the conversation.",
  back: "All conversations",
  placeholder: "Reply to your guest",
  send: "Send reply",
  unreadOne: "1 unread message",
  unreadMany: (n: number) => `${n} unread messages`,
});

export const tradesCopy = branded({
  title: "Your trades and helpers",
  blurb:
    "Your own list of people you actually call. One tap to ring, text, WhatsApp or email them from this device.",
  empty:
    "No contacts yet. Add someone, bring in a spreadsheet, or let Latchkey suggest who you'll need.",
  add: "Add a contact",
  edit: "Edit contact",
  importCta: "Import a spreadsheet",
  importTitle: "Import contacts",
  importBlurb:
    "Drop in a CSV from your phone, email or accountant. You'll check the columns before anything is saved.",
  importChoose: "Choose a CSV file",
  importMap: "Match your columns",
  importPreview: (n: number) => `${n} contact${n === 1 ? "" : "s"} ready to add`,
  importSkipped: (n: number) =>
    `${n} row${n === 1 ? "" : "s"} skipped — no name or no way to contact them.`,
  importConfirm: "Add these contacts",
  importIgnore: "Ignore this column",
  suggestCta: "Suggest who I'll need",
  suggestAgain: "Suggest again",
  suggestBlurb:
    "Uses a little AI to list the trades a place like yours usually needs nearby. It never invents phone numbers — you add the real ones.",
  suggestDone: "Already suggested for this property.",
  suggestions: "Suggested for this property",
  suggestAdd: "Add to my list",
  searchFor: (role: string) => `Find a ${role.toLowerCase()}`,
  call: "Call",
  text: "Text",
  whatsapp: "WhatsApp",
  email: "Email",
  preferred: "First call",
  noneForJob:
    "No saved contacts yet. Add someone in the address book above, or search the directories below.",
  noContact: "No number or email saved yet.",
  deleteConfirm: "Remove this contact?",
  fields: {
    name: "Name",
    company_name: "Company",
    category: "What they do",
    phone: "Phone",
    whatsapp_phone: "WhatsApp number (if different)",
    email: "Email",
    website: "Website",
    area: "Area they cover",
    notes: "Notes",
    is_preferred: "Call this one first",
  },
  save: "Save contact",
  cancel: "Cancel",
  remove: "Remove",
});

export const pricingCopy = branded({
  eyebrow: "Pricing",
  title: (days: number) => `Free for ${days} days, then pennies a month`,
  base: (v: string) => `${v} a month for your first property and room`,
  room: (v: string) => `${v} a month for each extra room`,
  property: (v: string) => `${v} a month for each extra property`,
  guarantee: "Money-back guarantee if it isn't for you",
  cta: (days: number) => `Start your ${days}-day free trial`,
  estimator: "What would I pay?",
  properties: "Properties",
  roomsEach: "Rooms in each",
  after: (days: number) => `After your ${days}-day free trial`,
  perMonth: "a month",
  demoTitle: "Like what you see? Run your own rooms this way.",
  demoBody: (days: number) =>
    `Register as a host and try Latchkey free for ${days} days, with a money-back guarantee.`,
  adminTitle: "Subscription pricing (super admin)",
  adminBody: "Amounts in pence. Changes show on the home page straight away.",
  saved: "Pricing saved",
});

/** Currency, time zone and phone pickers. */
export const worldCopy = branded({
  nothing: "Nothing matches.",
  findCurrency: "Search currencies (name, code or symbol)",
  findZone: "Search time zones (city or region)",
  findCountry: "Search countries or codes",
  badPhone: (country: string, example: string) =>
    `That doesn't look like a ${country} number${example ? `, e.g. ${example}` : ""}.`,
  fixPhone: "Please check the phone number first.",
});

/** Launch offers: free trial, then the offer price for the first paid month, then the usual price. */
export const offerCopy = branded({
  ribbon: (label: string, days: number, price: string, until: string) =>
    `${label}: ${days} days free, then ${price} for your first month. For new hosts who join by ${until}.`,
  seePricing: "See pricing",
  badge: (label: string, until: string) => `${label} · join by ${until}`,
  firstMonth: "for your first month",
  thenUsual: (usual: string) => `then ${usual} a month`,
  journey: (days: number, price: string, usual: string) => [
    `${days} days free`,
    `${price} for your first month`,
    `${usual} a month after that`,
  ],
  newOnly: (until: string) =>
    `For accounts opened by ${until}. The offer is for one month only; after that it's the usual price.`,
  billing: (label: string, price: string, usual: string) =>
    `${label}: your first paid month is ${price} instead of ${usual}. After that it's ${usual} a month.`,
  demo: (price: string, until: string) =>
    `Join by ${until} and your first paid month is just ${price}.`,
  adminTitle: "Offer for new hosts",
  adminBody:
    "New accounts opened between these days (UK time) pay the offer price for their first paid month, after the free trial, then the usual price. Accounts keep the offer they joined with, even if you change or end it later.",
  enabled: "Offer is on",
  price: "Offer price for the first month (£)",
  label: "Name shown to hosts",
  startsOn: "First day",
  endsOn: "Last day to join",
  save: "Save offer",
  saved: "Offer saved. The home page shows it straight away.",
  counts: (waiting: number, used: number) =>
    `${waiting} account${waiting === 1 ? "" : "s"} still to use it · ${used} used`,
  live: "Running today",
  notLive: "Not running today",
});

export const team = branded({
  scopeLabel: "Properties",
  scopeAll: "All properties",
  scopeSome: "Only some",
  scopeSaved: "Properties updated.",
  title: "Team",
  body: "Invite people to help run your rooms. Each person signs in with their own account.",
  roles: {
    owner: "Owner",
    manager: "Manager",
    viewer: "Viewer",
  },
  roleHints: {
    owner: "Everything, including billing, the team and deleting properties.",
    manager: "Rooms, calendars, bookings, guides, extras and requests. Not billing or the team.",
    viewer: "Can see everything, can't change anything.",
  },
  you: "You",
  invite: "Invite someone",
  inviteTitle: "Invite to your team",
  inviteBody: "They'll get an email with a link that works for 7 days.",
  emailLabel: "Their email address",
  roleLabel: "What they can do",
  send: "Send invitation",
  sent: "Invitation sent",
  notEmailed: "Invitation saved, but the email didn't send. Use Resend to try again.",
  pending: "Waiting to accept",
  expired: "Expired",
  resend: "Resend",
  resent: "A fresh link is on its way",
  revoke: "Cancel invite",
  remove: "Remove",
  removeTitle: (email: string) => `Remove ${email}?`,
  removeBody: "They lose access straight away. You can invite them again later.",
  leave: "Leave this host",
  leaveTitle: "Leave this host?",
  leaveBody: "You'll lose access straight away. The owner can invite you again.",
  readOnlyList: "Only owners can change the team.",
  demoLocked: "The team is locked in the shared demo.",
  readOnlyBadge: "Read-only access",
  switchHost: "Switch host",
  joined: (date: string) => `Joined ${date}`,
  lastActive: (date: string) => `last signed in ${date}`,
  neverSignedIn: "hasn't signed in yet",
  accessTo: (list: string) => `Access: ${list}`,
  rooms: (n: number) => `${n} ${n === 1 ? "room" : "rooms"}`,
  noProperties: "no properties yet",
  editProfile: "Edit my profile",
  profileTitle: "Your profile",
  profileBody: "Your name and photo show on team cards. Your email is how you sign in.",
  photo: "Photo",
  photoSaved: "Photo updated",
  name: "Your name",
  nameSaved: "Name saved",
  signInEmail: "Sign-in email",
  changeEmail: "Change",
  emailHint:
    "We'll email a confirmation link to the new address; the change happens when you open it.",
  emailCheck: (email: string) => `Check ${email} for a link to confirm the change.`,
  accessRemoved: (host: string) => `Your access to ${host} was removed.`,
});

export const invite = branded({
  title: (host: string) => `Join ${host} on Latchkey`,
  as: (role: string) => `You've been invited as a ${role.toLowerCase()}.`,
  signInFirst: (email: string) => `Sign in or create your account with ${email} to accept.`,
  signIn: "Sign in or create account",
  accept: "Accept invitation",
  accepting: "Joining…",
  wrongEmail: (email: string) =>
    `This invite was sent to ${email}. Sign in with that email address to accept it.`,
  used: "This invitation has already been used. If it was yours, just sign in.",
  expired: "This invitation has expired. Ask the owner to send a new one.",
  revoked: "This invitation was cancelled. Ask the owner if you still need access.",
  missing: "We couldn't find this invitation. Check the link in your email.",
  demo: "The shared demo can't join a team. Sign out and use your own account.",
  pendingTitle: "You've been invited",
  pendingBody:
    "Someone has invited this email address to their team. Open the link in your invitation email to join.",
  pendingOwn: "Start my own workspace instead",
});

export const activity = branded({
  title: "Activity",
  subtitle: "Who changed what. Kept for a year.",
  empty: "Nothing has changed yet.",
  ownerOnly: "Only owners can see the activity history.",
  system: "Latchkey (automatic)",
  redacted: "changed",
  more: "Show more",
  view: "View",
  before: "Before",
  after: "After",
  wrap: "Wrap lines",
  copy: "Copy",
  copied: "Copied",
  actions: { insert: "added", update: "changed", delete: "removed" } as Record<string, string>,
  tables: {
    hosts: "business settings",
    host_members: "team member",
    host_invitations: "invitation",
    properties: "property",
    rooms: "room",
    channel_connections: "calendar link",
    room_listings: "room listing",
    bookings: "booking",
    guides: "guide section",
    guide_steps: "guide step",
    extras_catalogue: "price list item",
    unavailability_windows: "unavailable time",
    trades: "trade contact",
  } as Record<string, string>,
});

export const guestCard = branded({
  noName: "Guest name to confirm",
  archived: "Hidden",
  room: "Room",
  noRoom: "No room allocated",
  arrives: "Arrives",
  leaves: "Leaves",
  nights: "Nights",
  guests: "Guests",
  bookedOn: "Booked on",
  reference: "Reference",
  email: "Email",
  address: "Address",
  phone: "Phone",
  call: "Call",
  text: "Text",
  whatsapp: "WhatsApp",
  callHint:
    "Opens your phone, or the app that makes calls on this computer (iPhone on a Mac, Phone Link on Windows).",
  kioskWelcome: "Kiosk welcome",
  kioskWelcomeHide: "Close the welcome",
  checkedIn: "Checked in",
  notes: "Notes",
  archive: "Hide",
  restore: "Show again",
  archivedToast: "Hidden. It stays hidden on later syncs unless the platform changes it.",
  restored: "Back in your bookings",
  messages: "Messages",
  noMessages: "No messages yet.",
  you: "You",
  guest: "Guest",
  replyPlaceholder: "Write to the guest…",
  send: "Send",
  sent: "Message sent",
  requests: "Requests",
  noRequests: "No requests.",
  extrasRequest: "Extras request",
  free: "free",
  openServices: "Open Services",
  activity: "Arrivals and departures",
  presence: {
    arrived: "Arrived",
    left: "Left",
    returned: "Came back",
    checked_out: "Checked out",
  } as Record<string, string>,
  deleteTitle: (name: string) => `Remove ${name}?`,
  deleteBody:
    "This deletes the stay with its messages, requests and alerts. It can't be undone. Hide it instead if you might need it later. Guest register entries are kept for 12 months, as UK law requires.",
  deleteSynced:
    "It came from a calendar link, so it will come back on the next sync if the platform still lists it.",
  deleted: "Stay removed",
  whoStaying: "Who's staying",
  arrivedCount: (adults: number, children: number) =>
    `${adults} ${adults === 1 ? "adult" : "adults"}${children ? `, ${children} ${children === 1 ? "child" : "children"}` : ""}`,
  bookedFor: (n: number) => `booked for ${n}`,
  leadGuest: "Lead guest",
  adult: (n: number) => `Adult ${n}`,
  child: (age: number | null) => (age === null ? "Child" : `Child, ${age}`),
  verified: "ID matches booking",
  idChecked: "ID checked",
  idPartial: "ID partly matches",
  idMismatch: "ID doesn't match",
  idSkipped: "No ID shown",
  idNone: "No ID check",
  noPeople: "Guests haven't said who's staying yet.",
  viewId: (name: string) => `View ID for ${name}`,
  idDialogTitle: (name: string) => `${name}'s ID`,
  idPhoto: "ID photo",
  facePhoto: "Face photo",
  noPhotos: "No photos kept for this guest.",
  docType: {
    passport: "Passport",
    driving_licence: "Driving licence",
    national_id: "ID card",
    residence_permit: "Residence permit",
    other: "Other ID",
  } as Record<string, string>,
  detailName: "Name on ID",
  detailDob: "Date of birth",
  detailDoc: "ID type",
  detailCountry: "Issued by",
  detailExpiry: "Expires",
  detailNumber: "Number ends",
  deletedOn: (date: string) => `Deleted automatically on ${date}.`,
  registerTitle: "Guest register (kept 12 months)",
  registerNationality: "Nationality",
  registerDocument: "Passport or ID number",
  registerPlace: "Place of issue",
  registerNext: "Next destination",
  registerAddress: "Address there",
});

export const bookingTools = branded({
  showing: (what: string, n: number) =>
    `Showing ${what.toLowerCase()}: ${n} ${n === 1 ? "stay" : "stays"}`,
  showLabels: {
    arriving: "Arriving today",
    staying: "Staying now",
    leaving: "Leaving today",
    needs_details: "Stays that need details",
    double_booked: "Possible double bookings",
  } as Record<string, string>,
  showEverything: "Show everything",
  active: "Bookings",
  archive: "Hidden",
  select: "Select",
  done: "Done",
  selected: (n: number) => `${n} selected`,
  selectAll: "Select all",
  archiveSelected: "Hide",
  restoreSelected: "Show again",
  deleteSelected: "Delete",
  deleteTitle: (n: number) => `Delete ${n} ${n === 1 ? "stay" : "stays"}?`,
  deleteBody:
    "This deletes them with their messages, requests and alerts, and can't be undone. Stays from a calendar link come back on the next sync if the platform still lists them; hide those instead to keep them out of sight.",
  archivedToast: (n: number) => `${n} hidden`,
  restoredToast: (n: number) => `${n} back in your bookings`,
  deletedToast: (n: number) => `${n} removed`,
  syncAll: "Sync calendars",
  syncedToast: (created: number, updated: number) =>
    `Calendars synced · ${created} new, ${updated} updated`,
  noLinks: "This property has no calendar links yet.",
  archiveEmpty: "Nothing hidden.",
  archiveHint:
    "Hidden stays are left out of Today and Bookings, and stay hidden on later calendar syncs unless the platform changes them (new dates, a guest books, or it's reopened). Guests can still use their links.",
  rowAddName: "Add the guest's name",
  rowNotBooking: "Not a booking: close these nights",
  rowUnblock: "It's a booking: reopen to add the guest",
  rowHide: "Hide",
  rowShow: "Show again",
  rowOpenOriginal: "Open the booking these nights mirror",
  closedToast: "Closed. Moved to closed nights.",
  reopenedToast: "Reopened. Add the guest's name when you have it.",
});

export const stayCalendar = branded({
  title: "Next two weeks",
  subtitle:
    "Who is where, what is blocked, and who is waiting on you. Tap a stay for the guest's details.",
  room: "Room",
  checkedIn: "Checked in",
  unread: (n: number) => `${n} unread ${n === 1 ? "message" : "messages"}`,
  requests: (n: number) => `${n} open ${n === 1 ? "request" : "requests"}`,
  earlier: "Earlier",
  later: "Later",
  nights: (n: number) => `${n} ${n === 1 ? "night" : "nights"}`,
  stayDates: (from: string, to: string) => `${from} to ${to}`,
  cleaning: "Cleaning",
  continues: "Continues",
  continued: "Continued",
});

export const jobTools = branded({
  archiveTab: "Archive",
  archiveEmpty: "Nothing in the archive.",
  archive: "Archive",
  restore: "Restore",
  archived: "Moved to the archive",
  restored: "Back on the board",
  deleteTitle: (title: string) => `Delete "${title}"?`,
  deleteBody:
    "This removes the job for good. Archive it instead if you might want to look it up later.",
  deleted: "Job deleted",
});

export const linkTools = branded({
  subtitle: "Every room's calendar links in one place, with how each one is doing.",
  addLink: "Add link",
  unlinked: "Not linked to a room",
  noRooms: "Add rooms to this property first.",
  noLink: "No link saved",
  editTitle: "Edit calendar link",
  editBody: (masked: string) =>
    `Change the room, platform or name. To replace the link (${masked || "none saved"}), paste the new one; leave it empty to keep it.`,
  testNeedsLink: "Paste a link to test it",
  saved: "Calendar link updated",
  syncResult: (created: number, updated: number, cancelled: number) =>
    `Synced · ${created} new, ${updated} updated, ${cancelled} cancelled`,
  syncedAll: (n: number) => `${n} calendar ${n === 1 ? "link" : "links"} synced`,
  removeTitle: "Remove this calendar link?",
  removeBody:
    "Latchkey stops reading this calendar. Bookings it brought in stay unless you tick the box.",
  withStays: "Also remove the stays this link brought in",
  withStaysHint: "Their messages and requests go too. Any with payments are hidden instead.",
  removed: "Calendar link removed",
  removedWithStays: (removed: number, archived: number) =>
    `Calendar link removed with ${removed} ${removed === 1 ? "stay" : "stays"}${archived ? `; ${archived} with payments hidden` : ""}`,
  states: {
    syncing: "Syncing…",
    ok: "Working",
    warning: "Needs a look",
    error: "Not working",
    never: "Not checked yet",
  },
});

/** The UK guest register (Immigration (Hotel Records) Order 1972). */
export const registerPage = branded({
  gapsTitle: "To add from check-in",
  gapsBody:
    "These guests checked in, but their ID couldn't be read automatically (or they had none), so they aren't in the register yet. Open each, check the photo and save. \"Read the ID photo\" fills the details in for you to check.",
  gapAdd: "Add to register",
  gapGuest: (n: number) => `Guest ${n}`,
  gapNoPhoto: "No ID photo kept",
  gapPhotoAlt: "The guest's ID photo",
  readPhoto: "Read the ID photo",
  readPhotoDone: "Read from the photo. Please check before saving.",
  stayDetails: "ID photos and check-in details",
  hideDetails: "Hide ID photos and details",
  photosTitle: "ID photographs",
  noPhotosKept:
    "No ID photographs are kept for this stay. They're only kept when your guest records settings ask for them, and are deleted automatically after the days you chose.",
  preview: "Preview",
  downloadPhoto: "Download",
  downloadFailed: "Couldn't download that photo. Open the preview and save it from there.",
  photoOf: (who: string, what: string) => `${what}: ${who}`,
  dataTitle: "Captured at check-in",
  stayTitle: "The stay",
  colGuest: "Guest",
  colType: "Adult or child",
  colIdType: "ID type",
  colIssuedBy: "Issued by",
  colDob: "Date of birth",
  colExpiry: "ID expires",
  colNumberEnds: "Number ends",
  colCheck: "ID check",
  colDeleted: "Photos deleted",
  adult: "Adult",
  child: (age: number | null) => (age === null ? "Child" : `Child, ${age}`),
  factRef: "Booking reference",
  factRoom: "Room",
  factDates: "Dates",
  factCheckedIn: "Checked in",
  factArrived: "Arrived",
  factEmail: "Email",
  factPhone: "Phone",
  factAddress: "Home address",
  noDetails: "No one has checked in for this stay through Latchkey yet.",
  title: "Guest register",
  subtitle:
    "UK law asks you to record the full name and nationality of every guest aged 16 or over, and keep it for 12 months. Guests fill this in when they check in.",
  law: "Guests who aren't British, Irish or Commonwealth citizens also give their passport or ID number, where it was issued, and where they're going next. Show this register to the police or an immigration officer if they ask to inspect it. Entries are removed automatically 12 months after arrival.",
  notUk: "None of your properties are in the UK, so there's nothing to record here.",
  staffOnly: "Only owners and managers can see the guest register.",
  allProperties: "All properties",
  from: "Arrived from",
  to: "to",
  download: "Download spreadsheet",
  downloaded: (n: number) => `Downloaded ${n} ${n === 1 ? "entry" : "entries"}.`,
  print: "Print",
  add: "Add a guest",
  edit: "Correct",
  empty: "No guests registered for these dates.",
  count: (n: number) => `${n} ${n === 1 ? "guest" : "guests"}`,
  colArrived: "Arrived",
  colName: "Full name",
  colNationality: "Nationality",
  colDocument: "Passport or ID",
  colNext: "Next destination",
  colWhere: "Where",
  issuedAt: (place: string) => `issued ${place}`,
  byHost: "Added by you",
  dialogAdd: "Add a guest to the register",
  dialogEdit: "Correct this entry",
  dialogHelp: "For anyone aged 16 or over who checked in with you in person.",
  property: "Property",
  arrival: "Arrival date",
  room: "Room (optional)",
  saved: "Register updated",
  keptUntil: (date: string) => `Kept until ${date}`,
});

/** Invoices for direct stays: guest guide, the invoice page, and the host's tools. */
export const invoiceCopy = branded({
  // Guest guide
  cardTitle: "Your invoice",
  cardBody: "Need an invoice for your stay? It's made for you when you ask.",
  issuedTo: "It will be made out to",
  changeQuestion: "Do any of these details need changing?",
  changeNo: "No, they're right",
  changeYes: "Yes, change them",
  email: "Email address",
  address: "Postal address (optional)",
  addressHint: "Each line on its own line, for example street, town and postcode.",
  lockNote:
    "Once it's made, these details can't be changed here. Your host can update it if anything is wrong.",
  create: "Make my invoice",
  creating: "Making your invoice…",
  ready: (number: string) => `Invoice ${number} is ready.`,
  open: "View or download",
  emailIt: "Email it to me",
  emailSubject: (number: string, place: string) => `Invoice ${number} from ${place}`,
  emailBody: (url: string) => `Here's the invoice for my stay:\n\n${url}`,
  copyLink: "Copy link",
  copied: "Link copied",
  // Invoice page
  pageTitle: "Invoice",
  number: "Invoice number",
  date: "Date",
  billedTo: "Billed to",
  from: "From",
  room: "Room",
  stay: "Stay",
  item: "Description",
  amount: "Amount",
  subtotal: "Subtotal",
  taxLine: (name: string, ratePct: string) => `${name} at ${ratePct}%`,
  total: "Total",
  paidNote: "Thank you for staying with us.",
  amended: (date: string) => `Amended ${date}`,
  download: "Download PDF",
  downloadHint: "Choose Save as PDF in the print window.",
  notFound: "We couldn't find that invoice. Please ask your host for a new link.",
  // Host
  hostSection: "Invoice",
  hostNone:
    "No invoice yet. The guest can make one from their guest guide, or you can make it now.",
  hostNotDirect:
    "Invoices are for direct bookings. This stay came from a booking site, which invoices the guest itself.",
  hostNeedsAmount: "Add the amount the guest paid (edit the booking) to make an invoice.",
  hostOff: "Invoices are switched off. Turn them on in Settings → Invoices.",
  hostMake: "Make invoice",
  hostEdit: "Edit invoice",
  hostOpen: "Open",
  hostMadeBy: (who: string) => (who === "guest" ? "Made by the guest" : "Made by you"),
  dialogTitleNew: "Make an invoice",
  dialogTitleEdit: (number: string) => `Edit invoice ${number}`,
  sellerName: "Property name",
  sellerRoom: "Room",
  sellerAddress: "Property address",
  buyerName: "Guest name",
  buyerEmail: "Guest email",
  buyerAddress: "Guest postal address",
  description: "Description",
  amountLabel: (currency: string) => `Amount charged (${currency})`,
  includesTax: (tax: string) => `This amount includes ${tax}`,
  useBookingAmount: (amount: string) => `Use the booking's amount (${amount})`,
  notRegistered:
    "You're not registered for tax, so no tax line is shown. Change this in Settings → Extras.",
  totalsPreview: (net: string, tax: string, total: string, name: string) =>
    `${net} + ${tax} ${name} = ${total}`,
  saved: "Invoice saved",
  // Settings
  settingsTitle: "Invoices",
  settingsBody:
    "Let guests on direct bookings download an invoice from their guest guide. Nothing is made until they, or you, ask for one.",
  enable: "Offer invoices on direct bookings",
  taxNumber: (label: string) => `${label} (optional)`,
  taxNumberHint: (name: string) => `Shown on invoices when you're registered for ${name}.`,
  prefix: "Invoice number prefix",
  prefixHint: (example: string) => `Invoices are numbered in order, for example ${example}.`,
  taxSummary: (registered: boolean, name: string, rate: string, includes: boolean) =>
    registered
      ? `You charge ${name} at ${rate}%, and your prices ${includes ? "include" : "don't include"} it. Change this in Extras.`
      : `You're not registered for ${name}, so invoices show no tax. Change this in Extras.`,
  settingsSaved: "Invoice settings saved",
  // Booking dialog
  stayAmount: (currency: string) => `Amount the guest paid (${currency})`,
  stayAmountHint: "Used for the invoice on direct bookings.",
  stayIncludesTax: (tax: string) => `Includes ${tax}`,
});

/** Latchkey's own subscription, as the host sees it. */
export const billingCopy = branded({
  navLabel: "Billing",
  title: "Subscription",
  subtitle: "Your Latchkey plan, card and invoices.",
  phase: {
    trial: (days: number) => `Free trial: ${days} ${days === 1 ? "day" : "days"} left`,
    trial_ended: "Your free trial has ended",
    active: "Subscribed",
    past_due: "Payment failed: Stripe will try your card again",
    canceled: "Subscription cancelled",
    comped: "Free plan",
  } as Record<string, string | ((days: number) => string)>,
  price: (amount: string, properties: number, rooms: number) =>
    `${amount} a month for ${properties} ${properties === 1 ? "property" : "properties"} and ${rooms} ${rooms === 1 ? "room" : "rooms"}.`,
  trialEnds: (date: string) => `Your trial ends on ${date}.`,
  chargeNote: (date: string) =>
    `Add a card now and nothing is taken until ${date}. Stripe then takes the first monthly payment automatically, and every month after.`,
  chargeNow: "Your trial has ended, so the first monthly payment is taken today.",
  renews: (date: string) => `Next payment on ${date}.`,
  addCard: "Add a card and subscribe",
  reactivate: "Subscribe again",
  updateCard: "Update card or see invoices",
  cancel: "Cancel subscription",
  cancelTitle: "Cancel your subscription?",
  cancelBody:
    "Your subscription stops straight away and so does access to Latchkey: you won't be able to make changes, and guests won't be able to check themselves in. Your guest register and invoices stay readable. You can subscribe again at any time.",
  cancelConfirm: "Yes, cancel now",
  canceledToast: "Your subscription is cancelled.",
  done: "Thank you. Your card is saved and your subscription is set up.",
  notReady: "Payments aren't switched on yet. Please contact Latchkey support.",
  ownerOnly: "Only the owner can change the subscription.",
  plansTitle: "Plans",
  recommended: "Most popular",
  yourPlan: "Your plan",
  perMonth: "a month",
  planRooms: (rooms: number, extra: string, maxProps: number | null) =>
    `Includes ${rooms} rooms, then ${extra} a room${maxProps ? `. Up to ${maxProps} ${maxProps === 1 ? "property" : "properties"}` : ". Any number of properties"}.`,
  youWouldPay: (amount: string, rooms: number) =>
    `With your ${rooms} ${rooms === 1 ? "room" : "rooms"}: ${amount} a month.`,
  apiIncluded: (n: number) => `Includes ${n.toLocaleString("en-GB")} API and MCP requests a month.`,
  choosePlan: (name: string) => `Choose ${name}`,
  planChanged: "Plan updated. Any difference is adjusted on your next payment.",
  apiAddonTitle: "API and MCP add-on",
  apiAddonBody: (price: string, n: number) =>
    `Connect AI assistants and other apps to Latchkey. ${price} a month for ${n.toLocaleString("en-GB")} requests.`,
  lockedTitle: "Your Latchkey access has ended",
  lockedTrial:
    "Your free trial has finished. Subscribe to carry on where you left off: everything you set up is still here.",
  lockedCanceled:
    "Your subscription was cancelled. Subscribe again to carry on: everything you set up is still here.",
  lockedCta: "Go to Billing",
  lockedRegister: "You can still open your guest register.",
  bannerTrial: (days: number) => `${days} ${days === 1 ? "day" : "days"} left of your free trial.`,
  bannerPastDue: "Your last payment didn't go through. Update your card to keep Latchkey running.",
  bannerCta: "Billing",
});

/** Letting Latchkey support help, and what support sees. */
export const supportCopy = branded({
  title: "Support access",
  body: "Let Latchkey support look into problems and make changes for you. It lasts 30 days, and you can stop it at any time. Support can always see your dashboard to help, but can't change anything, or see guests' ID details, unless this is on.",
  allow: "Allow support to make changes for 30 days",
  until: (date: string) => `Support can make changes until ${date}.`,
  stop: "Stop support access now",
  allowed: "Support access is on for 30 days.",
  stopped: "Support access is off.",
  bannerReadOnly: (name: string) =>
    `Support view of ${name}: read-only. The host hasn't allowed changes.`,
  bannerWritable: (name: string, date: string) =>
    `Support view of ${name}: changes allowed until ${date}.`,
  exit: "Back to admin",
});

/** Ratings, ideas and bug reports. */
export const feedbackCopy = branded({
  button: "Feedback",
  title: "Tell us what you think",
  tabRate: "Rate Latchkey",
  tabFeature: "Suggest a feature",
  tabBug: "Report a bug",
  rateLabel: "How are you finding Latchkey?",
  star: (n: number) => `${n} ${n === 1 ? "star" : "stars"}`,
  comment: "Anything to add? (optional)",
  feature: "What would make Latchkey better for you?",
  bug: "What went wrong? What were you doing at the time?",
  send: "Send",
  thanks: "Thank you. We read every message.",
  gotIt: "Got it",
  needSomething: "Add a rating or a few words.",
  // Guest guide
  guestTitle: "How was your stay?",
  guestBody: "Your host would love to know. Only they see this.",
  guestComment: "Anything you'd like to tell your host? (optional)",
  guestSend: "Send to my host",
  guestThanks: "Thank you. Your host has your feedback.",
  // Host
  reviewsTitle: "What guests said",
  reviewOnPage: "Shown on your booking page (the guest agreed)",
  reviewsEmpty: "No guest feedback yet. Guests can rate their stay from their guest guide.",
  reviewsAverage: (avg: string, n: number) =>
    `${avg} average from ${n} ${n === 1 ? "guest" : "guests"}`,
});

/** The super admin's area. */
export const adminCopy = branded({
  siteSettingsTitle: "Sign-ups, support and notices",
  viewingTitle: (name: string) => `The business you're viewing${name ? `: ${name}` : ""}`,
  viewingBody:
    'Latchkey\'s own switches for this business: whether each connection is in demo or live, and its sample data. Use "View as host" below to open another business.',
  sampleLoaded: "Demo rooms loaded",
  sampleRemoved: "Demo content removed",
  navLabel: "Latchkey admin",
  title: "Latchkey admin",
  subtitle: "Every business, billing, trial checks, feedback, announcements and site settings.",
  tabOverview: "Overview",
  tabHosts: "Businesses",
  tabFlags: "Trial checks",
  tabFeedback: "Feedback",
  tabMessages: "Announcements",
  tabSettings: "Site settings",
  tabPricing: "Pricing studio",
  tabRoutines: "Routines",
  tabIntegrations: "Integrations",
  tabVisitors: "Visitors",
  planPackage: "Plan",
  apiAddonOn: "API add-on: on",
  apiAddonOff: "API add-on: off",
  packageSaved: "Saved. Their card is charged the new price from the next bill.",
  statBusinesses: "Businesses",
  statProperties: "Properties",
  statRooms: "Rooms",
  statBookings30: "Bookings, last 30 days",
  statCheckins30: "Check-ins, last 30 days",
  statMrr: "Monthly revenue (subscribed)",
  statTrialing: "On trial",
  statPaying: "Paying",
  statEnded: "Ended",
  platforms: "Bookings by platform",
  colBusiness: "Business",
  colPlan: "Plan",
  colSize: "Properties · rooms",
  colUse: "Bookings (30 days / all)",
  colBill: "Monthly",
  colLast: "Last sign-in",
  viewAs: "View as host",
  comp: "Make free",
  extend: "Extend trial 14 days",
  endAccess: "End access",
  backToTrial: "Back on trial 14 days",
  platformStripeOn: "Guest payments: use Latchkey's Stripe",
  platformStripeOff: "Guest payments: host's own Stripe",
  supportOn: "Support allowed",
  flagsEmpty: "No repeat sign-ups spotted.",
  flagReason: {
    same_address: "Same address as another account",
    same_email: "Same email as another account",
  } as Record<string, string>,
  resolve: "Mark reviewed",
  resolved: "Reviewed",
  feedbackEmpty: "No feedback yet.",
  kinds: { host_rating: "Rating", feature: "Feature idea", bug: "Bug" } as Record<string, string>,
  statuses: { new: "New", seen: "Seen", planned: "Planned", done: "Done" } as Record<
    string,
    string
  >,
  sendTitle: "Send an announcement or message",
  audience: "To",
  everyone: "Every host",
  msgTitle: "Title",
  msgBody: "Message",
  msgExpires: "Show for (days, optional)",
  msgSend: "Send",
  msgSent: "Sent. Hosts see it once, the next time they open Latchkey.",
  msgActive: "Showing",
  msgOff: "Stopped",
  msgStop: "Stop showing",
  msgResume: "Show again",
  signupsOpen: "New free trials are open",
  nightlyLines: "Invoices: one line per night",
  kioskSaverTitle: "Kiosk screensaver",
  kioskSaverHelp:
    "Every kiosk starts at this brightness and clock size. Hosts can change them on the screensaver (slide the left edge for brightness, the right edge for size), within the size limits here.",
  kioskSaverBrightness: "Starting brightness",
  kioskSaverSize: "Starting clock size",
  kioskSaverSizeMin: "Smallest clock size hosts can choose",
  kioskSaverSizeMax: "Largest clock size hosts can choose",
  kioskTimingsTitle: "Kiosk timings",
  kioskQrTitle: "Check in on a phone instead",
  kioskQrHelp:
    "How door tablets offer guests the square to scan with their own phone on the welcome screen. After the welcome it's always the small icon at the top.",
  kioskQrStyles: {
    panel: {
      label: "Full panel on the right",
      help: "A large square beside the welcome, with a short explanation.",
    },
    icon: {
      label: "Small icon at the top",
      help: "A phone icon beside the time; tapping it opens the square.",
    },
  },
  kioskResetMinutes: "Unfinished check-in goes back to the start after (minutes with no touch)",
  kioskSaverMinutes: "Screensaver starts after (minutes with no touch)",
  kioskSaverMinutesHelp: "Counted from the last touch, so never sooner than the check-in reset.",
  kioskWelcomeMinutes: "A host's welcome rests after (minutes with no touch)",
  kioskWelcomeMinutesHelp:
    "Resting splits the screen: the welcome and its Check in button on top, a dim clock, quiet hours and the phone QR below. It stays until the guest checks in, the host takes it off or its end time; the screensaver never covers it. 0 never rests.",
  kioskSaverNotReady:
    "Kiosk screensaver settings appear once the latest database update is applied.",
  nightlyLinesHelp:
    "Each night of the stay gets its own line with its share of the price, then the total. Off: one line for the whole stay. Applies to invoices made or edited from now on.",
  supportEmail: "Support email shown to hosts",
  notice: "Site notice (shown at the top of every host's dashboard)",
  saved: "Saved",
  pricingTitle: "Subscription pricing",
  superAdminsTitle: "Super admins",
  superAdminsBody:
    "People who can manage all of Latchkey: every business, billing, announcements and these settings. They sign in with this email and must confirm it before they get access.",
  you: "You",
  addedBy: (by: string, when: string) => `Added by ${by} on ${when}`,
  addPlaceholder: "name@example.com",
  addAdmin: "Add super admin",
  added: "Added. They'll see Latchkey admin once they sign in with that email.",
  removeAdmin: "Remove",
  removed: "Removed.",
  notAdmin: "This page is for the Latchkey super admin.",
});

/** Super admin: plans, costs, recommendations and projections. */
export const studioCopy = branded({
  published: "Published: hosts see these plans on Billing.",
  notPublished:
    "Not published yet: hosts pay the original per-room price. Publish when you're happy.",
  migration:
    "Run migration 0027 first (Lovable applies it on the next sync); until then nothing here can be saved.",
  nowTitle: "Where you are now",
  payers: "Paying hosts",
  trials: "On trial",
  revenue: "Monthly revenue at these prices",
  cost: "Monthly cost (estimate)",
  profit: "Profit",
  breakEven: (n: number, m: number | null, pct: number) =>
    m === null
      ? `Breaks even at ${n} paying hosts; ${pct}% isn't reachable at these prices.`
      : `Breaks even at ${n} paying hosts, ${pct}% profit from ${m}.`,
  losing: "Every host costs more than they pay: raise prices or lower costs.",
  plansTitle: "Plans and features",
  plansBody:
    "Three tiers, like The Economist: Start is the low-cost way in, Grow is the one most hosts should pick (marked recommended), and Pro is the top tier that makes Grow look good value. Each includes some rooms, then extra rooms cost a little more, so hosts pay as they grow.",
  expected: "Paying hosts to share fixed costs across",
  applyAll: "Use all recommended prices",
  breakEvenPrice: (be: string, rec: string) => `Break-even ${be} · recommended ${rec}`,
  use: "Use",
  name: "Name",
  tagline: "One line about who it's for",
  base: "Price a month (£)",
  included: "Rooms included",
  extraRoom: "Each extra room (£)",
  maxProps: "Properties (blank = no limit)",
  apiReq: "API requests included (0 = add-on only)",
  aiReads: "AI ID reads a month (for costing)",
  recommended: "Recommended plan",
  addonTitle: "API & MCP add-on (for plans without it)",
  addonPrice: "Price a month (£)",
  addonRequests: "Requests included",
  addonRec: (rec: string) => `Recommended ${rec} (break-even + margin for its requests)`,
  moveSubs: "Also move current subscribers to these prices from their next bill",
  publish: "Publish plans",
  unpublish: "Go back to per-room pricing",
  publishedToast: (moved: number, failed: number) =>
    moved || failed
      ? `Published. ${moved} subscribers moved${failed ? `, ${failed} couldn't be (check Stripe)` : ""}.`
      : "Published.",
  costsTitle: "What Latchkey costs to run",
  costsBody:
    "Lovable charges in Run credits and doesn't publish a rate per request, so these start as estimates. Each month, copy the credits from Lovable (Settings → Usage, last 30 days) into Calibrate and they're tuned to what really happened.",
  costFields: {
    usdPerCredit: ["US$ per Run credit", "Pro plan top-ups are $0.30"],
    gbpPerUsd: ["£ per US$", "Exchange rate"],
    fixedPence: ["Fixed costs a month (pence)", "Lovable plan, domain, email"],
    fixedCredits: [
      "Baseline credits a month",
      "Database, scheduler and demo, whatever the number of hosts",
    ],
    creditsPerRoom: ["Credits per room a month", "Calendar syncs, guest pages, storage"],
    creditsPer1kApi: ["Credits per 1,000 API requests", ""],
    creditsPerAiRead: ["Credits per AI ID read", ""],
    stripePct: ["Stripe fee (fraction)", "0.022 = 2.2% card + Billing"],
    stripeFixedPence: ["Stripe fixed fee (pence)", "Per monthly payment"],
    margin: ["Target profit (fraction)", "0.1 = break-even + 10%"],
  } as Record<string, [string, string]>,
  saveCosts: "Save costs",
  calibrateTitle: "Calibrate from Lovable",
  totalCredits: "Total credits, last 30 days",
  aiCredits: "Of which AI credits",
  counted: (rooms: number, ai: number, api: number) =>
    `Latchkey counted: ${rooms} active rooms, ${ai} AI ID reads, ${api} API requests in the same 30 days.`,
  calibrate: "Calibrate",
  calibrated: "Calibrated, and this month's actuals recorded.",
  projTitle: "Projection and actuals",
  projBody:
    "How many hosts you expect on each plan, and how fast they join and leave. Re-base starts it again from today's real numbers; each calibration records the real month next to the projected one.",
  projStart: "Paying now",
  projNew: "New a month",
  projRooms: "Typical rooms",
  churn: "Hosts leaving a month (%)",
  attach: "Hosts adding the API (%)",
  apiTypical: "API requests a month (users)",
  saveProj: "Save projection",
  rebase: "Re-base on today",
  rebased: "Projection now starts from today's numbers.",
  colMonth: "Month",
  colHosts: "Hosts",
  colRevenue: "Revenue",
  colCost: "Cost",
  colProfit: "Profit",
  colMargin: "Margin",
  colActual: "Actual",
  saved: "Saved",
});

/** Super admin: visitor and user analytics. */
export const visitorsCopy = branded({
  range: "Period",
  day1: "Last 24 hours",
  days7: "Last 7 days",
  days30: "Last 30 days",
  days90: "Last 90 days",
  days365: "Last 12 months",
  club: "Group visits by",
  byDay: "Day",
  byWeek: "Week",
  byMonth: "Month",
  who: "Show",
  whoAll: "Everyone",
  whoKnown: "Known people",
  whoAnon: "Not yet known",
  whoConverted: "Became known",
  hideBots: "Hide bots and crawlers",
  hideTeam: "Hide Latchkey team",
  search: "Search email, place, IP, device or source",
  migration:
    "Run migration 0028 first (Lovable applies it on the next sync); visits are recorded from then on.",
  tPeople: "People",
  tVisitors: "Browsers",
  tVisits: "Visits",
  tViews: "Page views",
  tAvg: "Average visit",
  tKnown: "Known",
  tConverted: "Became known",
  botsHidden: (n: number) => `${n} visit${n === 1 ? "" : "s"} by bots and crawlers hidden.`,
  truncated:
    "Showing the latest 20,000 visits in this period; pick a shorter period for everything.",
  pages: "Pages",
  page: "Page",
  views: "Views",
  uniques: "Browsers",
  avgTime: "Avg time",
  sources: "Came from",
  places: "Where",
  devices: "Devices",
  browsers: "Browsers",
  people: "People and visitors",
  peopleBody:
    "One row per person. Browsers are matched to a person only on exact identifiers (their account and email) when they sign in, so the same person on a phone and a laptop shows once. Until then each browser is its own anonymous visitor. Click a row for every visit and page.",
  person: "Person",
  visitsCol: (p: string) => `Visits (by ${p})`,
  time: "Time on site",
  from: "From",
  device: "Device",
  lastSeen: "Last seen",
  bot: "Bot",
  team: "Team",
  browsersN: (n: number) => `${n} browsers`,
  pagesN: (n: number) => `${n} page${n === 1 ? "" : "s"}`,
  known: "Known",
  trial: "Trial, no email yet",
  anonymous: "Anonymous",
  convertedOn: (d: string) => `Became known ${d}`,
  firstSeen: "First seen",
  knownSince: "Known since",
  ips: "IP addresses",
  clubbed: (p: string) => `Visits by ${p}`,
  clubLine: (visits: number, pages: number, time: string) =>
    `${visits} visit${visits === 1 ? "" : "s"}, ${pages} pages, ${time}`,
  weekOf: (d: string) => `Week of ${d}`,
  via: "from",
  empty: "No visits in this period.",
  more: (n: number) => `${n} more not shown; narrow the period or search.`,
  privacy:
    "Kept 13 months; IP addresses are cleared after 90 days. Browsers that send Global Privacy Control or Do Not Track aren't counted, and anyone can opt out with a link ending ?notrack=1.",
});

/** Super admin: every routine that spends Lovable Run credits. */
export const routinesCopy = branded({
  demoLinksTitle: "Public demo links",
  demoLinksBody:
    "Share these. Each regional link carries its own campaign name unless the link already has utm_* tags; results show in Visitors → Launch funnel.",
  demoHill: "The Hill Suites · Amersham",
  demoGuest: "Guest journey",
  demoHost: "Host dashboard",
  demoCampaign: (c: string) => `campaign: ${c}`,
  demoCopy: "Copy",
  demoCopied: "Link copied.",
  recordingTitle: "Recording account",
  recordingBody:
    "Refill the separate account you record videos from: three weeks of stays at about 70%, turnovers, a late arrival, an ID check, requests and a conversation. The sign-in comes from RECORDING_HOST_EMAIL in Lovable Cloud → Secrets; only its sample data is replaced.",
  recordingButton: "Reseed recording account",
  recordingDone: (n: number) => `Recording account refilled with ${n} stays.`,
  title: "Routines that use Run credits",
  body: "Everything Latchkey runs on Lovable's servers. Scheduled ones are woken by Lovable's scheduler (set in Lovable under Cloud → Cron); when one is off or not due, the wake-up stops before any real work. Switching off a feature that runs when used turns that feature off for every host.",
  scheduled: "Scheduled",
  onUse: "Runs when used",
  wakes: (w: string) => `Lovable wakes it: ${w.toLowerCase()}`,
  every: "Run at most",
  lastRun: (when: string, status: string, ms: number | null) =>
    `Last run ${when}${ms !== null ? ` (${(ms / 1000).toFixed(1)}s)` : ""}: ${status}`,
  never: "Not run yet",
  thisMonth: (n: number) => `${n.toLocaleString("en-GB")} this month`,
  credits: (c: string, gbp: string) => `≈ ${c} credits (${gbp})`,
  inRoomCost: "Counted in the per-room cost",
  runNow: "Run now",
  ran: (s: string) => `Done: ${s}`,
  on: "On",
  off: "Off",
  intervals: {
    30: "Every 30 minutes",
    60: "Every hour",
    120: "Every 2 hours",
    360: "Every 6 hours",
    720: "Every 12 hours",
    1440: "Once a day",
    2880: "Every 2 days",
    10080: "Once a week",
  } as Record<number, string>,
  saved: "Saved",
});

/** The bookings table and its filters. */
export const bookingTable = branded({
  toConfirm: "To confirm",
  actions: "Quick actions",
  search: "Search guest or reference",
  status: "Stays",
  rooms: "Rooms",
  platforms: "Platforms",
  showPast: "Show past stays",
  clear: "Show everything",
  shown: (n: number, total: number) =>
    n === total ? `${n} ${n === 1 ? "stay" : "stays"}` : `${n} of ${total} stays`,
  noRoom: "No room",
  groups: {
    here: "Staying now",
    arriving: "Arriving today",
    leaving: "Leaving today",
    upcoming: "Coming up",
    attention: "Needs details",
    past: "Past stays",
    cancelled: "Cancelled",
    closed: "Closed nights",
  } as Record<string, string>,
  cols: {
    guest: "Guest",
    room: "Room",
    checkIn: "Stay",
    checkOut: "Leaves",
    nights: "Nights",
    platform: "Site",
    status: "Status",
    amount: "Paid",
  } as Record<string, string>,
  sortBy: (col: string) => `Sort by ${col}`,
  defaultOrder: "Default order",
  nothing: "No stays match these filters.",
});

/** Settings → API & MCP, and the developer docs. */
export const apiCopy = branded({
  title: "API & MCP",
  loading: "Loading your keys…",
  unavailable:
    "API keys aren't available for this business yet. Read the guide to see what you can connect.",
  body: "Connect Latchkey to AI assistants (Claude, ChatGPT, Cursor and others) and to your own tools. Ask an assistant who's arriving today, or let your website add direct bookings.",
  notOnPlan:
    "The API and MCP server aren't on your plan yet. Add the API add-on or choose Pro in Billing.",
  notPublished:
    "The API and MCP server will be available with the new plans. Ask Latchkey support to turn it on for you.",
  toBilling: "Open Billing",
  usage: (used: number, allowance: number) =>
    `${used.toLocaleString("en-GB")} of ${allowance.toLocaleString("en-GB")} requests used this month`,
  keysTitle: "Your API keys",
  noKeys: "No keys yet.",
  keyName: "Name it (where you'll use it)",
  keyNamePlaceholder: "Claude on my laptop",
  canWrite: "Allow changes (add and change bookings, message guests)",
  makeKey: "Make a key",
  keyShownOnce: "Copy this key now. For your security it won't be shown again.",
  copy: "Copy",
  copied: "Copied",
  readOnly: "Read only",
  readWrite: "Read and change",
  lastUsed: (when: string) => `Last used ${when}`,
  neverUsed: "Not used yet",
  revoke: "Revoke",
  revoked: "Revoked",
  revokedToast: "Key revoked. Anything using it stops working straight away.",
  docs: "How to connect",
});

export const propertyCodesCopy = branded({
  checking: "Checking…",
  linkFree: "Available",
  linkTaken: "Already used by another property",
  linkTry: "Try one of these:",
  linkAskMore: "Or add another word, the town or a number to make it yours.",
  linkProblems: {
    too_short: "Use at least 3 letters or numbers.",
    too_long: "Keep it to 40 characters or fewer.",
    characters: "Use letters, numbers and single hyphens only.",
    reserved: "That one is used by Latchkey itself.",
  } as Record<string, string>,
  linkAuto: "Made from your property's name. Change it if you like.",
  linkPreview: (code: string) => `Guests will reach you at /kiosk/${code}`,
  pinFree: "Available",
  pinTaken: "Already used by another property. Choose another, or make a new one.",
  pinWeak: "Easy to guess. A random one is safer.",
  pinNeeds: "Six digits.",
  pinNew: "New PIN",
  pinAuto: "Made for you, and not used by any other property. Change it if you like.",
});

export const brandAdminCopy = branded({
  title: "Brand",
  help: "The product's name everywhere: every page, email, alert, the installed app and the API. Changes show within a minute.",
  name: "Product name",
  tagline: "Tagline (under the name on the home page)",
  footer: "Home page footer",
  footerHint: "Leave empty for “© year and the product name”.",
  preview: (name: string) => `Pages will say “${name}”.`,
  saved: "Brand saved. Pages pick it up within a minute.",
  logoTitle: "Site logo",
  logoHelp:
    "Shown in the website header, on sign-in, in the browser tab and on the installed app. Hosts who haven't picked their own logo show it too.",
  logoMarks: {
    key: "Antique key",
    arch: "Doorway and keyhole",
    monogram: "Serif L with key",
    initial: "First letter of the name",
  } as Record<string, string>,
  uploadLogo: "Upload your own",
  uploadHint: "PNG, JPG, WebP or SVG, square, under 1 MB. Used instead of the mark while it's set.",
  removeLogo: "Use the mark instead",
  appIconNote:
    "The installed app's icon follows the mark; an uploaded logo is used where the browser accepts it.",
  notReady: "Brand settings appear once the latest database update is applied.",
  domainsTitle: "Hosts' own web addresses",
  domainsHelp:
    "When a host proves an address is theirs, add it to the hosting (in Lovable: Project settings → Domains), then switch it on here. Guests there see the host's name.",
  domainsEmpty: "No host has added an address yet.",
  verified: "Proved",
  waiting: "Waiting for DNS proof",
  live: "Live",
});

export const domainCopy = branded({
  title: "Your own web address",
  help: "Let guests check in and read their guide at your own address, like stay.yourhotel.co.uk, with your name on every page.",
  add: "Add address",
  placeholder: "stay.yourhotel.co.uk",
  opens: "Its home page opens",
  firstProperty: "Your first property",
  step1: "At your domain's DNS provider, add these two records:",
  type: "Type",
  host: "Name",
  value: "Value",
  step2: "Then tap Check. DNS changes can take up to an hour to show.",
  check: "Check",
  checking: "Checking…",
  notYet: "Not found yet. DNS changes can take up to an hour; try again soon.",
  proved: "Proved. We'll connect it and let you know when it's live.",
  live: "Live",
  waitingLive: "Proved, being connected",
  waitingProof: "Waiting for the DNS records",
  remove: "Remove",
  removed: "Address removed",
  added: "Address added. Now add the DNS records below.",
  ownerOnly: "Only the owner can add a web address.",
  notReady: "Your own web address can be set up once the latest database update is applied.",
  copy: "Copy",
  copied: "Copied",
});

export const guideAttachCopy = branded({
  title: "Photos and documents",
  add: "Attach",
  empty:
    "Attach photos, PDFs or Word, Excel and PowerPoint files. Guests open them right inside their guide. Shared by every room.",
  notReady: "Attachments will be available here soon.",
  added: "Attached",
  removed: "Attachment removed",
  remove: (name: string) => `Remove ${name}`,
  wrongType: (name: string) =>
    `${name} can't be shown to guests. Attach photos, PDFs, or Word, Excel or PowerPoint files.`,
  tooBig: (name: string) => `${name} is over 10 MB. Try a smaller file.`,
  roomNote: "Photos and documents are added on the whole-property guide and shared by every room.",
});

export const menuAdminCopy = branded({
  tab: "Menu and pages",
  menuTitle: "Menu",
  menuHelp:
    "The order and items every host sees in their menu. Latchkey admin is always there for super admins.",
  pagesTitle: "Page sections",
  pagesHelp:
    "The order of each page's sections, and which show, for every host. On Today, hosts can still rearrange their own copy.",
  up: (label: string) => `Move ${label} up`,
  down: (label: string) => `Move ${label} down`,
  show: (label: string) => `Show ${label}`,
  hide: (label: string) => `Hide ${label}`,
  always: "Always shown",
  hiddenBadge: "Hidden",
  yours: "Your item",
  edit: "Edit",
  remove: "Remove",
  add: "Add a menu item",
  label: "Label",
  linkKind: "Goes to",
  inApp: "A page in the app",
  external: "Another website (opens in a new tab)",
  path: "Page (starts with /)",
  url: "Web address (https://…)",
  icon: "Icon",
  upload: "Upload your own",
  uploadHelp:
    "PNG or SVG, square, at least 64 × 64 pixels (it's resized to 64 × 64). Use a transparent background and one solid shape: it's tinted to match the menu, light or dark, and when selected. Turn on “Keep its own colours” for a multi-coloured logo instead.",
  keepColours: "Keep its own colours",
  iconTooBig: "That icon is too detailed to keep small. Try a simpler PNG or SVG.",
  iconBad: "That file isn't an image we can use. Upload a PNG or SVG.",
  save: "Save menu and pages",
  saved: "Saved. Every host sees the change within a minute.",
  done: "Done",
  cancel: "Cancel",
  notReady: "Menu and page settings appear once the latest database update is applied.",
  needLabel: "Give it a label and a page or https web address.",
  page: "Page",
});

export const starterAdminCopy = branded({
  title: "Starter guide sections",
  help: "Every new host starts their stay guide with these sections. Turning one off only affects hosts who sign up from now on: hosts already here keep theirs, and can still add it themselves. At least one starter always stays.",
  badge: "Starter",
  offered: "Offered to new hosts",
  saved: "Saved for new hosts",
  notReady: "Starter settings appear once the latest database update is applied.",
});

export const driveAdminCopy = branded({
  title: "Google Drive: attachments and private records",
  help: "The Google Drive you connect holds hosts' guide attachments (a folder per host) and Latchkey's private records: guests' ID photos (a folder per business), Commission Partners' ID photos, drawn signatures and signed agreements (a folder per partner), all under \"Latchkey private records (restricted, do not share)\". Nothing there is ever shared: people see files only through short-lived links from Latchkey. If Drive can't be reached, files wait in Latchkey's private storage and move across once it's back, then the copy is removed.",
  queueEmpty: "Nothing waiting for Google Drive.",
  queueWaiting: (n: number) =>
    n === 1
      ? "1 private file is waiting to move to Google Drive."
      : `${n} private files are waiting to move to Google Drive.`,
  queueMove: "Move them now",
  queueMoved: (moved: number, left: number) =>
    `${moved} moved to Google Drive${left ? `, ${left} still waiting` : ""}.`,
  connected: (email: string) => `Connected to ${email}`,
  notConnected: "Not connected",
  connect: "Connect Google Drive",
  reconnect: "Reconnect",
  disconnect: "Disconnect",
  disconnected:
    "Disconnected. Existing attachments stay in the Drive but can't be shown until you reconnect.",
  setupTitle: "One-off set-up in Google Cloud (free)",
  setup: [
    "In Google Cloud Console, create a project, then enable the Google Drive API.",
    "OAuth consent screen: External, then Publish app (In production). The drive.file permission needs no Google review. Leave it in Testing and Google ends the connection after 7 days, so files would queue until you reconnect.",
    "Credentials → Create OAuth client ID → Web application. Add this as an authorised redirect URI:",
    "Copy the client ID and secret into Lovable Cloud secrets as GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then press Connect here.",
  ],
  missingSecrets: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Lovable Cloud first.",
  results: {
    connected: "Google Drive connected.",
    cancelled: "Connecting was cancelled.",
    expired: "That took too long. Please try again.",
    failed: "Google didn't finish connecting. Please try again.",
  } as Record<string, string>,
  scopeNote:
    "Latchkey only asks for permission to see the files it creates (drive.file), nothing else in the Drive.",
});

export const stayHeroCopy = branded({
  coverLabel: "Your stay",
  tileDownload: (name: string) => `Download ${name}`,
  tileOpenSite: "Open in a new tab",
  tileLinkHint:
    "If the page stays blank, that site doesn't allow being shown here: open it in a new tab.",
  tileMissing: "This file couldn't be loaded. Please try again in a moment.",
  tileTimes: "Times",
  eyebrow: "Make it special",
  title: "Add an extra touch",
  body: "Late check-out, breakfast, an early arrival or something special: ask here and your host takes care of it.",
  cta: "Explore extras",
  inFrom: (t: string) => `Check-in from ${t}`,
  outBy: (t: string, day: string) => `Check-out by ${t}, ${day}`,
  wifi: (name: string) => `Wi-Fi: ${name}`,
  yourStay: "Your stay",
  nights: (n: number) => (n === 1 ? "1 night" : `${n} nights`),
  room: "Your room",
  helpEyebrow: "Need something?",
  helpBody: "Your host is here to help. Send a message any time.",
  helpCta: "Message host",
  messageTile: "Message host",
});

export const privacyCopy = branded({
  title: "Privacy and retention",
  body: "Choose how long Latchkey keeps your guests' details after they leave. The stay itself stays, without a name, for your statistics.",
  details: "Guest names and contact details",
  detailsHelp: "Name, email, phone digits and your notes on the stay.",
  messages: "Guest messages",
  messagesHelp: "Messages with the guest and booking-site emails about the stay.",
  afterDays: (d: number) => (d === 365 ? "1 year after check-out" : `${d} days after check-out`),
  keepMessages: "Keep until the stay is deleted",
  saved: "Privacy choices saved. The nightly clear-up follows them from tonight.",
  notReady:
    "These choices can be saved once the latest database update is applied. Until then: details 90 days, messages kept.",
  ownerOnly: "Only the owner can change these.",
  otherTitle: "What else is kept, and for how long",
  idPhotos:
    "ID checks, ID copies and face photos: whether they're taken, and 7, 14 or 30 days, are set for each property.",
  idPhotosLink: "Who's staying settings",
  register:
    "UK guest register (law: Immigration (Hotel Records) Order 1972): 12 months from arrival, whatever you choose here.",
  registerLink: "Open the register",
  fixed: [
    "Invoices: kept for your tax records.",
    "Direct enquiries: 1 year. Returning-guest contacts: until the guest withdraws or you remove them.",
    "Check-in attempts: 30 days. Team activity: 1 year.",
    "Website visits: 13 months, with IP addresses cleared after 90 days.",
  ],
});

export const guideTilesCopy = branded({
  title: "Quick tiles",
  body: "Up to 8 tiles at the top of every guest guide and room guide. They share the full width of a phone screen. Point them at a section, Wi-Fi, extras or messages, or add your own text, link, photo or PDF, which opens inside the guide.",
  automatic: "Automatic",
  own: "Choose my own",
  preview: "What guests see",
  tooFew: "Add at least two tiles to show them.",
  icon: "Icon",
  defaultIcon: "Default",
  up: "Move up",
  down: "Move down",
  remove: "Remove tile",
  section: "Section",
  label: "Label",
  labelPlaceholder: (d: string) => (d ? `Label (default: ${d})` : "Label"),
  ownTitle: "Tile name (needed)",
  contentType: "What it opens",
  contentTypes: { text: "Text", link: "Web page", image: "Photo", doc: "PDF" } as Record<
    string,
    string
  >,
  textPlaceholder: "What guests read when they tap the tile.",
  uploadImage: "Upload photo",
  uploadDoc: "Upload PDF",
  replaceFile: "Replace",
  checkinHint: "Shows on room guides only: check in, or open the guest's own stay.",
  stayOnlyHint: "Shows on a guest's own stay guide only.",
  add: "Add a tile",
  full: "8 tiles: the most",
  count: (n: number) => `${n} of 8`,
  saved: "Tiles saved. Guests see them next time the guide opens.",
  notReady:
    "Quick tiles can be chosen once the latest database update is applied. Until then guests see the automatic tiles.",
  kinds: {
    wifi: "Wi-Fi",
    section: "A guide section",
    extras: "Extras",
    messages: "Message us",
    times: "Stay times",
    checkin: "Check in",
    custom: "Your own: text, link, photo or PDF",
  } as Record<string, string>,
  kindLabels: {
    wifi: "Wi-Fi",
    extras: "Extras",
    messages: "Message host",
    times: "Times",
    checkin: "Check in",
  },
});

export const roomPhotoCopy = branded({
  title: "Room photo",
  body: "The cover of this room's guide and of guests' stay guides for this room. Without one, the property's cover is used.",
  upload: "Upload photo",
  replace: "Replace photo",
  remove: "Use the property's cover",
  saved: "Room photo saved.",
  removed: "Back to the property's cover.",
});

/** The Settings menu: its groups (tabs) and which section sits in which. */
export const settingsMenuCopy = branded({
  label: "Settings menu",
  groups: {
    business: "Business",
    checkin: "Check-in and records",
    rooms: "QR",
    reviews: "Reviews",
    money: "Payments",
    kiosk: "Kiosk",
    look: "Branding",
    apps: "Alerts and apps",
  } as Record<string, string>,
  sections: {
    business: ["Business details", "business"],
    group: ["Group brand", "business"],
    team: ["Team", "business"],
    support: ["Support access", "business"],
    domain: ["Own web address", "business"],
    demo: ["Sample data", "business"],
    messages: ["Airbnb and Booking.com messages", "apps"],
    checkin: ["Check-in journey", "checkin"],
    records: ["Who's staying and ID records", "checkin"],
    stayAccess: ["Room QR codes and Wi-Fi", "rooms"],
    reviews: ["Reviews", "reviews"],
    privacy: ["Privacy and retention", "checkin"],
    money: ["Tax, bank details and away", "money"],
    payments: ["Card payments", "money"],
    invoices: ["Invoices", "money"],
    theme: ["Look and feel", "look"],
    kioskTablets: ["Door tablets", "kiosk"],
    welcomeCards: ["Check-in cards", "kiosk"],
    goodbye: ["Check-out cards", "kiosk"],
    kioskScreen: ["Door tablet screen", "kiosk"],
    kioskRest: ["Screen saver", "kiosk"],
    alerts: ["Alerts", "apps"],
    api: ["API & MCP", "apps"],
    shortcuts: ["Phone shortcuts", "apps"],
    shortcuts2: ["More shortcuts", "apps"],
    adminLink: ["Latchkey admin", "apps"],
  } as Record<string, [string, string]>,
});

export const omniCopy = branded({
  open: "Search",
  openHint: "Search everything (Ctrl K or ⌘K)",
  title: "Search",
  placeholder: "Search guests, bookings, pages, settings, guides…",
  hint: "Guests and bookings, your guide, extras, jobs, tradespeople, calendar links, pages, settings, features and logos.",
  empty: "Nothing found.",
  searching: "Searching your business…",
  settings: "Settings",
  guides: "Guides",
  guideSection: "Guide section",
  quickTiles: "Quick tiles",
  yourLogo: "Your logo",
  logoChoice: "Logo you can choose",
  siteLogo: "Site logo",
  demoLive: "Demo / live switch",
  groups: {
    guests: "Guests and bookings",
    yours: "Your business",
    pages: "Pages and settings",
    features: "Features",
  } as Record<string, string>,
  kinds: {
    page: "Page",
    setting: "Setting",
    feature: "Feature",
    logo: "Logo",
    integration: "Integration",
    guide: "Guide",
    guest: "Guest",
    property: "Property",
    room: "Room",
    extra: "Extra",
    job: "Job",
    trade: "Trade",
    connection: "Calendar",
    look: "Look",
    enquiry: "Enquiry",
  } as Record<string, string>,
  /** Other words each page answers to. */
  pageWords: {
    today: "dashboard home arrivals leaving",
    bookings: "stays reservations guests calendar timeline",
    housekeeping: "cleaning turnover rooms ready changeover cleaner board",
    reports: "occupancy statistics numbers analytics check-in rate extras revenue response times",
    direct: "enquiries returning guests repeat direct booking stay again past guests",
    services: "jobs requests maintenance cleaning trades",
    guides: "guest guide stay guide sections wifi",
    properties: "rooms check-in times door pin",
    connections: "calendar ical airbnb booking.com sync platforms",
    settings: "account business",
  } as Record<string, string>,
  /** Other words each settings section answers to. */
  settingWords: {
    business: "name contact email phone currency time zone",
    team: "members invite managers staff",
    support: "help access latchkey team",
    domain: "domain web address dns custom",
    messages: "email forward inbox platform",
    labels: "channels airbnb booking.com sites names icons",
    privacy: "retention gdpr delete data keep",
    money: "tax vat bank details sort code iban away",
    payments: "stripe card payments connect",
    invoices: "vat tax receipts numbers",
    theme: "look feel colours fonts logo template cover photo",
    alerts: "notifications push telegram sms email",
    api: "mcp developers key claude chatgpt",
    shortcuts: "phone home screen",
    shortcuts2: "phone home screen",
    demo: "sample data demo rooms",
    checkin:
      "check-in journey steps quick thorough welcome surname check-out nights photo id selfie face camera front back last digits phone self declare kiosk qr print",
    records: "who's staying adults children id photo face register keep days",
    stayAccess:
      "room qr code wifi wi-fi password network door tablet presence location guide before check-in message",
    reviews: "reviews review stars score ask last day booking page feedback",
    kioskRest: "night light screensaver clock qr screen off tablet",
    kioskScreen: "door tablet screen calibration size zoom shift edges keyboard address bar",
    kioskTablets: "door tablets kiosk pair code number name camera cctv security wall version",
  } as Record<string, string>,
});

export const timelineCopy = branded({
  room: "Room",
  today: "Today",
  earlier: "Earlier",
  later: "Later",
  zoom: "How much to show",
  zooms: {
    day: "Day",
    "3days": "3 days",
    week: "Week",
    "2weeks": "2 weeks",
    month: "Month",
  } as Record<string, string>,
  zoomsShort: { day: "1d", "3days": "3d", week: "1w", "2weeks": "2w", month: "1m" } as Record<
    string,
    string
  >,
  hint: "Swipe or drag sideways to move through time; pinch, or Ctrl/⌘ and scroll, to zoom.",
});

export const housekeepingCopy = branded({
  title: "Housekeeping",
  subtitle:
    "Room by room: what the day means, where cleaning has got to, and which rooms are ready for guests.",
  noProperty: "Add a property first.",
  noRooms: "No rooms yet",
  noRoomsBody: "Add rooms to this property to see them on the board.",
  prevDay: "Previous day",
  nextDay: "Next day",
  todayLabel: (d: string) => `Today, ${d}`,
  backToToday: "Back to today",
  summary: "The day at a glance",
  notReady:
    "The board shows what today's bookings mean for each room. Saving progress starts once the latest database update is applied.",
  totals: {
    toClean: (n: number) => `${n} to clean`,
    inProgress: (n: number) => `${n} in progress`,
    ready: (n: number) => `${n} ready`,
    cleaning: (n: number) => `${n} cleaning`,
    clean: (n: number) => `${n} clean`,
    arriving: (n: number) => `${n} arriving`,
    notReady: (n: number) => (n === 1 ? "1 arrival not ready" : `${n} arrivals not ready`),
    outOfService: (n: number) => `${n} out of service`,
  },
  occupancy: {
    turnover: "Turnover: out and in today",
    leaving: "Guest leaving",
    arriving: "Guest arriving",
    staying: "Guest staying",
    empty: "Empty",
    closed: "Closed",
  } as Record<string, string>,
  status: {
    to_clean: "To clean",
    cleaning: "Cleaning",
    clean: "Clean",
    ready: "Ready",
    out_of_service: "Out of service",
  } as Record<string, string>,
  statusLabel: (room: string) => `Cleaning progress for ${room}`,
  guest: "Guest",
  out: (name: string, time: string) => (time ? `Out: ${name}, by ${time}` : `Out: ${name}`),
  in: (name: string, people: number | null) =>
    people && people > 1 ? `In: ${name}, ${people} guests` : `In: ${name}`,
  staying: (name: string, until: string) => `${name}, until ${until}`,
  dueBy: (t: string) => `Ready by ${t}`,
  overdue: (t: string) => `Was due at ${t}`,
  openJobs: (n: number) => (n === 1 ? "1 open job in this room" : `${n} open jobs in this room`),
  assign: "Who's on it",
  assignPlaceholder: "Who's on it (team or tradesperson)",
  assignedTo: (who: string) => `On it: ${who}`,
  note: "Note",
  notePlaceholder: "Anything for the next person (spare towels used, a stain, a broken bulb…)",
  addNote: "Add note",
  outOfService: "Out of service",
  backInService: "Back in service",
  readyToast: (room: string) => `${room} is ready for guests.`,
  you: "you",
  lastChange: (status: string, who: string | null, at: string) =>
    who ? `${status}: ${who} at ${at}` : `${status} at ${at}`,
  suggested: "From today's bookings",
  subtitleFull:
    "The day's turnovers on one timeline with your cleaning windows, where each room has got to, and the weekly schedule behind it.",
  subtitleShort:
    "Each room's turnovers on the bookings timeline, coloured by where cleaning has got to. Tap a room or a turnover to move it on.",
  todayShort: "Today",
  windowDefault: "Cleaning",
  orderProperty: "Property order",
  orderState: "Needs attention first",
  jobsShort: (n: number) => (n === 1 ? "1 job" : `${n} jobs`),
  plan: {
    title: "The day at a glance",
    body: "Each room from the guest leaving to the next arriving, with the cleaning and unavailable times. Tap a room to go to its card.",
    wholeHouse: "Whole property",
    now: "Now",
    legend: {
      guest_out: "Guest leaving",
      free: "Free to clean",
      window: "Cleaning or unavailable",
      guest_in: "Guest arriving",
      staying: "Guest staying",
      closed: "Closed",
    } as Record<string, string>,
    outAt: (t: string) => `Out ${t}`,
    dueAt: (t: string) => `Ready by ${t}`,
  },
  windowLine: (reason: string | null, start: string, end: string, house: boolean) =>
    `${reason || (house ? "House cleaning" : "Room cleaning")} ${start}–${end}${house ? " (whole property)" : ""}`,
  schedule: {
    title: "Schedule",
    summary: (out: string, inn: string, n: number) =>
      `Out by ${out}, in from ${inn} · ${n === 1 ? "1 weekly window" : `${n} weekly windows`}`,
    body: "Your standard times and the weekly cleaning and unavailable times. They show on the timeline above and in guests' stay guides; check-in isn't offered for a room during its windows.",
    times: "Standard times",
    checkOut: "Check-out by",
    checkIn: "Check-in from",
    quiet: "Quiet hours",
    editTimes: "Change times",
    week: "Every week",
    oneOff: "One-off",
    none: "Nothing this day",
    goTo: (day: string) => `Show ${day} on the board`,
    add: "Add a window",
    day: "Day",
    everyDay: "Every day",
    room: "Room",
    wholeHouse: "Whole property",
    from: "From",
    until: "Until",
    reason: "What for",
    reasons: ["Cleaning", "Deep clean", "Laundry", "Maintenance", "Owner use"],
    addCta: "Add",
    added: "Added to the schedule",
    removed: "Removed from the schedule",
    remove: (what: string) => `Remove ${what}`,
    badTimes: "Until must be after From.",
    viewOnly: "Owners and managers change the schedule.",
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    short: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  },
});

export const reportsCopy = branded({
  title: "Reports",
  subtitle:
    "How your operation is running, across every booking site: occupancy, arrivals, check-ins, rooms ready, guest service and extras.",
  staffOnly: "Reports are for owners and managers.",
  noProperty: "Add a property first.",
  download: "Download days (CSV)",
  property: "Property",
  allProperties: "All properties",
  period: "Period",
  presets: {
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    month: "This month",
    lastMonth: "Last month",
    custom: "Choose dates",
  } as Record<string, string>,
  from: "From",
  to: "To (inclusive)",
  rangeLine: (a: string, b: string) => `${a} to ${b}`,
  occupancy: "Occupancy",
  occupancyHint: (occ: number, avail: number) =>
    `${occ} of ${avail} room-nights, closed nights left out`,
  checkIns: "Checked in",
  checkInsHint: (arr: number, dep: number) =>
    `of arrivals so far · ${arr} arriving, ${dep} leaving`,
  ready: "Ready on arrival",
  readyHint: "Rooms marked ready on the housekeeping board by arrival day",
  readyNotYet: "Starts once the housekeeping board is saving",
  extras: "Extras paid",
  extrasHint: (paid: number, asked: number) => `${paid} paid · ${asked} asked for`,
  byDay: "Night by night",
  byDayHint: (rooms: number) =>
    rooms === 1
      ? "Share of your 1 room occupied each night."
      : `Share of your ${rooms} rooms occupied each night.`,
  dayTitle: (day: string, occ: number, avail: number, arr: number, dep: number) =>
    `${day}: ${occ} of ${avail} rooms · ${arr} in, ${dep} out`,
  arrivals: "Arrivals",
  departures: "Departures",
  averageStay: "Average stay",
  nights: (n: number) => (n === 1 ? "1 night" : `${n} nights`),
  averageParty: "Average party",
  bySite: "By booking site",
  bySiteHint: "Where your nights came from. Mirrored copies of the same stay are counted once.",
  site: "Site",
  stays: "Arrivals",
  nightsCol: "Nights",
  share: "Share",
  noStays: "No stays in this period.",
  service: "Guest service",
  replies: "Reply to guests",
  repliesHint: (n: number) =>
    n
      ? `Typical time to answer a guest's message (${n} conversations)`
      : "No guest messages in this period",
  requests: "Guest requests",
  requestsHint: (made: number, done: number, open: number, hours: number | null) =>
    `Typical time to acknowledge · ${made} made, ${done} done, ${open} open now${hours !== null ? ` · done in about ${hours} h` : ""}`,
  maintenance: "Maintenance open",
  maintenanceHint: (made: number, done: number) =>
    `${made} jobs added, ${done} finished in this period`,
  duration: (min: number) =>
    min < 60
      ? `${min} min`
      : min < 60 * 48
        ? `${Math.round(min / 6) / 10} h`
        : `${Math.round(min / 144) / 10} days`,
  footnote:
    "Built from every stay in Latchkey, whichever site it came from. Not revenue management: no rates or forecasts.",
});

export const reservationCopy = branded({
  pageTitle: "Your booking",
  notFound:
    "We couldn't find that booking. Please check the link in your email, or contact the property.",
  checking: "Checking your payment…",
  states: {
    paid: {
      title: "Booked and paid",
      body: (business: string) => `Thank you. ${business} has your booking and payment.`,
    },
    confirmed: {
      title: "Booked",
      body: (business: string) =>
        `Thank you. ${business} has your booking; you'll pay at the property.`,
    },
    awaitingTransfer: {
      title: "Booked: please pay by bank transfer",
      body: (by: string) =>
        `Your room is held. Please send the payment by ${by}, quoting your reference.`,
    },
    awaitingCard: {
      title: "Waiting for your card payment",
      body: (_business: string) =>
        "Your room is held for 30 minutes while you pay. If you closed the payment page, go back to the booking page and book again.",
    },
    expired: {
      title: "Not paid in time",
      body: (_business: string) =>
        "The card payment wasn't completed, so the room has been released. You can book again from the property's page.",
    },
    cancelled: {
      title: "Cancelled",
      body: (business: string) =>
        `This booking has been cancelled. Please contact ${business} with any questions.`,
    },
  },
  reference: "Reference",
  room: "Room",
  dates: "Dates",
  nights: (n: number) => `${n} ${n === 1 ? "night" : "nights"}`,
  guests: "Guests",
  rate: "Rate",
  flex: "Refundable",
  flexUntil: (date: string) => `Refundable: free cancellation until ${date}`,
  nonRef: "Non-refundable",
  total: "Total",
  payment: "Payment",
  methods: { card: "Card", bank: "Bank transfer", property: "At the property" } as Record<
    string,
    string
  >,
  bankTitle: "Bank transfer details",
  bankBody: (amount: string) =>
    `Please send ${amount}, quoting your reference so it's matched to your booking.`,
  useReference: "Reference to quote",
  copyLabel: (what: string) => `Copy ${what}`,
  copied: "Copied",
  email: "Email the property",
  call: "Call the property",
  print: "Print",
  keepLink: "Keep this page's link: it's your booking confirmation.",
});

export const enquiryCopy = branded({
  planFlex: "Refundable",
  planNonRef: "Non-refundable",
  planNonRefLong: "Non-refundable: you won't get money back if you cancel or change your dates.",
  freeCancel: (date: string) => `Free cancellation until ${date}`,
  noFreeCancel: "Arriving soon: cancellation isn't free",
  nonRefNote: (saving: string) => `Save ${saving} a night · no refunds`,
  reserve: "Reserve",
  approx: (amount: string) => `≈ ${amount}`,
  fxLine: (amount: string, ours: string, rate: number, theirs: string) =>
    `About ${amount} at today's rate (1 ${ours} = ${rate.toFixed(4)} ${theirs}). You're charged in ${ours}.`,
  checkoutTitle: "Your booking",
  changeRoom: "Change room or rate",
  country: "Your country",
  howToPay: "How would you like to pay?",
  methods: {
    card: { label: "Card", help: "Pay now, securely through Stripe." },
    bank: {
      label: "Bank transfer",
      help: (days: number) =>
        `You'll see the bank details next. Please pay within ${days} ${days === 1 ? "day" : "days"}.`,
    },
    property: { label: "Pay at the property", help: "Pay when you arrive." },
  },
  bookingAgree: (business: string) =>
    `I agree to the rate's cancellation terms, and ${business} may contact me about this booking.`,
  bookingAgreeNeeded: "Please tick the box to agree to the cancellation terms.",
  bookAndPay: (amount: string) => `Book and pay ${amount}`,
  bookNow: "Book now",
  cardNote: "You'll pay on Stripe's secure page; your room is held for 30 minutes while you do.",
  bookingNote:
    "Your room is booked straight away. You'll see your confirmation and reference next.",
  pageTitle: (place: string) => `Stay with us at ${place}`,
  metaDescription:
    "Pick your dates, choose a room and send a booking request directly. The host confirms.",
  notFound: "This page isn't taking enquiries. Please check the link.",
  eyebrow: "Stay with us",
  title: (place: string) => `Stay at ${place}`,
  introBook: (business: string) =>
    `Choose your dates and a room and book directly with ${business}: the best rate, straight to them. Rooms without a price can be requested.`,
  intro: (business: string) =>
    `Choose your dates and a room, and send ${business} a booking request. They'll confirm your stay and how to pay; nothing is booked or paid on this page.`,
  offersTitle: "Seasonal offers",
  offerLine: (percent: number, from: string, to: string) => `${percent}% off, ${from} to ${to}`,
  offerDaysHint: "Underlined dates have an offer.",
  checkIn: "Arriving",
  checkOut: "Leaving",
  pickDate: "Pick a date",
  pickBoth: "Pick your arrival and leaving dates on the calendar.",
  nights: (n: number) => `${n} ${n === 1 ? "night" : "nights"}.`,
  tooLong: (n: number) => `Please ask about up to ${n} nights at a time.`,
  guests: "Guests",
  fewer: "Fewer guests",
  more: "More guests",
  roomsTitle: "Rooms",
  perNight: "a night",
  sleeps: (n: number) => `Sleeps ${n}`,
  ensuite: "En-suite",
  takenForDates: "Booked on some of these nights",
  tooMany: (n: number) => `Sleeps up to ${n}`,
  forNights: (n: number) => `for ${n} ${n === 1 ? "night" : "nights"}`,
  freeAskPrice: "Free for your dates: ask for the price",
  requestRoom: "Request this room",
  chosen: "Chosen",
  notSure: "Not sure which room, or need something else?",
  generalEnquiry: "Send a general enquiry",
  requestTitle: (room: string) => `Request ${room}`,
  enquiryTitle: "Your details",
  summary: (from: string, to: string, nights: number, guests: number) =>
    `${from} to ${to} · ${nights} ${nights === 1 ? "night" : "nights"} · ${guests} ${guests === 1 ? "guest" : "guests"}`,
  estimate: (total: string) => `estimated ${total}`,
  name: "Your name",
  email: "Email",
  phone: "Phone (optional)",
  message: "Anything else (optional)",
  messagePlaceholder: "A late arrival, a cot, a special occasion…",
  optional: "(optional)",
  agreeNeeded: "Please tick the box so they can reply to you.",
  send: "Send enquiry",
  sendRequest: "Send booking request",
  failed: "That request couldn't be sent. Please try again.",
  sentTitle: "Thank you, request sent",
  sentBody: (business: string) =>
    `${business} will confirm your stay and how to pay by email. Nothing is booked yet.`,
  notBooked:
    "This is a booking request: the host confirms the room, the price and how to pay. Prices shown are estimates.",
});

/** /book/$code: the booking page's bar, calendar, room tiles, booking panel and enquiry box. */
export const bookPageCopy = branded({
  barLabel: "Your dates and guests",
  arrive: "Arrive",
  leave: "Leave",
  nightsShort: (n: number) => `${n} ${n === 1 ? "night" : "nights"}`,
  guestsBox: "Guests",
  adults: "Adults",
  children: "Children",
  childrenHint: "Under 18",
  fewerOf: (what: string) => `Fewer ${what.toLowerCase()}`,
  moreOf: (what: string) => `More ${what.toLowerCase()}`,
  done: "Done",
  prevMonth: "Previous month",
  nextMonth: "Next month",
  calendarHelp:
    "Tap your arrival, then your leaving day. Or drag across the days, or drag your stay to move it (on a phone, press and hold first).",
  legendOffer: "Offer",
  legendFull: "no rooms free",
  legendFullShort: "No rooms free",
  offerDates: (from: string, to: string) => `${from} to ${to}`,
  askQuestion: "Ask a question",
  roomsTitle: "Rooms for your dates",
  roomsUnavailable: "Not free for these dates",
  available: "Available",
  booked: "Booked on some of these nights",
  sleeps: (n: number) => `Sleeps ${n}`,
  ensuite: "En-suite",
  perNight: (amount: string) => `${amount} a night`,
  forNights: (n: number) => `for ${n} ${n === 1 ? "night" : "nights"}`,
  askPrice: "Ask for the price",
  add: "Add room",
  added: "Added",
  removeRoom: (room: string) => `Remove ${room}`,
  enquire: "Enquire",
  enquireAbout: (room: string) => `Ask about ${room}`,
  enquirySummary: (from: string, to: string, nights: number, party: string) =>
    `${from} to ${to} · ${nights} ${nights === 1 ? "night" : "nights"} · ${party}`,
  name: "Your name",
  email: "Email",
  phone: "Phone",
  close: "Close",
  panelTitle: "Your booking",
  panelEmpty: "Add a room to book it. You can book more than one room together.",
  panelRequest: (business: string) =>
    `Choose a room and press Enquire, and ${business} will reply with the price and how to book.`,
  needMore: (n: number) => `Add a room for ${n} more ${n === 1 ? "guest" : "guests"}.`,
  tooManyRooms: "Each room needs at least one guest: remove a room or add guests.",
  rate: "Rate",
  total: "Total",
  roomsCount: (n: number) => `${n} ${n === 1 ? "room" : "rooms"}`,
  continue: "Continue",
  back: "Back to rooms",
  yourDetails: "Your details",
  pay: "Payment",
  countryHint: "For prices in your currency and the right bank details.",
});

export const stayAgainCopy = branded({
  title: "Stay with us again",
  eyebrow: "Come back soon",
  titleOffer: (percent: number) => `Book direct next time and save ${percent}%`,
  titlePlain: "Book direct next time",
  offerRunning: (label: string, percent: number, until: string, someRooms: boolean) =>
    `${label} is on now: ${percent}% off${someRooms ? " selected rooms" : ""} for stays until ${until}, only when you book with us directly.`,
  offerSoon: (label: string, percent: number, from: string, to: string, someRooms: boolean) =>
    `${label}: ${percent}% off${someRooms ? " selected rooms" : ""} for stays from ${from} to ${to}, only when you book with us directly.`,
  nonRef: (percent: number) =>
    `Book with us directly and save ${percent}% with our non-refundable rate.`,
  plain: (business: string) =>
    `Our best rate is always the one you get by booking with ${business} directly.`,
  perks: [
    "Our best rate, no booking-site fees",
    "Pick your favourite room",
    "Talk to us, not a call centre",
  ],
  bookDirect: "Book direct",
  askDirect: "See dates and prices",
  hearFirst: "Hear about offers before anyone else? (optional)",
  body: (business: string) => `Enjoying your stay? Next time, ask ${business} directly.`,
  ask: "Ask about future dates",
  emailPlaceholder: "Your email",
  save: "Keep me posted",
  failed: "That couldn't be saved. Please try again.",
  onList: (business: string) => `${business} can get in touch about future stays.`,
  changedMind: "Changed your mind?",
  withdrawTitle: "Stop hearing about future stays?",
  withdrawBody:
    "You'll be taken off this business's list of past guests to contact. Your stay and its records aren't affected.",
  withdrawButton: "Yes, stop",
  withdrawnTitle: "Done",
  withdrawnBody: "You won't hear from them about future stays.",
  badLink: "This link isn't right. Please check it in the email you were sent.",
});

export const bankCopy = branded({
  country: "Bank's country",
  optional: "(optional)",
  forAbroad: "For guests paying from abroad",
  seenHome: "Guests in the same country see",
  seenAbroad: "Guests abroad see",
});

export const directBookingCopy = branded({
  title: "Book and pay here",
  body: "Let guests book a free room straight away on your Stay with us page, Booking.com style, and pay you directly. Off: they send a request and you confirm.",
  notReady:
    "Booking and paying here appears once the latest database update (migration 0053) is applied.",
  instant: "Guests can book free rooms straight away",
  instantHelp:
    "Rooms are free when none of your calendars (from every booking site) has a stay on those nights. Rooms without a nightly rate can only be requested.",
  children: "Ask about children",
  childrenHelp:
    "Guests choose adults and children on your booking page. Children count towards how many each room sleeps.",
  calendarWarning: (rooms: string) =>
    `Other booking sites can't see direct bookings for: ${rooms}. Share each room's Latchkey calendar and add it on Airbnb, Booking.com and the rest, or a room could be booked twice.`,
  calendarLink: "Share calendars in Connections",
  calendarReminder:
    "Every room's Latchkey calendar is shared: make sure each booking site imports it, so direct bookings block those nights there too.",
  ratesTitle: "Rates",
  flex: "Refundable (your nightly rate)",
  freeCancelBefore: "Free cancellation until",
  daysBefore: "days before arrival",
  nonRef: "Non-refundable, cheaper",
  cheaperBy: "Cheaper by",
  perNightIn: (currency: string) => `${currency} a night`,
  payTitle: "How guests can pay",
  methods: {
    card: "Card (through your Stripe account)",
    bank: "Bank transfer",
    atProperty: "Pay at the property",
  } as Record<string, string>,
  cardHelp:
    "Guests pay on Stripe's secure page; the money goes straight to your Stripe account. Unpaid after 30 minutes, the room is released.",
  connectStripe: "Connect Stripe in Settings → Money",
  bankHelp: (days: number) =>
    `Guests see your bank details (local or international, by their country) and a reference, and pay within ${days} ${days === 1 ? "day" : "days"}. Mark it paid when it arrives.`,
  addBank: "Add your bank details in Settings → Money",
  propertyHelp: "Guests pay when they arrive. Only if you take payments on site.",
  bankDaysLabel: "Bank transfers due within",
  days: "days",
  saved: "Saved. Your Stay with us page uses it now.",
});

export const directRatesCopy = branded({
  title: "Rates and seasonal offers",
  body: 'What your "Stay with us" page shows: each room\'s nightly rate and any offers, so guests see an estimated total for their dates before they send a request. You confirm every stay and how they pay.',
  notReady: "Rates and offers appear once the latest database update (migration 0052) is applied.",
  ratesTitle: (currency: string) => `Nightly rate (${currency})`,
  rateFor: (room: string) => `Nightly rate for ${room}`,
  noRate: "Ask",
  ratesHelp: "Leave a room empty to show it without a price (guests can still request it).",
  offersTitle: "Seasonal offers",
  addOffer: "Add an offer",
  noOffers: "No offers yet. Add one for a quiet season, a long weekend or early bookers' dates.",
  offerName: "Name guests see",
  offerPlaceholder: "Winter escape",
  from: "First night",
  to: "Last night",
  percent: "% off",
  removeOffer: "Remove this offer",
  appliesTo: "Applies to:",
  allRooms: "Every room",
  offerProblem: "Each offer needs a first and last night (in order) and 1 to 90% off.",
  saved: "Rates and offers saved. Your Stay with us page shows them now.",
});

export const directCopy = branded({
  bookingsTab: (pending: number) =>
    pending ? `Bookings made here (${pending} waiting)` : "Bookings made here",
  noBookings: "No bookings made here yet",
  noBookingsBody:
    'Turn on "Book and pay here" below, and guests can book free rooms on your Stay with us page.',
  resStatus: {
    pending: "Waiting for card payment",
    awaitingTransfer: "Waiting for transfer",
    confirmed: "Pay at property",
    paid: "Paid",
    cancelled: "Cancelled",
    expired: "Not paid in time",
  } as Record<string, string>,
  resMethod: { card: "Card", bank: "Bank transfer", property: "At the property" } as Record<
    string,
    string
  >,
  resFlex: (until: string | null) => (until ? `refundable until ${until}` : "refundable"),
  resNonRef: "non-refundable",
  payBy: (date: string) => `due by ${date}`,
  openBooking: "Open the booking",
  markPaid: "Mark paid",
  markedPaid: "Marked as paid.",
  cancel: "Cancel",
  cancelConfirm:
    "Cancel this booking? The room is freed. Any refund for a card payment is made in your Stripe account.",
  cancelled: "Booking cancelled.",
  quoted: (amount: string) => `estimated ${amount}`,
  title: "Direct stays",
  subtitle:
    "Booking platforms help guests find you. This helps them come back to you: enquiries from your own page, and past guests who asked to hear from you.",
  staffOnly: "Direct stays are for owners and managers.",
  notReady: "Direct stays start once the latest database update is applied.",
  linkTitle: "Your enquiry page",
  linkBody:
    "Share it on your website, in your guide or in a thank-you email. Guests ask about dates; you reply from your own email. Nothing is booked until you agree it with them.",
  copy: "Copy link",
  copied: "Link copied.",
  open: "Open",
  enquiriesTab: (n: number) => (n ? `Enquiries (${n} new)` : "Enquiries"),
  guestsTab: (n: number) => `Returning guests (${n})`,
  noEnquiries: "No enquiries yet",
  noEnquiriesBody: "Share your enquiry page to start getting direct enquiries.",
  guestsBody:
    "Guests who ticked the box to hear from you about future stays, with the words they agreed to. Email them from your own mailbox; each email includes their link to stop. Nothing is sent automatically.",
  noGuests: "No returning guests yet",
  noGuestsBody:
    "Guests can ask to hear from you on their stay guide, or when they send an enquiry.",
  dates: (a: string, b: string, n: number, g: number) =>
    `${a} to ${b} · ${n === 1 ? "1 night" : `${n} nights`} · ${g === 1 ? "1 guest" : `${g} guests`}`,
  returning: "Returning",
  status: { new: "New", offered: "Replied", booked: "Booked", declined: "Declined" } as Record<
    string,
    string
  >,
  statusLabel: "Enquiry status",
  received: (when: string) => `received ${when}`,
  reply: "Reply by email",
  convert: "Make it a direct stay",
  converted: "Added to Bookings as a direct stay. Pick the room there.",
  openStay: "Open the stay",
  remove: "Delete enquiry",
  removeConfirm: "Delete this enquiry?",
  email: "Email",
  removeGuest: "Remove from returning guests",
  removeGuestConfirm: "Remove this guest? You won't have their consent to contact them any more.",
  agreedOn: (when: string, where: string) => `agreed ${when}, ${where}`,
  fromStay: "on their stay guide",
  fromEnquiry: "with an enquiry",
  theirWords: "What they agreed to",
});

export const demoBannerCopy = branded({
  text: "You're exploring a demo. Everyone shares it, and it resets daily.",
  trial: "Start free trial",
  leave: "Leave demo",
});

export const funnelCopy = branded({
  title: "Launch funnel",
  body: "Distinct visitors at each step, by where they came from (utm_source and utm_campaign). Opted-out browsers aren't counted.",
  lastDays: (d: number) => `Last ${d} days`,
  notReady: "The funnel starts once the latest database update is applied.",
  empty: "No funnel events yet.",
  columns: [
    "Source",
    "Campaign",
    "Tour views",
    "Tours finished",
    "Host demo",
    "Trials started",
    "Trials saved",
    "Demo → trial",
  ],
});

/** /privacy: the statistics switch inside the Privacy policy (the policy's wording is in src/content/legal.ts). */
export const privacyPageCopy = branded({
  intro:
    "How Latchkey handles personal data for website visitors, hosts and their guests, and how to change your cookie choice.",
  switchTitle: "Your cookie choice",
  switchLabel: "Allow statistics and referral cookies",
  checking: "Checking…",
  onNow:
    "You've accepted: your visits are counted (without your IP address or exact location) and a partner's link is remembered.",
  offNow: "Not accepted: nothing optional is stored and your visits aren't counted.",
  browserSignal:
    "Your browser asks sites not to track it (Global Privacy Control or Do Not Track), so we never count it.",
  switchHint:
    "This browser remembers your choice for up to 12 months. You can also add ?notrack=1 to any of our links.",
});

/** The cookie banner (CookieBanner, src/lib/consent.ts) on our own site and the dashboard. */
export const cookieCopy = branded({
  label: "Cookie choice",
  title: "Cookies",
  body: "We store only what's needed to sign you in and remember your settings. If you accept, we'll also count your visits to improve Latchkey and remember a Commission Partner's link for 60 days. No advertising or third-party trackers.",
  accept: "Accept",
  reject: "Reject",
  more: "Privacy policy",
});

/** /terms and /privacy page frame, footer links and the super admin's legal details form. */
export const legalPageCopy = branded({
  updated: (d: string) => `Last updated ${d}`,
  contents: "Contents",
  legalNav: "Legal",
  terms: "Terms of service",
  privacy: "Privacy policy",
  statistics: "Cookie choice",
  home: "Home",
  agree: "By continuing you agree to the",
  and: "and",
  adminTitle: "Legal details",
  adminBody:
    "Who runs Latchkey. The Terms of service, the Privacy policy and the Commission Partner agreement all name the operator from here, and the agreement updates every partner's copy when these change (its clause 1.5). For a person trading on their own, leave the company number empty and give a business address. The Commission Partner agreement can't be signed until the legal name and address are filled in.",
  missing: (fields: string) => `Still missing on the published pages: ${fields}.`,
  notReady:
    "Legal details can be saved once the latest database update (0054) is applied. Until then the pages use the brand name.",
  saved: "Legal details saved.",
  view: "View",
  fields: {
    companyName: "Legal name (your own name, or the company's)",
    tradingName: "Trading name (optional)",
    companyNumber: "Company number (companies only)",
    registeredAddress: "Address (a company's registered office)",
    contactEmail: "Contact email",
    privacyEmail: "Privacy email (optional)",
    icoNumber: "ICO registration number",
    vatNumber: "VAT number (optional)",
    governingLaw: "Governing law",
  } as Record<string, string>,
});

export const breakfastCopy = branded({
  title: "Breakfast menu",
  body: "Your own à la carte breakfast, for each way you serve it. Guests order from their stay guide for a morning and time, and it's charged like any extra.",
  styles: {
    packed: "Light or packed",
    delivered: "Delivered to the room",
    dining: "In the dining room",
  } as Record<string, string>,
  styleHelp: {
    packed: "Something light or to take away: a pastry bag, a breakfast box for an early start.",
    delivered: "Brought to the guest's door or room at the time they choose.",
    dining: "Served at a table in your dining room or breakfast room.",
  } as Record<string, string>,
  empty: "Nothing on this menu yet. Guests only see the ways you serve breakfast that have dishes.",
  name: "Dish",
  namePlaceholder: "Dish name",
  description: "What's in it",
  descriptionPlaceholder: "What's in it (optional)",
  section: "Menu section",
  sectionPlaceholder: "Section (Hot, Drinks…)",
  sectionIdeas: ["Hot", "Cold", "Pastries", "Sides", "Drinks"],
  price: "Price",
  priceOf: (n: string) => `${n} price`,
  offered: "Offered",
  offeredOf: (n: string) => `${n}: offered`,
  removeOf: (n: string) => `Remove ${n}`,
  removeConfirm: "Remove this dish from the menu?",
  removed: "Dish removed.",
  add: "Add to the menu",
  addTitle: (style: string) => `Add a dish (${style.toLowerCase()})`,
  added: "Added to the breakfast menu.",
});

export const guestBreakfastCopy = branded({
  title: "Breakfast",
  body: "Choose from the menu, then the morning and time. Your host confirms it, like any extra.",
  howLabel: "How you'd like breakfast",
  included: "Included",
  less: (n: string) => `One less ${n}`,
  more: (n: string) => `One more ${n}`,
  morning: "Morning",
  time: "Time",
  noteLabel: "Anything your host should know",
  notePlaceholder: "Allergies, a cot-side table, an early taxi…",
  choose: "Choose something from the menu",
  order: (total: string) => (total ? `Order breakfast · ${total}` : "Order breakfast"),
  sent: "Breakfast ordered. Your host will confirm it.",
});

export const groupBrandCopy = branded({
  partOf: (group: string) => `Part of ${group}`,
  title: "Group brand",
  body: "For a business with more than one property. Each property keeps its own logo (Look and feel); here you choose your business's logo and where it shows.",
  logo: "Group logo",
  upload: "Upload a logo",
  removeLogo: "Remove",
  noLogo: "No group logo",
  propertyLogos: "Property logos",
  own: "Each property's own logo (the group logo where a property has none)",
  group: "The group logo on every property",
  guestPages: "Show “Part of {group}” on guest pages",
  guestPagesHelp: "On the guest guide, room guides and kiosk, with your group logo.",
  invoices: "Show the group on invoices",
  invoicesHelp:
    "Your group name and logo at the top. Off: the property's name and logo instead; your business details always stay in the small print.",
  saved: "Group brand saved.",
  notReady: "The group brand can be set once the latest database update is applied.",
  ownerOnly: "Only the owner can change the group brand.",
});

/** The floating demo panel (DemoDock). */
export const demoDockCopy = branded({
  label: "Demo",
  pill: "Demo",
  tab: "Demo: switch property",
  tabHint: "Tap to switch property; drag to move",
  text: "You're exploring a demo. Everyone shares it, and it resets daily.",
  switchHost: "Switch property",
  switchGuest: "Switch property experience",
  hillName: "The Hill Suites",
  hillPlace: "Amersham · Boutique Heritage",
  trial: "Start free trial",
  leaveHost: "Leave demo",
  leaveGuest: "Back to Latchkey",
});

export const tourCopy = branded({
  navLabel: "Guided tour",
  pickerTitle: "Take a guided tour",
  pickerBody:
    "Pick a journey and we'll walk you through it on the real dashboard: what you're looking at, where to tap, and what else to notice. You can stop at any time and carry on later.",
  modeLabel: "How long",
  quick: "Quick (a few steps)",
  full: "Comprehensive",
  coverage: (done: number, total: number) => `${done} of ${total} journeys done`,
  doneLabel: "Done",
  steps: (n: number) => `${n} steps`,
  resume: (at: number, n: number) => `Carry on: step ${at} of ${n}`,
  again: (n: number) => `Done · take it again (${n} steps)`,
  stepOf: (at: number, n: number) => `Step ${at} of ${n}`,
  journeys: "Journeys",
  close: "Stop the tour",
  elsewhere: "This step is on another page.",
  missing:
    "This part isn't showing right now (it may be empty in the demo, or need a wider screen). Read on, then tap Next.",
  clickIt: "Tap the highlighted part to carry on.",
  back: "Back",
  next: "Next",
  finish: "Finish",
  takeMe: "Take me there",
  finishedTitle: (j: string) => `${j}: done`,
  allJourneys: "All journeys",
  nextJourney: (j: string) => `Next: ${j}`,
});

/** Commission Partner programme: the user-facing name is always "Commission Partner". */
export const partnerCopy = branded({
  codeLabel: "Referral code (from your Commission Partner)",
  codeHint:
    "Optional. If an independent Latchkey Commission Partner told you about Latchkey, enter their code.",
  codeAdd: "Add code",
  codeAdded: "Thanks: we've noted your Commission Partner.",
  codeFromLink: "Code from the link you followed",
  joinTitle: "Become an independent Latchkey Commission Partner",
  joinIntro:
    "Know hosts who run guest houses, B&Bs, serviced apartments or short lets? Introduce them to Latchkey and earn commission on what they pay.",
  joinPoints: [
    "10% as standard of what each host you refer pays for Latchkey (excluding VAT), for their first 12 paid months.",
    "Paid monthly through Stripe once your balance is £10 or more.",
    "No limit on how many hosts you refer.",
    "You're an independent business, not an employee or agent of Latchkey.",
  ],
  joinTermsNote:
    "The Commission Partner agreement sets out the full terms, including when commission is held, refunds and the Launch Bonus.",
  bonusLine: (label: string, rate: string, until: string) =>
    `${label}: ${rate} for the first 12 paid months on every host who starts paying by 23:59 UK time on ${until}. Standard rate 10% after that.`,
  bonusUpcoming: (label: string, rate: string, from: string, until: string) =>
    `${label}: ${rate} for the first 12 paid months on every host who starts paying between ${from} and 23:59 UK time on ${until}.`,
  bonusNote:
    "The rate is fixed for each host when they make their first payment after the free trial, and it doesn't change later. Every referral is reviewed, and all the usual rules apply.",
  bonusBadge: (label: string, rate: string) => `${label} ${rate}`,
  rateNotFixed: "Fixed at their first payment",
  joinSignUp: "Create an account to apply",
  joinSignIn: "I already have an account",
  formTitle: "Your details",
  kindIndividual: "Me, as an individual",
  kindBusiness: "My business",
  legalName: "Your full legal name",
  businessName: "Business name",
  businessType: "Type of business (optional)",
  companyNumber: "Company number (if a company)",
  country: "Country you're based in",
  email: "Email",
  phone: "Phone",
  vat: "VAT number (optional)",
  taxAck: "I'm responsible for my own tax on what I earn.",
  independentAck:
    "I'm applying as an independent business, not as an employee or agent of Latchkey.",
  apply: "Apply",
  applied: "Thanks: we'll check your application and email you.",
  accountTitle: "Your Commission Partner account",
  statusPending: "We're checking your application. We'll email you once it's approved.",
  statusWaitlisted:
    "Commission Partners in your country are on a waiting list for now. We'll email you when we can pay partners there.",
  statusSuspended: "Your Commission Partner account is paused. Please contact us.",
  statusTerminated:
    "Your Commission Partner arrangement has ended. Amounts already due are still paid as the agreement says.",
  yourLink: "Your referral link",
  yourCode: "Your referral code",
  copy: "Copy",
  copied: "Copied",
  payoutsTitle: "Payouts",
  payoutsSetUp: "Set up payouts with Stripe",
  payoutsContinue: "Finish setting up payouts",
  payoutsReady: "Stripe can pay you.",
  payoutsDashboard: "Open your Stripe dashboard",
  payoutsCheck: "Check again",
  payoutsOther: "We'll be in touch about how you're paid in your country.",
  held: "Held",
  heldHint: "Waiting out the 45-day hold after each payment",
  payable: "Due at the next payout",
  paid: "Paid so far",
  minNote: (min: string) =>
    `Payouts are monthly once you're owed ${min} or more; smaller amounts carry forward.`,
  hostsTitle: "Hosts you've referred",
  hostsEmpty:
    "No hosts yet. Share your link: a host who signs up through it within 60 days is yours.",
  monthsUsed: (n: number) => `${n} of 12 paid months`,
  bonus: "Sign-up Bonus",
  payoutsList: "Payout history",
  testMode: "Test mode: no real money moves.",
  notSetUp: "The Commission Partner programme isn't open yet.",
  heldHintDays: (days: number) => `Waiting out the ${days}-day hold after each payment`,
  hostsEmptyDays: (days: number) =>
    `No hosts yet. Share your link: a host who signs up through it within ${days} days is yours.`,
  monthsUsedOf: (n: number, cap: number) => `${n} of ${cap} paid months`,
  comingSoonTitle: "The Commission Partner programme is coming soon",
  comingSoonBody:
    "We're getting ready to welcome independent Latchkey Commission Partners. Please check back soon. If you already have a Commission Partner account, you can still sign in.",
  comingSoonSignIn: "Sign in to your Commission Partner account",
  previewNote: "Preview: applications are closed to the public.",
  readAgreement: "Read the Commission Partner agreement",
  joinSteps:
    "How joining works: apply, read and sign the agreement online, verify your identity with a photo ID and a selfie, then we check and activate your account.",
  agreementPdf: "Download PDF",
  agreementUnavailable:
    "The agreement isn't available just now. Please try again in a few minutes.",
  agreementFingerprint: (version: string, hash: string) =>
    `Version ${version} · text fingerprint ${hash}`,
  agreementContents: "Contents",
  agreementEnd: "End of the agreement. The signing section follows.",
  signTitle: "Sign the agreement",
  signLocked: "Read to the end of the agreement to sign it.",
  signApplyFirst: "Apply first, then come back to sign",
  signDone: "You've signed the version in force. Your signed copy is in your account.",
  signNotOpen: "Signing isn't open yet. Please check back soon.",
  signTicksTitle: "Please tick each box",
  signCapacity: "Who is signing",
  signAsMe: "I'm signing for myself",
  signAsCompany: "I'm signing for a company or organisation",
  signName: "Full legal name (typed)",
  signPosition: "Your position",
  signDraw: "Your signature (drawn)",
  signRecordNote:
    "When you sign, we record the agreement's version and fingerprint, the date and time, your typed name and drawn signature, the boxes you ticked, your IP address and your device and browser details (clause 4.3). We then email you a link to your signed copy.",
  signSubmit: "Sign the agreement",
  stepsTitle: "Getting your account ready",
  stepSign: "Sign the Commission Partner agreement",
  stepNewVersion: "Read and accept the new version of the agreement",
  stepVerify: "Verify your identity",
  stepApproval: "We check your application and confirm your signature",
  stepDone: "Done",
  stepWaiting: "Waiting for us",
  stepToDo: "To do",
  stepOpen: "Open",
  needsAgreementAndId:
    "Your referral code works once you've signed the agreement and we've approved your identity check.",
  yourAgreement: "Your agreement",
  agreementSigned: (version: string, when: string) => `Version ${version}, signed ${when}.`,
  agreementConfirmed: "Confirmed by Latchkey.",
  agreementUnconfirmed: "Waiting for Latchkey to confirm.",
  downloadSigned: "Download your signed copy",
  stopTitle: "Stop being a Commission Partner",
  stopBody:
    "You can stop at any time, without penalty (clause 20.1). If you signed as a consumer, this is also how you cancel within 14 days (clause 21.2). Your code and link stop working for new sign-ups straight away; commission already earned, and on hosts who paid before today, is still paid as clause 20.3 says.",
  stopConfirmLabel: "Type STOP to confirm",
  stopButton: "Stop being a Commission Partner",
  stopped: "You've stopped being a Commission Partner. We've emailed you a confirmation.",
  verifyTitle: "Verify your identity",
  verifyContinue: "I'm happy to continue",
  verifyPrivacyLink: "Partner section of the privacy notice",
  verifyIdStep: "Photograph your passport, photocard driving licence or national ID card",
  verifyIdHelp:
    "Use the original document, flat, in good light, with the whole of it in the frame.",
  verifySelfieStep: "Now take a selfie",
  verifySelfieHelp: "Look at the camera, with your face clearly visible.",
  verifyChecking: "Checking…",
  verifyNoCamera:
    "We couldn't open your camera. Allow camera access for this site, or try on your phone.",
  verifyWaiting: "Thanks. We're checking your identity and will email you once it's done.",
  verifyApproved: "Your identity is verified.",
  verifyRejected:
    "We couldn't verify your identity. Please contact us, or try again with another document.",
  verifyAttemptsLeft: (n: number) =>
    n === 1
      ? "You have 1 more automatic attempt; after that, we check by hand."
      : `You have ${n} more automatic attempts.`,
  verifyTryAgain: "Try again",
  verifySignFirst: "Sign the agreement first: we compare your ID with the name you sign with.",
  statementTitle: "Your details for statements",
  statementBody:
    "Each monthly statement is a self-billed invoice that we issue for you (clause 12.7), unless you opt out. It shows your name and address, and your VAT number if you're VAT-registered.",
  statementAddress: "Postal address",
  statementOptOut:
    "I'll send my own invoices instead of self-billing (they must match each statement).",
  statementSave: "Save details",
  statementSaved: "Saved.",
});
