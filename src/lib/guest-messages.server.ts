/* eslint-disable @typescript-eslint/no-explicit-any -- guest_messages and the *_message_at columns are from migration 0080 */
/**
 * Sends each property's welcome and goodbye messages when they're due
 * (rules in src/lib/guest-messages.ts), run with the calendar sync. Each
 * message is claimed on the booking before it goes, so it's sent once.
 * The phone gets WhatsApp or a text (as the host chose and what's set up);
 * email goes only to a guest's own address. Every message is logged in the
 * stay's conversation, marked when demo mode kept it back. Server only.
 */
import {
  dueMessages,
  fillMessage,
  normaliseGuestMessages,
  phoneChannel,
  realEmail,
  type GuestMessagesSettings,
} from "./guest-messages";

type Loose = { from: (t: string) => any };

async function db(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

/** How a message that didn't go reads in the conversation. */
const NOT_SENT: Record<string, string> = {
  demo: "Demo mode, not sent",
  failed: "Couldn't be sent",
  unavailable: "Not sent (not set up)",
};

const firstName = (full: string | null) => (full ?? "").trim().split(/\s+/)[0] ?? "";

/** A six-hour link to one of the guide's attached files (WhatsApp and email only). */
async function attachmentLink(propertyId: string, id: string | null): Promise<string | null> {
  if (!id) return null;
  const { attachmentsFor } = await import("./attachments.server");
  const all = Object.values(await attachmentsFor(propertyId)).flat();
  return all.find((a) => a.id === id)?.url ?? null;
}

export async function sendDueGuestMessages(): Promise<{ sent: number }> {
  const rows = await db();
  const { data: props, error } = await rows
    .from("properties")
    .select(
      "id, host_id, name, short_code, timezone, default_check_in_time, default_check_out_time, guest_messages",
    )
    .eq("active", true)
    .not("guest_messages", "is", null);
  if (error || !props?.length) return { sent: 0 };
  const { zonedParts } = await import("./dates");
  let sent = 0;
  for (const p of props) {
    const s = normaliseGuestMessages(p.guest_messages);
    if (!s.welcome.on && !s.goodbye.on) continue;
    const local = zonedParts(new Date(), p.timezone ?? "Europe/London");
    const { data: stays } = await rows
      .from("bookings")
      .select(
        "id, status, guest_full_name, guest_email, guest_phone, check_in_date, check_out_date, check_in_time, check_out_time, welcome_message_at, goodbye_message_at, archived_at, mirror_of, rooms(display_name)",
      )
      .eq("property_id", p.id)
      .or(`check_in_date.eq.${local.date},check_out_date.eq.${local.date}`)
      .is("archived_at", null)
      .is("mirror_of", null);
    for (const stay of stays ?? []) {
      for (const kind of dueMessages(s, stay, local)) {
        const col = kind === "welcome" ? "welcome_message_at" : "goodbye_message_at";
        // Claimed first: a second run at the same moment finds it taken.
        const { data: claimed } = await rows
          .from("bookings")
          .update({ [col]: new Date().toISOString() })
          .eq("id", stay.id)
          .is(col, null)
          .select("id");
        if (!claimed?.length) continue;
        sent += await sendOne(p, s, stay, kind);
      }
    }
  }
  return { sent };
}

async function sendOne(
  p: any,
  s: GuestMessagesSettings,
  stay: any,
  kind: "welcome" | "goodbye",
): Promise<number> {
  const { publicOrigin } = await import("./integrations.server");
  const { guideWindow } = await import("./guide");
  const { shortLinkFor } = await import("./stay-links.server");
  const { guestChannels, sendGuestText } = await import("./guest-messaging.server");
  const origin = publicOrigin();
  const tz = p.timezone ?? "Europe/London";
  const checkin = (stay.check_in_time ?? p.default_check_in_time ?? "15:00").slice(0, 5);
  const checkout = (stay.check_out_time ?? p.default_check_out_time ?? "11:00").slice(0, 5);
  const win = guideWindow(stay.check_in_date, stay.check_out_date, checkout, tz);
  const words = await shortLinkFor(stay.id, win.expiresAt);
  const guide = words ? `${origin}/g/${words}` : "";
  const vars = {
    name: firstName(stay.guest_full_name),
    property: p.name,
    guide,
    checkin,
    checkout,
    room: stay.rooms?.display_name ?? "",
    book: `${origin}/book/${p.short_code}`,
  };
  const body = fillMessage(kind === "welcome" ? s.welcome.text : s.goodbye.text, vars);
  const ch = await guestChannels(p.host_id);
  const media = kind === "welcome" ? await attachmentLink(p.id, s.attachmentId) : null;
  const log: Array<{ via: string; status: string }> = [];

  const route = phoneChannel(s.phone, {
    sms: ch.sms,
    whatsapp: ch.whatsapp && !!ch.whatsappTemplates[kind],
  });
  if (route && stay.guest_phone) {
    // WhatsApp uses the wording Meta approved, filled in: name, property, then the link.
    const link = kind === "welcome" ? guide : vars.book;
    let status = await sendGuestText({
      hostId: p.host_id,
      to: stay.guest_phone,
      channel: route,
      body,
      template: { key: kind, vars: [vars.name, p.name, link] },
      mediaUrl: media,
    });
    let via: string = route;
    if (route === "whatsapp" && status === "failed" && s.phone === "auto" && ch.sms) {
      status = await sendGuestText({
        hostId: p.host_id,
        to: stay.guest_phone,
        channel: "sms",
        body,
      });
      via = "sms";
    }
    log.push({ via, status });
  }

  if (s.email && realEmail(stay.guest_email)) {
    let status: string = "demo";
    if (!ch.demo) {
      const { sendGuestEmail } = await import("./alert-email.server");
      const ok = await sendGuestEmail({
        to: stay.guest_email,
        subject: kind === "welcome" ? `Welcome to ${p.name}` : `Thank you for staying at ${p.name}`,
        body: media ? `${body}\n\nAttached for you: ${media}` : body,
        from: p.name,
        key: `${kind}-${stay.id}`,
      });
      status = ok ? "sent" : "failed";
    }
    log.push({ via: "email", status });
  }

  // In the stay's conversation, so the host sees what went (or would have gone).
  const rows = await db();
  for (const l of log) {
    await rows.from("messages").insert({
      booking_id: stay.id,
      direction: "outbound",
      channel: "guest_text",
      platform: l.via,
      body: l.status === "sent" ? body : `${NOT_SENT[l.status] ?? "Not sent"}: ${body}`,
      sent_at: l.status === "sent" ? new Date().toISOString() : null,
    });
  }
  // Nothing could go (no number or address): free the claim so a number added later still gets it today.
  if (!log.length) {
    const col = kind === "welcome" ? "welcome_message_at" : "goodbye_message_at";
    await rows
      .from("bookings")
      .update({ [col]: null })
      .eq("id", stay.id);
  }
  return log.filter((l) => l.status === "sent").length;
}
