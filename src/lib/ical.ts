/**
 * Pure iCalendar parsing and channel mapping. No network access here so the
 * logic can be unit tested. Fetching lives in ical-sync.server.ts.
 */

import { zonedParts } from "./dates";

export type Channel = "airbnb" | "booking_com" | "homestay" | "direct" | "other";

export type IcsEvent = {
  uid: string;
  summary: string;
  description: string;
  startDate: string; // yyyy-mm-dd in the property timezone
  endDate: string; // yyyy-mm-dd in the property timezone (checkout day)
  startTime: string | null; // HH:MM when the feed gives a real time
  endTime: string | null;
  allDay: boolean;
};

export type ParsedBooking = {
  externalUid: string;
  reservationCode: string | null;
  guestFullName: string | null;
  phoneLast4: string | null;
  guestCount: number | null;
  checkInDate: string;
  checkOutDate: string;
  checkInTime: string;
  checkOutTime: string;
  status: "upcoming" | "needs_details" | "blocked";
  externalListingTitle: string | null;
};

/** Unfolds RFC 5545 line folding (continuation lines start with space or tab). */
export function unfold(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

type RawProp = { name: string; params: Record<string, string>; value: string };

function parseLine(line: string): RawProp | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq > -1) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return { name: (name ?? "").toUpperCase(), params, value };
}

function parseDateValue(
  value: string,
  params: Record<string, string>,
  timeZone: string,
): { date: string; time: string | null; allDay: boolean } | null {
  const raw = value.trim();
  if (/^\d{8}$/.test(raw) || params["VALUE"] === "DATE") {
    const d = raw.slice(0, 8);
    return { date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, time: null, allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(raw);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z) {
    const instant = new Date(
      Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
    );
    const parts = zonedParts(instant, timeZone);
    return { date: parts.date, time: parts.time, allDay: false };
  }
  // Floating or TZID-qualified local time: treat as already local to the property.
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}`, allDay: false };
}

/** Parses an .ics document into events. */
export function parseIcs(text: string, timeZone = "Europe/London"): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: Partial<IcsEvent> | null = null;

  for (const line of unfold(text)) {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      current = { summary: "", description: "" };
      continue;
    }
    if (trimmed === "END:VEVENT") {
      if (
        current &&
        current.uid &&
        current.startDate &&
        current.endDate
      ) {
        events.push({
          uid: current.uid,
          summary: current.summary ?? "",
          description: current.description ?? "",
          startDate: current.startDate,
          endDate: current.endDate,
          startTime: current.startTime ?? null,
          endTime: current.endTime ?? null,
          allDay: current.allDay ?? true,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const prop = parseLine(line);
    if (!prop) continue;

    switch (prop.name) {
      case "UID":
        current.uid = prop.value.trim();
        break;
      case "SUMMARY":
        current.summary = unescapeText(prop.value).trim();
        break;
      case "DESCRIPTION":
        current.description = unescapeText(prop.value);
        break;
      case "DTSTART": {
        const parsed = parseDateValue(prop.value, prop.params, timeZone);
        if (parsed) {
          current.startDate = parsed.date;
          current.startTime = parsed.time;
          current.allDay = parsed.allDay;
        }
        break;
      }
      case "DTEND": {
        const parsed = parseDateValue(prop.value, prop.params, timeZone);
        if (parsed) {
          current.endDate = parsed.date;
          current.endTime = parsed.time;
        }
        break;
      }
      default:
        break;
    }
  }

  return events;
}

const NOT_AVAILABLE = /not\s*available|unavailable|blocked/i;

export function extractReservationCode(text: string): string | null {
  const url = /reservations?\/details\/([A-Z0-9]{6,})/i.exec(text);
  if (url?.[1]) return url[1].toUpperCase();
  const hm = /\b(HM[A-Z0-9]{6,})\b/.exec(text);
  if (hm?.[1]) return hm[1];
  const code = /(?:Reservation|Booking|Confirmation)\s*(?:code|number|ID)\s*[:#]?\s*([A-Z0-9-]{4,})/i.exec(
    text,
  );
  return code?.[1] ? code[1].toUpperCase() : null;
}

export function extractPhoneLast4(text: string): string | null {
  const m = /Phone\s*(?:Number)?\s*\(?Last\s*4\s*Digits\)?\s*[:#]?\s*(\d{4})/i.exec(text);
  if (m?.[1]) return m[1];
  const alt = /\(Last\s*4\s*Digits\)\s*[:#]?\s*(\d{4})/i.exec(text);
  return alt?.[1] ?? null;
}

export function extractGuestCount(text: string): number | null {
  const m = /(\d{1,2})\s*(?:guests?|adults?|people)/i.exec(text);
  return m?.[1] ? Number(m[1]) : null;
}

function cleanName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const name = raw.trim();
  if (!name) return null;
  if (NOT_AVAILABLE.test(name)) return null;
  if (/^(reserved|closed|busy|booked)$/i.test(name)) return null;
  return name;
}

function guestNameFromSummary(summary: string, channel: Channel): string | null {
  // "CLOSED - Jane Brown", "Reserved - Jane Brown", "Jane Brown (2 guests)"
  const dashed = /^(?:reserved|closed|booked|busy)\s*[-–—]\s*(.+)$/i.exec(summary);
  if (dashed?.[1]) return cleanName(dashed[1]);
  if (channel === "airbnb") return cleanName(summary.replace(/^reserved$/i, ""));
  return cleanName(summary.replace(/\s*\(.*\)\s*$/, ""));
}

export type MapOptions = {
  channel: Channel;
  defaultCheckInTime: string; // "15:00"
  defaultCheckOutTime: string; // "11:00"
  listingTitle?: string | null;
  /** Today in the property timezone, used to spot far-future closures. */
  today?: string | null;
};

/** Nameless closures longer than this are availability blocks, not stays. */
export const MAX_PLAUSIBLE_NIGHTS = 28;
/** Nameless closures starting further ahead than this are booking-window blocks. */
export const MAX_LEAD_DAYS = 330;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Booking.com and similar feeds label real stays and host closures the same
 * way ("CLOSED - Not available"). Obvious closures are marked blocked; the
 * rest need the host to confirm.
 */
export function looksLikeBlock(checkIn: string, checkOut: string, today?: string | null): boolean {
  if (daysBetween(checkIn, checkOut) > MAX_PLAUSIBLE_NIGHTS) return true;
  if (today && daysBetween(today, checkIn) > MAX_LEAD_DAYS) return true;
  return false;
}

export type MapResult = {
  bookings: ParsedBooking[];
  skipped: number;
};

/**
 * Turns raw calendar events into bookings for one channel.
 * Airbnb "(Not available)" blocks are skipped entirely; Booking.com CLOSED
 * entries without a guest name come through as needing details.
 */
export function mapEventsToBookings(events: IcsEvent[], opts: MapOptions): MapResult {
  const bookings: ParsedBooking[] = [];
  let skipped = 0;

  for (const ev of events) {
    const blob = `${ev.summary}\n${ev.description}`;
    const isBlock = NOT_AVAILABLE.test(ev.summary);

    if (opts.channel === "airbnb" && isBlock && !/reserved/i.test(ev.summary)) {
      skipped += 1;
      continue;
    }

    const guestFullName = guestNameFromSummary(ev.summary, opts.channel);
    const reservationCode = extractReservationCode(blob);
    const phoneLast4 = extractPhoneLast4(blob);
    const guestCount = extractGuestCount(ev.description);

    if (opts.channel !== "airbnb" && isBlock && !guestFullName && !reservationCode) {
      // Booking.com "CLOSED - Not available": a real stay with details missing.
      bookings.push({
        externalUid: ev.uid,
        reservationCode: null,
        guestFullName: null,
        phoneLast4: null,
        guestCount: null,
        checkInDate: ev.startDate,
        checkOutDate: ev.endDate,
        checkInTime: ev.startTime ?? opts.defaultCheckInTime,
        checkOutTime: ev.endTime ?? opts.defaultCheckOutTime,
        status: looksLikeBlock(ev.startDate, ev.endDate, opts.today) ? "blocked" : "needs_details",
        externalListingTitle: opts.listingTitle ?? null,
      });
      continue;
    }

    bookings.push({
      externalUid: ev.uid,
      reservationCode,
      guestFullName,
      phoneLast4,
      guestCount,
      checkInDate: ev.startDate,
      checkOutDate: ev.endDate,
      checkInTime: ev.startTime ?? opts.defaultCheckInTime,
      checkOutTime: ev.endTime ?? opts.defaultCheckOutTime,
      status: guestFullName ? "upcoming" : "needs_details",
      externalListingTitle: opts.listingTitle ?? null,
    });
  }

  return { bookings, skipped };
}

/** A feed URL reduced to something safe to show a host. */
export function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const tail = u.pathname.split("/").filter(Boolean).pop() ?? "";
    const hint = tail.length > 6 ? tail.slice(-6) : tail;
    return `${u.hostname}/…${hint}`;
  } catch {
    return "hidden feed link";
  }
}
