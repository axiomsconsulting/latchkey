/* eslint-disable @typescript-eslint/no-explicit-any -- door codes are from migrations 0084-0085, newer than the generated types */
/**
 * The host's side of door codes (door-codes.ts): the set-up in Settings, Today's
 * list of codes to put on and take off the lock, and a stay's own codes.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays, todayInZone } from "@/lib/dates";
import {
  DOOR_KEYS,
  doorsOn,
  formatChanged,
  keepLocked,
  normaliseDoorCodes,
  staticCodeFor,
  type DoorKey,
} from "@/lib/door-codes";
import { hostOfProperty, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();
const doorKey = z.enum(["front", "room"]);
type Loose = { from: (t: string) => any };

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const COLS: Record<DoorKey, { code: string; set: string; removed: string }> = {
  front: { code: "door_code", set: "door_code_set_at", removed: "door_code_removed_at" },
  room: {
    code: "door_code_room",
    set: "door_code_room_set_at",
    removed: "door_code_room_removed_at",
  },
};
const cleared = (k: DoorKey) => ({
  [COLS[k].code]: null,
  [COLS[k].set]: null,
  [COLS[k].removed]: null,
});

/** The set-up, and the rooms for their own fixed codes. */
export const getDoorCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const [{ data: p, error }, { data: rooms }] = await Promise.all([
      sb.from("properties").select("door_codes").eq("id", data.propertyId).maybeSingle(),
      sb
        .from("rooms")
        .select("id, display_name")
        .eq("property_id", data.propertyId)
        .neq("active", false)
        .order("sort_order"),
    ]);
    return {
      available: !error,
      settings: normaliseDoorCodes(error ? null : p?.door_codes),
      rooms: ((rooms ?? []) as any[]).map((r) => ({
        id: r.id as string,
        name: r.display_name as string,
      })),
    };
  });

export const saveDoorCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, settings: z.record(z.string(), z.unknown()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const sb = context.supabase as unknown as Loose;
    const { data: cur, error: readError } = await sb
      .from("properties")
      .select("door_codes, timezone")
      .eq("id", data.propertyId)
      .maybeSingle();
    const prev = normaliseDoorCodes(readError ? null : cur?.door_codes);
    const settings = keepLocked(prev, normaliseDoorCodes(data.settings));
    const { error } = await sb
      .from("properties")
      .update({ door_codes: settings })
      .eq("id", data.propertyId);
    if (error)
      throw new Error(
        /door_codes/.test(error.message)
          ? "This needs the latest database update (migration 0084)."
          : error.message,
      );
    // Codes that no longer apply: a door that stopped using them, or a new format.
    // Only those nobody has seen and that aren't on the lock are made again.
    const db = await admin();
    const today = todayInZone(cur?.timezone ?? "Europe/London");
    for (const k of DOOR_KEYS) {
      if (settings[k].mode !== "per_stay")
        await db
          .from("bookings")
          .update(cleared(k))
          .eq("property_id", data.propertyId)
          .gte("check_out_date", today)
          .not(COLS[k].code, "is", null);
      else if (formatChanged(prev[k], settings[k]))
        await db
          .from("bookings")
          .update(cleared(k))
          .eq("property_id", data.propertyId)
          .gte("check_out_date", today)
          .is(COLS[k].set, null)
          .is("door_code_shown_at", null)
          .not(COLS[k].code, "is", null);
    }
    return { ok: true };
  });

/**
 * Today: new per-stay codes to put on the lock (arrivals in the next week), and
 * those of guests who've left to take off. Makes any code that's still missing.
 */
export const listDoorCodeJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    type Job = {
      id: string;
      door: DoorKey;
      name: string | null;
      room: string | null;
      code: string;
      checkIn: string;
      checkOut: string;
    };
    const empty = { on: false, toSet: [] as Job[], toRemove: [] as Job[] };
    const { data: p, error } = await sb
      .from("properties")
      .select("door_codes, timezone")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (error || !p) return empty;
    const f = normaliseDoorCodes(p.door_codes);
    const doors = DOOR_KEYS.filter((k) => f[k].mode === "per_stay");
    if (!doors.length) return empty;
    const today = todayInZone(p.timezone ?? "Europe/London");
    const { ensureCodes } = await import("./door-codes.server");
    await ensureCodes(await admin(), data.propertyId, f, today);
    const { data: rows, error: rowsError } = await sb
      .from("bookings")
      .select(
        "id, guest_full_name, status, door_code, door_code_set_at, door_code_removed_at, door_code_room, door_code_room_set_at, door_code_room_removed_at, check_in_date, check_out_date, rooms(display_name)",
      )
      .eq("property_id", data.propertyId)
      .or("door_code.not.is.null,door_code_room.not.is.null")
      .is("archived_at", null)
      .gte("check_out_date", addDays(today, -7))
      .lte("check_in_date", addDays(today, 7))
      .order("check_in_date")
      .limit(100);
    if (rowsError) return empty;
    const toSet: Job[] = [];
    const toRemove: Job[] = [];
    for (const b of (rows ?? []) as any[]) {
      const gone = b.check_out_date < today || ["cancelled", "checked_out"].includes(b.status);
      for (const k of doors) {
        const code = b[COLS[k].code] as string | null;
        if (!code) continue;
        const job: Job = {
          id: b.id,
          door: k,
          name: b.guest_full_name ?? null,
          room: b.rooms?.display_name ?? null,
          code,
          checkIn: b.check_in_date,
          checkOut: b.check_out_date,
        };
        if (!b[COLS[k].set]) {
          if (!gone) toSet.push(job);
        } else if (gone && !b[COLS[k].removed]) toRemove.push(job);
      }
    }
    return { on: true, toSet, toRemove };
  });

/** The host's tick: it's on the lock, or off it. */
export const markDoorCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ bookingId: uuid, door: doorKey, what: z.enum(["set", "unset", "removed"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const { data: b } = await sb
      .from("bookings")
      .select("property_id")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!b) throw new Error("That stay no longer exists. Please refresh.");
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, b.property_id));
    const now = new Date().toISOString();
    const c = COLS[data.door];
    const { error } = await sb
      .from("bookings")
      .update(
        data.what === "set"
          ? { [c.set]: now, [c.removed]: null }
          : data.what === "unset"
            ? { [c.set]: null }
            : { [c.removed]: now },
      )
      .eq("id", data.bookingId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** On the guest's card: this stay's code for each door, making any that's due. */
export const getStayDoorCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const { data: b, error } = await sb
      .from("bookings")
      .select(
        "id, property_id, room_id, status, mirror_of, door_code, door_code_set_at, door_code_room, door_code_room_set_at, door_code_hidden, door_code_shown_at, room_check, properties(door_codes, timezone)",
      )
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error || !b) return null;
    const f = normaliseDoorCodes(b.properties?.door_codes);
    if (!doorsOn(f) || !b.room_id || b.mirror_of || ["cancelled", "blocked"].includes(b.status))
      return null;
    const doors: Array<{
      door: DoorKey;
      code: string | null;
      perStay: boolean;
      onLock: boolean;
      keyNote: string;
    }> = [];
    for (const k of DOOR_KEYS) {
      const door = f[k];
      if (door.mode === "off") {
        doors.push({ door: k, code: null, perStay: false, onLock: false, keyNote: door.keyNote });
        continue;
      }
      if (door.mode === "static") {
        const code = staticCodeFor(f, k, b.room_id) || null;
        doors.push({ door: k, code, perStay: false, onLock: false, keyNote: "" });
        continue;
      }
      let code = b[COLS[k].code] as string | null;
      if (!code && !b.door_code_hidden) {
        const { giveCode } = await import("./door-codes.server");
        code = await giveCode(
          await admin(),
          b.property_id,
          b.id,
          k,
          f,
          todayInZone(b.properties?.timezone ?? "Europe/London"),
          [b.door_code, b.door_code_room],
        );
        if (code) b[COLS[k].code] = code;
      }
      doors.push({ door: k, code, perStay: true, onLock: !!b[COLS[k].set], keyNote: "" });
    }
    return {
      hidden: !!b.door_code_hidden as boolean,
      shown: !!b.door_code_shown_at as boolean,
      doors,
    };
  });

/** A different code for this stay and door (lost, or shared too widely). It then needs putting on the lock. */
export const newStayDoorCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid, door: doorKey }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const { data: b } = await sb
      .from("bookings")
      .select("id, property_id, door_code, door_code_room, properties(door_codes, timezone)")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!b) throw new Error("That stay no longer exists. Please refresh.");
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, b.property_id));
    const { giveCode } = await import("./door-codes.server");
    const code = await giveCode(
      await admin(),
      b.property_id,
      b.id,
      data.door,
      normaliseDoorCodes(b.properties?.door_codes),
      todayInZone(b.properties?.timezone ?? "Europe/London"),
      [b.door_code, b.door_code_room],
    );
    if (!code)
      throw new Error("No codes are free: please allow more digits in your door code set-up.");
    return { code };
  });

/**
 * Not giving this guest a code: nothing's shown, and their codes are let go so
 * they aren't used. Says whether one was on the lock, to take off.
 */
export const setStayDoorHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid, hidden: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const { data: b } = await sb
      .from("bookings")
      .select("property_id, door_code_set_at, door_code_room_set_at")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!b) throw new Error("That stay no longer exists. Please refresh.");
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, b.property_id));
    const { error } = await sb
      .from("bookings")
      .update({
        door_code_hidden: data.hidden,
        ...(data.hidden ? { ...cleared("front"), ...cleared("room") } : {}),
      })
      .eq("id", data.bookingId);
    if (error) throw new Error(error.message);
    return { wasOnLock: data.hidden && !!(b.door_code_set_at || b.door_code_room_set_at) };
  });
