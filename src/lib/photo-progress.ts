/**
 * What the guest is told while a photo is being dealt with (IdCamera): an ID
 * is sent, read by the ID reader (the slow part, a few seconds) and matched
 * to the booking; a face photo is only saved. The bar fills quickly at first
 * and then ever more slowly, never reaching the end until the answer comes.
 * Pure, so it can be tested.
 */

export type PhotoStage = "sending" | "reading" | "matching" | "nearly" | "saving";

export function photoStage(kind: "id" | "face", ms: number): PhotoStage {
  if (kind === "face") return "saving";
  if (ms < 1200) return "sending";
  if (ms < 6500) return "reading";
  if (ms < 11000) return "matching";
  return "nearly";
}

/** 0–0.95: about half way at 3 s for an ID (1 s for a face). */
export function photoFill(kind: "id" | "face", ms: number): number {
  const half = kind === "face" ? 1000 : 3000;
  return Math.min(0.95, 1 - Math.pow(0.5, Math.max(0, ms) / half));
}
