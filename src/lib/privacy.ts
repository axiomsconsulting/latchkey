/**
 * Each business's privacy and retention choices (hosts.privacy, migration
 * 0041): how long guests' details and messages stay after check-out. Pure;
 * the daily sweep (runRetentionSweep) applies them. Records set by law (the
 * UK guest register, invoices) and the per-property ID photo days
 * (properties.guest_records) have their own rules.
 */
import { addDays } from "./dates";

export const DETAIL_DAY_CHOICES = [30, 90, 180, 365] as const;
/** 0 = keep messages until the stay is deleted. */
export const MESSAGE_DAY_CHOICES = [90, 180, 365, 0] as const;

export type DetailDays = (typeof DETAIL_DAY_CHOICES)[number];
export type MessageDays = (typeof MESSAGE_DAY_CHOICES)[number];

export type Privacy = {
  /** Days after check-out before the guest's name, email, phone digits and notes are cleared from the stay. */
  guestDetailsDays: DetailDays;
  /** Days after check-out before the stay's messages are deleted; 0 keeps them. */
  messagesDays: MessageDays;
};

export const DEFAULT_PRIVACY: Privacy = { guestDetailsDays: 90, messagesDays: 0 };

export function normalisePrivacy(raw: unknown): Privacy {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const details = DETAIL_DAY_CHOICES.includes(r["guestDetailsDays"] as DetailDays)
    ? (r["guestDetailsDays"] as DetailDays)
    : DEFAULT_PRIVACY.guestDetailsDays;
  const messages = MESSAGE_DAY_CHOICES.includes(r["messagesDays"] as MessageDays)
    ? (r["messagesDays"] as MessageDays)
    : DEFAULT_PRIVACY.messagesDays;
  return { guestDetailsDays: details, messagesDays: messages };
}

/** Stays that checked out before this day have their guest details cleared today. */
export function detailsCutoff(today: string, p: Privacy): string {
  return addDays(today, -p.guestDetailsDays);
}

/** Stays that checked out before this day lose their messages today; null when messages are kept. */
export function messagesCutoff(today: string, p: Privacy): string | null {
  return p.messagesDays === 0 ? null : addDays(today, -p.messagesDays);
}
