/* eslint-disable @typescript-eslint/no-explicit-any -- door codes are from migration 0084, newer than the generated types */
/** Server only: giving stays their door code (door-codes.ts) and what a guest sees of it. */
import { addDays, todayInZone } from "./dates";
import {
  blockedCodes,
  codeShows,
  codeSteps,
  generateCode,
  normaliseDoorCodes,
  spacedCode,
  staticCodeFor,
  type DoorCodes,
} from "./door-codes";
import { zonedToUtc } from "./guide";

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Before the migration, or for a property with none: off. */
export async function doorCodesFor(db: any, propertyId: string): Promise<DoorCodes> {
  const { data, error } = await db
    .from("properties")
    .select("door_codes")
    .eq("id", propertyId)
    .maybeSingle();
  return normaliseDoorCodes(error ? null : data?.door_codes);
}

async function historyOf(db: any, propertyId: string) {
  const { data } = await db
    .from("bookings")
    .select("id, door_code, status, check_out_date")
    .eq("property_id", propertyId)
    .not("door_code", "is", null)
    .limit(5000);
  return (data ?? []) as Array<{
    id: string;
    door_code: string;
    status: string;
    check_out_date: string;
  }>;
}

/**
 * A new code for this stay; the database refuses one that another stay still
 * holds (two arriving at once), so it tries again. Null when none is free.
 */
export async function giveCode(
  db: any,
  propertyId: string,
  bookingId: string,
  f: DoorCodes,
  today: string,
  /** The code being replaced: not an option, even with nothing else free. */
  replacing?: string | null,
): Promise<string | null> {
  const blocked = blockedCodes(await historyOf(db, propertyId), bookingId, today, f.reuseAfterDays);
  if (replacing) blocked.add(replacing);
  for (let i = 0; i < 5; i++) {
    const code = generateCode(f, blocked);
    if (!code) return null;
    const { data, error } = await db.rpc("assign_door_code", { _booking: bookingId, _code: code });
    if (error) return null;
    if (data === true) return code;
    blocked.add(code);
  }
  return null;
}

/** Stays arriving soon that can have a code: a room, not cancelled, closed, mirrored or held. */
export async function ensureCodes(db: any, propertyId: string, f: DoorCodes, today: string) {
  if (!f.on || f.mode !== "per_stay") return;
  const { data } = await db
    .from("bookings")
    .select("id")
    .eq("property_id", propertyId)
    .is("door_code", null)
    .is("mirror_of", null)
    .is("archived_at", null)
    .not("room_id", "is", null)
    .not("status", "in", "(cancelled,blocked,checked_out)")
    .lte("check_in_date", addDays(today, 14))
    .gte("check_out_date", today)
    .order("check_in_date")
    .limit(60);
  for (const b of (data ?? []) as Array<{ id: string }>)
    await giveCode(db, propertyId, b.id, f, today);
}

export type GuestDoor = {
  code: string;
  spaced: string;
  steps: string[];
  unlockHow: string;
  lockHow: string;
};

/**
 * The door code for a guest's stay, when they may see it. Made here if it isn't
 * yet. Null when it's off, not time, or there's nothing to show.
 */
export async function doorForGuest(bookingId: string): Promise<GuestDoor | null> {
  const db = await admin();
  const { data: b, error } = await db
    .from("bookings")
    .select(
      "id, property_id, room_id, status, mirror_of, door_code, check_in_date, check_out_date, check_out_time, room_check, properties(timezone, default_check_out_time, door_codes)",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !b || !b.room_id || b.mirror_of || b.room_check?.held) return null;
  if (b.status === "cancelled" || b.status === "blocked") return null;
  const f = normaliseDoorCodes(b.properties?.door_codes);
  if (!f.on) return null;
  const tz = b.properties?.timezone ?? "Europe/London";
  const out = (b.check_out_time ?? b.properties?.default_check_out_time ?? "11:00").slice(0, 5);
  if (
    !codeShows(f, {
      checkedIn: b.status === "checked_in",
      checkedOut: b.status === "checked_out",
      nowMs: Date.now(),
      opensAtMs: zonedToUtc(b.check_in_date, "00:00", tz).getTime(),
      endsAtMs: zonedToUtc(b.check_out_date, out, tz).getTime(),
    })
  )
    return null;
  const code =
    f.mode === "static"
      ? staticCodeFor(f, b.room_id)
      : (b.door_code ?? (await giveCode(db, b.property_id, b.id, f, todayInZone(tz))));
  if (!code) return null;
  return {
    code,
    spaced: spacedCode(code),
    steps: codeSteps(f, spacedCode(code)),
    unlockHow: f.unlockHow,
    lockHow: f.lockHow,
  };
}
