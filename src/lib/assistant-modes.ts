/**
 * How the two assistants work, set by Latchkey admin (site_settings.integrations.aiModes):
 * - "full": the language model answers (receptionist) or picks what a guest meant when the
 *   rules can't tell (door tablet voice concierge).
 * - "assisted": no language model at all. The receptionist matches the question to a part of the
 *   guide by its words (matchTopic), opens it and says a recorded phrase; the concierge keeps to
 *   its own rules. Listening still works (the browser's own, else the studio voices service).
 * Pure; tested in tests/assistant-modes.test.ts.
 */

export type AiMode = "assisted" | "full";
export type AiModes = { concierge: AiMode; receptionist: AiMode };

export const DEFAULT_AI_MODES: AiModes = { concierge: "full", receptionist: "full" };

export function normaliseAiModes(raw: unknown): AiModes {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (v: unknown, d: AiMode): AiMode => (v === "assisted" || v === "full" ? v : d);
  return {
    concierge: pick(r["concierge"], DEFAULT_AI_MODES.concierge),
    receptionist: pick(r["receptionist"], DEFAULT_AI_MODES.receptionist),
  };
}

/** Words that point to each part of the guide (built-in sections and the extra cards). */
export const TOPIC_WORDS: Record<string, string[]> = {
  "stay-wifi": ["wifi", "wi fi", "internet", "network", "password", "broadband", "online"],
  getting_in: [
    "get in",
    "door",
    "front door",
    "key",
    "keys",
    "code",
    "lock",
    "entry",
    "keypad",
    "access",
  ],
  shoes: ["shoes", "shoe", "bags", "luggage"],
  room: [
    "my room",
    "bedding",
    "sheets",
    "pillow",
    "blanket",
    "lights",
    "light",
    "heating",
    "radiator",
    "tv",
    "television",
  ],
  kitchenette: [
    "kitchen",
    "kitchenette",
    "cook",
    "cooking",
    "fridge",
    "microwave",
    "kettle",
    "food storage",
    "washing up",
    "dishes",
  ],
  bathroom: ["bathroom", "shower", "hot water", "towel", "towels", "toilet", "bath"],
  parking: ["park", "parking", "car", "permit"],
  taxis: ["taxi", "taxis", "cab", "uber", "station"],
  rules: ["rules", "smoking", "smoke", "pets", "pet", "visitors", "guests allowed", "party"],
  quiet: ["quiet", "noise", "noisy", "loud", "music"],
  unavailable: [
    "cleaning",
    "cleaner",
    "closed",
    "unavailable",
    "timings",
    "house timings",
    "hours",
  ],
  checkout: ["check out", "checkout", "leave", "leaving", "departure", "depart", "late check out"],
  contact: ["host", "contact", "phone", "call", "emergency", "help", "owner", "manager"],
  find_room: [
    "find my room",
    "where is my room",
    "way to my room",
    "which room",
    "directions",
    "which floor",
  ],
  house: [
    "where is",
    "where's",
    "floor plan",
    "plan",
    "stairs",
    "lift",
    "toilet",
    "laundry",
    "washing machine",
    "iron",
    "fire",
    "first aid",
    "bins",
    "thermostat",
    "fuse",
  ],
  property_info: [
    "information",
    "info",
    "appliance",
    "how do i use",
    "instructions",
    "manual",
    "boiler",
  ],
  local: [
    "restaurant",
    "restaurants",
    "eat",
    "food",
    "cafe",
    "coffee",
    "pub",
    "bar",
    "drink",
    "shop",
    "shops",
    "supermarket",
    "things to do",
    "events",
    "whats on",
    "what's on",
    "nearby",
    "near by",
    "around here",
    "museum",
    "park",
  ],
};

const norm = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "is",
  "my",
  "your",
  "how",
  "what",
  "where",
  "can",
  "i",
  "do",
  "it",
]);

/**
 * The part of the guide a question is about, among the ones on this page (`topics`), or null.
 * Phrase matches score by length (more specific first); a section's own title words count too,
 * so a host's own sections can be found.
 */
export function matchTopic(
  question: string,
  topics: Array<{ key: string; title: string }>,
): string | null {
  const q = norm(question);
  let best: { key: string; score: number } | null = null;
  for (const t of topics) {
    let score = 0;
    for (const w of TOPIC_WORDS[t.key] ?? [])
      if (q.includes(norm(w))) score += 2 + norm(w).length / 10;
    for (const w of norm(t.title).trim().split(" "))
      if (w.length > 2 && !STOP.has(w) && q.includes(` ${w} `)) score += 1.5;
    if (score > 0 && (!best || score > best.score)) best = { key: t.key, score };
  }
  return best?.key ?? null;
}
