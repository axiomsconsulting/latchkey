/**
 * Voice check-in on the door tablet (Pro plan): a concierge that talks the guest through the
 * check-in and acts on what they say, so no button needs pressing. Flow driven: each screen
 * has a script (what to say, which answers it listens for); the tablet's own voices speak it,
 * so no AI is used to talk. AI only helps at the awkward moments: a reply that doesn't match
 * any expected answer (voice.functions.ts). Pure; tested in tests/voice-concierge.test.ts.
 */

export type VoiceGender = "female" | "male";

export type Intent =
  | "yes"
  | "no"
  | "repeat"
  | "help"
  | "stop"
  | "home"
  | "elsewhere"
  | "done"
  | "add"
  | `letter-${string}`;

/** What the concierge says. One place, so every voice says the same words. */
export const PHRASES = {
  hello:
    "Hello! I'm your check-in concierge. I'll guide you, so you won't need to touch the screen.",
  idConsent:
    "First, I'll take a photo of your passport or ID card to find your booking. Shall we start? Just say yes.",
  idShow: "Please hold your passport or ID card up to the camera, with the photo facing me.",
  faceShow: "Now a quick photo of you. Please look at the camera.",
  checking: "Got it. Just a moment while I check.",
  letter: "What's the first letter of your surname? You can say it, like 'S for Sierra'.",
  checkout: "Please tap the day you check out.",
  confirm: "Is this your booking? Say yes or no.",
  party: "How many people are staying? Please tap the number on the screen.",
  registerName: "Is your full name right on the screen? Say yes, or tap to change it.",
  registerNationality: "Please tap your nationality on the screen.",
  registerTyped: "Please type that on the screen, then say yes.",
  registerDestination:
    "Where are you going after your stay? Say 'going home', or 'somewhere else'.",
  registerAddress: "If you know the address there, type it. Otherwise just say yes.",
  registerCheck: "Please check your details on the screen. Say yes when they're right.",
  noMatch: "I couldn't find your booking. Let's try another way.",
  done: "You're all checked in. Have a wonderful stay! Say 'done' when you're ready.",
  doneMore: "If someone else is with you, say 'add a guest'.",
  notUnderstood: "Sorry, I didn't catch that. Could you say it again?",
  tapInstead: "You can also tap the screen at any time.",
  goodbye: "Okay, I'll stop here. You can carry on by touching the screen.",
  // Guidance while the camera looks for the ID or face.
  moveLeft: "Move it left a little.",
  moveRight: "Move it right a little.",
  moveUp: "Up a little.",
  moveDown: "Down a little.",
  closer: "Bring it a bit closer.",
  back: "Move it back a bit.",
  glare: "Tilt it slightly, there's a reflection.",
  dark: "It's a little dark. Can you move into the light?",
  hold: "Hold still.",
  perfect: "That's perfect. Stay still.",
  faceCloser: "Come a little closer.",
  faceIn: "Move so I can see your whole face.",
} as const;

export type PhraseKey = keyof typeof PHRASES;

/* ------------------------------- understanding ------------------------------- */

const NATO: Record<string, string> = {
  alfa: "A",
  alpha: "A",
  bravo: "B",
  charlie: "C",
  delta: "D",
  echo: "E",
  foxtrot: "F",
  golf: "G",
  hotel: "H",
  india: "I",
  juliet: "J",
  juliett: "J",
  kilo: "K",
  lima: "L",
  mike: "M",
  november: "N",
  oscar: "O",
  papa: "P",
  quebec: "Q",
  romeo: "R",
  sierra: "S",
  tango: "T",
  uniform: "U",
  victor: "V",
  whiskey: "W",
  whisky: "W",
  xray: "X",
  "x-ray": "X",
  yankee: "Y",
  zulu: "Z",
};

/** How letters sound when said alone ("bee", "see", "double you"). */
const SPOKEN: Record<string, string> = {
  a: "A",
  ay: "A",
  eh: "A",
  b: "B",
  be: "B",
  bee: "B",
  c: "C",
  see: "C",
  sea: "C",
  d: "D",
  dee: "D",
  e: "E",
  f: "F",
  ef: "F",
  eff: "F",
  g: "G",
  gee: "G",
  h: "H",
  aitch: "H",
  haitch: "H",
  i: "I",
  eye: "I",
  j: "J",
  jay: "J",
  k: "K",
  kay: "K",
  l: "L",
  el: "L",
  ell: "L",
  m: "M",
  em: "M",
  n: "N",
  en: "N",
  o: "O",
  oh: "O",
  p: "P",
  pee: "P",
  pea: "P",
  q: "Q",
  queue: "Q",
  cue: "Q",
  r: "R",
  are: "R",
  ar: "R",
  s: "S",
  es: "S",
  ess: "S",
  t: "T",
  tee: "T",
  tea: "T",
  u: "U",
  you: "U",
  v: "V",
  vee: "V",
  w: "W",
  "double-u": "W",
  x: "X",
  ex: "X",
  y: "Y",
  why: "Y",
  z: "Z",
  zed: "Z",
  zee: "Z",
};

const YES =
  /\b(yes|yeah|yep|yup|sure|ok|okay|correct|right|that's right|that is right|start|go ahead|let's go|it is|perfect|confirm|continue|next)\b/;
const NO = /\b(no|nope|not me|wrong|incorrect|isn't|is not|that's not|cancel)\b/;

/**
 * The answer a guest gave, among those the screen is listening for; null when it's none of
 * them (then AI may help). Rule based, so it's instant and free.
 */
export function intentFor(transcript: string, allowed: readonly Intent[]): Intent | null {
  const t = ` ${transcript
    .toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
  if (!t.trim()) return null;
  const has = (i: Intent) => allowed.includes(i);
  if (has("stop") && /\b(stop|quiet|be quiet|shut up|no voice|turn off)\b/.test(t)) return "stop";
  if (has("repeat") && /\b(repeat|again|say that again|pardon|what)\b/.test(t)) return "repeat";
  if (has("help") && /\b(help|don't know|confused|how)\b/.test(t)) return "help";
  if (has("add") && /\b(add|another|someone else|one more|second guest)\b/.test(t)) return "add";
  if (
    has("done") &&
    /\b(done|finished|that's all|that's it|bye|goodbye|thank you|thanks)\b/.test(t)
  )
    return "done";
  if (has("home") && /\b(home|going home|back home|my home)\b/.test(t)) return "home";
  if (
    has("elsewhere") &&
    /\b(somewhere else|elsewhere|another|travelling|not home|different)\b/.test(t)
  )
    return "elsewhere";
  // Letters: "S for Sierra", "Sierra", "the letter S", "ess".
  if (allowed.some((i) => i.startsWith("letter-"))) {
    const words = t.trim().split(" ");
    for (const w of words) if (NATO[w]) return `letter-${NATO[w]}`;
    const form = /\b(?:letter\s+)?([a-z])\s+for\b/.exec(t) ?? /\bletter\s+([a-z])\b/.exec(t);
    if (form) return `letter-${form[1]!.toUpperCase()}`;
    if (words.length <= 2) {
      const sound = SPOKEN[words[words.length - 1]!];
      if (sound) return `letter-${sound}`;
    }
  }
  if (has("no") && NO.test(t)) return "no";
  if (has("yes") && YES.test(t)) return "yes";
  return null;
}

/* ---------------------------------- scripts ---------------------------------- */

export type Script = {
  /** Said when the screen opens (in order). */
  say: PhraseKey[];
  /** The answers listened for; each presses the screen's button marked data-voice=<intent>. */
  listen: Intent[];
};

const ALWAYS: Intent[] = ["repeat", "help", "stop"];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => `letter-${l}` as Intent);

/**
 * What the concierge does on each check-in screen (CheckInFlow's step key, "name:position"),
 * and on the register's current page when it's paged.
 */
export function scriptFor(stepKey: string, extra: { registerPage?: string | null } = {}): Script {
  const name = stepKey.split(":")[0] ?? "";
  switch (name) {
    case "welcome":
      return { say: ["hello"], listen: ["yes", ...ALWAYS] };
    case "idFirst":
      return { say: ["idConsent"], listen: ["yes", "no", ...ALWAYS] };
    // Photo screens: said when the camera opens (its "lk-camera" event), not twice.
    case "identity":
    case "companion":
    case "face":
      return { say: [], listen: ALWAYS };
    case "letter":
      return { say: ["letter"], listen: [...LETTERS, ...ALWAYS] };
    case "checkout":
    case "checkout3":
    case "pick":
      return { say: ["checkout"], listen: ALWAYS };
    case "confirm":
      return { say: ["confirm"], listen: ["yes", "no", ...ALWAYS] };
    case "party":
      return { say: ["party"], listen: ["yes", ...ALWAYS] };
    case "register": {
      const page = extra.registerPage;
      if (page === "name") return { say: ["registerName"], listen: ["yes", ...ALWAYS] };
      if (page === "nationality")
        return { say: ["registerNationality"], listen: ["yes", ...ALWAYS] };
      if (page === "document" || page === "place")
        return { say: ["registerTyped"], listen: ["yes", ...ALWAYS] };
      if (page === "destination")
        return { say: ["registerDestination"], listen: ["home", "elsewhere", "yes", ...ALWAYS] };
      if (page === "address") return { say: ["registerAddress"], listen: ["yes", ...ALWAYS] };
      return {
        say: ["registerCheck"],
        listen: ["home", "elsewhere", "yes", ...ALWAYS],
      };
    }
    case "no_match":
      return { say: ["noMatch", "tapInstead"], listen: ALWAYS };
    case "done":
      return { say: ["done", "doneMore"], listen: ["done", "add", ...ALWAYS] };
    default:
      return { say: ["tapInstead"], listen: ALWAYS };
  }
}

/* --------------------------------- guidance ---------------------------------- */

export type GuidanceInput = {
  kind: "id" | "face";
  /** The auto-snap's own reading (use-auto-snap.ts). */
  say: "look" | "cut_off" | "small" | "blurry" | "dark" | "glare" | "hold";
  /** Corners or face box in the camera's own pixels, when something was found. */
  points: Array<{ x: number; y: number }> | null;
  good: boolean;
  w: number;
  h: number;
  /** The front camera: the guest faces it, so their left is the picture's right. */
  front: boolean;
};

/**
 * One instruction for the guest, from where their ID (or face) sits in the picture: move it
 * left, right, up, down, closer or back, hold still, or perfect. In the guest's own terms.
 */
export function guidanceFor(g: GuidanceInput): PhraseKey | null {
  if (g.good) return "perfect";
  if (g.say === "dark") return "dark";
  if (g.say === "glare") return g.kind === "id" ? "glare" : null;
  if (!g.points?.length || !g.w || !g.h) {
    if (g.say === "cut_off") return g.kind === "id" ? "back" : "faceIn";
    return null;
  }
  const xs = g.points.map((p) => p.x);
  const ys = g.points.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2 / g.w;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2 / g.h;
  const share =
    ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) / (g.w * g.h);
  if (g.say === "cut_off" || share > 0.85) return g.kind === "id" ? "back" : "faceIn";
  if (g.say === "small" || share < (g.kind === "id" ? 0.16 : 0.05))
    return g.kind === "id" ? "closer" : "faceCloser";
  const off = 0.14;
  // Picture left is the guest's right with the front camera (they face it).
  const towardGuestLeft = g.front ? cx < 0.5 - off : cx > 0.5 + off;
  const towardGuestRight = g.front ? cx > 0.5 + off : cx < 0.5 - off;
  if (towardGuestLeft) return "moveLeft";
  if (towardGuestRight) return "moveRight";
  if (cy < 0.5 - off) return "moveDown";
  if (cy > 0.5 + off) return "moveUp";
  if (g.say === "blurry" || g.say === "hold") return "hold";
  return null;
}

/** Guidance isn't said more often than this, and the same words not twice in a row this soon. */
export const GUIDE_GAP_MS = 1800;
export const SAME_GAP_MS = 4500;

export function shouldSay(
  next: PhraseKey,
  last: { key: PhraseKey | null; at: number },
  now: number,
): boolean {
  if (now - last.at < GUIDE_GAP_MS) return false;
  if (next === last.key && now - last.at < SAME_GAP_MS) return false;
  return true;
}

/* ----------------------------------- voices ---------------------------------- */

const FEMALE =
  /(female|woman|samantha|serena|kate|moira|tessa|karen|victoria|fiona|susan|hazel|libby|sonia|zira|aria|jenny|emma|amy|olivia|google uk english female)/i;
const MALE =
  /(\bmale\b|\bman\b|daniel|arthur|oliver|alex|fred|george|ryan|thomas|david|mark|guy|rishi|google uk english male)/i;

/** The tablet's own voice to use: English (British first), of the chosen kind when the name says so. */
export function pickVoice<V extends { name: string; lang: string; localService?: boolean }>(
  voices: readonly V[],
  gender: VoiceGender,
): V | null {
  const english = voices.filter((v) => /^en/i.test(v.lang));
  if (!english.length) return voices[0] ?? null;
  const want = gender === "female" ? FEMALE : MALE;
  const avoid = gender === "female" ? MALE : FEMALE;
  const score = (v: V) =>
    (want.test(v.name) ? 4 : 0) +
    (avoid.test(v.name) && !want.test(v.name) ? -4 : 0) +
    (/en[-_]GB/i.test(v.lang) ? 2 : 0) +
    (v.localService ? 1 : 0);
  return [...english].sort((a, b) => score(b) - score(a))[0] ?? null;
}
