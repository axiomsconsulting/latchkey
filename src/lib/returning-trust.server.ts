/* eslint-disable @typescript-eslint/no-explicit-any -- guest_id_passes and returning_trust are from migration 0088 */
import { createHmac } from "crypto";

import { todayInZone } from "./dates";
import { realEmail } from "./guest-messages";
import { registerApplies } from "./hotel-register";
import { signingSecret } from "./private-store.server";
import {
  maskDocument,
  passHolds,
  passKeepUntil,
  worthRemembering,
  type IdPass,
} from "./returning-trust";

const scramble = (kind: string, value: string) =>
  createHmac("sha256", signingSecret()).update(`id-pass|${kind}|${value}`).digest("hex");

function contactHashes(b: { guest_email?: string | null; guest_phone?: string | null }) {
  const email = b.guest_email?.trim().toLowerCase();
  return {
    email_hash: email && realEmail(email) ? scramble("email", email) : null,
    phone_hash: b.guest_phone ? scramble("phone", b.guest_phone) : null,
  };
}

/** The host's switch for this property; UK only, and off until the migration is applied. */
async function switchedOn(db: any, propertyId: string) {
  const { data, error } = await db
    .from("properties")
    .select("returning_trust, country_code, host_id, timezone")
    .eq("id", propertyId)
    .maybeSingle();
  if (error || !data?.returning_trust || !registerApplies(data.country_code)) return null;
  return data as { host_id: string; timezone: string | null };
}

/** After an ID check that matched: remembered only while the host's switch is on. Never fails a check-in. */
export async function rememberPass(
  db: any,
  bookingId: string,
  propertyId: string,
  result: string | null,
  read: { fullName: string | null; expiryDate: string | null },
) {
  try {
    const p = await switchedOn(db, propertyId);
    if (!p || !read.fullName) return;
    const today = todayInZone(p.timezone ?? "Europe/London");
    if (!worthRemembering(result, read.expiryDate, today)) return;
    const { data: b } = await db
      .from("bookings")
      .select("guest_email, guest_phone")
      .eq("id", bookingId)
      .maybeSingle();
    const keys = contactHashes(b ?? {});
    if (!keys.email_hash && !keys.phone_hash) return;
    await db.from("guest_id_passes").upsert(
      {
        host_id: p.host_id,
        booking_id: bookingId,
        ...keys,
        full_name: read.fullName.slice(0, 120),
        document_expiry: read.expiryDate,
        verified_at: new Date().toISOString(),
        keep_until: passKeepUntil(today),
      },
      { onConflict: "booking_id" },
    );
  } catch (err) {
    console.error("Remembering an ID check failed", err);
  }
}

/** An earlier passed ID check that applies to this stay, or null. Any problem means null: the usual ID check. */
export async function trustedPass(db: any, bookingId: string): Promise<IdPass | null> {
  try {
    const { data: stay } = await db
      .from("bookings")
      .select("id, property_id, guest_full_name, guest_email, guest_phone, check_in_date")
      .eq("id", bookingId)
      .maybeSingle();
    if (!stay) return null;
    const p = await switchedOn(db, stay.property_id);
    if (!p) return null;
    const { email_hash, phone_hash } = contactHashes(stay);
    const today = todayInZone(p.timezone ?? "Europe/London");
    const found = await Promise.all(
      (
        [
          ["email_hash", email_hash],
          ["phone_hash", phone_hash],
        ] as const
      )
        .filter(([, v]) => !!v)
        .map(([col, v]) =>
          db
            .from("guest_id_passes")
            .select("booking_id, full_name, document_expiry, keep_until")
            .eq("host_id", p.host_id)
            .eq(col, v),
        ),
    );
    const passes = found.flatMap((f: any) => (f.data ?? []) as IdPass[]);
    return passes.find((x) => passHolds(x, stay, today)) ?? null;
  } catch {
    return null;
  }
}

/** The register details from their last stay, for them to confirm; the document number masked. */
export async function lastEntry(db: any, pass: IdPass) {
  const row = await lastRow(db, pass);
  return {
    fullName: row?.full_name ?? pass.full_name,
    nationality: row?.nationality ?? null,
    documentNumber: maskDocument(row?.document_number),
    placeOfIssue: row?.place_of_issue ?? null,
    fromLastStay: true,
  };
}

/** The real number behind the mask, only ever read on the server. */
export async function lastDocumentNumber(db: any, pass: IdPass): Promise<string | null> {
  return (await lastRow(db, pass))?.document_number ?? null;
}

async function lastRow(db: any, pass: IdPass) {
  const { data } = await db
    .from("guest_register")
    .select("full_name, nationality, document_number, place_of_issue")
    .eq("booking_id", pass.booking_id)
    .eq("position", 0)
    .maybeSingle();
  return data as {
    full_name: string;
    nationality: string;
    document_number: string | null;
    place_of_issue: string | null;
  } | null;
}

/** A guest moved to another stay: what their booking's contact details pointed at no longer holds. */
export async function forgetPasses(db: any, bookingIds: string[]) {
  await db
    .from("guest_id_passes")
    .delete()
    .in("booking_id", bookingIds)
    .then(
      () => {},
      () => {},
    );
}
