/**
 * Door codes (properties.door_codes): for the front door and the room door, the
 * host says whether it takes a new code each stay, one fixed code, or a key, and
 * what the lock takes. Latchkey makes codes to fit. A code another stay holds now
 * or later is never given out; a past guest's only comes round again after the
 * host's chosen time, and one no guest ever saw doesn't count as used. Latchkey
 * doesn't work the lock itself: the host puts each code on it. Pure, tested.
 */

export type DoorKey = "front" | "room";
export const DOOR_KEYS: DoorKey[] = ["front", "room"];

/** What a lock takes: letters, then digits, then letters. */
export type CodeFormat = {
  lettersStart: number;
  digits: number;
  lettersEnd: number;
  /** What the keypad's number buttons go from and to (1 to 3 on some button locks). */
  digitFrom: number;
  digitTo: number;
  letterFrom: string;
  letterTo: string;
  /** Patterns people remember (483 483), when the lock has enough buttons. */
  memorable: boolean;
};

export type Door = CodeFormat & {
  /** per_stay: new code each stay. static: fixed. off: a key, or nothing to do. */
  mode: "per_stay" | "static" | "off";
  /** Off: what guests are told instead ("The key is in the safe by the door."). */
  keyNote: string;
  /** Pressed before or after the code: "*", "#", "Unlock". */
  pressBefore: string;
  pressAfter: string;
  unlockHow: string;
  lockHow: string;
  /** Fixed codes: the front door's. */
  staticCode: string;
  /** Fixed codes: each room's own, for the room door. */
  roomCodes: Record<string, string>;
  /** Fixed codes can't be changed or regenerated until the host unlocks them. */
  locked: boolean;
};

export type DoorCodes = {
  front: Door;
  room: Door;
  /** Days before a past guest's code can come round again; 0 = never. */
  reuseAfterDays: number;
  /** When guests see it. */
  reveal: "check_in" | "arrival_day";
};

export const REUSE_CHOICES = [30, 90, 180, 365, 0] as const;
export const MAX_DIGITS = 12;
export const MAX_LETTERS = 3;

const DEFAULT_FORMAT: CodeFormat = {
  lettersStart: 0,
  digits: 6,
  lettersEnd: 0,
  digitFrom: 0,
  digitTo: 9,
  letterFrom: "A",
  letterTo: "Z",
  memorable: true,
};

/** Common locks, one tap each, so nobody has to work out the fields. */
export const FORMAT_PRESETS: Array<{ id: string; format: CodeFormat }> = [
  { id: "six", format: DEFAULT_FORMAT },
  { id: "four", format: { ...DEFAULT_FORMAT, digits: 4 } },
  { id: "eight", format: { ...DEFAULT_FORMAT, digits: 8 } },
  { id: "buttons", format: { ...DEFAULT_FORMAT, digits: 4, digitFrom: 1, digitTo: 5 } },
  { id: "letter", format: { ...DEFAULT_FORMAT, lettersStart: 1, digits: 5, letterTo: "D" } },
];

const FORMAT_KEYS = Object.keys(DEFAULT_FORMAT) as Array<keyof CodeFormat>;

/** Which preset this format is, or null for one of the host's own. */
export function presetOfFormat(f: CodeFormat): string | null {
  return (
    FORMAT_PRESETS.find((p) => FORMAT_KEYS.every((k) => k === "memorable" || p.format[k] === f[k]))
      ?.id ?? null
  );
}

const DEFAULT_DOOR: Door = {
  ...DEFAULT_FORMAT,
  mode: "off",
  keyNote: "",
  pressBefore: "",
  pressAfter: "",
  unlockHow: "",
  lockHow: "",
  staticCode: "",
  roomCodes: {},
  locked: false,
};

const whole = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? Math.round(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const letter = (v: unknown, fallback: string) => {
  const c = typeof v === "string" ? v.trim().toUpperCase() : "";
  return /^[A-Z]$/.test(c) ? c : fallback;
};
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** A code as a lock takes it: letters, digits, * and #, no spaces, up to 16. */
export function cleanCode(v: unknown): string {
  return typeof v === "string"
    ? v
        .replace(/\s+/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9*#]/g, "")
        .slice(0, 16)
    : "";
}

function normaliseDoor(raw: unknown): Door {
  const d = DEFAULT_DOOR;
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const a = whole(v["digitFrom"], 0, 9, d.digitFrom);
  const b = whole(v["digitTo"], 0, 9, d.digitTo);
  const la = letter(v["letterFrom"], d.letterFrom);
  const lb = letter(v["letterTo"], d.letterTo);
  const lettersStart = whole(v["lettersStart"], 0, MAX_LETTERS, 0);
  const lettersEnd = whole(v["lettersEnd"], 0, MAX_LETTERS, 0);
  // Always at least three characters.
  const digits = Math.max(
    3 - lettersStart - lettersEnd,
    whole(v["digits"], 0, MAX_DIGITS, d.digits),
  );
  const rooms = (
    v["roomCodes"] && typeof v["roomCodes"] === "object" ? v["roomCodes"] : {}
  ) as Record<string, unknown>;
  return {
    mode: v["mode"] === "per_stay" || v["mode"] === "static" ? v["mode"] : "off",
    keyNote: text(v["keyNote"], 300),
    lettersStart,
    digits,
    lettersEnd,
    digitFrom: Math.min(a, b),
    digitTo: Math.max(a, b),
    letterFrom: la <= lb ? la : lb,
    letterTo: la <= lb ? lb : la,
    memorable: v["memorable"] !== false,
    pressBefore: text(v["pressBefore"], 24),
    pressAfter: text(v["pressAfter"], 24),
    unlockHow: text(v["unlockHow"], 500),
    lockHow: text(v["lockHow"], 500),
    staticCode: cleanCode(v["staticCode"]),
    roomCodes: Object.fromEntries(
      Object.entries(rooms)
        .map(([k, c]) => [k, cleanCode(c)] as const)
        .filter(([, c]) => !!c),
    ),
    locked: v["locked"] === true,
  };
}

export function normaliseDoorCodes(raw: unknown): DoorCodes {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const reveal = v["reveal"] === "arrival_day" ? "arrival_day" : "check_in";
  const reuseAfterDays = whole(v["reuseAfterDays"], 0, 3650, 90);
  // Saved before there were two doors: one lock, on the front door.
  if (!("front" in v) && !("room" in v)) {
    return {
      front: normaliseDoor({ ...v, mode: v["on"] === true ? v["mode"] : "off", roomCodes: {} }),
      room: normaliseDoor(
        v["on"] === true && v["mode"] === "static" && v["roomCodes"]
          ? { ...v, mode: "static", staticCode: "" }
          : null,
      ),
      reveal,
      reuseAfterDays,
    };
  }
  return {
    front: { ...normaliseDoor(v["front"]), roomCodes: {} },
    room: { ...normaliseDoor(v["room"]), staticCode: "" },
    reveal,
    reuseAfterDays,
  };
}

/** Anything on: a code on either door, or a note about a key. */
export function doorsOn(f: DoorCodes): boolean {
  return DOOR_KEYS.some((k) => f[k].mode !== "off" || !!f[k].keyNote);
}

/** Locked fixed codes stay as they were, whatever the page sends. */
export function keepLocked(prev: DoorCodes, next: DoorCodes): DoorCodes {
  const keep = (k: DoorKey): Door =>
    prev[k].locked && next[k].locked
      ? { ...next[k], staticCode: prev[k].staticCode, roomCodes: prev[k].roomCodes }
      : next[k];
  return { ...next, front: keep("front"), room: keep("room") };
}

/** The format changed, so codes not yet used should be made again to fit. */
export function formatChanged(a: CodeFormat, b: CodeFormat): boolean {
  return FORMAT_KEYS.some((k) => k !== "memorable" && a[k] !== b[k]);
}

const digitSpan = (f: CodeFormat) => f.digitTo - f.digitFrom + 1;
const letterSpan = (f: CodeFormat) => f.letterTo.charCodeAt(0) - f.letterFrom.charCodeAt(0) + 1;

/** How many different codes this format has. */
export function possibleCodes(f: CodeFormat): number {
  return digitSpan(f) ** f.digits * letterSpan(f) ** (f.lettersStart + f.lettersEnd);
}

/** How many it will really choose from: memorable patterns use far fewer than the format allows. */
export function likelyCodes(f: CodeFormat): number {
  if (!f.memorable || f.digits < 4 || digitSpan(f) < 3) return possibleCodes(f);
  let picks = 1;
  const span = digitSpan(f);
  for (let i = 0; i < Math.ceil(f.digits / 2); i++) picks *= Math.max(1, span - i);
  return Math.min(possibleCodes(f), picks * 3 * letterSpan(f) ** (f.lettersStart + f.lettersEnd));
}

/** Few enough that a stranger could try them, or that they'd soon run out. */
export const FEW_CODES = 1000;

type Rand = (below: number) => number;

const secureRand: Rand = (below) => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! % below;
};

/** Guessed first: one digit over and over, or counting up or down. */
export function isWeakDigits(d: string, f: Pick<CodeFormat, "digitFrom" | "digitTo">): boolean {
  if (d.length < 3 || f.digitTo - f.digitFrom < 3) return false;
  if (new Set(d).size === 1) return true;
  const steps = [...d].slice(1).map((c, i) => Number(c) - Number(d[i]));
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return true;
  // A year someone might have been born in.
  return d.length === 4 && /^(19|20)/.test(d);
}

/** Distinct digits where the buttons allow, so patterns don't collapse to 4444. */
function someDigits(n: number, f: CodeFormat, rand: Rand): number[] {
  const pool = Array.from({ length: digitSpan(f) }, (_, i) => f.digitFrom + i);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!pool.length) out.push(f.digitFrom + rand(digitSpan(f)));
    else out.push(pool.splice(rand(pool.length), 1)[0]!);
  }
  return out;
}

/** 483 483, 483 384 or 44 88 33: half the digits to remember. */
function memorableDigits(f: CodeFormat, rand: Rand): string {
  const n = f.digits;
  const half = someDigits(Math.ceil(n / 2), f, rand);
  const shapes = [
    () => [...half, ...half].slice(0, n),
    () => [...half, ...[...half].reverse().slice(n % 2)],
    () => half.flatMap((x) => [x, x]).slice(0, n),
  ];
  return shapes[rand(shapes.length)]!().join("");
}

const plainDigits = (f: CodeFormat, rand: Rand) =>
  Array.from({ length: f.digits }, () => f.digitFrom + rand(digitSpan(f))).join("");

const someLetters = (n: number, f: CodeFormat, rand: Rand) =>
  Array.from({ length: n }, () =>
    String.fromCharCode(f.letterFrom.charCodeAt(0) + rand(letterSpan(f))),
  ).join("");

/** The nth code of the format, for going through them all when few are left. */
function nthCode(i: number, f: CodeFormat): string {
  let rest = i;
  const take = (span: number) => {
    const v = rest % span;
    rest = Math.floor(rest / span);
    return v;
  };
  const letters = (n: number) =>
    Array.from({ length: n }, () =>
      String.fromCharCode(f.letterFrom.charCodeAt(0) + take(letterSpan(f))),
    ).join("");
  const start = letters(f.lettersStart);
  const end = letters(f.lettersEnd);
  const digits = Array.from({ length: f.digits }, () => f.digitFrom + take(digitSpan(f))).join("");
  return `${start}${digits}${end}`;
}

/**
 * A code nobody else holds: memorable if asked and possible, otherwise any that
 * isn't easily guessed, otherwise any free one at all. Null when every code is taken.
 */
export function generateCode(
  f: CodeFormat,
  blocked: ReadonlySet<string>,
  rand: Rand = secureRand,
): string | null {
  const wrap = (d: string) =>
    `${someLetters(f.lettersStart, f, rand)}${d}${someLetters(f.lettersEnd, f, rand)}`;
  const attempt = (make: () => string, tries: number) => {
    for (let i = 0; i < tries; i++) {
      const d = make();
      if (isWeakDigits(d, f)) continue;
      const code = wrap(d);
      if (!blocked.has(code)) return code;
    }
    return null;
  };
  const found =
    (f.memorable && f.digits >= 4 && digitSpan(f) >= 3
      ? attempt(() => memorableDigits(f, rand), 60)
      : null) ?? attempt(() => plainDigits(f, rand), 200);
  if (found) return found;
  const total = possibleCodes(f);
  if (total > 200_000) return null;
  const from = rand(total);
  for (let i = 0; i < total; i++) {
    const code = nthCode((from + i) % total, f);
    if (!blocked.has(code)) return code;
  }
  return null;
}

export type CodeHistory = {
  id: string;
  door_code: string | null;
  door_code_room?: string | null;
  door_code_shown_at?: string | null;
  status: string;
  check_out_date: string;
};

/**
 * Codes this stay can't have. Any stay here now or still to come keeps its codes to
 * itself, always. A past guest's are free once `reuseAfterDays` have gone by (0 = never),
 * and straight away if they never saw them: an unused code wasn't given to anyone.
 */
export function blockedCodes(
  stays: CodeHistory[],
  selfId: string,
  today: string,
  reuseAfterDays: number,
): Set<string> {
  const free = reuseAfterDays
    ? new Date(Date.parse(`${today}T12:00:00Z`) - reuseAfterDays * 86_400_000)
        .toISOString()
        .slice(0, 10)
    : null;
  const out = new Set<string>();
  for (const s of stays) {
    if (s.id === selfId || s.status === "cancelled") continue;
    const current = s.check_out_date >= today;
    const given = !!s.door_code_shown_at && (!free || s.check_out_date > free);
    if (!current && !given) continue;
    if (s.door_code) out.add(s.door_code);
    if (s.door_code_room) out.add(s.door_code_room);
  }
  return out;
}

/** What the guest does, step by step. */
export function codeSteps(f: Pick<Door, "pressBefore" | "pressAfter">, code: string): string[] {
  return [
    ...(f.pressBefore ? [`Press ${f.pressBefore}`] : []),
    `Enter ${code}`,
    ...(f.pressAfter ? [`Press ${f.pressAfter}`] : []),
  ];
}

/** Easier to read and remember: letters apart, six or eight digits in halves (483 483), longer in threes. */
export function spacedCode(code: string): string {
  const parts = code.match(/[A-Z]+|[0-9]+|[^A-Z0-9]+/g) ?? [code];
  const group = (p: string) => {
    if (!/^[0-9]{5,}$/.test(p)) return p;
    const size = p.length === 6 || p.length === 8 ? p.length / 2 : 3;
    return p.match(new RegExp(`.{1,${size}}`, "g"))?.join(" ") ?? p;
  };
  return parts.map(group).join(" ");
}

/** The fixed code for this door: the front door's, or this room's. */
export function staticCodeFor(f: DoorCodes, door: DoorKey, roomId: string | null): string {
  return door === "front" ? f.front.staticCode : (roomId && f.room.roomCodes[roomId]) || "";
}

/** Whether the guest sees their code now. Never before arrival day, never after they've left. */
export function codeShows(
  f: Pick<DoorCodes, "reveal">,
  stay: {
    checkedIn: boolean;
    checkedOut: boolean;
    nowMs: number;
    opensAtMs: number;
    endsAtMs: number;
  },
): boolean {
  if (stay.checkedOut || stay.nowMs < stay.opensAtMs || stay.nowMs > stay.endsAtMs) return false;
  return f.reveal === "arrival_day" || stay.checkedIn;
}
