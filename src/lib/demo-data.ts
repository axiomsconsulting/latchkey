/**
 * Demo content for The Hill Suites, Amersham. Dates are always relative
 * to today so the dashboard looks alive whenever it is opened.
 */

import { addDays } from "./dates";

export type DemoRoom = {
  key: string;
  room_number: string;
  display_name: string;
  public_title: string;
  description: string;
  max_guests: number;
  has_ensuite: boolean;
  sort_order: number;
};

export type DemoBooking = {
  roomKey: string;
  channel: "airbnb" | "booking_com" | "homestay" | "vrbo" | "agoda" | "direct" | "other";
  source: "ical" | "manual" | "csv" | "api";
  guest_full_name: string | null;
  reservation_code: string | null;
  guest_count: number;
  phone_last4: string | null;
  check_in_offset: number;
  check_out_offset: number;
  check_in_time: string;
  check_out_time: string;
  status: "needs_details" | "upcoming" | "checked_in" | "checked_out" | "cancelled" | "flagged";
  notes: string | null;
};

export const DEMO_PROPERTY = {
  name: "The Hill Suites",
  address: "12 Bellfield Row, Amersham",
  postcode: "HP7 9QZ",
  short_code: "hill",
  check_in_pin: "409271",
  timezone: "Europe/London",
  parking_notes: "One space on the drive, first come. Free on-street after 18:00.",
  wifi_name: "HillSuites",
  wifi_password: "bellfield12",
  host_contact_name: "Swapnil",
  host_contact_phone: "07700 900142",
};

export const DEMO_ROOMS: DemoRoom[] = [
  {
    key: "r1",
    room_number: "1",
    display_name: "Room 1",
    public_title: "The Hill — Suite 1",
    description: "Front double with a bay window, ensuite shower and a desk.",
    max_guests: 2,
    has_ensuite: true,
    sort_order: 1,
  },
  {
    key: "r2",
    room_number: "2",
    display_name: "Room 2",
    public_title: "The Hill — Garden Room",
    description: "Quiet double at the back overlooking the garden. Shared bathroom.",
    max_guests: 2,
    has_ensuite: false,
    sort_order: 2,
  },
  {
    key: "r3",
    room_number: "3",
    display_name: "Room 3",
    public_title: "The Hill — Loft Single",
    description: "Top-floor single with a skylight. Best for one guest travelling light.",
    max_guests: 1,
    has_ensuite: false,
    sort_order: 3,
  },
];

export const DEMO_BOOKINGS: DemoBooking[] = [
  {
    roomKey: "r1",
    channel: "airbnb",
    source: "ical",
    guest_full_name: "Jane Brown",
    reservation_code: "HMABCD1234",
    guest_count: 2,
    phone_last4: "8842",
    check_in_offset: 0,
    check_out_offset: 3,
    check_in_time: "22:40",
    check_out_time: "11:00",
    status: "upcoming",
    notes: "Late flight into Heathrow, expects to arrive near midnight.",
  },
  {
    roomKey: "r2",
    channel: "booking_com",
    source: "ical",
    guest_full_name: null,
    reservation_code: null,
    guest_count: 1,
    phone_last4: null,
    check_in_offset: 0,
    check_out_offset: 1,
    check_in_time: "15:00",
    check_out_time: "11:00",
    status: "needs_details",
    notes: null,
  },
  {
    roomKey: "r3",
    channel: "homestay",
    source: "ical",
    guest_full_name: "Ade Okafor",
    reservation_code: "HS-55219",
    guest_count: 1,
    phone_last4: "3310",
    check_in_offset: -2,
    check_out_offset: 4,
    check_in_time: "16:30",
    check_out_time: "11:00",
    status: "checked_in",
    notes: "Studying at Bucks New Uni for the week. Asked about a desk lamp.",
  },
  {
    roomKey: "r1",
    channel: "direct",
    source: "manual",
    guest_full_name: "Tomasz Nowak",
    reservation_code: "DIR-0042",
    guest_count: 2,
    phone_last4: "7712",
    check_in_offset: -3,
    check_out_offset: 0,
    check_in_time: "15:00",
    check_out_time: "11:00",
    status: "checked_in",
    notes: "Asked about a late check-out today.",
  },
  {
    roomKey: "r2",
    channel: "airbnb",
    source: "ical",
    guest_full_name: "Priya Shah",
    reservation_code: "HMZZTT9081",
    guest_count: 2,
    phone_last4: "1104",
    check_in_offset: 4,
    check_out_offset: 6,
    check_in_time: "15:00",
    check_out_time: "11:00",
    status: "upcoming",
    notes: null,
  },
  {
    roomKey: "r3",
    channel: "booking_com",
    source: "ical",
    guest_full_name: "Marek Dvorak",
    reservation_code: "BDC-99301",
    guest_count: 1,
    phone_last4: "2287",
    check_in_offset: 9,
    check_out_offset: 12,
    check_in_time: "15:00",
    check_out_time: "11:00",
    status: "upcoming",
    notes: null,
  },
  {
    roomKey: "r1",
    channel: "other",
    source: "csv",
    guest_full_name: "Laura Kennedy",
    reservation_code: "LEG-2201",
    guest_count: 1,
    phone_last4: "9040",
    check_in_offset: -12,
    check_out_offset: -9,
    check_in_time: "15:00",
    check_out_time: "11:00",
    status: "checked_out",
    notes: null,
  },
  // The coming days, so the housekeeping board, reports and Today always have work in every room.
  {
    roomKey: "r2",
    channel: "direct",
    source: "manual",
    guest_full_name: "Hannah Lee",
    reservation_code: null,
    guest_count: 2,
    phone_last4: "3318",
    check_in_offset: 1,
    check_out_offset: 3,
    check_in_time: "16:00",
    check_out_time: "11:00",
    status: "upcoming",
    notes: "Returning guest: asked for the garden room again.",
  },
  {
    roomKey: "r1",
    channel: "booking_com",
    source: "ical",
    guest_full_name: "Sofia Marin",
    reservation_code: "BK-48211",
    guest_count: 2,
    phone_last4: "7720",
    check_in_offset: 3,
    check_out_offset: 5,
    check_in_time: "22:30",
    check_out_time: "11:00",
    status: "upcoming",
    notes: "Late arrival, around 22:30.",
  },
  {
    roomKey: "r3",
    channel: "direct",
    source: "manual",
    guest_full_name: "Chloe Martin",
    reservation_code: null,
    guest_count: 1,
    phone_last4: "5503",
    check_in_offset: 5,
    check_out_offset: 8,
    check_in_time: "15:00",
    check_out_time: "11:00",
    status: "upcoming",
    notes: null,
  },
  {
    roomKey: "r1",
    channel: "airbnb",
    source: "ical",
    guest_full_name: "Owen Price",
    reservation_code: "HMX2Q8",
    guest_count: 2,
    phone_last4: "6614",
    check_in_offset: 6,
    check_out_offset: 9,
    check_in_time: "15:00",
    check_out_time: "11:00",
    status: "upcoming",
    notes: null,
  },
  {
    roomKey: "r2",
    channel: "airbnb",
    source: "ical",
    guest_full_name: "Ravi Mehta",
    reservation_code: "HMB7K2",
    guest_count: 2,
    phone_last4: "2287",
    check_in_offset: 7,
    check_out_offset: 10,
    check_in_time: "15:00",
    check_out_time: "11:00",
    status: "upcoming",
    notes: null,
  },
];

/** Weekly whole-house cleaning: Tuesdays and Thursdays, 10:00 to 15:00. */
export const DEMO_UNAVAILABILITY = [
  { day_of_week: 2, start_time: "10:00", end_time: "15:00", reason: "Whole-house cleaning" },
  { day_of_week: 4, start_time: "10:00", end_time: "15:00", reason: "Whole-house cleaning" },
];

export const DEMO_CONNECTIONS = [
  { roomKey: "r1", channel: "airbnb" as const, listing_name: "The Hill — Suite 1" },
  { roomKey: "r2", channel: "booking_com" as const, listing_name: "Garden Room, Amersham" },
  { roomKey: "r3", channel: "homestay" as const, listing_name: "Loft Single" },
];

/** A guest request and a maintenance job, so Services and the housekeeping board have something open. */
export const DEMO_JOBS = [
  {
    roomKey: "r3",
    guest: "Ade Okafor",
    source: "guest" as const,
    category: "linen",
    title: "Extra towels",
    note: "Two more bath towels, please.",
    urgency: "normal" as const,
    status: "new" as const,
  },
  {
    roomKey: "r2",
    guest: null,
    source: "maintenance" as const,
    category: "handyman",
    title: "Shower drips after use",
    note: "Check the mixer seal before the weekend.",
    urgency: "low" as const,
    status: "acknowledged" as const,
  },
];

/** A short conversation (answered) and a question still waiting, minutes before now. */
export const DEMO_MESSAGES = [
  {
    guest: "Ade Okafor",
    direction: "inbound" as const,
    minutesAgo: 190,
    body: "Hi, could we have two more towels please?",
  },
  {
    guest: "Ade Okafor",
    direction: "outbound" as const,
    minutesAgo: 170,
    body: "Of course. I'll leave them outside your door by 6pm.",
  },
  {
    guest: "Jane Brown",
    direction: "inbound" as const,
    minutesAgo: 40,
    body: "We're on the train, arriving around 9pm. Is the door code the same as in the guide?",
  },
];

export function demoDates(today: string, b: DemoBooking) {
  return {
    check_in_date: addDays(today, b.check_in_offset),
    check_out_date: addDays(today, b.check_out_offset),
  };
}

/* ------------------------- recording account -------------------------- */

/** Fictional guests for the screen-recording account (never real people). */
export const RECORDING_GUESTS = [
  "Amelia Hart",
  "Jonas Weber",
  "Priya Nair",
  "Callum Reid",
  "Sofia Ricci",
  "Daniel Okoye",
  "Maya Lindqvist",
  "Tom Fletcher",
  "Aisha Rahman",
  "Lucas Moreau",
  "Grace Whitfield",
  "Mateo García",
  "Hannah Brooks",
  "Kenji Sato",
  "Isla Campbell",
  "Omar Haddad",
  "Freya Nilsen",
  "Ben Carter",
  "Zara Malik",
  "Noah Fischer",
  "Ella Byrne",
  "Arjun Mehta",
  "Chloe Dupont",
  "Leo Martins",
];

const RECORDING_CHANNELS: DemoBooking["channel"][] = [
  "airbnb",
  "booking_com",
  "direct",
  "airbnb",
  "booking_com",
  "direct",
  "airbnb",
];
// Nights and the gap after each stay: about 70% of nights are occupied.
const STAY_PATTERN: Array<[nights: number, gap: number]> = [
  [3, 1],
  [2, 0],
  [4, 2],
  [1, 1],
  [3, 0],
  [2, 2],
  [5, 1],
  [2, 0],
];

/**
 * Bookings for the recording account: every room from 7 days ago to 21 days
 * ahead, about 70% full, on Airbnb, Booking.com and direct, 1 to 3 guests
 * (never more than the room takes), some late arrivals, same-day turnovers
 * (out by 11:00, in from 15:00), and one stay flagged for an ID check.
 */
export type StayOptions = {
  guests?: string[];
  channels?: DemoBooking["channel"][];
  checkIn?: string;
  checkOut?: string;
  lateArrival?: string;
  /** Days before and after today to fill. */
  from?: number;
  to?: number;
  /** Today's arrivals are named and expected (the guest tour needs someone to check in). */
  namedToday?: boolean;
  /** Mark one upcoming stay for an ID check. */
  flagOne?: boolean;
};

export function buildRecordingBookings(
  rooms: Array<Pick<DemoRoom, "key" | "max_guests">> = DEMO_ROOMS,
  o: StayOptions = {},
): DemoBooking[] {
  const guests = o.guests ?? RECORDING_GUESTS;
  const channels = o.channels ?? RECORDING_CHANNELS;
  const from = o.from ?? -7;
  const to = o.to ?? 21;
  const checkIn = o.checkIn ?? "15:00";
  const late = o.lateArrival ?? "22:30";
  const out: DemoBooking[] = [];
  let n = 0;
  rooms.forEach((room, r) => {
    // Each room starts at a different point in the pattern, so turnovers don't all land on one day.
    let day = from - r;
    let p = r * 3;
    while (day < to) {
      const [nights, gap] = STAY_PATTERN[p % STAY_PATTERN.length]!;
      const inOff = day;
      const outOff = day + nights;
      if (outOff > from) {
        const isLate = n % 5 === 2;
        const unnamedToday = inOff === 0 && n % 2 === 0 && !o.namedToday;
        const status: DemoBooking["status"] =
          outOff <= 0
            ? "checked_out"
            : inOff < 0
              ? "checked_in"
              : unnamedToday
                ? "needs_details"
                : "upcoming";
        const channel = channels[n % channels.length]!;
        out.push({
          roomKey: room.key,
          channel,
          source: channel === "direct" ? "manual" : "ical",
          guest_full_name: status === "needs_details" ? null : guests[n % guests.length]!,
          reservation_code:
            channel === "direct" ? null : `RX${(48210 + n * 37).toString(36).toUpperCase()}`,
          guest_count: Math.min(room.max_guests, 1 + (n % 3)),
          phone_last4: String(1000 + ((n * 7919) % 9000)),
          check_in_offset: inOff,
          check_out_offset: outOff,
          check_in_time: isLate ? late : checkIn,
          check_out_time: o.checkOut ?? "11:00",
          status,
          notes: isLate ? `Late arrival, around ${late}.` : null,
        });
        n++;
      }
      day = outOff + gap;
      p++;
    }
  });
  // The tour always has someone named arriving today.
  if (o.namedToday && !out.some((b) => b.check_in_offset === 0)) {
    const free = rooms.find(
      (room) =>
        !out.some(
          (b) => b.roomKey === room.key && b.check_in_offset <= 0 && b.check_out_offset > 0,
        ),
    );
    if (free) {
      const before = out
        .filter((b) => b.roomKey === free.key && b.check_in_offset > 0)
        .sort((a, b) => a.check_in_offset - b.check_in_offset)[0];
      const until = Math.min(2, before ? before.check_in_offset : 2);
      if (until > 0)
        out.push({
          roomKey: free.key,
          channel: channels[0]!,
          source: "ical",
          guest_full_name: guests[guests.length - 1]!,
          reservation_code: "RXTODAY",
          guest_count: 1,
          phone_last4: "4821",
          check_in_offset: 0,
          check_out_offset: until,
          check_in_time: checkIn,
          check_out_time: o.checkOut ?? "11:00",
          status: "upcoming",
          notes: null,
        });
    }
  }
  // One upcoming stay waits on an ID check, so that screen can be shown.
  if (o.flagOne !== false) {
    const flag = out.find(
      (b) => b.status === "upcoming" && b.check_in_offset >= 1 && b.guest_full_name,
    );
    if (flag) {
      flag.status = "flagged";
      flag.notes = "ID check needs a look: the name on the ID didn't match the booking.";
    }
  }
  return out;
}
