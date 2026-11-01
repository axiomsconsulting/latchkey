/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
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
  "id, host_id, name, short_code, timezone, country_code, check_in_pin, checkin_methods, default_check_in_time, default_check_out_time, quiet_hours_start, quiet_hours_end, wifi_name, wifi_password, parking_notes, host_contact_name, host_contact_phone, active, theme_config, is_demo";

export async function loadPropertyByCode(code: string) {
  const db = await admin();
  const find = (cols: string) =>
    db
      .from("properties")
      .select(cols)
      .eq("short_code", code.toLowerCase())
      .eq("active", true)
      .maybeSingle();
  // checkin_flow is from migration 0065, guest_records from 0020.
  const { data } = await withLegacy<any>(
    () => find(`${PROPERTY_COLUMNS}, guest_records, checkin_flow`),
    () =>
      withLegacy<any>(
        () => find(`${PROPERTY_COLUMNS}, guest_records`),
        () => find(PROPERTY_COLUMNS),
      ),
  );
  if (!data) return null;
  // The check-in journey (Latchkey's rules applied) decides the switches every check-in rule reads.
  const { withFlow } = await import("./checkin-flow.server");
  return withFlow(data as Record<string, any>) as Promise<any>;
}

/** The host's demo/live switches. */
export async function hostModes(hostId: string) {
  const { normaliseModes } = await import("./integration-modes");
  const db = await admin();
  const { data } = await db
    .from("hosts")
    .select("integration_modes")
    .eq("id", hostId)
    .maybeSingle();
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
  return loadSessionWhere("token_hash", sha256(token));
}

/** The same check-in, found by its id (for a guest's phone that joined it). */
export async function loadSessionById(id: string): Promise<Session> {
  return loadSessionWhere("id", id);
}

/** The check-in whose square (share code) a guest scanned to join it. */
export async function loadSessionByShare(share: string): Promise<Session> {
  return loadSessionWhere("share_hash", sha256(share));
}

async function loadSessionWhere(
  column: "token_hash" | "id" | "share_hash",
  value: string,
): Promise<Session> {
  const db = await admin();
  const legacy =
    "id, property_id, booking_id, confirmed, verified_method, photo_attempts, last4_attempts, completed_at, expires_at";
  const { data } = await withLegacy(
    () =>
      db
        .from("checkin_sessions")
        .select(`${legacy}, adults, children, companion_attempts`)
        // share_hash is from migration 0037, newer than the generated types.
        .eq(column as "id", value)
        .maybeSingle(),
    () =>
      db
        .from("checkin_sessions")
        .select(legacy)
        .eq(column as "id", value)
        .maybeSingle(),
  );
  if (!data || Date.parse(data.expires_at) < Date.now()) {
    throw new Error("This check-in has timed out. Please start again.");
  }
  const row = data as Partial<Session>;
  return {
    ...row,
    adults: row.adults ?? null,
    children: row.children ?? null,
    companion_attempts: row.companion_attempts ?? 0,
  } as Session;
}

export type JoinClaim = {
  id: string;
  session_id: string;
  position: number;
  kind: "adult" | "child";
  done_at: string | null;
};

/** A guest's phone that joined a check-in: the one guest it may fill in. */
export async function loadJoin(token: string): Promise<JoinClaim> {
  const db = (await admin()) as unknown as { from: (t: string) => any };
  const { data } = await db
    .from("checkin_joins")
    .select("id, session_id, position, kind, done_at")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (!data) throw new Error("This check-in has timed out. Please start again.");
  return data as JoinClaim;
}

/** Records an alert for the host and emails it when email is set up. */
export async function raiseAlert(input: {
  hostId: string;
  propertyId: string;
  bookingId?: string | null;
  kind:
    | "lockout"
    | "id_mismatch"
    | "id_partial"
    | "self_declared"
    | "service_request"
    | "party"
    | "handover"
    | "direct_enquiry"
    | "tablet_joined";
  message: string;
  /** Channels not to use for this one (e.g. email, when the platform already emailed). */
  skip?: Array<"email" | "push" | "telegram" | "sms">;
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
  // Push, Telegram, email and SMS, as the business has chosen (never throws).
  const { notifyHost } = await import("./notify.server");
  await notifyHost({
    hostId: input.hostId,
    kind: input.kind,
    message: input.message,
    bookingId: input.bookingId ?? null,
    alertId: data?.id ?? null,
    skip: input.skip ?? [],
  });
}

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

/**
 * Reads the key details from a photo of an ID document. The full-size image
 * is held in memory for this call only; whether a small copy is kept is the
 * caller's decision, based on the host's settings.
 */
export async function readIdDetails(
  imageDataUrl: string,
): Promise<import("./guest-records").IdRead> {
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
                "as YYYY-MM-DD, the issuing country in English, the nationality exactly as printed (for example GBR or FRA), " +
                "the document number, and the place or authority of issue as printed. " +
                "Also give nationality_code: the ISO 3166-1 alpha-2 code of the nationality the document prints " +
                "(as a code, a word or a demonym, for example British citizen is GB), or null when it prints no nationality; " +
                "and issuing_country_code: the ISO 3166-1 alpha-2 code of the issuing country. " +
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
                enum: [
                  "passport",
                  "driving_licence",
                  "national_id",
                  "residence_permit",
                  "other",
                  null,
                ],
              },
              full_name: { type: ["string", "null"] },
              date_of_birth: { type: ["string", "null"] },
              expiry_date: { type: ["string", "null"] },
              issuing_country: { type: ["string", "null"] },
              number_last4: { type: ["string", "null"] },
              nationality: { type: ["string", "null"] },
              nationality_code: { type: ["string", "null"] },
              issuing_country_code: { type: ["string", "null"] },
              document_number: { type: ["string", "null"] },
              place_of_issue: { type: ["string", "null"] },
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
              "nationality",
              "nationality_code",
              "issuing_country_code",
              "document_number",
              "place_of_issue",
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
        const evt = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          error?: { message?: string };
        };
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
  const str = (v: unknown, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  const code2 = (v: unknown) =>
    typeof v === "string" && /^[A-Za-z]{2}$/.test(v.trim()) ? v.trim().toUpperCase() : null;
  try {
    const p = JSON.parse(text) as Record<string, unknown>;
    const { last4Of } = await import("./guest-records");
    const types = [
      "passport",
      "driving_licence",
      "national_id",
      "residence_permit",
      "other",
    ] as const;
    return {
      isIdDocument: p["is_id_document"] === true,
      hasHolderPhoto: p["has_holder_photo"] === true,
      looksHomemade: p["looks_homemade"] !== false,
      documentType: types.find((t) => t === p["document_type"]) ?? null,
      fullName: str(p["full_name"], 120),
      dateOfBirth: date(p["date_of_birth"]),
      expiryDate: date(p["expiry_date"]),
      issuingCountry: str(p["issuing_country"], 60),
      numberLast4: last4Of(
        typeof p["document_number"] === "string"
          ? p["document_number"]
          : typeof p["number_last4"] === "string"
            ? p["number_last4"]
            : null,
      ),
      // The code when the reader gave one (a demonym like "Pakistani" has no other match).
      nationality: code2(p["nationality_code"]) ?? str(p["nationality"], 40),
      issuingCountryCode: code2(p["issuing_country_code"]),
      documentNumber: str(p["document_number"], 40),
      placeOfIssue: str(p["place_of_issue"], 80),
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
      nationality: null,
      documentNumber: null,
      placeOfIssue: null,
    };
  }
}

/* ------------------------------ guest photos ----------------------------- */

/**
 * Saves a small JPEG a guest's device already shrank: queued at once and
 * moved to the business's restricted Google Drive folder shortly after.
 * Returns the reference to keep on guest_ids.
 */
export async function storeGuestPhoto(
  bookingId: string,
  kind: "id" | "face",
  dataUrl: string,
  propertyId: string,
): Promise<string> {
  const m = /^data:image\/jpeg;base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("That photo couldn't be saved.");
  const bytes = Buffer.from(m[1]!, "base64");
  if (bytes.length > 400 * 1024) throw new Error("That photo is too large.");
  const { guestOwner, storePrivate } = await import("./private-store.server");
  const owner = await guestOwner(propertyId);
  return storePrivate({
    kind: kind === "id" ? "guest_id" : "guest_face",
    ownerKey: owner.key,
    ownerLabel: owner.label,
    name: `${bookingId}-${kind}-${randomBytes(4).toString("hex")}.jpg`,
    mime: "image/jpeg",
    bytes: new Uint8Array(bytes),
    ref: { table: "guest_ids", column: kind === "id" ? "id_photo_path" : "face_photo_path" },
    // The guest is waiting at the door: a quick save now, moved to Drive shortly after.
    soon: true,
  });
}

/** Deletes guest photos for good, from Google Drive or the queue. */
export async function removeGuestPhotos(paths: string[]) {
  if (!paths.length) return;
  const { removePrivate } = await import("./private-store.server");
  await removePrivate(paths);
}

/** Short-lived links (10 minutes) so photos are only visible while the card is open. */
export async function signGuestPhotos(paths: string[]): Promise<Record<string, string>> {
  const { signPrivateLinks } = await import("./private-store.server");
  return signPrivateLinks(paths, 600, "guest-photo.jpg");
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
  return resolveSites(
    await channelLabels(hostId),
    (data as { booking_sites?: unknown } | null)?.booking_sites,
    {
      ...channels,
      ...guest.platforms,
    },
  );
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
  // Postgres says "column … does not exist"; the API layer says it "could not find the '…' column".
  const missing =
    res.error &&
    (res.error.code === "42703" ||
      res.error.code === "PGRST204" ||
      /column .* does not exist|could not find the '.*' column/i.test(res.error.message));
  return missing
    ? ((await legacy()) as { data: T; error: { code?: string; message: string } | null })
    : res;
}
