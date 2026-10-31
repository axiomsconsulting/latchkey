/**
 * What a door tablet shows right now, reported by the tablet as it changes
 * (kiosk_devices.screen, migration 0073) for the host's live view
 * (TabletLive). Only which screen it is, never anyone's details. Pure;
 * tested in tests/kiosk-screen.test.ts.
 */
export const SCREEN_VIEWS = [
  "start",
  "cards",
  "welcome",
  "welcomeRest",
  "saver",
  "night",
  "blank",
  "checkin",
  "join",
] as const;
export type ScreenView = (typeof SCREEN_VIEWS)[number];

export type KioskScreen = {
  view: ScreenView;
  /** The check-in step (CheckInFlow's step name), while someone checks in. */
  step: string | null;
  fullscreen: boolean;
  /** The compatible kiosk for older tablets (/lite). */
  lite: boolean;
  /** When it last changed (ISO). */
  at: string | null;
};

export function normaliseScreen(raw: unknown): KioskScreen | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const view = (SCREEN_VIEWS as readonly string[]).includes(r["view"] as string)
    ? (r["view"] as ScreenView)
    : null;
  if (!view) return null;
  const step =
    typeof r["step"] === "string" && /^[a-z0-9_]{1,24}$/.test(r["step"]) ? r["step"] : null;
  return {
    view,
    step: view === "checkin" ? step : null,
    fullscreen: r["fullscreen"] === true,
    lite: r["lite"] === true,
    at: typeof r["at"] === "string" ? r["at"] : null,
  };
}

/** The kiosk's view from its state (kiosk.$code.tsx), in the order things sit on top of each other. */
export function screenFrom(s: {
  welcomeUp: boolean;
  welcomeRest: boolean;
  cardsUp: boolean;
  saver: boolean;
  rest: "night" | "blank" | "clock";
  atWelcome: boolean;
  step: string;
  join: boolean;
}): { view: ScreenView; step: string | null } {
  if (s.welcomeUp) return { view: s.welcomeRest ? "welcomeRest" : "welcome", step: null };
  if (s.cardsUp) return { view: "cards", step: null };
  if (s.saver)
    return {
      view: s.rest === "night" ? "night" : s.rest === "blank" ? "blank" : "saver",
      step: null,
    };
  if (s.join) return { view: "join", step: null };
  if (s.atWelcome) return { view: "start", step: null };
  const step = s.step.split(":")[0] ?? "";
  return { view: "checkin", step: /^[a-z0-9_]{1,24}$/i.test(step) ? step.toLowerCase() : null };
}

/** Plain words for a check-in step, for the live view. */
export const STEP_WORDS: Record<string, string> = {
  welcome: "Start",
  find_id: "Photo ID",
  letter: "First letter of surname",
  checkout: "Check-out day",
  checkout3: "Check-out day",
  platform: "Booking site",
  pick: "Picking their booking",
  no_match: "Booking not found",
  locked: "Locked after wrong answers",
  guestName: "Their name",
  confirm: "Is this you?",
  party: "Who's staying",
  companion: "Another guest's ID",
  face: "Face photo",
  register: "Guest register",
  handover: "Asked for the host",
  waiting: "Waiting for other phones",
  identity: "Photo ID",
  done: "Checked in",
};

export const stepWords = (step: string | null) =>
  step ? (STEP_WORDS[step] ?? step.replace(/_/g, " ")) : "Checking in";
