/**
 * Server-only helpers for guest check-in. Guests never touch tables directly;
 * every read and write here uses the admin client after the caller's answers
 * or session token have been checked.
 */

import { createHash, randomBytes } from "crypto";

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: sha256(token) };
}

/** Device ids are random per browser; we only ever store a salted hash. */
export function deviceHash(propertyId: string, deviceId: string): string {
  return sha256(`${propertyId}:${deviceId}`);
}

export async function loadPropertyByCode(code: string) {
  const db = await admin();
  const { data } = await db
    .from("properties")
    .select(
      "id, host_id, name, short_code, timezone, check_in_pin, checkin_methods, default_check_out_time, quiet_hours_start, quiet_hours_end, wifi_name, wifi_password, parking_notes, host_contact_name, host_contact_phone, active, theme_config",
    )
    .eq("short_code", code.toLowerCase())
    .eq("active", true)
    .maybeSingle();
  return data;
}

/** The host's demo/live switches. */
export async function hostModes(hostId: string) {
  const { normaliseModes } = await import("./integration-modes");
  const db = await admin();
  const { data } = await db.from("hosts").select("integration_modes").eq("id", hostId).maybeSingle();
  return normaliseModes(data?.integration_modes);
}

export type Session = {
  id: string;
  property_id: string;
  booking_id: string;
  confirmed: boolean;
  verified_method: string | null;
  photo_attempts: number;
  last4_attempts: number;
  completed_at: string | null;
};

export async function loadSession(token: string): Promise<Session> {
  const db = await admin();
  const { data } = await db
    .from("checkin_sessions")
    .select("id, property_id, booking_id, confirmed, verified_method, photo_attempts, last4_attempts, completed_at, expires_at")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (!data || Date.parse(data.expires_at) < Date.now()) {
    throw new Error("This check-in has timed out. Please start again.");
  }
  return data as Session;
}

/** Records an alert for the host and emails it when email is set up. */
export async function raiseAlert(input: {
  hostId: string;
  propertyId: string;
  bookingId?: string | null;
  kind: "lockout" | "id_mismatch" | "id_partial" | "self_declared" | "service_request";
  message: string;
}) {
  const db = await admin();
  const { data } = await db
    .from("host_alerts")
    .insert({
      host_id: input.hostId,
      property_id: input.propertyId,
      booking_id: input.bookingId ?? null,
      kind: input.kind,
      message: input.message,
    })
    .select("id")
    .single();
  try {
    const modes = await hostModes(input.hostId);
    if (modes.host_email === "demo") {
      console.info("[demo] host alert email not sent:", input.message);
      return;
    }
    const { sendAlertEmail } = await import("./alert-email.server");
    const sent = await sendAlertEmail(input.hostId, input.message);
    if (sent && data) {
      await db.from("host_alerts").update({ emailed_at: new Date().toISOString() }).eq("id", data.id);
    }
  } catch (err) {
    console.error("Alert email failed", err);
  }
}

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

/**
 * Reads the holder's name from a photo of an ID document. The image is held
 * in memory for this call only and never written anywhere.
 */
export async function readNameFromId(imageDataUrl: string): Promise<{ name: string | null; isId: boolean }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("ID reading is not configured.");

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      store: false,
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "This photo should show a passport, driving licence or national ID card. " +
                "Return only the holder's full name exactly as printed (given names then surname). " +
                "If the image is not an ID document or the name cannot be read clearly, set full_name to null. " +
                "Do not return any other details from the document.",
            },
            { type: "input_image", image_url: imageDataUrl },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "id_name",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              is_id_document: { type: "boolean" },
              full_name: { type: ["string", "null"] },
            },
            required: ["is_id_document", "full_name"],
          },
        },
      },
    }),
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    console.error(`ID read failed [${res.status}]: ${body.slice(0, 500)}`);
    throw new Error(res.status === 402 ? "ID reading is paused." : "We could not read the photo.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload) as { type?: string; delta?: string; error?: { message?: string } };
        if (evt.type === "response.output_text.delta" && evt.delta) text += evt.delta;
        if (evt.type === "error" || evt.type === "response.failed") {
          console.error("ID read stream error", payload.slice(0, 300));
          throw new Error("We could not read the photo.");
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("We could not")) throw e;
      }
    }
  }

  try {
    const parsed = JSON.parse(text) as { is_id_document: boolean; full_name: string | null };
    return { name: parsed.full_name?.trim() || null, isId: Boolean(parsed.is_id_document) };
  } catch {
    return { name: null, isId: false };
  }
}
