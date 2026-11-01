/**
 * Messages to guests by text, WhatsApp and email: what Latchkey admin sets
 * up once (the shared WhatsApp sender, Meta-approved templates) and the
 * rules each business's messages follow. Pure; tested in
 * tests/guest-messages.test.ts.
 */

/** Templates Meta must approve before WhatsApp lets a business message a guest first. */
export const WHATSAPP_TEMPLATES = ["photo_link", "welcome", "goodbye"] as const;
export type WhatsAppTemplateKey = (typeof WHATSAPP_TEMPLATES)[number];

export type WhatsAppSettings = {
  /** Latchkey's shared WhatsApp number (E.164), used until a business connects its own. */
  sender: string | null;
  /** Twilio Content template ids (HX…), one per message. */
  templates: Record<WhatsAppTemplateKey, string | null>;
};

const e164 = (v: unknown): string | null =>
  typeof v === "string" && /^\+[1-9]\d{7,14}$/.test(v.trim()) ? v.trim() : null;

const contentSid = (v: unknown): string | null =>
  typeof v === "string" && /^HX[0-9a-f]{32}$/i.test(v.trim()) ? v.trim() : null;

export function normaliseWhatsApp(raw: unknown, envSender: string | null = null): WhatsAppSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const t = (r["templates"] && typeof r["templates"] === "object" ? r["templates"] : {}) as Record<
    string,
    unknown
  >;
  return {
    sender: e164(r["sender"]) ?? e164(envSender?.replace(/^whatsapp:/, "")),
    templates: Object.fromEntries(WHATSAPP_TEMPLATES.map((k) => [k, contentSid(t[k])])) as Record<
      WhatsAppTemplateKey,
      string | null
    >,
  };
}
