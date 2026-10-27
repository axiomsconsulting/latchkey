/**
 * Stay guide: sections, merging house + room content, basic vs detailed,
 * the "things people usually forget" card and link validity. Pure and tested.
 */

import { addDays, dayOfWeek, zonedParts } from "./dates";

export type BuiltInKey =
  | "getting_in"
  | "shoes"
  | "room"
  | "kitchenette"
  | "bathroom"
  | "parking"
  | "taxis"
  | "rules"
  | "quiet"
  | "unavailable"
  | "checkout"
  | "contact";
/** Built-in sections, or the host's own ("custom_" + a random id, titled by the host). */
export type SectionKey = BuiltInKey | `custom_${string}`;

export const isCustom = (key: string): key is `custom_${string}` =>
  /^custom_[a-z0-9]{6,20}$/.test(key);

export const SECTIONS: { key: BuiltInKey; title: string; hint: string }[] = [
  {
    key: "getting_in",
    title: "Getting in",
    hint: "How to open the front door and use the lock. Add photos of the keypad.",
  },
  {
    key: "shoes",
    title: "Shoes and entry",
    hint: "Where to leave shoes and bags when you come in.",
  },
  {
    key: "room",
    title: "Your room",
    hint: "Which door, lights, heating controls, where spare bedding is.",
  },
  {
    key: "kitchenette",
    title: "Kitchenette",
    hint: "What guests can use, labelling food, washing up.",
  },
  {
    key: "bathroom",
    title: "Bathroom and hot water",
    hint: "Shower controls, how long hot water takes, towels.",
  },
  { key: "parking", title: "Parking", hint: "Where to park, permits, where not to park." },
  {
    key: "taxis",
    title: "Local taxis",
    hint: "Two or three local firms with phone numbers, and the usual fare to the station.",
  },
  { key: "rules", title: "House rules", hint: "Smoking, guests, pets, the shared spaces." },
  { key: "quiet", title: "Quiet hours", hint: "Anything to add to your quiet hours." },
  {
    key: "unavailable",
    title: "Times the house is unavailable",
    hint: "Cleaning windows when rooms or shared spaces are closed.",
  },
  {
    key: "checkout",
    title: "Check-out time and steps",
    hint: "What to do before leaving: keys, bins, windows.",
  },
  {
    key: "contact",
    title: "Host contact",
    hint: "When and how to reach you, and what counts as an emergency.",
  },
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
  /** The section's title (the host's own words for their own sections). */
  title?: string | null;
  /** False when the host removed the section from the guide. */
  published?: boolean;
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

export type GuideSection = {
  key: SectionKey;
  title: string;
  summary: string | null;
  steps: GuideStep[];
  pinned: boolean;
};

/** One-line facts used when the host hasn't written a summary. */
export function autoSummary(key: SectionKey, f: GuideFacts): string | null {
  switch (key) {
    case "quiet":
      return `Please keep noise down between ${f.quietStart} and ${f.quietEnd}.`;
    case "checkout":
      return `Check-out is by ${f.checkOutTime} on ${f.checkOutDateLabel}.`;
    case "parking":
      return f.parkingNotes;
    case "room":
      return f.roomName ? `You're staying in ${f.roomName}.` : null;
    case "shoes":
      return "Please take your shoes off at the front door.";
    case "contact":
      return f.hostPhone ? `${f.hostName ? `${f.hostName}: ` : ""}${f.hostPhone}` : null;
    case "unavailable":
      return f.unavailableLines.length ? f.unavailableLines.join(" · ") : null;
    default:
      return null;
  }
}

/**
 * Room sections replace house sections with the same key. Basic mode keeps
 * one short text per section and drops steps and photos. Sections come back
 * in the host's own order, with anything they haven't ordered keeping the
 * standard running order.
 */
export function buildGuide(
  stored: StoredSection[],
  roomId: string | null,
  mode: "basic" | "detailed",
  facts: GuideFacts,
  /** Starter sections this host didn't start with (startersOffFor). */
  startersOff: readonly string[] = [],
  /** Sections with photos or documents attached: shown even with nothing written. */
  withFiles: readonly string[] = [],
): GuideSection[] {
  const out: (GuideSection & { order: number })[] = [];
  const add = (key: SectionKey, title: string, i: number) => {
    const room = roomId
      ? stored.find((x) => x.roomId === roomId && x.sectionKey === key)
      : undefined;
    const house = stored.find((x) => x.roomId === null && x.sectionKey === key);
    // Removed by the host: left out, even where Latchkey could fill it in.
    if (house?.published === false) return;
    // A starter this host never had, unless they've added it themselves.
    if (!house && !isCustom(key) && startersOff.includes(key)) return;
    const src = room ?? house;
    const summary = src?.summary?.trim() || (isCustom(key) ? null : autoSummary(key, facts));
    const steps =
      mode === "detailed"
        ? (src?.steps ?? []).filter((st) => st.heading.trim() || st.body?.trim())
        : [];
    if (!summary && steps.length === 0 && !withFiles.includes(key)) return;
    // Pinning and ordering are set once for the whole house, so a room's own
    // wording doesn't quietly unpin a reminder.
    const meta = house ?? room;
    const order = meta?.sortOrder && meta.sortOrder > 0 ? meta.sortOrder : 100 + i;
    out.push({ key, title, summary, steps, pinned: meta?.pinned === true, order });
  };
  SECTIONS.forEach((s, i) => add(s.key, s.title, i));
  // The host's own sections, titled in their words.
  stored
    .filter((x) => x.roomId === null && isCustom(x.sectionKey))
    .forEach((x, i) =>
      add(x.sectionKey, x.title?.trim() || "More information", SECTIONS.length + i),
    );
  out.sort((a, b) => a.order - b.order);
  return out.map(({ order: _order, ...rest }) => rest);
}

export type EditorSection = {
  key: SectionKey;
  title: string;
  hint: string;
  custom: boolean;
  /** Removed from the guide (built-ins can be added back). */
  removed: boolean;
};

/**
 * The editor's list: every section in the host's running order, their own
 * sections included, with removed ones set apart so they can be added back.
 */
export function editorSections(
  stored: StoredSection[],
  startersOff: readonly string[] = [],
): { shown: EditorSection[]; removed: EditorSection[] } {
  const house = (key: string) => stored.find((x) => x.roomId === null && x.sectionKey === key);
  const all = [
    ...SECTIONS.map((s, i) => ({
      key: s.key as SectionKey,
      title: s.title,
      hint: s.hint,
      custom: false,
      i,
    })),
    ...stored
      .filter((x) => x.roomId === null && isCustom(x.sectionKey))
      .map((x, i) => ({
        key: x.sectionKey,
        title: x.title?.trim() || "More information",
        hint: "",
        custom: true,
        i: SECTIONS.length + i,
      })),
  ].map((s) => {
    const h = house(s.key);
    // A starter this host didn't start with sits with the removed ones, ready to add.
    const off = !h && !s.custom && startersOff.includes(s.key);
    return {
      ...s,
      removed: h?.published === false || off,
      order: h?.sortOrder && h.sortOrder > 0 ? h.sortOrder : 100 + s.i,
    };
  });
  all.sort((a, b) => a.order - b.order);
  const strip = ({ i: _i, order: _o, ...rest }: (typeof all)[number]) => rest;
  return {
    shown: all.filter((s) => !s.removed).map(strip),
    removed: all.filter((s) => s.removed).map(strip),
  };
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
export function windowsOn(
  windows: Window[],
  roomId: string | null,
  date: string,
  tz: string,
): string[] {
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
    .filter(
      (w) =>
        w.day_of_week !== null &&
        (!w.room_id || w.room_id === roomId) &&
        w.start_time &&
        w.end_time,
    )
    .map(
      (w) =>
        `${days[w.day_of_week!]} ${w.start_time!.slice(0, 5)}–${w.end_time!.slice(0, 5)}${w.reason ? ` (${w.reason})` : ""}`,
    );
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
    .map((s) => ({ key: s.key, text: s.summary?.trim() || s.title }))
    .filter((i) => i.text.length > 0);
  for (const t of todayWindows) items.push({ key: "today", text: `Today: ${t}` });
  return items;
}

/** Which sections the reminder card is currently showing. */
export function pinnedKeys(sections: GuideSection[]): SectionKey[] {
  const chosen = sections.filter((s) => s.pinned).map((s) => s.key);
  return chosen.length
    ? chosen
    : sections.filter((s) => DEFAULT_PINNED.includes(s.key)).map((s) => s.key);
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

/** Starter text for The Hill Suites style homes. Marked so hosts replace it. */
export const STARTER: Record<
  BuiltInKey,
  { summary: string; steps: { heading: string; body: string }[] }
> = {
  getting_in: {
    summary: "The front door has a keypad lock. Your code is on your check-in screen.",
    steps: [
      {
        heading: "Find the keypad",
        body: "It's on the right of the front door, under the porch light.",
      },
      {
        heading: "Enter your code",
        body: "Press the Latchkey logo to wake it, type your code, then press the tick. Wait for the green light.",
      },
      {
        heading: "Close behind you",
        body: "The door locks itself. Push until you hear the click.",
      },
    ],
  },
  shoes: {
    summary: "Shoes off in the hallway, please.",
    steps: [
      {
        heading: "Shoe rack",
        body: "Use the rack to the left of the door. Slippers are in the basket.",
      },
    ],
  },
  room: {
    summary: "Your room door is labelled with its number.",
    steps: [
      { heading: "Heating", body: "The radiator dial goes from 1 (low) to 5 (high)." },
      { heading: "Spare bedding", body: "In the top of the wardrobe." },
    ],
  },
  kitchenette: {
    summary: "Shared kitchenette on the ground floor: kettle, microwave and fridge.",
    steps: [
      { heading: "Fridge", body: "Label your food with your room number. The top shelf is yours." },
      { heading: "Washing up", body: "Please wash, dry and put away anything you use." },
    ],
  },
  bathroom: {
    summary: "Hot water takes about a minute to come through.",
    steps: [
      {
        heading: "Shower",
        body: "Turn the left dial for power and the right dial for temperature.",
      },
    ],
  },
  parking: { summary: "Free on-street parking on Bellfield Row.", steps: [] },
  taxis: {
    summary: "Local firms are quicker than an app here, especially late at night.",
    steps: [
      {
        heading: "Booking ahead",
        body: "For an early train, book the night before. Cars are scarce before 6am.",
      },
      { heading: "To the station", body: "Amersham station is about five minutes by car." },
      {
        heading: "Replace these details",
        body: "Add two or three local firms with their phone numbers and the usual fare.",
      },
    ],
  },
  rules: { summary: "No smoking anywhere indoors. No visitors after 10pm.", steps: [] },
  quiet: { summary: "", steps: [] },
  unavailable: { summary: "", steps: [] },
  checkout: {
    summary: "",
    steps: [
      {
        heading: "Before you go",
        body: "Strip the bed, leave used towels in the bath and close the window.",
      },
      { heading: "Leaving", body: "Pull the front door shut behind you. No need to find us." },
    ],
  },
  contact: {
    summary: "",
    steps: [
      {
        heading: "Emergencies",
        body: "For a leak, no heating or being locked out, call any time.",
      },
    ],
  },
};

/**
 * Starter sections a host doesn't start with: the ones the super admin took
 * out for new hosts before this host signed up. Hosts who were already here
 * keep them. `removed` maps section key → when it was taken out.
 */
export function startersOffFor(
  removed: Record<string, string> | null | undefined,
  hostCreatedAt: string | null | undefined,
): BuiltInKey[] {
  if (!removed || !hostCreatedAt) return [];
  const since = Date.parse(hostCreatedAt);
  return SECTIONS.map((s) => s.key).filter((k) => {
    const at = removed[k] ? Date.parse(removed[k]!) : NaN;
    return Number.isFinite(at) && at <= since;
  });
}

/** The super admin's starter settings, safe against anything stored; at least one starter always stays. */
export function normaliseStarters(raw: unknown): { removed: Record<string, string> } {
  const r = (
    raw && typeof raw === "object" ? (raw as Record<string, unknown>)["removed"] : null
  ) as Record<string, unknown> | null;
  const keys = new Set<string>(SECTIONS.map((s) => s.key));
  const removed: Record<string, string> = {};
  for (const [k, v] of Object.entries(r ?? {}))
    if (keys.has(k) && typeof v === "string" && Number.isFinite(Date.parse(v))) removed[k] = v;
  // Never every starter: the first one still offered stays.
  if (Object.keys(removed).length >= SECTIONS.length) delete removed[SECTIONS[0]!.key];
  return { removed };
}
