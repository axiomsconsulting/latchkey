import { rebrand } from "@/lib/brand";
/**
 * Where a host's alerts go: email, push to their devices, Telegram and SMS.
 * Each business chooses (hosts.notify_prefs); Latchkey's super admin decides
 * which channels exist at all (keys set) and can switch each off. Pure.
 */

export type Channel = "email" | "push" | "telegram" | "sms";
export const CHANNELS: Channel[] = ["email", "push", "telegram", "sms"];

export type AlertKind = "lockout" | "id_mismatch" | "id_partial" | "self_declared" | "service_request" | "party" | "handover" | "direct_enquiry" | "test";

/** Kinds that need the host now: the only ones sent by SMS unless the host asks for everything. */
export const URGENT: AlertKind[] = ["lockout", "handover", "party"];

export type NotifyPrefs = {
  email: boolean;
  push: boolean;
  telegram: boolean;
  sms: boolean;
  /** SMS costs money per message: by default only urgent alerts go by text. */
  smsUrgentOnly: boolean;
};

export const DEFAULT_PREFS: NotifyPrefs = { email: true, push: true, telegram: true, sms: false, smsUrgentOnly: true };

export function normalisePrefs(raw: unknown): NotifyPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof NotifyPrefs, unknown>>;
  const out = { ...DEFAULT_PREFS };
  for (const k of Object.keys(DEFAULT_PREFS) as Array<keyof NotifyPrefs>) {
    if (typeof r[k] === "boolean") out[k] = r[k] as boolean;
  }
  return out;
}

/** What the host has set up and Latchkey has switched on. */
export type Available = Record<Channel, boolean>;

/** The channels this alert goes to, cheapest first. */
export function channelsFor(kind: AlertKind, prefs: NotifyPrefs, available: Available): Channel[] {
  const out: Channel[] = [];
  if (prefs.push && available.push) out.push("push");
  if (prefs.telegram && available.telegram) out.push("telegram");
  if (prefs.email && available.email) out.push("email");
  if (prefs.sms && available.sms && (!prefs.smsUrgentOnly || URGENT.includes(kind) || kind === "test")) out.push("sms");
  return out;
}

const TITLES: Record<AlertKind, string> = {
  lockout: "Guest can't get in",
  id_mismatch: "ID check needs you",
  id_partial: "ID check needs you",
  self_declared: "Guest checked in without ID",
  service_request: "Guest request",
  party: "More guests than booked",
  handover: "Guest wants you to check them in",
  direct_enquiry: "New direct enquiry",
  test: "Test alert",
};

export function alertTitle(kind: string): string {
  return TITLES[kind as AlertKind] ?? rebrand("Latchkey");
}

/** Where tapping the alert should land. */
export function alertPath(kind: string, bookingId: string | null): string {
  if (kind === "direct_enquiry") return "/app/direct";
  if (bookingId && kind !== "test") return `/app/bookings?guest=${bookingId}`;
  return "/app/today";
}

/** A text message: short, with the link, under one SMS where possible. */
export function smsText(kind: string, message: string, link: string): string {
  const head = rebrand(`Latchkey: ${alertTitle(kind)}. `);
  const room = 160 - head.length - link.length - 1;
  const body = message.length > room ? `${message.slice(0, Math.max(0, room - 1))}…` : message;
  return `${head}${body} ${link}`;
}
