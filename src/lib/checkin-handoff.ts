/**
 * Moving one check-in between the door tablet and a guest's phone, and back
 * (migration 0100 checkin_handoffs). The device in control saves where it is:
 * the screen it shows and the ones still to come, with what each register
 * form starts with. The other device reads it and opens exactly that screen.
 * Only one device is in control at a time ("at"); every change of hands bumps
 * "rev", so each side knows when the other has taken over.
 */

export type HandoffSide = "kiosk" | "phone";
export type RegisterAskKey = "nationality" | "document" | "place" | "destination";

export type HandoffStep =
  | { kind: "face"; position: number }
  | { kind: "companion"; position: number }
  | { kind: "register"; position: number; child: boolean; only?: RegisterAskKey[] | undefined };

export type HandoffPrefill = {
  fullName: string | null;
  nationality: string | null;
  documentNumber: string | null;
  placeOfIssue: string | null;
  homeAddress?: string | null;
  homeTown?: string | null;
  fromLastStay?: boolean;
};

export type HandoffState = {
  /** The screen showing first, then the ones still to come. */
  steps: HandoffStep[];
  /** Register forms' starting values, only for people still in `steps`. */
  prefill: Record<string, HandoffPrefill>;
};

const ASKS: RegisterAskKey[] = ["nationality", "document", "place", "destination"];
const MAX_STEPS = 40;

const text = (v: unknown, max = 120): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const pos = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 40 ? v : null;

/** Tidies a saved state from either device (or the database); anything odd is dropped. */
export function normaliseHandoff(raw: unknown): HandoffState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { steps?: unknown; prefill?: unknown };
  if (!Array.isArray(r.steps)) return null;
  const steps: HandoffStep[] = [];
  for (const s of r.steps.slice(0, MAX_STEPS)) {
    if (!s || typeof s !== "object") continue;
    const x = s as { position?: unknown; kind?: unknown; only?: unknown; child?: unknown };
    const position = pos(x.position);
    if (position === null) continue;
    if (x.kind === "face" || x.kind === "companion") steps.push({ kind: x.kind, position });
    else if (x.kind === "register") {
      const only = Array.isArray(x.only)
        ? ASKS.filter((a) => (x.only as unknown[]).includes(a))
        : undefined;
      steps.push({
        kind: "register",
        position,
        child: x.child === true,
        ...(only ? { only } : {}),
      });
    }
  }
  const wanted = new Set(steps.filter((s) => s.kind === "register").map((s) => s.position));
  const prefill: Record<string, HandoffPrefill> = {};
  if (r.prefill && typeof r.prefill === "object") {
    for (const [k, v] of Object.entries(r.prefill as Record<string, unknown>)) {
      const p = pos(Number(k));
      if (p === null || !wanted.has(p) || !v || typeof v !== "object") continue;
      const x = v as {
        fullName?: unknown;
        nationality?: unknown;
        documentNumber?: unknown;
        placeOfIssue?: unknown;
        homeAddress?: unknown;
        homeTown?: unknown;
        fromLastStay?: unknown;
      };
      prefill[String(p)] = {
        fullName: text(x.fullName),
        nationality: text(x.nationality, 12),
        documentNumber: text(x.documentNumber, 40),
        placeOfIssue: text(x.placeOfIssue),
        homeAddress: text(x.homeAddress, 300),
        homeTown: text(x.homeTown),
        ...(x.fromLastStay === true ? { fromLastStay: true } : {}),
      };
    }
  }
  return { steps, prefill };
}

/** Whether `side` may save: only the device in control (or anyone before a hand-off starts). */
export function maySave(at: HandoffSide | null, side: HandoffSide): boolean {
  return at === null || at === side;
}

/** What a device should do after reading the hand-off: carry on, finish, or wait while the other has it. */
export function handoffView(
  me: HandoffSide,
  now: { at: HandoffSide | null; completed: boolean },
  /** This device is adding someone after the lead finished: "completed" was already true, so it never means done. */
  adding = false,
): "done" | "mine" | "elsewhere" {
  if (now.completed && !adding) return "done";
  return now.at === null || now.at === me ? "mine" : "elsewhere";
}
