/**
 * The host's side of notifications and booking-site messages: where alerts
 * go, this device's push alerts, linking Telegram, a test alert, and the
 * forwarding address for Airbnb / Booking.com emails.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { requireOwner, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();
type Loose = { from: (t: string) => any };
const loose = (c: unknown) => c as Loose;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return loose(supabaseAdmin);
}

function randomCode(n: number) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return [...crypto.getRandomValues(new Uint8Array(n))].map((b) => alphabet[b % alphabet.length]).join("");
}

export const getNotifySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { pushKeys, telegramToken, twilio, telegramCall, integrationSettings } = await import("./integrations.server");
    const { normalisePrefs } = await import("./notify");
    const { data: host, error } = await db.from("hosts").select("notify_prefs, contact_email, contact_phone, integration_modes, inbound_code").eq("id", data.hostId).maybeSingle();
    if (error) return { available: false as const };
    const [{ data: devices }, { data: chats }, { data: inbound }] = await Promise.all([
      loose(context.supabase).from("push_subscriptions").select("id, device, created_at, last_sent_at, failed_at, user_id").eq("host_id", data.hostId),
      loose(context.supabase).from("telegram_links").select("id, username, linked_at").eq("host_id", data.hostId),
      loose(context.supabase).from("inbound_emails").select("id, platform, subject, guest_name, booking_id, received_at, body").eq("host_id", data.hostId).order("received_at", { ascending: false }).limit(10),
    ]);
    let botName: string | null = null;
    if (telegramToken()) {
      const me = await telegramCall<{ username: string }>("getMe", {});
      botName = me.ok ? (me.result?.username ?? null) : null;
    }
    const settings = await integrationSettings();
    const { checkPhone } = await import("./world");
    const phoneOk = !!host?.contact_phone && checkPhone(host.contact_phone, "GB").ok;
    const modes = (host?.integration_modes ?? {}) as Record<string, string>;
    return {
      available: true as const,
      prefs: normalisePrefs(host?.notify_prefs),
      email: { address: host?.contact_email ?? null, live: modes["host_email"] !== "demo" },
      push: { ready: !!pushKeys(), publicKey: pushKeys()?.publicKey ?? null },
      telegram: { ready: !!botName, bot: botName },
      sms: { ready: !!twilio(), phone: phoneOk ? host!.contact_phone : null },
      devices: (devices ?? []) as Array<{ id: string; device: string | null; created_at: string; last_sent_at: string | null; failed_at: string | null; user_id: string }>,
      chats: (chats ?? []) as Array<{ id: string; username: string | null; linked_at: string }>,
      inbound: {
        address: settings.inboundAddress && host?.inbound_code ? settings.inboundAddress.replace("{code}", host.inbound_code) : null,
        ready: !!settings.inboundAddress,
        hasCode: !!host?.inbound_code,
        recent: (inbound ?? []) as Array<{ id: string; platform: string | null; subject: string | null; guest_name: string | null; booking_id: string | null; received_at: string; body: string | null }>,
      },
      me: context.userId,
    };
  });

const prefsSchema = z.object({ email: z.boolean(), push: z.boolean(), telegram: z.boolean(), sms: z.boolean(), smsUrgentOnly: z.boolean() });

export const saveNotifyPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, prefs: prefsSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, data.hostId);
    const db = await admin();
    const { error } = await db.from("hosts").update({ notify_prefs: data.prefs }).eq("id", data.hostId);
    if (error) throw new Error(error.message.includes("notify_prefs") ? "Notifications need the latest update (migration 0032)." : error.message);
    return { ok: true };
  });

/** This browser asked for push alerts. Returns the token the service worker uses to fetch the newest alert. */
export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, endpoint: z.string().url().max(1000), device: z.string().max(120).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireWrite(context.supabase, data.hostId);
    const { sha256 } = await import("./notify.server");
    const token = `${randomCode(24)}${randomCode(16)}`;
    const db = await admin();
    const { error } = await db
      .from("push_subscriptions")
      .upsert(
        { host_id: data.hostId, user_id: context.userId, endpoint: data.endpoint, token_hash: await sha256(token), device: data.device, failed_at: null },
        { onConflict: "endpoint" },
      );
    if (error) throw new Error(error.message.includes("push_subscriptions") ? "Push alerts need the latest update (migration 0032)." : error.message);
    return { token };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid.optional(), endpoint: z.string().max(1000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS: your own devices, or any of the business's if you can manage it.
    let q = loose(context.supabase).from("push_subscriptions").delete();
    q = data.id ? q.eq("id", data.id) : q.eq("endpoint", data.endpoint ?? "");
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** A one-time link that opens the Latchkey bot in Telegram and links that chat to this business. */
export const createTelegramLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireWrite(context.supabase, data.hostId);
    const { telegramCall } = await import("./integrations.server");
    const me = await telegramCall<{ username: string }>("getMe", {});
    if (!me.ok || !me.result?.username) throw new Error("Telegram alerts aren't set up for Latchkey yet.");
    const code = randomCode(20);
    const db = await admin();
    const { error } = await db
      .from("telegram_link_codes")
      .insert({ code, host_id: data.hostId, user_id: context.userId, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() });
    if (error) throw new Error(error.message);
    return { url: `https://t.me/${me.result.username}?start=${code}` };
  });

export const removeTelegramLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await loose(context.supabase).from("telegram_links").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Sends a test alert down every channel the business has chosen, and says what happened. */
export const sendTestAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireWrite(context.supabase, data.hostId);
    const db = await admin();
    const { data: alert } = await db
      .from("host_alerts")
      .insert({ host_id: data.hostId, kind: "service_request", message: "This is a test alert from Latchkey. You can mark it as seen." })
      .select("id")
      .maybeSingle();
    const { notifyHost } = await import("./notify.server");
    return notifyHost({ hostId: data.hostId, kind: "test", message: "This is a test alert from Latchkey.", alertId: alert?.id ?? null });
  });

/** The business's forwarding address for booking-site emails (made the first time). */
export const ensureInboundAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireOwner(context.supabase, data.hostId);
    const db = await admin();
    const { data: host } = await db.from("hosts").select("inbound_code").eq("id", data.hostId).maybeSingle();
    if (host?.inbound_code) return { ok: true };
    const { error } = await db.from("hosts").update({ inbound_code: randomCode(12) }).eq("id", data.hostId).is("inbound_code", null);
    if (error) throw new Error(error.message.includes("inbound_code") ? "Booking-site messages need the latest update (migration 0032)." : error.message);
    return { ok: true };
  });
