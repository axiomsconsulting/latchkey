/**
 * Sends a host alert everywhere the business wants it: push to their
 * devices, Telegram, email and (for urgent alerts) SMS. Each channel must be
 * set up by the super admin, switched on in Routines, and chosen by the host.
 * Never throws: an alert is always saved on Today whatever happens here.
 */
import { CHANNELS, alertPath, alertTitle, channelsFor, normalisePrefs, smsText, type AlertKind, type Available, type Channel } from "./notify";
import { rebrand } from "@/lib/brand";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
}

export type NotifyResult = Partial<Record<Channel, "sent" | "failed" | "skipped">>;

export async function notifyHost(input: {
  hostId: string;
  kind: AlertKind;
  message: string;
  bookingId?: string | null;
  alertId?: string | null;
  skip?: Channel[];
}): Promise<NotifyResult> {
  const result: NotifyResult = {};
  try {
    const d = await db();
    const { pushKeys, telegramToken, twilio, publicOrigin } = await import("./integrations.server");
    const { jobAllowed, bumpUsage } = await import("./usage.server");
    const { hostModes } = await import("./checkin.server");
    const [{ data: host }, { data: subs }, { data: chats }, modes] = await Promise.all([
      d.from("hosts").select("notify_prefs, contact_email, contact_phone, business_name").eq("id", input.hostId).maybeSingle(),
      d.from("push_subscriptions").select("id, endpoint").eq("host_id", input.hostId).limit(20),
      d.from("telegram_links").select("chat_id").eq("host_id", input.hostId).limit(10),
      hostModes(input.hostId),
    ]);
    const prefs = normalisePrefs(host?.notify_prefs);
    const keys = pushKeys();
    const phone = typeof host?.contact_phone === "string" && host.contact_phone.startsWith("+") ? host.contact_phone : null;
    const allowed = async (job: string) => jobAllowed(job);
    const available: Available = {
      // Email follows the host's demo/live switch, as before.
      email: !!host?.contact_email && modes.host_email !== "demo" && (await allowed("email_alerts")),
      push: !!keys && (subs ?? []).length > 0 && (await allowed("push_alerts")),
      telegram: !!telegramToken() && (chats ?? []).length > 0 && (await allowed("telegram_alerts")),
      sms: !!twilio() && !!phone && (await allowed("sms_alerts")),
    };
    const send = channelsFor(input.kind, prefs, available).filter((c) => !(input.skip ?? []).includes(c));
    for (const ch of CHANNELS) if (!send.includes(ch)) result[ch] = "skipped";

    const title = alertTitle(input.kind);
    const link = `${publicOrigin()}${alertPath(input.kind, input.bookingId ?? null)}`;

    if (send.includes("push") && keys) {
      const { sendPush } = await import("./webpush");
      let ok = 0;
      for (const s of (subs ?? []) as Array<{ id: string; endpoint: string }>) {
        const r = await sendPush(s.endpoint, keys);
        if (r === "gone") await d.from("push_subscriptions").delete().eq("id", s.id);
        else if (r === "sent") {
          ok++;
          await d.from("push_subscriptions").update({ last_sent_at: new Date().toISOString(), failed_at: null }).eq("id", s.id);
        } else await d.from("push_subscriptions").update({ failed_at: new Date().toISOString() }).eq("id", s.id);
      }
      result.push = ok ? "sent" : "failed";
      if (ok) await bumpUsage(input.hostId, "push:sent", ok);
    }

    if (send.includes("telegram")) {
      const { telegramCall } = await import("./integrations.server");
      let ok = 0;
      for (const c of (chats ?? []) as Array<{ chat_id: number }>) {
        const r = await telegramCall("sendMessage", {
          chat_id: c.chat_id,
          text: `🔔 ${title}\n${input.message}`,
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: [[{ text: rebrand("Open in Latchkey"), url: link }]] },
        });
        if (r.ok) ok++;
        // The host blocked the bot or left the chat: forget it.
        else if (/blocked|chat not found|kicked|deactivated/i.test(r.description ?? "")) await d.from("telegram_links").delete().eq("host_id", input.hostId).eq("chat_id", c.chat_id);
      }
      result.telegram = ok ? "sent" : "failed";
      if (ok) await bumpUsage(input.hostId, "telegram:sent", ok);
    }

    if (send.includes("email")) {
      const { sendAlertEmail } = await import("./alert-email.server");
      const sent = await sendAlertEmail(input.hostId, `${input.message}\n\n${link}`, input.alertId ?? undefined);
      result.email = sent ? "sent" : "failed";
      if (sent) {
        await bumpUsage(input.hostId, "email:alert");
        if (input.alertId) await d.from("host_alerts").update({ emailed_at: new Date().toISOString() }).eq("id", input.alertId);
      }
    }

    if (send.includes("sms") && phone) {
      const { sendSms } = await import("./integrations.server");
      const ok = await sendSms(phone, smsText(input.kind, input.message, link));
      result.sms = ok ? "sent" : "failed";
      if (ok) await bumpUsage(input.hostId, "sms:sent");
    }
  } catch (err) {
    console.error("Host notification failed", err instanceof Error ? err.message : err);
  }
  return result;
}

/** The newest unseen alert for the business behind a device token (asked for by the service worker). */
export async function latestForDevice(token: string): Promise<{ title: string; body: string; url: string; tag: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const d = await db();
  const hash = await sha256(token);
  const { data: sub } = await d.from("push_subscriptions").select("host_id").eq("token_hash", hash).maybeSingle();
  if (!sub) return null;
  const { data: alert } = await d
    .from("host_alerts")
    .select("id, kind, message, booking_id, created_at")
    .eq("host_id", sub.host_id)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!alert) return { title: rebrand("Latchkey"), body: "Open Today to see what's new.", url: "/app/today", tag: "latchkey" };
  return { title: alertTitle(alert.kind), body: alert.message, url: alertPath(alert.kind, alert.booking_id), tag: `alert-${alert.id}` };
}

export async function sha256(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
