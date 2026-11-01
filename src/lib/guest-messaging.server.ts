/* eslint-disable @typescript-eslint/no-explicit-any -- reads settings the generated Supabase types don't cover */
/**
 * Texts and WhatsApp messages to guests, through Latchkey's Twilio account.
 * Every send checks the business's guest-messages switch
 * (hosts.integration_modes.guest_messages): in demo nothing leaves Latchkey
 * and the caller is told so. WhatsApp needs a sender (the business's own
 * number once Latchkey support has connected it, else Latchkey's shared one)
 * and, for a message the guest didn't start, a template Meta has approved
 * (site_settings.integrations.whatsapp.templates). Server only.
 */
import { normaliseWhatsApp, type WhatsAppTemplateKey } from "./guest-messages";

export type SendStatus = "sent" | "demo" | "failed" | "unavailable";

const env = (k: string) => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : null;
};

async function loose() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
}

/** Latchkey admin's WhatsApp settings: the shared sender and the approved templates. */
export async function whatsAppSettings() {
  try {
    const { data } = await (
      await loose()
    )
      .from("site_settings")
      .select("integrations")
      .eq("id", 1)
      .maybeSingle();
    return normaliseWhatsApp(data?.integrations?.whatsapp, env("TWILIO_WHATSAPP_FROM"));
  } catch {
    return normaliseWhatsApp(null, env("TWILIO_WHATSAPP_FROM"));
  }
}

/** The business's own WhatsApp number, once connected (hosts.whatsapp, migration 0080). */
async function ownSender(hostId: string): Promise<string | null> {
  try {
    const { data, error } = await (
      await loose()
    )
      .from("hosts")
      .select("whatsapp")
      .eq("id", hostId)
      .maybeSingle();
    if (error) return null;
    const w = data?.whatsapp as { sender?: unknown; status?: unknown } | null;
    return w && w.status === "live" && typeof w.sender === "string" ? w.sender : null;
  } catch {
    return null;
  }
}

/** Which ways of reaching a guest this business has now. */
export async function guestChannels(hostId: string) {
  const { twilio } = await import("./integrations.server");
  const { hostModes } = await import("./checkin.server");
  const [modes, wa, own] = await Promise.all([
    hostModes(hostId),
    whatsAppSettings(),
    ownSender(hostId),
  ]);
  const t = twilio();
  return {
    demo: modes.guest_messages !== "live",
    sms: !!t,
    whatsapp: !!t && !!(own ?? wa.sender),
    whatsappTemplates: wa.templates,
    sender: own ?? wa.sender,
  };
}

async function twilioSend(form: URLSearchParams): Promise<boolean> {
  const { twilio } = await import("./integrations.server");
  const t = twilio();
  if (!t) return false;
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(t.sid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${t.sid}:${t.token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * One message to a guest. SMS is plain text. WhatsApp uses the approved
 * template for `template` (its variables in order) and may carry one
 * attachment (a public https link: a photo or PDF); without an approved
 * template it isn't sent.
 */
export async function sendGuestText(input: {
  hostId: string;
  to: string;
  channel: "sms" | "whatsapp";
  body: string;
  template?: { key: WhatsAppTemplateKey; vars: string[] } | undefined;
  mediaUrl?: string | null | undefined;
}): Promise<SendStatus> {
  const ch = await guestChannels(input.hostId);
  if (input.channel === "sms" ? !ch.sms : !ch.whatsapp) return "unavailable";
  if (ch.demo) return "demo";
  const { twilio } = await import("./integrations.server");
  const { bumpUsage } = await import("./usage.server");
  const form = new URLSearchParams();
  if (input.channel === "sms") {
    const from = twilio()!.from;
    form.set("To", input.to);
    form.set("Body", input.body);
    if (from.startsWith("MG")) form.set("MessagingServiceSid", from);
    else form.set("From", from);
  } else {
    const sid = input.template ? ch.whatsappTemplates[input.template.key] : null;
    if (!sid) return "unavailable";
    form.set("To", `whatsapp:${input.to}`);
    form.set("From", `whatsapp:${ch.sender}`);
    form.set("ContentSid", sid);
    form.set(
      "ContentVariables",
      JSON.stringify(
        Object.fromEntries((input.template?.vars ?? []).map((v, i) => [String(i + 1), v])),
      ),
    );
    if (input.mediaUrl && /^https:\/\//.test(input.mediaUrl)) form.set("MediaUrl", input.mediaUrl);
  }
  const ok = await twilioSend(form);
  if (ok) await bumpUsage(input.hostId, `${input.channel}:guest`).catch(() => undefined);
  return ok ? "sent" : "failed";
}
