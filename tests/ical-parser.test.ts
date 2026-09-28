import { describe, expect, it } from "vitest";

import {
  extractPhoneLast4,
  extractReservationCode,
  mapEventsToBookings,
  maskUrl,
  parseIcs,
} from "../src/lib/ical";
import { bookingsToCancel, buildPatch, type ExistingBooking } from "../src/lib/sync-logic";
import { addDays, formatUkDate, nightsBetween, stayState } from "../src/lib/dates";

const AIRBNB_FEED = `BEGIN:VCALENDAR
PRODID:-//Airbnb Inc//Hosting Calendar 0.8.8//EN
VERSION:2.0
BEGIN:VEVENT
DTEND;VALUE=DATE:20260403
DTSTART;VALUE=DATE:20260401
UID:1a2b3c4d-airbnb@airbnb.com
SUMMARY:Reserved - Jane Brown
DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/de
 tails/HMABCD1234\\nPhone Number (Last 4 Digits): 8842\\n2 guests
END:VEVENT
BEGIN:VEVENT
DTEND;VALUE=DATE:20260410
DTSTART;VALUE=DATE:20260408
UID:blocked-1@airbnb.com
SUMMARY:Airbnb (Not available)
END:VEVENT
END:VCALENDAR`;

const BOOKING_FEED = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260505
DTEND;VALUE=DATE:20260506
UID:bdc-987@booking.com
SUMMARY:CLOSED - Not available
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260512
DTEND;VALUE=DATE:20260515
UID:bdc-988@booking.com
SUMMARY:CLOSED - Tomasz Nowak
END:VEVENT
END:VCALENDAR`;

describe("iCal parsing", () => {
  it("unfolds folded lines and reads all-day bounds", () => {
    const events = parseIcs(AIRBNB_FEED);
    expect(events).toHaveLength(2);
    expect(events[0]!.startDate).toBe("2026-04-01");
    expect(events[0]!.endDate).toBe("2026-04-03");
    expect(events[0]!.allDay).toBe(true);
    expect(events[0]!.description).toContain("HMABCD1234");
  });

  it("pulls the Airbnb reservation code and phone last 4", () => {
    const events = parseIcs(AIRBNB_FEED);
    const blob = `${events[0]!.summary}\n${events[0]!.description}`;
    expect(extractReservationCode(blob)).toBe("HMABCD1234");
    expect(extractPhoneLast4(blob)).toBe("8842");
  });

  it("skips Airbnb (Not available) blocks", () => {
    const { bookings, skipped } = mapEventsToBookings(parseIcs(AIRBNB_FEED), {
      channel: "airbnb",
      defaultCheckInTime: "15:00",
      defaultCheckOutTime: "11:00",
    });
    expect(skipped).toBe(1);
    expect(bookings).toHaveLength(1);
    expect(bookings[0]!.guestFullName).toBe("Jane Brown");
    expect(bookings[0]!.guestCount).toBe(2);
    expect(bookings[0]!.checkInTime).toBe("15:00");
    expect(bookings[0]!.checkOutTime).toBe("11:00");
    expect(bookings[0]!.status).toBe("upcoming");
  });

  it("treats Booking.com CLOSED entries without a name as needing details", () => {
    const { bookings } = mapEventsToBookings(parseIcs(BOOKING_FEED), {
      channel: "booking_com",
      defaultCheckInTime: "15:00",
      defaultCheckOutTime: "11:00",
    });
    expect(bookings).toHaveLength(2);
    expect(bookings[0]!.status).toBe("needs_details");
    expect(bookings[0]!.guestFullName).toBeNull();
    expect(bookings[1]!.guestFullName).toBe("Tomasz Nowak");
    expect(bookings[1]!.status).toBe("upcoming");
  });

  it("handles a single-night stay", () => {
    const { bookings } = mapEventsToBookings(parseIcs(BOOKING_FEED), {
      channel: "booking_com",
      defaultCheckInTime: "15:00",
      defaultCheckOutTime: "11:00",
    });
    expect(nightsBetween(bookings[0]!.checkInDate, bookings[0]!.checkOutDate)).toBe(1);
    expect(nightsBetween(bookings[1]!.checkInDate, bookings[1]!.checkOutDate)).toBe(3);
  });

  it("converts UTC timestamps into the property timezone", () => {
    const feed = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:timed-1
DTSTART:20260701T140000Z
DTEND:20260703T100000Z
SUMMARY:Reserved - Ade Okafor
END:VEVENT
END:VCALENDAR`;
    const events = parseIcs(feed, "Europe/London");
    expect(events[0]!.startDate).toBe("2026-07-01");
    expect(events[0]!.startTime).toBe("15:00"); // BST is UTC+1
    expect(events[0]!.endTime).toBe("11:00");
  });

  it("masks feed links so raw URLs never reach the host UI", () => {
    expect(maskUrl("https://www.airbnb.co.uk/calendar/ical/123456.ics?s=secrettoken")).toBe(
      "www.airbnb.co.uk/…56.ics",
    );
  });
});

const baseExisting: ExistingBooking = {
  id: "b1",
  external_uid: "uid-1",
  connection_id: "c1",
  room_id: "r1",
  status: "upcoming",
  check_in_date: "2026-04-01",
  check_out_date: "2026-04-03",
  manual_fields: [],
  guest_full_name: "Jane Brown",
  phone_last4: "8842",
  guest_count: 2,
  check_in_time: "15:00",
  check_out_time: "11:00",
  reservation_code: "HMABCD1234",
};

describe("sync reconciliation", () => {
  it("never overwrites a field the host edited by hand", () => {
    const existing = { ...baseExisting, manual_fields: ["check_in_time", "guest_full_name"] };
    const patch = buildPatch(existing, {
      externalUid: "uid-1",
      reservationCode: "HMABCD1234",
      guestFullName: "J. Brown",
      phoneLast4: "8842",
      guestCount: 2,
      checkInDate: "2026-04-01",
      checkOutDate: "2026-04-04",
      checkInTime: "20:00",
      checkOutTime: "11:00",
      status: "upcoming",
      externalListingTitle: null,
    });
    expect(patch.check_in_time).toBeUndefined();
    expect(patch.guest_full_name).toBeUndefined();
    expect(patch.check_out_date).toBe("2026-04-04");
  });

  it("reinstates a cancelled booking when its reservation reappears", () => {
    const patch = buildPatch(
      { ...baseExisting, status: "cancelled" },
      {
        externalUid: "uid-1",
        reservationCode: "HMABCD1234",
        guestFullName: "Jane Brown",
        phoneLast4: "8842",
        guestCount: 2,
        checkInDate: "2026-04-01",
        checkOutDate: "2026-04-03",
        checkInTime: "15:00",
        checkOutTime: "11:00",
        status: "upcoming",
        externalListingTitle: null,
      },
    );
    expect(patch.status).toBe("upcoming");
  });

  it("cancels only future stays from the same connection", () => {
    const rows: ExistingBooking[] = [
      { ...baseExisting, id: "past", check_out_date: "2026-01-01" },
      { ...baseExisting, id: "future", external_uid: "uid-2", check_out_date: "2026-12-01" },
      {
        ...baseExisting,
        id: "other-connection",
        external_uid: "uid-3",
        connection_id: "c2",
        check_out_date: "2026-12-01",
      },
    ];
    const ids = bookingsToCancel(rows, new Set<string>(), "c1", "2026-06-01");
    expect(ids).toEqual(["future"]);
  });
});

describe("dates", () => {
  it("formats UK style", () => {
    expect(formatUkDate("2026-09-30")).toBe("Wed 30 Sep");
    expect(addDays("2026-09-30", 2)).toBe("2026-10-02");
  });

  it("derives arrival and departure states from the date, not storage", () => {
    const b = { status: "upcoming", check_in_date: "2026-06-01", check_out_date: "2026-06-04" };
    expect(stayState(b, "2026-06-01")).toBe("arriving_today");
    expect(stayState(b, "2026-06-02")).toBe("in_stay");
    expect(stayState(b, "2026-06-04")).toBe("departing_today");
    expect(stayState(b, "2026-06-05")).toBe("past");
    expect(stayState({ ...b, status: "cancelled" }, "2026-06-02")).toBe("cancelled");
  });
});
