/**
 * Photos on a phone, for a check-in at the door tablet. Door tablets rarely
 * have good cameras, so at each photo step the kiosk offers a square (and
 * "Text me the link") for the guest's or host's phone. One link serves the
 * whole check-in: the kiosk posts each photo task in turn (find the stay
 * from the ID, the lead guest's ID, another guest's ID, a face photo), each
 * with the next number; the phone does the task on screen now and the
 * server records the result against that number. The kiosk only takes the
 * result for the task it is waiting on, so the two screens can never act on
 * an old step. Pure; tested in tests/photo-handoff.test.ts.
 */

export type PhotoKind = "find" | "lead" | "companion" | "face";

/** What the kiosk asks the phone to do now. */
export type PhotoTask = {
  n: number;
  kind: PhotoKind;
  /** Guest 1 is 0. */
  position: number;
  /** Take their face photo straight after the ID (live, never uploaded). */
  face: boolean;
  /** Failed ID reads so far for this task (a second one keeps the photo for the host, as on the kiosk). */
  tries: number;
};

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type JsonObject = { [k: string]: Json };

/** What the phone sent back for a task; `id` is the same answer the kiosk gets from its own camera. */
export type PhotoResult = {
  n: number;
  id?: JsonObject | null;
  /** The face photo: taken, or the guest skipped it. */
  face?: "taken" | "skipped" | null;
};

export const PHOTO_KINDS: readonly PhotoKind[] = ["find", "lead", "companion", "face"];

/** How long a phone link works: long enough for a slow check-in, short enough to be useless later. */
export const HANDOFF_MINUTES = 30;

/** The next task: always a new number, so a late answer to the last one is ignored. */
export function nextTask(
  prev: Pick<PhotoTask, "n"> | null | undefined,
  t: { kind: PhotoKind; position: number; face: boolean },
): PhotoTask {
  return {
    n: (prev?.n ?? 0) + 1,
    kind: t.kind,
    position: t.kind === "find" || t.kind === "lead" ? 0 : Math.max(0, Math.floor(t.position)),
    face: t.kind === "face" ? false : t.face,
    tries: 0,
  };
}

/** The result for exactly this task, or nothing (an old task's answer, or none yet). */
export function resultFor(result: PhotoResult | null | undefined, n: number): PhotoResult | null {
  return result && result.n === n ? result : null;
}

/**
 * Whether an ID answer ends the task for the kiosk (it then carries on as
 * if its own camera took it), or the phone should simply try again.
 * The first unreadable photo when finding the stay is retried; the second
 * finds it the usual way (as the kiosk does).
 */
export function idAnswerFinal(kind: PhotoKind, status: string, tries: number): boolean {
  if (status !== "retry") return true;
  return kind === "find" && tries >= 2;
}

/** After the ID: the face photo, when asked for and the ID went through. */
export function faceNext(task: Pick<PhotoTask, "kind" | "face">, idStatus: string): boolean {
  if (!task.face) return false;
  if (task.kind === "find") return idStatus === "matched";
  return idStatus === "done";
}

/** What the phone shows. */
export type PhoneScreen =
  | "wait" // linked, nothing to do yet (the guest is answering on the tablet)
  | "id"
  | "face"
  | "sent" // done; the tablet carries on
  | "closed"; // the check-in at the door has finished or timed out

export function phoneScreen(
  task: PhotoTask | null,
  result: PhotoResult | null,
  open: boolean,
): PhoneScreen {
  if (!open) return "closed";
  if (!task) return "wait";
  const r = resultFor(result, task.n);
  if (task.kind === "face") return r?.face ? "sent" : "face";
  if (!r?.id) return "id";
  if (faceNext(task, String(r.id["status"] ?? "")) && !r.face) return "face";
  return "sent";
}

/**
 * What the kiosk shows at a photo step: the offer (square, "Text me the
 * link", and its own camera if it has one), or "carry on on your phone"
 * once a phone has the link open and the task has no answer yet.
 */
export type KioskHandoff = "offer" | "onPhone";

export function kioskHandoff(o: {
  connected: boolean;
  task: Pick<PhotoTask, "n"> | null;
  result: PhotoResult | null;
}): KioskHandoff {
  if (!o.connected || !o.task) return "offer";
  return resultFor(o.result, o.task.n) ? "offer" : "onPhone";
}

/**
 * A phone counts as connected while it checked in within this long; a
 * phone that went quiet (closed, locked) lets the tablet offer its own
 * camera again.
 */
export const PHONE_QUIET_MS = 20_000;

export const phoneConnected = (seenAt: string | null | undefined, now: number): boolean =>
  !!seenAt && now - new Date(seenAt).getTime() < PHONE_QUIET_MS;

/** The text with the link: short enough for one SMS (160 GSM characters) with a typical link. */
export function photoLinkText(property: string, url: string): string {
  const name = property.length > 40 ? `${property.slice(0, 39)}…` : property;
  return `${name}: take your check-in photos on your phone here ${url}`;
}

/** Mobile numbers only: E.164 with a plausible length. */
export const plausibleMobile = (e164: string): boolean => /^\+[1-9]\d{7,14}$/.test(e164);
