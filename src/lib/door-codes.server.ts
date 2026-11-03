/* eslint-disable @typescript-eslint/no-explicit-any -- door codes are from migrations 0084-0085, newer than the generated types */
/** Server only: giving stays their door codes (door-codes.ts) and what a guest sees of them. */
import { addDays, todayInZone } from "./dates";
import {
  DOOR_KEYS,
  blockedCodes,
  codeShows,
  codeSteps,
  doorsOn,
  generateCode,
  normaliseDoorCodes,
  spacedCode,
  staticCodeFor,
  type DoorCodes,
  type DoorKey,
} from "./door-codes";
import { zonedToUtc } from "./guide";

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const CODE_COLUMN: Record<DoorKey, string> = { front: "door_code", room: "door_code_room" };

async function historyOf(db: any, propertyId: string) {
  const { data } = await db
    .from("bookings")
    .select("id, door_code, door_code_room, door_code_shown_at, status, check_out_date")
    .eq("property_id", propertyId)
    .or("door_code.not.is.null,door_code_room.not.is.null")
    .limit(5000);
  return (data ?? []) as Array<{
    id: string;
    door_code: string | null;
    door_code_room: string | null;
    door_code_shown_at: string | null;
    status: string;
    check_out_date: string;
  }>;
}

/**
 * A new code for this stay and door; the database refuses one that another stay
 * still holds (two arriving at once), so it tries again. Null when none is free.
 */
export async function giveCode(
  db: any,
  propertyId: string,
  bookingId: string,
  door: DoorKey,
  f: DoorCodes,
  today: string,
  /** The stay's own codes aren't options: its other door's, or the one being replaced. */
  not: Array<string | null | undefined> = [],
): Promise<string | null> {
  const blocked = blockedCodes(await historyOf(db, propertyId), bookingId, today, f.reuseAfterDays);
  for (const c of not) if (c) blocked.add(c);
  for (let i = 0; i < 5; i++) {
    const code = generateCode(f[door], blocked);
    if (!code) return null;
    const { data, error } = await db.rpc("assign_door_code", {
      _booking: bookingId,
      _code: code,
      _door: door,
    });
    if (error) return null;
    if (data === true) return code;
    blocked.add(code);
  }
  return null;
}

/** Stays arriving in the next month that can have a code: a room, not cancelled, closed, mirrored, held or "not given". */
export async function ensureCodes(db: any, propertyId: string, f: DoorCodes, today: string) {
  const doors = DOOR_KEYS.filter((k) => f[k].mode === "per_stay");
  if (!doors.length) return;
  const { data, error } = await db
    .from("bookings")
    .select("id, door_code, door_code_room")
    .eq("property_id", propertyId)
    .eq("door_code_hidden", false)
    .is("mirror_of", null)
    .is("archived_at", null)
    .not("room_id", "is", null)
    .not("status", "in", "(cancelled,blocked,checked_out)")
    .lte("check_in_date", addDays(today, 30))
    .gte("check_out_date", today)
    .or(doors.map((k) => `${CODE_COLUMN[k]}.is.null`).join(","))
    .order("check_in_date")
    .limit(80);
  if (error) return;
  for (const b of (data ?? []) as any[])
    for (const k of doors)
      if (!b[CODE_COLUMN[k]])
        b[CODE_COLUMN[k]] = await giveCode(db, propertyId, b.id, k, f, today, [
          b.door_code,
          b.door_code_room,
        ]);
}

/** On the way to a list of stays: anything due gets its code first. Never gets in the way of the list. */
export async function ensureCodesForProperty(propertyId: string) {
  try {
    const db = await admin();
    const { data } = await db
      .from("properties")
      .select("door_codes, timezone")
      .eq("id", propertyId)
      .maybeSingle();
    const f = normaliseDoorCodes(data?.door_codes);
    if (!doorsOn(f)) return;
    await ensureCodes(db, propertyId, f, todayInZone(data?.timezone ?? "Europe/London"));
  } catch (e) {
    console.error("Making door codes failed", e);
  }
}

export type GuestDoor = {
  door: DoorKey;
  /** Null: this door has no code, only a note about the key. */
  code: string | null;
  spaced: string;
  steps: string[];
  unlockHow: string;
  lockHow: string;
  keyNote: string;
};

/**
 * What a guest's told about each door, when they may see it, making a code that's
 * due. Empty when nothing's set up, it isn't time, or the host isn't giving them one.
 */
export async function doorsForGuest(bookingId: string): Promise<GuestDoor[]> {
  const db = await admin();
  const { data: b, error } = await db
    .from("bookings")
    .select(
      "id, property_id, room_id, status, mirror_of, door_code, door_code_room, door_code_hidden, door_code_shown_at, check_in_date, check_out_date, check_out_time, room_check, properties(timezone, default_check_out_time, door_codes)",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !b || !b.room_id || b.mirror_of || b.room_check?.held || b.door_code_hidden)
    return [];
  if (b.status === "cancelled" || b.status === "blocked") return [];
  const f = normaliseDoorCodes(b.properties?.door_codes);
  if (!doorsOn(f)) return [];
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
    return [];
  const doors: GuestDoor[] = [];
  let shown = false;
  for (const k of DOOR_KEYS) {
    const door = f[k];
    let code: string | null = null;
    if (door.mode === "static") code = staticCodeFor(f, k, b.room_id) || null;
    if (door.mode === "per_stay") {
      code = (b[CODE_COLUMN[k]] as string | null) ?? null;
      code ??= await giveCode(db, b.property_id, b.id, k, f, todayInZone(tz), [
        b.door_code,
        b.door_code_room,
      ]);
      if (code) {
        b[CODE_COLUMN[k]] = code;
        shown = true;
      }
    }
    if (!code && !door.keyNote) continue;
    doors.push({
      door: k,
      code,
      spaced: code ? spacedCode(code) : "",
      steps: code ? codeSteps(door, spacedCode(code)) : [],
      unlockHow: code ? door.unlockHow : "",
      lockHow: code ? door.lockHow : "",
      keyNote: code ? "" : door.keyNote,
    });
  }
  // A code a guest has seen counts as used from now on.
  if (shown && !b.door_code_shown_at)
    await db
      .from("bookings")
      .update({ door_code_shown_at: new Date().toISOString() })
      .eq("id", b.id);
  return doors;
}
