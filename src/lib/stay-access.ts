/**
 * Opening a guest's own guide from the QR code printed in their room, before
 * check-in is finished (properties.stay_access, migration 0057), and the Wi-Fi
 * on guest pages. Pure: the server functions live in stay-access.functions.ts.
 *
 * The room QR opens the stay of whoever is booked into that room today, but
 * only when the host allows it and the phone is shown to be at the property:
 * on the same internet connection as the door tablet (same public address, so
 * a router's isolated guest network still counts), or, if the host allows it,
 * close to the tablet's location. Otherwise the guest checks in first.
 */
import { addDays, nightsBetween } from "./dates";
import { normaliseBuffer } from "./stay-times";

export type Presence = "network" | "network_or_location";

export type StayAccess = {
  /** The room QR opens the guest's own guide before check-in is complete. */
  roomQrEarly: boolean;
  /** How a phone is shown to be at the property. */
  presence: Presence;
  /** Shown from the second day of a stay. */
  stayMessage: string;
  /** Wi-Fi password only once the guest has checked in. */
  wifiAfterCheckIn: boolean;
  /** On the last day, ask for a review (on the site they booked with, or here for direct stays). */
  askReview: boolean;
  reviewText: string;
  /** Direct guests' reviews scoring 9 or more out of 10 (with their agreement) on the property's booking page. */
  showDirectReviews: boolean;
  /** Minutes kept free between one guest leaving a room and the next arriving (early check-in and late check-out respect it). */
  bufferMinutes: number;
};

export const DEFAULT_REVIEW_TEXT =
  "Enjoyed your stay? A quick review means the world to a small place like ours: it helps us stay in business and helps other guests find us.";

/** "Need something else?" on the guide: questions the guide doesn't answer (feedback has its own card). */
export const DEFAULT_STAY_MESSAGE = "Anything you'd like to ask that isn't covered in this guide? Send us a message and we'll get back to you.";
/** The earlier default, which read like feedback: replaced wherever it was kept unchanged. */
const OLD_STAY_MESSAGE = "We hope your stay has been comfortable so far. If anything would make it better, just send us a message.";

export const DEFAULT_STAY_ACCESS: StayAccess = {
  roomQrEarly: false,
  presence: "network_or_location",
  stayMessage: DEFAULT_STAY_MESSAGE,
  wifiAfterCheckIn: false,
  askReview: false,
  reviewText: DEFAULT_REVIEW_TEXT,
  showDirectReviews: false,
  bufferMinutes: 60,
};

export function normaliseStayAccess(raw: unknown): StayAccess {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const clean = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 280) : "");
  return {
    roomQrEarly: r["roomQrEarly"] === true,
    presence: r["presence"] === "network" ? "network" : "network_or_location",
    stayMessage: (clean(r["stayMessage"]) !== OLD_STAY_MESSAGE && clean(r["stayMessage"])) || DEFAULT_STAY_MESSAGE,
    wifiAfterCheckIn: r["wifiAfterCheckIn"] === true,
    askReview: r["askReview"] === true,
    reviewText: clean(r["reviewText"]) || DEFAULT_REVIEW_TEXT,
    showDirectReviews: r["showDirectReviews"] === true,
    bufferMinutes: normaliseBuffer(r["bufferMinutes"]),
  };
}

export type StayProgress = {
  nights: number;
  phase: "before" | "arrival" | "during" | "leaving" | "after";
  /** Tonight's night of the stay (1 = the first), while staying. */
  night: number;
  /** Nights already spent. */
  done: number;
  /** Nights still to come, tonight included. */
  left: number;
};

/** Where a guest is in their stay on a given day (the property's own date). */
export function stayProgress(checkIn: string, checkOut: string, today: string): StayProgress {
  const nights = Math.max(0, nightsBetween(checkIn, checkOut));
  if (today < checkIn) return { nights, phase: "before", night: 0, done: 0, left: nights };
  if (today >= checkOut) return { nights, phase: today === checkOut ? "leaving" : "after", night: 0, done: nights, left: 0 };
  const done = nightsBetween(checkIn, today);
  return { nights, phase: done === 0 ? "arrival" : "during", night: done + 1, done, left: nights - done };
}

/** Today falls within a stay (arrival day up to leaving day). */
export const inStayWindow = (checkIn: string, checkOut: string, today: string) => today >= checkIn && today <= checkOut;

/**
 * The part of an address that's the same for every device behind one internet
 * connection: the whole IPv4 address (one public address per router), or the
 * first 56 bits of an IPv6 address (the prefix a home or business line is
 * given; a guest network is usually another /64 inside it).
 */
export function networkKey(ip: string | null | undefined): string | null {
  const s = (ip ?? "").trim().toLowerCase();
  if (!s) return null;
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (v4) return `4:${v4[1]}`;
  if (!s.includes(":")) return null;
  const [head, tail = ""] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  if (h.length + t.length > 8) return null;
  const groups = [...h, ...Array(8 - h.length - t.length).fill("0"), ...t].map((g) => g.padStart(4, "0"));
  if (groups.some((g) => !/^[0-9a-f]{4}$/.test(g))) return null;
  return `6:${groups.join("").slice(0, 14)}`;
}

export type Fix = { lat: number; lng: number; accuracy: number };

/** Metres between two points (haversine). */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Close enough to the door tablet to be at the property: within 150 m, allowing for how sure both readings are, never a vague fix. */
export function nearKiosk(kiosk: Fix, guest: Fix): boolean {
  if (!(guest.accuracy > 0) || guest.accuracy > 250) return false;
  const allow = Math.min(400, 150 + guest.accuracy + Math.min(kiosk.accuracy || 0, 100));
  return distanceMetres(kiosk, guest) <= allow;
}

/** A room's own network, or the property's. */
export function wifiFor(room: { wifi_name?: string | null; wifi_password?: string | null } | null, property: { wifi_name?: string | null; wifi_password?: string | null } | null): { name: string; password: string | null } | null {
  if (room?.wifi_name?.trim()) return { name: room.wifi_name.trim(), password: room.wifi_password?.trim() || null };
  if (property?.wifi_name?.trim()) return { name: property.wifi_name.trim(), password: property.wifi_password?.trim() || null };
  return null;
}

/** The text in a "join Wi-Fi" QR code, which phone cameras offer to join. */
export function wifiQrText(name: string, password: string | null): string {
  const esc = (v: string) => v.replace(/([\;,:"])/g, "\\$1");
  return password ? `WIFI:T:WPA;S:${esc(name)};P:${esc(password)};;` : `WIFI:T:nopass;S:${esc(name)};;`;
}

export type JoinKind = "ios" | "android" | "other";

/** How this phone can join a network from a web page. */
export function joinKind(userAgent: string): JoinKind {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && /Mobile/i.test(userAgent))) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

const xml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * An Apple configuration profile that adds the network: on an iPhone or iPad
 * the guest taps Join, then Install in Settings, and it connects whenever
 * it's in range. Not signed, so Settings labels it "Unverified".
 */
export function wifiProfile(name: string, password: string | null, org: string, uuid: (n: number) => string): string {
  const id = `uk.latchkey.wifi.${uuid(0).slice(0, 8)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>AutoJoin</key><true/>
      <key>EncryptionType</key><string>${password ? "Any" : "None"}</string>
      <key>HIDDEN_NETWORK</key><false/>
      ${password ? `<key>Password</key><string>${xml(password)}</string>` : ""}
      <key>PayloadDisplayName</key><string>${xml(name)}</string>
      <key>PayloadIdentifier</key><string>${id}.network</string>
      <key>PayloadType</key><string>com.apple.wifi.managed</string>
      <key>PayloadUUID</key><string>${uuid(1)}</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>SSID_STR</key><string>${xml(name)}</string>
    </dict>
  </array>
  <key>PayloadDisplayName</key><string>${xml(`Wi-Fi at ${org}`)}</string>
  <key>PayloadDescription</key><string>${xml(`Joins ${name}. You can remove it in Settings at any time.`)}</string>
  <key>PayloadIdentifier</key><string>${id}</string>
  <key>PayloadOrganization</key><string>${xml(org)}</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>${uuid(2)}</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>
`;
}

export { addDays };

/** A score out of 10 as the 1-5 stars the host's review list uses. */
export const starsOf = (score: number) => Math.min(5, Math.max(1, Math.round(score / 2)));

/** Shown on the booking page: 9 or more out of 10. */
export const PUBLIC_REVIEW_MIN = 9;

/** When the review nudge shows: the last day of the stay, and the day after while the guide still opens. */
export const reviewDay = (phase: StayProgress["phase"]) => phase === "leaving" || phase === "after";
