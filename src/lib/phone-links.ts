/**
 * Calling or messaging a guest from their number: standard tel: and sms:
 * links, which every device hands to whatever it uses for calls and texts
 * (the phone app on a phone; iPhone handoff on a Mac; Phone Link on
 * Windows), and a WhatsApp chat link. Pure.
 */

/** A full number in international form, e.g. +447700900123. */
export const isE164 = (v: string | null | undefined): v is string =>
  !!v && /^\+[1-9]\d{6,14}$/.test(v);

/** The last 4 digits, as guests confirm at check-in. */
export const lastFour = (e164: string) => e164.replace(/\D/g, "").slice(-4);

export function phoneLinks(e164: string): { call: string; text: string; whatsapp: string } {
  const digits = e164.replace(/\D/g, "");
  return { call: `tel:${e164}`, text: `sms:${e164}`, whatsapp: `https://wa.me/${digits}` };
}
