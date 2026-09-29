/**
 * All user-facing copy lives here so it can be reviewed and later translated.
 * UK English throughout.
 */

export const brand = {
  name: "Latchkey",
  tagline: "Self-service arrivals for small hosts",
};

export const marketing = {
  headline: "Your guests let themselves in, calmly, while you get on with your day.",
  subhead:
    "Latchkey handles arrivals, house rules and extras for hosts who let a few rooms across Airbnb, Booking.com, Homestay.com and direct bookings.",
  primaryCta: "See a guest arrival",
  secondaryCta: "Open host dashboard",
  benefits: [
    {
      title: "Check-in without you",
      body: "A QR code, short link or PIN at the door. No app, no sign-up, no waiting on the doorstep at 11pm.",
    },
    {
      title: "Every booking in one list",
      body: "Airbnb, Booking.com, Homestay.com and direct bookings side by side, so you always know who is arriving.",
    },
    {
      title: "Extras that pay for themselves",
      body: "Late check-out, fresh towels, early arrival. Guests request and pay; you approve with one tap or let it run itself.",
    },
  ],
  beforeAfter: {
    beforeTitle: "A Tuesday before Latchkey",
    before: [
      "Three inboxes, three sets of arrival times",
      "Leaving a client call to hand over a key",
      "A towel request at 11pm you see at 7am",
      "Late check-out agreed, cleaner turns up anyway",
    ],
    afterTitle: "A Tuesday with Latchkey",
    after: [
      "One arrivals list for all channels",
      "Guest checks in at the door on the tablet",
      "Requests land in Today, approved in a tap",
      "Late check-out only offered when the room is free",
    ],
  },
};

export const auth = {
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
};

export const hostNav = {
  today: "Today",
  bookings: "Bookings",
  properties: "Properties",
  connections: "Connections",
  settings: "Settings",
};

export const statuses = {
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
};

export const channels = {
  airbnb: "Airbnb",
  booking_com: "Booking.com",
  homestay: "Homestay.com",
  direct: "Direct",
  other: "Other",
};

export const today = {
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
  doubleBookedBody: "Two platforms show different guests in the same room on the same nights. Check both and cancel one.",
  maybeBlock: "Dates you closed yourself?",
  markBlocked: "Not a booking, mark as blocked",
  cleaningToday: "Cleaning window today",
};

export const bookings = {
  title: "Bookings",
  subtitle: "Every stay across your channels, in one place.",
  mirrorNote: "Another platform is showing this stay as closed. It is linked to the real booking, so it is not counted twice.",
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
  manualNote: "Fields you change here are kept, even when the channel calendar updates.",
  importTitle: "Import bookings from a file",
  importBody: "Upload a CSV export from a channel or spreadsheet, then match the columns.",
  importChoose: "Choose CSV file",
  importConfirm: "Import bookings",
  importedToast: "bookings imported",
};

export const properties = {
  title: "Properties",
  subtitle: "Your rooms, door details and cleaning windows.",
  addProperty: "Add property",
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
};

export const connections = {
  title: "Connections",
  subtitle: "Calendar links that keep your bookings in step.",
  byRoomTitle: "Each room across platforms",
  byRoomBody: "Link every platform that lets the same room. Latchkey matches the entries so one stay is never counted twice.",
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
  managerBody: "Direct two-way sync with channel managers is planned for a later stage.",
  comingSoon: "Coming soon",
  conflictTitle: "Something needs your eye",
  syncedToast: "Calendar checked",
  removeConfirm: "Remove this calendar link? Bookings already imported are kept.",
};

export const settings = {
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
    "Load The Trinity Rooms in High Wycombe: three rooms, bookings across four channels, and Tuesday and Thursday cleaning windows.",
  loadDemo: "Load demo rooms",
  resetDemo: "Reset demo dates",
  removeDemo: "Remove demo data",
  demoBanner: "You are looking at demo content.",
  removing: "Removing…",
  privacyTitle: "Privacy and retention",
  privacyBody:
    "Guest names, phone digits and notes are cleared 90 days after check-out. Anonymous stay records are kept for your statistics.",
};

export const onboarding = {
  title: "Let's set up your rooms",
  subtitle: "Three short steps. You can change anything later.",
  step1: "Property",
  step2: "Rooms",
  step3: "Arrivals",
  next: "Continue",
  back: "Back",
  finish: "Finish setup",
  orDemo: "Or explore with demo rooms first",
};

export const common = {
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
};

export const guest = {
  propertyName: "The Trinity Rooms",
  location: "High Wycombe",
  welcome: "Welcome to The Trinity Rooms",
  welcomeBody:
    "Check yourself in, find your room and ask for anything you need. It takes about a minute and there is nothing to download.",
  startCta: "Start check-in",
  helpCta: "I need help",
  reassurance: "Arriving late? That is absolutely fine — the door code works at any hour.",
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
  noArrivals: "We can't see any arrivals on that platform today. Please try another, or call your host.",
  platforms: {
    airbnb: "Airbnb",
    booking_com: "Booking.com",
    homestay: "Homestay.com",
    direct: "Booked directly",
    other: "Somewhere else",
  } as Record<string, string>,
  noMatchTitle: "We couldn't find that booking",
  noMatchBody: "Please check your answers and try again. If it still doesn't work, your host is happy to help.",
  lockedTitle: "Let's pause for a moment",
  lockedBody: (time: string) =>
    `We've let your host know you're here. You can try again at ${time}, or give them a call.`,
  callHost: "Call your host",
  hi: (name: string) => `Hi ${name}`,
  confirmBody: "Is this your booking?",
  confirmYes: "Yes, that's me",
  confirmNo: "No, start again",
  idTitle: "A quick ID check",
  idConsent:
    "We only check your name matches your booking. We don't keep a copy of your ID.",
  idConsentAgree: "I'm happy to continue",
  idUseOther: "Use another way",
  idCameraHelp: "Hold your passport, driving licence or ID card flat, with the name clearly visible.",
  idTakePhoto: "Take photo",
  idChecking: "Checking your name…",
  idRetry: (left: number) =>
    `We couldn't read that clearly. Try again with more light and less glare (${left} ${left === 1 ? "try" : "tries"} left).`,
  idCameraFailed: "The camera didn't start, so let's try another way.",
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
  roomLine: (room: string, title: string | null) => `You're in ${room}${title ? `, ${title}` : ""}.`,
  noRoom: "Your host will show you to your room.",
  stayGuideCta: "Your stay guide",
  kioskResetting: "Starting over for the next guest…",
  kioskExitTitle: "Host access",
  kioskExitBody: "Enter the door PIN to leave kiosk mode.",
  kioskExitCta: "Unlock",
  kioskWrongPin: "That PIN isn't right.",
  pinTitle: "Enter the property PIN",
  pinBody: "You'll find the 6-digit PIN in your booking message or by the front door.",
  pinWrong: "We couldn't find a property with that PIN.",
  notFound: "We couldn't find that property. Please check the link or ask your host.",
  error: "Something went wrong. Please try again, or call your host.",
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
  stayGone: "This stay link has expired. We hope you enjoyed your stay.",
};

export const hostPlaceholders = {
  comingSoon: "Coming in a later stage",
};
