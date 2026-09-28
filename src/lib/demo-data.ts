/**
 * Demo content for The Trinity Rooms, High Wycombe. Dates are always relative
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
  channel: "airbnb" | "booking_com" | "homestay" | "direct" | "other";
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
  name: "The Trinity Rooms",
  address: "42 Amersham Hill",
  postcode: "HP13 6NX",
  short_code: "trinity",
  check_in_pin: "409271",
  timezone: "Europe/London",
  parking_notes: "One space on the drive, first come. Free on-street after 18:00.",
  wifi_name: "TrinityRooms",
  wifi_password: "highwycombe42",
  host_contact_name: "Swapnil",
  host_contact_phone: "07700 900142",
};

export const DEMO_ROOMS: DemoRoom[] = [
  {
    key: "r1",
    room_number: "1",
    display_name: "Room 1",
    public_title: "The Trinity — Suite 1",
    description: "Front double with a bay window, ensuite shower and a desk.",
    max_guests: 2,
    has_ensuite: true,
    sort_order: 1,
  },
  {
    key: "r2",
    room_number: "2",
    display_name: "Room 2",
    public_title: "The Trinity — Garden Room",
    description: "Quiet double at the back overlooking the garden. Shared bathroom.",
    max_guests: 2,
    has_ensuite: false,
    sort_order: 2,
  },
  {
    key: "r3",
    room_number: "3",
    display_name: "Room 3",
    public_title: "The Trinity — Loft Single",
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
];

/** Weekly whole-house cleaning: Tuesdays and Thursdays, 10:00 to 15:00. */
export const DEMO_UNAVAILABILITY = [
  { day_of_week: 2, start_time: "10:00", end_time: "15:00", reason: "Whole-house cleaning" },
  { day_of_week: 4, start_time: "10:00", end_time: "15:00", reason: "Whole-house cleaning" },
];

export const DEMO_CONNECTIONS = [
  { roomKey: "r1", channel: "airbnb" as const, listing_name: "The Trinity — Suite 1" },
  { roomKey: "r2", channel: "booking_com" as const, listing_name: "Garden Room, High Wycombe" },
  { roomKey: "r3", channel: "homestay" as const, listing_name: "Loft Single" },
];

export function demoDates(today: string, b: DemoBooking) {
  return {
    check_in_date: addDays(today, b.check_in_offset),
    check_out_date: addDays(today, b.check_out_offset),
  };
}
