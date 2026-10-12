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

const PROPERTY_COLUMNS =
  "id, host_id, name, short_code, timezone, check_in_pin, checkin_methods, default_check_in_time, default_check_out_time, quiet_hours_start, quiet_hours_end, wifi_name, wifi_password, parking_notes, host_contact_name, host_contact_phone, active, theme_config, is_demo";

export async function loadPropertyByCode(code: string) {
  const db = await admin();
  const find = (cols: string) =>
    db.from("properties").select(cols).eq("short_code", code.toLowerCase()).eq("active", true).maybeSingle();
  const { data } = await withLegacy(
    () =>
      db
        .from("properties")
        .select(`${PROPERTY_COLUMNS}, guest_records`)
        .eq("short_code", code.toLowerCase())
        .eq("active", true)
        .maybeSingle(),
    () => find(PROPERTY_COLUMNS),
  );
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
  adults: number | null;
  children: number | null;
  companion_attempts: number;
};

export async function loadSession(token: string): Promise<Session> {
  const db = await admin();
  const legacy = "id, property_id, booking_id, confirmed, verified_method, photo_attempts, last4_attempts, completed_at, expires_at";
  const { data } = await withLegacy(
    () =>
      db
        .from("checkin_sessions")
        .select(`${legacy}, adults, children, companion_attempts`)
        .eq("token_hash", sha256(token))
        .maybeSingle(),
    () => db.from("checkin_sessions").select(legacy).eq("token_hash", sha256(token)).maybeSingle(),
  );
  if (!data || Date.parse(data.expires_at) < Date.now()) {
    throw new Error("This check-in has timed out. Please start again.");
  }
  const row = data as Partial<Session>;
  return { ...row, adults: row.adults ?? null, children: row.children ?? null, companion_attempts: row.companion_attempts ?? 0 } as Session;
}

/** Records an alert for the host and emails it when email is set up. */
export async function raiseAlert(input: {
  hostId: string;
  propertyId: string;
  bookingId?: string | null;
  kind: "lockout" | "id_mismatch" | "id_partial" | "self_declared" | "service_request" | "party";
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
    const sent = await sendAlertEmail(input.hostId, input.message, data?.id);
    if (sent && data) {
      await db.from("host_alerts").update({ emailed_at: new Date().toISOString() }).eq("id", data.id);
    }
  } catch (err) {
    console.error("Alert email failed", err);
  }
}

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

/**
 * Reads the key details from a photo of an ID document. The full-size image
 * is held in memory for this call only; whether a small copy is kept is the
 * caller's decision, based on the host's settings.
 */
export async function readIdDetails(imageDataUrl: string): Promise<import("./guest-records").IdRead> {
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
                "This photo should show a passport, driving licence, national ID card or residence permit. " +
                "Be strict: set is_id_document to false for anything that is not an official printed identity document. " +
                "Set looks_homemade to true if it is handwritten, a plain piece of paper or card with a name on it, a printout, " +
                "or a document shown on a phone or computer screen. " +
                "Set has_holder_photo to true only if the holder's face photo printed on the document is clearly visible. " +
                "Return the holder's full name exactly as printed (given names then surname), the date of birth and expiry date " +
                "as YYYY-MM-DD, the issuing country in English, and only the last 4 characters of the document number. " +
                "Use null for anything you cannot read clearly. Do not guess and do not return any other details.",
            },
            { type: "input_image", image_url: imageDataUrl },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "id_details",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              is_id_document: { type: "boolean" },
              has_holder_photo: { type: "boolean" },
              looks_homemade: { type: "boolean" },
              document_type: {
                type: ["string", "null"],
                enum: ["passport", "driving_licence", "national_id", "residence_permit", "other", null],
              },
              full_name: { type: ["string", "null"] },
              date_of_birth: { type: ["string", "null"] },
              expiry_date: { type: ["string", "null"] },
              issuing_country: { type: ["string", "null"] },
              number_last4: { type: ["string", "null"] },
            },
            required: [
              "is_id_document",
              "has_holder_photo",
              "looks_homemade",
              "document_type",
              "full_name",
              "date_of_birth",
              "expiry_date",
              "issuing_country",
              "number_last4",
            ],
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

  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  try {
    const p = JSON.parse(text) as Record<string, unknown>;
    const { last4Of } = await import("./guest-records");
    const types = ["passport", "driving_licence", "national_id", "residence_permit", "other"] as const;
    return {
      isIdDocument: p["is_id_document"] === true,
      hasHolderPhoto: p["has_holder_photo"] === true,
      looksHomemade: p["looks_homemade"] !== false,
      documentType: types.find((t) => t === p["document_type"]) ?? null,
      fullName: str(p["full_name"], 120),
      dateOfBirth: date(p["date_of_birth"]),
      expiryDate: date(p["expiry_date"]),
      issuingCountry: str(p["issuing_country"], 60),
      numberLast4: last4Of(typeof p["number_last4"] === "string" ? p["number_last4"] : null),
    };
  } catch {
    return {
      isIdDocument: false,
      hasHolderPhoto: false,
      looksHomemade: true,
      documentType: null,
      fullName: null,
      dateOfBirth: null,
      expiryDate: null,
      issuingCountry: null,
      numberLast4: null,
    };
  }
}

/* ------------------------------ guest photos ----------------------------- */

const ID_BUCKET = "guest-ids";
let bucketReady = false;

/** The private bucket is made on first use, so no setup step is needed. */
async function ensureIdBucket() {
  if (bucketReady) return;
  const db = await admin();
  const { data } = await db.storage.getBucket(ID_BUCKET);
  if (!data) {
    const { error } = await db.storage.createBucket(ID_BUCKET, { public: false, fileSizeLimit: 400 * 1024 });
    if (error && !/exist/i.test(error.message)) throw new Error(error.message);
  }
  bucketReady = true;
}

/** Saves a small JPEG a guest's device already shrank. Returns its path. */
export async function storeGuestPhoto(bookingId: string, kind: "id" | "face", dataUrl: string): Promise<string> {
  const m = /^data:image\/jpeg;base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("That photo couldn't be saved.");
  const bytes = Buffer.from(m[1]!, "base64");
  if (bytes.length > 400 * 1024) throw new Error("That photo is too large.");
  await ensureIdBucket();
  const db = await admin();
  const path = `${bookingId}/${kind}-${randomBytes(8).toString("hex")}.jpg`;
  const up = await db.storage.from(ID_BUCKET).upload(path, bytes, { contentType: "image/jpeg" });
  if (up.error) throw new Error(up.error.message);
  return path;
}

export async function removeGuestPhotos(paths: string[]) {
  if (!paths.length) return;
  const db = await admin();
  await db.storage.from(ID_BUCKET).remove(paths);
}

/** Short-lived links so photos are only visible while the card is open. */
export async function signGuestPhotos(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!paths.length) return out;
  const db = await admin();
  const { data } = await db.storage.from(ID_BUCKET).createSignedUrls(paths, 60 * 10);
  for (const u of data ?? []) if (u.path && u.signedUrl) out[u.path] = u.signedUrl;
  return out;
}

/**
 * Host-chosen wording for each booking platform. The internal channel id never
 * changes, so a host renaming "Direct" to "Our website" can't break matching.
 */
export async function channelLabels(hostId: string): Promise<Record<string, string>> {
  const db = await admin();
  const { data } = await db.from("hosts").select("channel_labels").eq("id", hostId).maybeSingle();
  const raw = data?.channel_labels;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 40);
  }
  return out;
}

/** Booking sites in the guest's words, with any icon the host uploaded. */
export async function guestSites(hostId: string) {
  const { resolveSites } = await import("./booking-sites");
  const { channels, guest } = await import("@/content/copy");
  const db = await admin();
  const { data } = await db.from("hosts").select("booking_sites").eq("id", hostId).maybeSingle();
  return resolveSites(await channelLabels(hostId), (data as { booking_sites?: unknown } | null)?.booking_sites, {
    ...channels,
    ...guest.platforms,
  });
}

/**
 * Runs a query that reads columns from the newest migration, and falls back
 * to the older shape if the database hasn't been updated yet, so guests and
 * hosts are never blocked while a migration is pending.
 */
export async function withLegacy<T>(
  latest: () => PromiseLike<{ data: T; error: { code?: string; message: string } | null }>,
  legacy: () => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>,
): Promise<{ data: T; error: { code?: string; message: string } | null }> {
  const res = await latest();
  const missing = res.error && (res.error.code === "42703" || /column .* does not exist/i.test(res.error.message));
  return missing ? ((await legacy()) as { data: T; error: { code?: string; message: string } | null }) : res;
}
