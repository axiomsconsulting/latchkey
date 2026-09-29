/**
 * Stay guide: sections, merging house + room content, basic vs detailed,
 * the "things people usually forget" card and link validity. Pure and tested.
 */

import { addDays, dayOfWeek, zonedParts } from "./dates";

export type SectionKey =
  | "getting_in" | "shoes" | "room" | "kitchenette" | "bathroom" | "parking"
  | "taxis" | "rules" | "quiet" | "unavailable" | "checkout" | "contact";

export const SECTIONS: { key: SectionKey; title: string; hint: string }[] = [
  { key: "getting_in", title: "Getting in", hint: "How to open the front door and use the lock. Add photos of the keypad." },
  { key: "shoes", title: "Shoes and entry", hint: "Where to leave shoes and bags when you come in." },
  { key: "room", title: "Your room", hint: "Which door, lights, heating controls, where spare bedding is." },
  { key: "kitchenette", title: "Kitchenette", hint: "What guests can use, labelling food, washing up." },
  { key: "bathroom", title: "Bathroom and hot water", hint: "Shower controls, how long hot water takes, towels." },
  { key: "parking", title: "Parking", hint: "Where to park, permits, where not to park." },
  { key: "taxis", title: "Local taxis", hint: "Two or three local firms with phone numbers, and the usual fare to the station." },
  { key: "rules", title: "House rules", hint: "Smoking, guests, pets, the shared spaces." },
  { key: "quiet", title: "Quiet hours", hint: "Anything to add to your quiet hours." },
  { key: "unavailable", title: "Times the house is unavailable", hint: "Cleaning windows when rooms or shared spaces are closed." },
  { key: "checkout", title: "Check-out time and steps", hint: "What to do before leaving: keys, bins, windows." },
  { key: "contact", title: "Host contact", hint: "When and how to reach you, and what counts as an emergency." },
];

export type GuideStep = { heading: string; body: string | null; imageUrl: string | null };
export type StoredSection = {
  roomId: string | null;
  sectionKey: SectionKey;
  summary: string | null;
  steps: GuideStep[];
  /** Host has pinned this to the "things people usually forget" card. */
  pinned?: boolean;
  /** Host's own ordering; lower shows first. */
  sortOrder?: number;
};

export type GuideFacts = {
  wifiName: string | null;
  wifiPassword: string | null;
  quietStart: string; // HH:MM
  quietEnd: string;
  checkOutTime: string;
  checkOutDateLabel: string;
  parkingNotes: string | null;
  hostName: string | null;
  hostPhone: string | null;
  roomName: string | null;
  unavailableLines: string[];
};

export type GuideSection = { key: SectionKey; title: string; summary: string | null; steps: GuideStep[]; pinned: boolean };

/** One-line facts used when the host hasn't written a summary. */
export function autoSummary(key: SectionKey, f: GuideFacts): string | null {
  switch (key) {
    case "quiet": return `Please keep noise down between ${f.quietStart} and ${f.quietEnd}.`;
    case "checkout": return `Check-out is by ${f.checkOutTime} on ${f.checkOutDateLabel}.`;
    case "parking": return f.parkingNotes;
    case "room": return f.roomName ? `You're staying in ${f.roomName}.` : null;
    case "shoes": return "Please take your shoes off at the front door.";
    case "contact":
      return f.hostPhone ? `${f.hostName ? `${f.hostName}: ` : ""}${f.hostPhone}` : null;
    case "unavailable":
      return f.unavailableLines.length ? f.unavailableLines.join(" · ") : null;
    default: return null;
  }
}

/**
 * Room sections replace house sections with the same key. Basic mode keeps
 * one short text per section and drops steps and photos. Sections come back
 * in the host's own order, with anything they haven't ordered keeping the
 * standard running order.
 */
export function buildGuide(stored: StoredSection[], roomId: string | null, mode: "basic" | "detailed", facts: GuideFacts): GuideSection[] {
  const out: (GuideSection & { order: number })[] = [];
  SECTIONS.forEach((s, i) => {
    const room = roomId ? stored.find((x) => x.roomId === roomId && x.sectionKey === s.key) : undefined;
    const house = stored.find((x) => x.roomId === null && x.sectionKey === s.key);
    const src = room ?? house;
    const summary = src?.summary?.trim() || autoSummary(s.key, facts);
    const steps = mode === "detailed" ? (src?.steps ?? []).filter((st) => st.heading.trim() || st.body?.trim()) : [];
    if (!summary && steps.length === 0) return;
    // Pinning and ordering are set once for the whole house, so a room's own
    // wording doesn't quietly unpin a reminder.
    const meta = house ?? room;
    const order = meta?.sortOrder && meta.sortOrder > 0 ? meta.sortOrder : 100 + i;
    out.push({ key: s.key, title: s.title, summary, steps, pinned: meta?.pinned === true, order });
  });
  out.sort((a, b) => a.order - b.order);
  return out.map(({ order: _order, ...rest }) => rest);
}

export type Window = {
  room_id: string | null;
  reason: string | null;
  starts_at: string | null;
  ends_at: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
};

/** Unavailability windows affecting this room on a given local date, as text. */
export function windowsOn(windows: Window[], roomId: string | null, date: string, tz: string): string[] {
  const dow = dayOfWeek(date);
  const lines: string[] = [];
  for (const w of windows) {
    if (w.room_id && w.room_id !== roomId) continue;
    const what = w.reason || (w.room_id ? "Room cleaning" : "House cleaning");
    if (w.day_of_week !== null && w.day_of_week === dow && w.start_time && w.end_time) {
      lines.push(`${what} ${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)}`);
    } else if (w.starts_at && w.ends_at) {
      const s = zonedParts(new Date(w.starts_at), tz);
      const e = zonedParts(new Date(w.ends_at), tz);
      if (s.date <= date && e.date >= date) {
        const from = s.date === date ? s.time : "00:00";
        const to = e.date === date ? e.time : "23:59";
        lines.push(`${what} ${from}–${to}`);
      }
    }
  }
  return lines;
}

/** Weekly windows as readable lines for the "unavailable" section. */
export function weeklyLines(windows: Window[], roomId: string | null): string[] {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return windows
    .filter((w) => w.day_of_week !== null && (!w.room_id || w.room_id === roomId) && w.start_time && w.end_time)
    .map((w) => `${days[w.day_of_week!]} ${w.start_time!.slice(0, 5)}–${w.end_time!.slice(0, 5)}${w.reason ? ` (${w.reason})` : ""}`);
}

export type ForgetItem = { key: SectionKey | "today"; text: string };

/** Pinned when the host hasn't chosen anything yet. */
export const DEFAULT_PINNED: SectionKey[] = ["quiet", "shoes", "checkout"];

/**
 * The "things people usually forget" card is built from the sections the host
 * has pinned, so it never repeats what's already in the list below: the stay
 * page shows pinned sections here and unpinned ones underneath. Until a host
 * pins anything, quiet hours, shoes and check-out stand in.
 */
export function forgetCard(sections: GuideSection[], todayWindows: string[]): ForgetItem[] {
  const chosen = sections.filter((s) => s.pinned);
  const source = chosen.length ? chosen : sections.filter((s) => DEFAULT_PINNED.includes(s.key));
  const items: ForgetItem[] = source
    .map((s) => ({ key: s.key, text: (s.summary?.trim() || s.title) }))
    .filter((i) => i.text.length > 0);
  for (const t of todayWindows) items.push({ key: "today", text: `Today: ${t}` });
  return items;
}

/** Which sections the reminder card is currently showing. */
export function pinnedKeys(sections: GuideSection[]): SectionKey[] {
  const chosen = sections.filter((s) => s.pinned).map((s) => s.key);
  return chosen.length ? chosen : sections.filter((s) => DEFAULT_PINNED.includes(s.key)).map((s) => s.key);
}

/** UTC instant for a local date + time in a timezone. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const guess = new Date(`${date}T${time.slice(0, 5)}:00Z`);
  const p = zonedParts(guess, tz);
  const shown = Date.parse(`${p.date}T${p.time}:00Z`);
  return new Date(guess.getTime() - (shown - guess.getTime()));
}

/**
 * Guide link window: opens 48 hours before midnight on arrival day, door
 * details unlock at local midnight on arrival day, the stay becomes read-only
 * at check-out time and the link closes 24 hours after check-out.
 */
export function guideWindow(checkIn: string, checkOut: string, checkOutTime: string, tz: string) {
  const doorOpensAt = zonedToUtc(checkIn, "00:00", tz);
  const checkOutAt = zonedToUtc(checkOut, checkOutTime, tz);
  return {
    validFrom: new Date(doorOpensAt.getTime() - 48 * 3600_000),
    doorOpensAt,
    readOnlyAt: checkOutAt,
    expiresAt: new Date(checkOutAt.getTime() + 24 * 3600_000),
  };
}

/** Sections that give away how to get in; hidden until door details unlock. */
export const DOOR_SECTIONS: SectionKey[] = ["getting_in"];

export { addDays };

/** Starter text for The Trinity Rooms style homes. Marked so hosts replace it. */
export const STARTER: Record<SectionKey, { summary: string; steps: { heading: string; body: string }[] }> = {
  getting_in: {
    summary: "The front door has a keypad lock. Your code is on your check-in screen.",
    steps: [
      { heading: "Find the keypad", body: "It's on the right of the front door, under the porch light." },
      { heading: "Enter your code", body: "Press the Latchkey logo to wake it, type your code, then press the tick. Wait for the green light." },
      { heading: "Close behind you", body: "The door locks itself. Push until you hear the click." },
    ],
  },
  shoes: { summary: "Shoes off in the hallway, please.", steps: [{ heading: "Shoe rack", body: "Use the rack to the left of the door. Slippers are in the basket." }] },
  room: { summary: "Your room door is labelled with its number.", steps: [{ heading: "Heating", body: "The radiator dial goes from 1 (low) to 5 (high)." }, { heading: "Spare bedding", body: "In the top of the wardrobe." }] },
  kitchenette: { summary: "Shared kitchenette on the ground floor: kettle, microwave and fridge.", steps: [{ heading: "Fridge", body: "Label your food with your room number. The top shelf is yours." }, { heading: "Washing up", body: "Please wash, dry and put away anything you use." }] },
  bathroom: { summary: "Hot water takes about a minute to come through.", steps: [{ heading: "Shower", body: "Turn the left dial for power and the right dial for temperature." }] },
  parking: { summary: "Free on-street parking on Amersham Hill.", steps: [] },
  taxis: {
    summary: "Local firms are quicker than an app here, especially late at night.",
    steps: [
      { heading: "Booking ahead", body: "For an early train, book the night before. Cars are scarce before 6am." },
      { heading: "To the station", body: "High Wycombe station is about five minutes by car." },
      { heading: "Replace these details", body: "Add two or three local firms with their phone numbers and the usual fare." },
    ],
  },
  rules: { summary: "No smoking anywhere indoors. No visitors after 10pm.", steps: [] },
  quiet: { summary: "", steps: [] },
  unavailable: { summary: "", steps: [] },
  checkout: { summary: "", steps: [{ heading: "Before you go", body: "Strip the bed, leave used towels in the bath and close the window." }, { heading: "Leaving", body: "Pull the front door shut behind you. No need to find us." }] },
  contact: { summary: "", steps: [{ heading: "Emergencies", body: "For a leak, no heating or being locked out, call any time." }] },
};
