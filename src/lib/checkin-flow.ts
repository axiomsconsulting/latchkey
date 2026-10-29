/**
 * The guest check-in journey as steps the host ticks on or off
 * (properties.checkin_flow), drawn as connected boxes in Settings → Guests.
 * Two ways in, then the same steps for everyone:
 *  - The host put a welcome on the door tablet for this guest: its Check in
 *    button opens that guest's stay, so nothing is asked to find it.
 *  - No welcome (a busy door): surname initial, then the check-out day picked
 *    from three close choices (or the week), then "Is this you?".
 * Then who's checking in, the lead guest's photo ID (read automatically when
 * ID reading is on; the small copy is kept either way when the host keeps
 * them, so a failed read can be checked by hand), every adult's ID, a face
 * photo and, in the UK, the guest register. Fallbacks if the ID can't be
 * used: the last 4 of the booking reference or phone, then the guest's own
 * word (the host is told).
 *
 * Latchkey admin (site_settings.checkin_flow) sets the starting journey for
 * new properties, and can make a step required for everyone or remove it for
 * everyone; those win over the host's choice (effectiveFlow). A property
 * that never saved its own journey follows the starting one.
 *
 * The journey is the source of the step switches; the older columns
 * (checkin_methods.enabled, guest_records toggles) are written to match and
 * patched from it on the server (withFlow), so every existing rule keeps
 * working. Pure; tested in tests/checkin-flow.test.ts.
 */
import type { CheckinMethods } from "./checkin-logic";
import type { GuestRecords } from "./guest-records";

export const STEP_IDS = [
  "welcome_go",
  "find_letter",
  "find_checkout",
  "find_confirm",
  "party",
  "lead_id",
  "keep_id",
  "every_adult_id",
  "selfie",
  "register",
  "last4",
  "self_declare",
] as const;
export type StepId = (typeof STEP_IDS)[number];

/** Where a step sits in the drawing: one of the two ways in, the steps for everyone, or the fallbacks. */
export type Lane = "welcome" | "find" | "everyone" | "fallback";

export type StepDef = {
  id: StepId;
  lane: Lane;
  /** Always on: the journey can't work without it (or the law asks for it). */
  locked?: "always" | "uk";
  /** Only means something with this step on. */
  needs?: StepId;
  /** Keeps photos: only once the host confirms data-regulator registration. */
  photo?: boolean;
};

export const STEPS: StepDef[] = [
  { id: "welcome_go", lane: "welcome" },
  { id: "find_letter", lane: "find", locked: "always" },
  { id: "find_checkout", lane: "find", locked: "always" },
  { id: "find_confirm", lane: "find" },
  { id: "party", lane: "everyone" },
  { id: "lead_id", lane: "everyone" },
  { id: "keep_id", lane: "everyone", needs: "lead_id", photo: true },
  { id: "every_adult_id", lane: "everyone", needs: "lead_id" },
  { id: "selfie", lane: "everyone", photo: true },
  { id: "register", lane: "everyone", locked: "uk" },
  { id: "last4", lane: "fallback" },
  { id: "self_declare", lane: "fallback", locked: "always" },
];

export const stepDef = (id: StepId): StepDef => STEPS.find((s) => s.id === id)!;

export type CameraSide = "front" | "back";
/** How the check-out day is asked: three close choices, or the coming week. */
export type CheckoutStyle = "three" | "week";

export type FlowChoices = {
  steps: Record<StepId, boolean>;
  checkout: CheckoutStyle;
  /** On a shared door tablet; a guest's own phone always uses the back camera for ID and the front for a face. */
  idCamera: CameraSide;
  selfieCamera: CameraSide;
};

const allOn = Object.fromEntries(STEP_IDS.map((id) => [id, true])) as Record<StepId, boolean>;

/** Quick: find the stay, photo ID (kept), a face photo, done. */
export const QUICK: FlowChoices = {
  steps: { ...allOn, find_confirm: false, every_adult_id: false, last4: false },
  checkout: "three",
  idCamera: "front",
  selfieCamera: "front",
};

/** Thorough: everything, including every adult's ID and the booking-reference fallback. */
export const THOROUGH: FlowChoices = {
  steps: { ...allOn },
  checkout: "three",
  idCamera: "front",
  selfieCamera: "front",
};

export const PRESETS = { quick: QUICK, thorough: THOROUGH } as const;
export type PresetKey = keyof typeof PRESETS;

export function normaliseFlow(raw: unknown, fallback: FlowChoices = QUICK): FlowChoices {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const s = (
    r["steps"] && typeof r["steps"] === "object" && !Array.isArray(r["steps"]) ? r["steps"] : {}
  ) as Record<string, unknown>;
  const steps = { ...fallback.steps };
  // A step added to Latchkey later, which this property never saw, takes the starting choice.
  for (const id of STEP_IDS) if (typeof s[id] === "boolean") steps[id] = s[id] as boolean;
  const side = (v: unknown, d: CameraSide): CameraSide => (v === "front" || v === "back" ? v : d);
  return {
    steps,
    checkout:
      r["checkout"] === "week" || r["checkout"] === "three" ? r["checkout"] : fallback.checkout,
    idCamera: side(r["idCamera"], fallback.idCamera),
    selfieCamera: side(r["selfieCamera"], fallback.selfieCamera),
  };
}

/** Latchkey admin's journey: the start for new properties, and steps required or removed for everyone. */
export type FlowPolicy = { defaults: FlowChoices; required: StepId[]; removed: StepId[] };

export const DEFAULT_POLICY: FlowPolicy = { defaults: QUICK, required: [], removed: [] };

const lockable = (id: StepId) => !stepDef(id).locked;

export function normalisePolicy(raw: unknown): FlowPolicy {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const ids = (v: unknown): StepId[] =>
    Array.isArray(v)
      ? [...new Set(v.filter((x): x is StepId => STEP_IDS.includes(x as StepId)))].filter(lockable)
      : [];
  const required = ids(r["required"]);
  // A step can't be both; required wins.
  const removed = ids(r["removed"]).filter((id) => !required.includes(id));
  return { defaults: normaliseFlow(r["defaults"], QUICK), required, removed };
}

/** Why a step is on or off whatever the host picks, or null when it's theirs to choose. */
export type StepLock = "always" | "uk" | "required" | "removed" | "needs" | null;

export type FlowContext = {
  /** The UK guest register applies (properties in Great Britain). */
  uk: boolean;
};

/**
 * The journey as it runs: the host's own (or the starting one), with
 * Latchkey's required and removed steps applied, the always-on steps on,
 * the register only in the UK, and a step whose parent is off left off.
 */
export function effectiveFlow(
  own: FlowChoices | null,
  policy: FlowPolicy,
  ctx: FlowContext,
): FlowChoices {
  const base = own ?? policy.defaults;
  const steps = { ...base.steps };
  for (const id of STEP_IDS) {
    const lock = lockOf(id, base, policy, ctx);
    if (lock === "always" || lock === "uk" || lock === "required") steps[id] = true;
    if (lock === "removed") steps[id] = false;
  }
  if (!ctx.uk) steps.register = false;
  for (const s of STEPS) if (s.needs && !steps[s.needs]) steps[s.id] = false;
  return { ...base, steps };
}

export function lockOf(
  id: StepId,
  own: FlowChoices,
  policy: FlowPolicy,
  ctx: FlowContext,
): StepLock {
  const def = stepDef(id);
  if (def.locked === "always") return "always";
  if (def.locked === "uk") return ctx.uk ? "uk" : null;
  // Who's staying: the UK register needs to know.
  if (id === "party" && ctx.uk) return "uk";
  if (policy.removed.includes(id)) return "removed";
  if (policy.required.includes(id)) return "required";
  if (def.needs) {
    const parent = lockOf(def.needs, own, policy, ctx);
    if (parent === "removed") return "needs";
    if (parent === null && !own.steps[def.needs]) return "needs";
  }
  return null;
}

/** Steps shown in the host's drawing: Latchkey's removed ones are gone for everyone, the register only in the UK. */
export function visibleSteps(policy: FlowPolicy, ctx: FlowContext): StepDef[] {
  return STEPS.filter((s) => !policy.removed.includes(s.id) && (s.id !== "register" || ctx.uk));
}

/**
 * The journey worked out from the older settings, for properties saved
 * before the journey existed (and while the database hasn't the column):
 * the same switches, with the new steps on.
 */
export function fromLegacy(methods: CheckinMethods, records: GuestRecords | null): FlowChoices {
  return {
    steps: {
      ...allOn,
      lead_id: methods.enabled.photo_id,
      last4: methods.enabled.last4,
      party: records?.askWhoIsStaying ?? true,
      every_adult_id: records?.checkEveryAdult ?? true,
      keep_id: records?.idPhoto ?? false,
      selfie: records?.facePhoto ?? false,
    },
    checkout: "three",
    idCamera: "front",
    selfieCamera: "front",
  };
}

/** The older switches, matched to the journey (kept in step when it's saved, and patched on the server). */
export function toMethods(flow: FlowChoices): CheckinMethods {
  return {
    // As drawn: the photo ID first, then the booking details, then the guest's word.
    order: ["photo_id", "last4", "self_declare"],
    enabled: {
      photo_id: flow.steps.lead_id,
      last4: flow.steps.last4,
      self_declare: true,
    },
  };
}

export function toRecords(flow: FlowChoices, prev: GuestRecords): GuestRecords {
  return {
    ...prev,
    askWhoIsStaying: flow.steps.party,
    checkEveryAdult: flow.steps.every_adult_id,
    idPhoto: flow.steps.keep_id,
    facePhoto: flow.steps.selfie,
  };
}

/** Which camera a step opens: the host's choice on a shared tablet; on someone's own phone the back for ID, the front for a face. */
export function cameraFor(
  kind: "id" | "face",
  shared: boolean,
  flow: Pick<FlowChoices, "idCamera" | "selfieCamera">,
): "user" | "environment" {
  if (!shared) return kind === "id" ? "environment" : "user";
  const side = kind === "id" ? flow.idCamera : flow.selfieCamera;
  return side === "front" ? "user" : "environment";
}

/** What the guest's screen needs to know (sent with the property). */
export type GuestFlow = {
  welcomeGo: boolean;
  confirm: boolean;
  checkout: CheckoutStyle;
  idCamera: CameraSide;
  selfieCamera: CameraSide;
};

export const guestFlow = (f: FlowChoices): GuestFlow => ({
  welcomeGo: f.steps.welcome_go,
  confirm: f.steps.find_confirm,
  checkout: f.checkout,
  idCamera: f.idCamera,
  selfieCamera: f.selfieCamera,
});

/** Which preset the choices are, if any (the editor highlights it). */
export function presetOf(f: FlowChoices, ctx: FlowContext, policy: FlowPolicy): PresetKey | null {
  const eff = effectiveFlow(f, policy, ctx);
  for (const [key, p] of Object.entries(PRESETS) as Array<[PresetKey, FlowChoices]>) {
    const want = effectiveFlow(p, policy, ctx);
    if (STEP_IDS.every((id) => eff.steps[id] === want.steps[id]) && eff.checkout === want.checkout)
      return key;
  }
  return null;
}
