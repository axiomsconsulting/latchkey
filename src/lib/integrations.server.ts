/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * Latchkey-wide integrations, set by the super admin. Secrets live in the
 * server's environment (Lovable Cloud → Secrets); everything else in
 * site_settings.integrations. Server only.
 */

const env = (k: string) => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : null;
};

export type IntegrationSettings = {
  /** The forwarding address hosts send booking-site emails to, with {code} for each business. */
  inboundAddress: string | null;
};

export async function integrationSettings(): Promise<IntegrationSettings> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as unknown as { from: (t: string) => any })
      .from("site_settings")
      .select("integrations")
      .eq("id", 1)
      .maybeSingle();
    const raw = (data?.integrations ?? {}) as Partial<IntegrationSettings>;
    const inbound =
      typeof raw.inboundAddress === "string" && raw.inboundAddress.includes("{code}")
        ? raw.inboundAddress
        : null;
    return { inboundAddress: inbound };
  } catch {
    return { inboundAddress: null };
  }
}

export function pushKeys() {
  const publicKey = env("VAPID_PUBLIC_KEY");
  const privateKey = env("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: env("VAPID_SUBJECT") ?? "mailto:support@latchkey.omsestates.uk",
  };
}

export function telegramToken() {
  return env("TELEGRAM_BOT_TOKEN");
}

export async function telegramSecret(): Promise<string | null> {
  const token = telegramToken();
  if (!token) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`latchkey-telegram:${token}`),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 40);
}

export function twilio() {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_FROM");
  if (!sid || !token || !from) return null;
  return { sid, token, from };
}

export function inboundSecret() {
  return env("INBOUND_EMAIL_SECRET");
}

export function publicOrigin(): string {
  return env("PUBLIC_SITE_URL")?.replace(/\/$/, "") ?? "https://latchkey.omsestates.uk";
}

/* ------------------------------- Telegram -------------------------------- */

export async function telegramCall<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; result?: T; description?: string }> {
  const token = telegramToken();
  if (!token) return { ok: false, description: "No Telegram bot set up." };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as { ok: boolean; result?: T; description?: string };
  } catch (e) {
    return { ok: false, description: e instanceof Error ? e.message : "Telegram didn't answer." };
  }
}

/* --------------------------------- SMS ----------------------------------- */

export async function sendSms(to: string, body: string): Promise<boolean> {
  const t = twilio();
  if (!t) return false;
  const form = new URLSearchParams({ To: to, Body: body });
  // A Messaging Service id (MG…) or a phone number / sender name.
  if (t.from.startsWith("MG")) form.set("MessagingServiceSid", t.from);
  else form.set("From", t.from);
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
