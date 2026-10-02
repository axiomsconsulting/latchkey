/**
 * Email delivery for host alerts and guest receipts, through the managed
 * sender. Returns false when sending fails or the recipient has opted out —
 * never pretend a message was sent.
 */
import { sendTemplateEmail } from "./email-templates/send-email";

async function send(to: string, title: string, body: string, from: string, key: string): Promise<boolean> {
  try {
    const res = await sendTemplateEmail("notice", to, { templateData: { title, body, from }, idempotencyKey: key });
    return res.sent;
  } catch (err) {
    console.error("Email send failed", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function sendAlertEmail(hostId: string, message: string, alertId?: string): Promise<boolean> {
  const { admin } = await import("./checkin.server");
  const db = await admin();
  const { data } = await db.from("hosts").select("contact_email, business_name").eq("id", hostId).maybeSingle();
  if (!data?.contact_email) return false;
  return send(data.contact_email, "Latchkey alert", message, data.business_name ?? "Latchkey", `alert-${alertId ?? crypto.randomUUID()}`);
}

export async function sendGuestEmail(args: { to: string; subject: string; body: string; from?: string; key?: string }): Promise<boolean> {
  return send(args.to, args.subject, args.body, args.from ?? "Latchkey", args.key ?? `guest-${crypto.randomUUID()}`);
}
