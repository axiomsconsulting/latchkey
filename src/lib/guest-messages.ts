/**
 * Messages to guests by text, WhatsApp and email: what Latchkey admin sets
 * up once (the shared WhatsApp sender, Meta-approved templates) and the
 * rules each business's messages follow. Pure; tested in
 * tests/guest-messages.test.ts.
 */

/** Templates Meta must approve before WhatsApp lets a business message a guest first. */
export const WHATSAPP_TEMPLATES = ["photo_link", "welcome", "goodbye"] as const;
export type WhatsAppTemplateKey = (typeof WHATSAPP_TEMPLATES)[number];

export type WhatsAppSettings = {
  /** Latchkey's shared WhatsApp number (E.164), used until a business connects its own. */
  sender: string | null;
  /** Twilio Content template ids (HX…), one per message. */
  templates: Record<WhatsAppTemplateKey, string | null>;
};

const e164 = (v: unknown): string | null =>
  typeof v === "string" && /^\+[1-9]\d{7,14}$/.test(v.trim()) ? v.trim() : null;

const contentSid = (v: unknown): string | null =>
  typeof v === "string" && /^HX[0-9a-f]{32}$/i.test(v.trim()) ? v.trim() : null;

export function normaliseWhatsApp(raw: unknown, envSender: string | null = null): WhatsAppSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const t = (r["templates"] && typeof r["templates"] === "object" ? r["templates"] : {}) as Record<
    string,
    unknown
  >;
  return {
    sender: e164(r["sender"]) ?? e164(envSender?.replace(/^whatsapp:/, "")),
    templates: Object.fromEntries(WHATSAPP_TEMPLATES.map((k) => [k, contentSid(t[k])])) as Record<
      WhatsAppTemplateKey,
      string | null
    >,
  };
}

/* -------------------- each property's welcome and goodbye -------------------- */

export type PhoneRoute = "auto" | "sms" | "whatsapp" | "none";

export type MessageChoice = {
  on: boolean;
  /** Property time on the day (arrival or check-out), HH:MM. */
  time: string;
  /** With {name}, {property}, {guide}, {checkin}, {checkout}, {room}, {book}. */
  text: string;
};

export type GuestMessagesSettings = {
  welcome: MessageChoice;
  goodbye: MessageChoice;
  /** By phone: WhatsApp when it's set up (else a text), a text only, WhatsApp only, or not at all. */
  phone: PhoneRoute;
  /** Also by email, when the guest gave their own address (never a booking site's relay). */
  email: boolean;
  /** WhatsApp and email only: one of the guide's attached files (a PDF or photo) with the welcome. */
  attachmentId: string | null;
};

export const DEFAULT_WELCOME =
  "Hi {name}, welcome to {property}! Check-in from {checkin}. Wi-Fi, getting in and more: {guide}";
export const DEFAULT_GOODBYE =
  "Thank you for staying at {property}, {name}. Check-out is by {checkout}. Safe travels, and book direct next time: {book}";

export const DEFAULT_GUEST_MESSAGES: GuestMessagesSettings = {
  welcome: { on: false, time: "12:00", text: DEFAULT_WELCOME },
  goodbye: { on: false, time: "08:00", text: DEFAULT_GOODBYE },
  phone: "auto",
  email: true,
  attachmentId: null,
};

const hhmm = (v: unknown, d: string) =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d;
const txt = (v: unknown, d: string) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 600) : d;

function choice(raw: unknown, d: MessageChoice): MessageChoice {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    on: typeof r["on"] === "boolean" ? r["on"] : d.on,
    time: hhmm(r["time"], d.time),
    text: txt(r["text"], d.text),
  };
}

export function normaliseGuestMessages(raw: unknown): GuestMessagesSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const phone = r["phone"];
  const att = r["attachmentId"];
  return {
    welcome: choice(r["welcome"], DEFAULT_GUEST_MESSAGES.welcome),
    goodbye: choice(r["goodbye"], DEFAULT_GUEST_MESSAGES.goodbye),
    phone:
      phone === "auto" || phone === "sms" || phone === "whatsapp" || phone === "none"
        ? phone
        : "auto",
    email: typeof r["email"] === "boolean" ? r["email"] : true,
    attachmentId:
      typeof att === "string" && /^[0-9a-f-]{36}$/i.test(att) ? att.toLowerCase() : null,
  };
}

export type MessageVars = {
  name: string;
  property: string;
  guide: string;
  checkin: string;
  checkout: string;
  room: string;
  book: string;
};

/** The words with the guest's details in; anything unknown is left out cleanly. */
export function fillMessage(template: string, v: Partial<MessageVars>): string {
  return template
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k as keyof MessageVars] ?? "") : m))
    .replace(/\{\w+\}/g, "")
    .replace(/ +([,.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Characters only GSM-7 texts carry; anything else (emoji, curly quotes) makes it a 70-character text. */
const GSM =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";

/** How a text goes out: its length, how many parts it's billed as, and whether it uses unicode. */
export function smsInfo(text: string): { chars: number; parts: number; unicode: boolean } {
  const unicode = [...text].some((c) => !GSM.includes(c) && !GSM_EXT.includes(c));
  const chars = unicode
    ? [...text].length
    : [...text].reduce((n, c) => n + (GSM_EXT.includes(c) ? 2 : 1), 0);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const parts = chars === 0 ? 0 : chars <= single ? 1 : Math.ceil(chars / multi);
  return { chars, parts, unicode };
}

/** A typical short link's length (https://…/g/three-words-here), for the length shown while writing. */
export const SAMPLE_VARS = (property: string, origin: string): MessageVars => ({
  name: "Alex",
  property,
  guide: `${origin}/g/maple-river-stone`,
  checkin: "15:00",
  checkout: "11:00",
  room: "Room 2",
  book: `${origin}/book/yours`,
});

/** Booking sites' relay addresses: Booking.com only passes on mail from the host's registered address, so we don't use them. */
export function realEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return false;
  const domain = e.split("@")[1]!;
  return !/(^|\.)guest\.booking\.com$|(^|\.)guest\.airbnb\.com$|(^|\.)messages\.homeaway\.com$|(^|\.)expediapartnercentral\.com$|(^|\.)m\.expediapartnercentral\.com$/.test(
    domain,
  );
}

/** Which phone route a message takes now. */
export function phoneChannel(
  route: PhoneRoute,
  have: { sms: boolean; whatsapp: boolean },
): "sms" | "whatsapp" | null {
  if (route === "none") return null;
  if (route === "sms") return have.sms ? "sms" : null;
  if (route === "whatsapp") return have.whatsapp ? "whatsapp" : null;
  return have.whatsapp ? "whatsapp" : have.sms ? "sms" : null;
}

export type DueStay = {
  id: string;
  status: string;
  guest_full_name: string | null;
  check_in_date: string;
  check_out_date: string;
  welcome_message_at: string | null;
  goodbye_message_at: string | null;
};

const LIVE = new Set(["upcoming", "needs_details", "checked_in", "staying"]);

/**
 * Which messages are due for a stay now: the welcome on arrival day from
 * its time, the goodbye on check-out day from its time; each once, only
 * for a named stay that isn't cancelled or closed, and never late (a
 * welcome isn't sent after the day it was for).
 */
export function dueMessages(
  s: GuestMessagesSettings,
  stay: DueStay,
  local: { date: string; time: string },
): Array<"welcome" | "goodbye"> {
  if (!stay.guest_full_name?.trim()) return [];
  const out: Array<"welcome" | "goodbye"> = [];
  if (
    s.welcome.on &&
    !stay.welcome_message_at &&
    stay.check_in_date === local.date &&
    local.time >= s.welcome.time &&
    LIVE.has(stay.status)
  )
    out.push("welcome");
  if (
    s.goodbye.on &&
    !stay.goodbye_message_at &&
    stay.check_out_date === local.date &&
    local.time >= s.goodbye.time &&
    (LIVE.has(stay.status) || stay.status === "checked_out")
  )
    out.push("goodbye");
  return out;
}
