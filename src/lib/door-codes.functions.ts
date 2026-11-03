/* eslint-disable @typescript-eslint/no-explicit-any -- door codes are from migration 0084, newer than the generated types */
/**
 * The host's side of door codes (door-codes.ts): the set-up in Settings, Today's
 * list of codes to put on and take off the lock, and a stay's own code.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays, todayInZone } from "@/lib/dates";
import { normaliseDoorCodes, staticCodeFor } from "@/lib/door-codes";
import { hostOfProperty, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();
type Loose = { from: (t: string) => any };

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** The set-up, and the rooms for their own static codes. */
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
    const settings = normaliseDoorCodes(data.settings);
    const { error } = await (context.supabase as unknown as Loose)
      .from("properties")
      .update({ door_codes: settings })
      .eq("id", data.propertyId);
    if (error)
      throw new Error(
        /door_codes/.test(error.message)
          ? "This needs the latest database update (migration 0084)."
          : error.message,
      );
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
    const empty = { on: false, toSet: [], toRemove: [] };
    const { data: p, error } = await sb
      .from("properties")
      .select("door_codes, timezone")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (error || !p) return empty;
    const f = normaliseDoorCodes(p.door_codes);
    if (!f.on || f.mode !== "per_stay") return empty;
    const today = todayInZone(p.timezone ?? "Europe/London");
    const { ensureCodes } = await import("./door-codes.server");
    await ensureCodes(await admin(), data.propertyId, f, today);
    const { data: rows } = await sb
      .from("bookings")
      .select(
        "id, guest_full_name, status, door_code, door_code_set_at, door_code_removed_at, check_in_date, check_out_date, rooms(display_name)",
      )
      .eq("property_id", data.propertyId)
      .not("door_code", "is", null)
      .is("archived_at", null)
      .gte("check_out_date", addDays(today, -7))
      .lte("check_in_date", addDays(today, 7))
      .order("check_in_date")
      .limit(100);
    const shape = (b: any) => ({
      id: b.id as string,
      name: (b.guest_full_name as string | null) ?? null,
      room: (b.rooms?.display_name as string | null) ?? null,
      code: b.door_code as string,
      checkIn: b.check_in_date as string,
      checkOut: b.check_out_date as string,
    });
    const list = (rows ?? []) as any[];
    return {
      on: true,
      toSet: list
        .filter(
          (b) =>
            !b.door_code_set_at &&
            b.check_out_date >= today &&
            !["cancelled", "checked_out"].includes(b.status),
        )
        .map(shape),
      // Off the lock once they've left, or the stay's been cancelled.
      toRemove: list
        .filter(
          (b) =>
            b.door_code_set_at &&
            !b.door_code_removed_at &&
            (b.check_out_date < today || ["cancelled", "checked_out"].includes(b.status)),
        )
        .map(shape),
    };
  });

/** The host's tick: it's on the lock, or off it. */
export const markDoorCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ bookingId: uuid, what: z.enum(["set", "unset", "removed"]) }).parse(d),
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
    const { error } = await sb
      .from("bookings")
      .update(
        data.what === "set"
          ? { door_code_set_at: now, door_code_removed_at: null }
          : data.what === "unset"
            ? { door_code_set_at: null }
            : { door_code_removed_at: now },
      )
      .eq("id", data.bookingId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** On the guest's card: this stay's code, making one if it's due. */
export const getStayDoorCode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const { data: b, error } = await sb
      .from("bookings")
      .select(
        "id, property_id, room_id, status, mirror_of, door_code, door_code_set_at, room_check, properties(door_codes, timezone)",
      )
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error || !b) return null;
    const f = normaliseDoorCodes(b.properties?.door_codes);
    if (!f.on || !b.room_id || b.mirror_of || ["cancelled", "blocked"].includes(b.status))
      return null;
    if (f.mode === "static")
      return { code: staticCodeFor(f, b.room_id) || null, perStay: false, onLock: false };
    let code = b.door_code as string | null;
    if (!code) {
      const { giveCode } = await import("./door-codes.server");
      code = await giveCode(
        await admin(),
        b.property_id,
        b.id,
        f,
        todayInZone(b.properties?.timezone ?? "Europe/London"),
      );
    }
    return { code, perStay: true, onLock: !!b.door_code_set_at };
  });

/** A different code for this stay (lost, or shared too widely). It then needs putting on the lock again. */
export const newStayDoorCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const { data: b } = await sb
      .from("bookings")
      .select("id, property_id, door_code, properties(door_codes, timezone)")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!b) throw new Error("That stay no longer exists. Please refresh.");
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, b.property_id));
    const f = normaliseDoorCodes(b.properties?.door_codes);
    const { giveCode } = await import("./door-codes.server");
    const code = await giveCode(
      await admin(),
      b.property_id,
      b.id,
      f,
      todayInZone(b.properties?.timezone ?? "Europe/London"),
      b.door_code,
    );
    if (!code)
      throw new Error("No codes are free: please allow more digits in your door code set-up.");
    return { code };
  });
