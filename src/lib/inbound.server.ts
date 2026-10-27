/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * Booking-site emails forwarded by hosts: who it's for, which stay, and the
 * guest's message added to that stay's conversation. Server only.
 */
import { hostCode, matchStay, parseInbound, type InboundEmail } from "./platform-email";

/** Postmark's inbound JSON, or the plain shape our Cloudflare Email Worker posts. */
export function normalise(raw: Record<string, any>): InboundEmail {
  if ("TextBody" in raw || "FromFull" in raw || "MailboxHash" in raw) {
    const headers = (raw["Headers"] ?? []) as Array<{ Name: string; Value: string }>;
    const header = (n: string) => headers.find((h) => h.Name?.toLowerCase() === n)?.Value ?? null;
    const to = [
      raw["OriginalRecipient"],
      ...((raw["ToFull"] ?? []) as Array<{ Email: string }>).map((t) => t.Email),
      raw["To"],
    ].filter((x): x is string => typeof x === "string" && !!x);
    return {
      to,
      from: String(raw["From"] ?? ""),
      replyTo: (raw["ReplyTo"] as string) || header("reply-to"),
      subject: String(raw["Subject"] ?? ""),
      text: String(raw["TextBody"] ?? ""),
      html: (raw["HtmlBody"] as string) ?? null,
      messageId: header("message-id") ?? (raw["MessageID"] as string) ?? null,
      mailboxHash: (raw["MailboxHash"] as string) ?? null,
    };
  }
  const to = Array.isArray(raw["to"]) ? raw["to"] : [raw["to"]];
  return {
    to: to.filter((x: unknown): x is string => typeof x === "string"),
    from: String(raw["from"] ?? ""),
    replyTo: (raw["replyTo"] as string) ?? null,
    subject: String(raw["subject"] ?? ""),
    text: String(raw["text"] ?? ""),
    html: (raw["html"] as string) ?? null,
    messageId: (raw["messageId"] as string) ?? null,
  };
}

const PLATFORM_LABEL: Record<string, string> = {
  airbnb: "Airbnb",
  booking_com: "Booking.com",
  vrbo: "Vrbo",
  expedia: "Expedia",
  other: "a booking site",
};

export async function receiveInbound(raw: Record<string, any>) {
  const { jobAllowed, bumpUsage } = await import("./usage.server");
  if (!(await jobAllowed("inbound_email"))) return { ok: false, reason: "switched_off" };
  const email = normalise(raw);
  const code = hostCode(email);
  if (!code) return { ok: false, reason: "no_business" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as { from: (t: string) => any };
  const { data: host } = await db
    .from("hosts")
    .select("id, timezone")
    .eq("inbound_code", code)
    .maybeSingle();
  if (!host) return { ok: false, reason: "unknown_business" };
  await bumpUsage(host.id, "inbound:email");

  const parsed = parseInbound(email);
  const messageId = email.messageId?.slice(0, 300) ?? null;
  if (messageId) {
    const { data: dup } = await db
      .from("inbound_emails")
      .select("id")
      .eq("message_id", messageId)
      .maybeSingle();
    if (dup) return { ok: true, duplicate: true };
  }

  if (parsed.kind === "forward_confirm") {
    await db.from("inbound_emails").insert({
      host_id: host.id,
      platform: "gmail_confirm",
      from_addr: email.from.slice(0, 320),
      subject: email.subject.slice(0, 500),
      body: [parsed.code ? `Confirmation code: ${parsed.code}` : null, parsed.link]
        .filter(Boolean)
        .join("\n"),
      message_id: messageId,
    });
    return { ok: true, kind: "forward_confirm" };
  }

  // Stays from around now, at any of the business's properties.
  const { data: props } = await db.from("properties").select("id").eq("host_id", host.id);
  const propertyIds = ((props ?? []) as Array<{ id: string }>).map((p) => p.id);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: host.timezone ?? "Europe/London",
  }).format(new Date());
  const { data: stays } = propertyIds.length
    ? await db
        .from("bookings")
        .select(
          "id, property_id, channel, reservation_code, guest_full_name, check_in_date, check_out_date, status",
        )
        .in("property_id", propertyIds)
        .gte("check_out_date", new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10))
        .not("status", "in", "(cancelled,blocked)")
        .limit(500)
    : { data: [] };
  const stay = matchStay(parsed, (stays ?? []) as any[], today);

  await db.from("inbound_emails").insert({
    host_id: host.id,
    booking_id: stay?.id ?? null,
    platform: parsed.platform,
    from_addr: email.from.slice(0, 320),
    reply_to: parsed.replyTo,
    subject: email.subject.slice(0, 500),
    guest_name: parsed.guestName,
    reservation_code: parsed.reservationCode,
    body: parsed.body.slice(0, 20000),
    message_id: messageId,
  });

  if (!stay) return { ok: true, matched: false };

  // A name from the platform fills a stay that didn't have one.
  if (!stay.guest_full_name && parsed.guestName) {
    await db
      .from("bookings")
      .update({
        guest_full_name: parsed.guestName,
        ...(stay.status === "needs_details" ? { status: "upcoming" } : {}),
      })
      .eq("id", stay.id);
  }
  if (parsed.kind === "message" && parsed.body) {
    await db.from("messages").insert({
      booking_id: stay.id,
      direction: "inbound",
      channel: "platform",
      platform: parsed.platform,
      reply_to: parsed.replyTo,
      external_id: messageId,
      body: parsed.body,
      sent_at: new Date().toISOString(),
    });
    const { raiseAlert } = await import("./checkin.server");
    await raiseAlert({
      hostId: host.id,
      propertyId: stay.property_id,
      bookingId: stay.id,
      kind: "service_request",
      message: `${parsed.guestName ?? "A guest"} on ${PLATFORM_LABEL[parsed.platform]}: ${parsed.body.slice(0, 140)}`,
      // They already have the platform's own email about it.
      skip: ["email"],
    });
  }
  return { ok: true, matched: true, bookingId: stay.id };
}
