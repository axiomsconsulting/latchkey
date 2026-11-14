/**
 * The AI receptionist (properties.receptionist, kiosk_devices.receptionist, migration 0110): a
 * conversation, by voice or text, that answers guests' questions about their stay from what the
 * host has written (guide, property information, around here, the way to their room), on the
 * door tablets the host picks and, if the host allows, on guests' own phones (stay guide, room
 * guide, check-in on their phone). Pro, and switched on by Latchkey admin (routine
 * "ai_receptionist"). The host decides what it talks about and how much. It never says door
 * codes, never makes things up, and on a shared tablet never reads out the Wi-Fi password. Pure;
 * tested in tests/receptionist.test.ts.
 */
import { matchTopic } from "./assistant-modes";
import { PHRASES } from "./voice-concierge";

export type Topic =
  | "times"
  | "wifi"
  | "room"
  | "directions"
  | "rules"
  | "info"
  | "guide"
  | "local"
  | "extras"
  | "checkout";

export const TOPICS: Topic[] = [
  "times",
  "wifi",
  "room",
  "directions",
  "rules",
  "info",
  "guide",
  "local",
  "extras",
  "checkout",
];

export type Detail = "brief" | "normal" | "detailed";

export type Receptionist = {
  on: boolean;
  /** Also on guests' own phones (stay guide, room guide, check-in on their phone). */
  guestPhones: boolean;
  /** The voice: always the host's choice, or the other voice from the guest's ID (female greets male guests and male greets female guests). */
  voiceMatch: "opposite" | "fixed";
  /** The voice when there's no ID yet (or it says X). */
  voice: "female" | "male";
  topics: Record<Topic, boolean>;
  detail: Detail;
  /** The receptionist's name, said in its greeting (optional). */
  name: string;
  /** The host's own instructions: what to always mention, what not to discuss. */
  notes: string;
};

export const DEFAULT_RECEPTIONIST: Receptionist = {
  on: false,
  guestPhones: true,
  voiceMatch: "opposite",
  voice: "female",
  topics: Object.fromEntries(TOPICS.map((t) => [t, true])) as Record<Topic, boolean>,
  detail: "normal",
  name: "",
  notes: "",
};

const text = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        // eslint-disable-next-line no-control-regex -- strips control characters except new lines
        .replace(/[\u0000-\u0009\u000b-\u001f<>]/g, "")
        .trim()
        .slice(0, max)
    : "";

export function normaliseReceptionist(raw: unknown): Receptionist {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const t = (r["topics"] && typeof r["topics"] === "object" ? r["topics"] : {}) as Record<
    string,
    unknown
  >;
  return {
    on: r["on"] === true,
    guestPhones: r["guestPhones"] !== false,
    voiceMatch: r["voiceMatch"] === "fixed" ? "fixed" : "opposite",
    voice: r["voice"] === "male" ? "male" : "female",
    topics: Object.fromEntries(TOPICS.map((k) => [k, t[k] !== false])) as Record<Topic, boolean>,
    detail: r["detail"] === "brief" || r["detail"] === "detailed" ? r["detail"] : "normal",
    name: text(r["name"], 30),
    notes: text(r["notes"], 1000),
  };
}

/**
 * Which voice answers this guest: with "opposite", a female voice for an ID marked M and a male
 * voice for F (the host's own choice of matching); otherwise, or with no ID yet or X, the host's voice.
 */
export function voiceForGuest(
  s: Pick<Receptionist, "voiceMatch" | "voice">,
  sex: "M" | "F" | "X" | null | undefined,
): "female" | "male" {
  if (s.voiceMatch !== "opposite") return s.voice;
  if (sex === "M") return "female";
  if (sex === "F") return "male";
  return s.voice;
}

/** Where the receptionist is talking. */

export type Surface = "tablet" | "phone";

/** What it knows about the property and (when known) the guest's stay, as labelled parts. */
export type Knowledge = {
  property: string;
  guestName?: string | null;
  room?: string | null;
  times?: string | null;
  wifi?: { name: string | null; password: string | null } | null;
  directions?: string[] | null;
  /** Shared spaces, private areas, where the thermostat and such are (floor maps). */
  house?: string | null;
  rules?: string | null;
  info?: string | null;
  guide?: Array<{ key: string; title: string; text: string }>;
  local?: string | null;
  extras?: string | null;
  checkout?: string | null;
};

const LENGTH: Record<Detail, string> = {
  brief: "Answer in one or two short sentences.",
  normal: "Answer in at most three sentences.",
  detailed: "Answer fully but stay under six sentences.",
};

/**
 * The receptionist's instructions: who it is, the rules it keeps, and only what the host lets it
 * talk about. Door codes are never in it. On a shared tablet the Wi-Fi password isn't either.
 */
export function briefFor(k: Knowledge, s: Receptionist, surface: Surface): string {
  const on = s.topics;
  const parts: string[] = [
    `You are ${s.name ? `${s.name}, ` : ""}the receptionist for ${k.property}, helping a guest ${surface === "tablet" ? "at the door tablet in the entrance" : "on their own phone"}.`,
    "Be warm, plain and short; speak as a person at a front desk would. Use British English.",
    LENGTH[s.detail],
    "Only use the facts below. If the answer isn't there, say you don't know and suggest messaging the host. Never invent times, prices, rules or places.",
    "Never give door codes, key safe codes or PINs: say they're shown in the guest's guide once it's time.",
    "Don't discuss other guests, payments for other stays, or anything about the host's private life.",
    "If a section of the guide, the property information or around here would help, set open to its key so the guest's screen opens it.",
  ];
  if (k.guestName) parts.push(`The guest's first name is ${k.guestName}.`);
  if (on.room && k.room) parts.push(`Their room: ${k.room}.`);
  if (on.times && k.times) parts.push(`Times: ${k.times}`);
  if (on.wifi && k.wifi?.name)
    parts.push(
      surface === "tablet"
        ? `Wi-Fi network: ${k.wifi.name}. The password is in the guest's guide on their phone; don't read it out here.`
        : `Wi-Fi network: ${k.wifi.name}${k.wifi.password ? `, password ${k.wifi.password}` : " (the password is shown once they've checked in)"}.`,
    );
  if (on.directions && k.directions?.length)
    parts.push(`The way to their room: ${k.directions.join(" ")}`);
  if (on.info && k.house)
    parts.push(
      `Around the house (from the host's floor plans; open key house). Never send a guest into a private area:\n${k.house}`,
    );
  if (on.rules && k.rules) parts.push(`House rules: ${k.rules}`);
  if (on.info && k.info) parts.push(`Property information (open key property_info):\n${k.info}`);
  if (on.guide && k.guide?.length)
    parts.push(
      `Guide sections (open key in brackets):\n${k.guide.map((g) => `[${g.key}] ${g.title}: ${g.text}`).join("\n")}`,
    );
  if (on.local && k.local) parts.push(`Around here (open key local):\n${k.local}`);
  if (on.extras && k.extras) parts.push(`Extras they can order in their guide: ${k.extras}`);
  if (on.checkout && k.checkout) parts.push(`Check-out: ${k.checkout}`);
  if (s.notes) parts.push(`The host's instructions: ${s.notes}`);
  return parts.join("\n\n").slice(0, 24_000);
}

/** What the screen may open for the guest: a guide section, or one of the extra cards. */
export function openKeys(k: Knowledge): string[] {
  return [
    ...(k.guide ?? []).map((g) => g.key),
    ...(k.info ? ["property_info"] : []),
    ...(k.local ? ["local"] : []),
    ...(k.directions?.length ? ["find_room"] : []),
    ...(k.house ? ["house"] : []),
  ];
}

/** The model's answer, made safe: plain text, and an open key only if it's one we offered. */
export function readAnswer(
  raw: unknown,
  allowed: string[],
): { reply: string; open: string | null } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // A belt-and-braces guard: an answer mentioning a code never carries a number that could be one.
  const said = text(r["reply"], 1200);
  const reply = /\b(code|pin|key ?safe|keypad|passcode)\b/i.test(said)
    ? said.replace(/\b\d{3,8}\b#?/g, "••••")
    : said;
  const open = typeof r["open"] === "string" && allowed.includes(r["open"]) ? r["open"] : null;
  return { reply: reply || "Sorry, I didn't catch that. Could you ask again?", open };
}

/** The guest's question and the last few turns, trimmed (the model only needs a little history). */
export function trimHistory(
  history: Array<{ role: "guest" | "receptionist"; text: string }>,
  max = 8,
): Array<{ role: "guest" | "receptionist"; text: string }> {
  return history
    .filter((h) => (h.role === "guest" || h.role === "receptionist") && typeof h.text === "string")
    .slice(-max)
    .map((h) => ({ role: h.role, text: h.text.slice(0, 600) }));
}

/** How the receptionist says hello. */
export function greeting(s: Receptionist, property: string, firstName?: string | null): string {
  const who = s.name ? `I'm ${s.name}, ` : "";
  return `Hello${firstName ? ` ${firstName}` : ""}, welcome to ${property}. ${who}${s.name ? "the" : "I'm the"} receptionist here: ask me anything about your stay.`;
}

/** A guest may ask this many questions a minute (per stay or tablet). */
export const ASKS_PER_MINUTE = 12;

/** The titles of the parts of the guide the receptionist can open, for assisted answers. */
export function openTopics(k: Knowledge, wifi: boolean): Array<{ key: string; title: string }> {
  const extra: Record<string, string> = {
    property_info: "Property information",
    local: "Around here",
    find_room: "Finding your room",
    house: "Around the house",
  };
  return [
    ...(wifi && k.wifi?.name ? [{ key: "stay-wifi", title: "Wi-Fi" }] : []),
    ...openKeys(k).map((key) => ({
      key,
      title: k.guide?.find((g) => g.key === key)?.title ?? extra[key] ?? key,
    })),
  ];
}

/**
 * Assisted mode: no AI. The question's words pick the part of the guide (matchTopic); the reply
 * is a recorded phrase (rcHere / rcNotFound), with the part's name shown.
 */
export function assistedAnswer(
  k: Knowledge,
  question: string,
  wifi: boolean,
): { reply: string; open: string | null; phrase: "rcHere" | "rcNotFound" } {
  const topics = openTopics(k, wifi);
  const key = matchTopic(question, topics);
  if (!key) return { reply: PHRASES.rcNotFound, open: null, phrase: "rcNotFound" };
  const title = topics.find((t) => t.key === key)?.title ?? "";
  return { reply: `${PHRASES.rcHere} (${title})`, open: key, phrase: "rcHere" };
}
