/* eslint-disable @typescript-eslint/no-explicit-any -- room_check is from migration 0083, newer than the generated types */
/**
 * The host's side of room allocation (room-allocation.ts): guests Latchkey
 * couldn't place for certain, confirming them, moving a check-in to another stay
 * (exchange_check_ins swaps both ways), or making a new stay for someone held.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays, todayInZone } from "@/lib/dates";
import { deleteAfter, normaliseRecords } from "@/lib/guest-records";
import { normaliseRoomCheck, rankStays } from "@/lib/room-allocation";
import { hostOfProperty, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();
type Loose = { from: (t: string) => any; rpc: (f: string, a: unknown) => any };

async function admin(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

/** Stays and their property, after checking this person may change them. */
async function loadForWrite(context: any, ids: string[]) {
  const db = await admin();
  const { data } = await db
    .from("bookings")
    .select("id, property_id, status, mirror_of, room_id, check_in_date, room_check")
    .in("id", ids);
  const rows = (data ?? []) as any[];
  if (rows.length !== ids.length) throw new Error("That stay no longer exists. Please refresh.");
  await requireWrite(context.supabase, await hostOfProperty(context.supabase, rows[0].property_id));
  if (rows.some((r) => r.property_id !== rows[0].property_id))
    throw new Error("Those stays are at different properties.");
  return { db, rows };
}

/**
 * Everything tied to a stay's check-out, once its guests or dates have changed:
 * how long their ID records are kept, and how long their guide link lasts.
 */
async function followDates(db: Loose, bookingId: string) {
  const { data: b } = await db
    .from("bookings")
    .select(
      "check_in_date, check_out_date, check_out_time, properties(timezone, default_check_out_time, guest_records)",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return;
  const { guideWindow } = await import("@/lib/guide");
  const win = guideWindow(
    b.check_in_date,
    b.check_out_date,
    (b.check_out_time ?? b.properties?.default_check_out_time ?? "11:00").slice(0, 5),
    b.properties?.timezone ?? "Europe/London",
  );
  const keepDays = normaliseRecords(b.properties?.guest_records).keepDays;
  await Promise.all([
    db
      .from("guest_ids")
      .update({ delete_after: deleteAfter(b.check_out_date, keepDays) })
      .eq("booking_id", bookingId),
    db
      .from("stay_tokens")
      .update({ expires_at: win.expiresAt.toISOString() })
      .eq("booking_id", bookingId),
    db
      .from("stay_short_links")
      .update({ expires_at: win.expiresAt.toISOString() })
      .eq("booking_id", bookingId),
  ]);
}

/** Guests to place or check at this property, those waiting for a room first. */
export const listRoomChecks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as unknown as Loose)
      .from("bookings")
      .select(
        "id, guest_full_name, check_in_date, check_out_date, status, room_check, rooms(display_name)",
      )
      .eq("property_id", data.propertyId)
      .not("room_check", "is", null)
      .order("check_in_date", { ascending: false })
      .limit(40);
    // Before the migration: nothing to check.
    if (error) return { items: [] };
    const items = ((rows ?? []) as any[]).flatMap((b) => {
      const check = normaliseRoomCheck(b.room_check);
      if (!check) return [];
      return [
        {
          id: b.id as string,
          bookingName: (b.guest_full_name as string | null) ?? null,
          idName: check.idName,
          reason: check.reason,
          held: check.held,
          room: (b.rooms?.display_name as string | null) ?? null,
          checkIn: b.check_in_date as string,
          checkOut: b.check_out_date as string,
        },
      ];
    });
    return { items: items.sort((a, b) => Number(b.held) - Number(a.held)) };
  });

/** "Looks right": nothing more to check on this stay. */
export const confirmRoomCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, rows } = await loadForWrite(context, [data.bookingId]);
    if (normaliseRoomCheck(rows[0].room_check)?.held)
      throw new Error("This guest has no room yet. Please place them first.");
    await db.from("bookings").update({ room_check: null }).eq("id", data.bookingId);
    return { ok: true };
  });

/** Where a check-in could move to: stays around its arrival, the likeliest first, and the rooms for a new stay. */
export const moveCheckInOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const { data: from } = await sb
      .from("bookings")
      .select("id, property_id, check_in_date, guest_full_name, room_check")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!from) throw new Error("That stay no longer exists. Please refresh.");
    const [{ data: lead }, { data: rows }, { data: rooms }, { data: prop }] = await Promise.all([
      sb
        .from("guest_ids")
        .select("full_name")
        .eq("booking_id", data.bookingId)
        .eq("position", 0)
        .maybeSingle(),
      sb
        .from("bookings")
        .select(
          "id, guest_full_name, check_in_date, check_out_date, status, channel, room_check, rooms(display_name)",
        )
        .eq("property_id", from.property_id)
        .neq("id", data.bookingId)
        .is("mirror_of", null)
        .is("archived_at", null)
        .not("status", "in", "(cancelled,blocked)")
        .lte("check_in_date", addDays(from.check_in_date, 1))
        .gte("check_out_date", from.check_in_date)
        .limit(60),
      sb
        .from("rooms")
        .select("id, display_name")
        .eq("property_id", from.property_id)
        .neq("active", false)
        .order("sort_order"),
      sb.from("properties").select("timezone").eq("id", from.property_id).maybeSingle(),
    ]);
    const idName =
      (lead?.full_name as string | undefined) ??
      normaliseRoomCheck(from.room_check)?.idName ??
      from.guest_full_name ??
      "";
    const today = todayInZone(prop?.timezone ?? "Europe/London");
    return {
      idName: idName as string,
      held: !!normaliseRoomCheck(from.room_check)?.held,
      checkIn: from.check_in_date as string,
      rooms: ((rooms ?? []) as any[]).map((r) => ({
        id: r.id as string,
        name: r.display_name as string,
      })),
      stays: rankStays((rows ?? []) as any[], idName, today).map((s: any) => ({
        id: s.id as string,
        name: (s.guest_full_name as string | null) ?? null,
        room: (s.rooms?.display_name as string | null) ?? null,
        channel: s.channel as string,
        checkIn: s.check_in_date as string,
        checkOut: s.check_out_date as string,
        checkedIn: s.status === "checked_in" || s.status === "checked_out",
        likely: s.likely as boolean,
      })),
    };
  });

/** Moves a check-in to another stay, or swaps the two if that stay already has a guest. */
export const moveCheckIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fromId: uuid, toId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.fromId === data.toId) return { ok: true };
    const { db, rows } = await loadForWrite(context, [data.fromId, data.toId]);
    const to = rows.find((r) => r.id === data.toId);
    const from = rows.find((r) => r.id === data.fromId);
    if (to.mirror_of || ["cancelled", "blocked"].includes(to.status))
      throw new Error("That stay can't take a guest.");
    const { error } = await db.rpc("exchange_check_ins", { _a: data.fromId, _b: data.toId });
    if (error) throw new Error(error.message);
    // The host has decided: nothing left to check on the stay they chose.
    await db.from("bookings").update({ room_check: null }).eq("id", data.toId);
    if (normaliseRoomCheck(from.room_check)?.held) {
      // The holding row has done its job, unless a swap left someone else on it.
      const { count } = await db
        .from("guest_ids")
        .select("id", { count: "exact", head: true })
        .eq("booking_id", data.fromId);
      if (!count) await db.from("bookings").delete().eq("id", data.fromId);
      else await followDates(db, data.fromId);
    } else {
      await db.from("bookings").update({ room_check: null }).eq("id", data.fromId);
      await followDates(db, data.fromId);
    }
    await followDates(db, data.toId);
    return { ok: true };
  });

/** Someone held with no booking to go on: their own stay, in a free room. */
export const makeStayForHeld = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ bookingId: uuid, roomId: uuid, nights: z.number().int().min(1).max(365) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db, rows } = await loadForWrite(context, [data.bookingId]);
    const held = rows[0];
    if (!normaliseRoomCheck(held.room_check)?.held)
      throw new Error("This stay already has a room.");
    const { data: room } = await db
      .from("rooms")
      .select("id, display_name, property_id")
      .eq("id", data.roomId)
      .maybeSingle();
    if (!room || room.property_id !== held.property_id) throw new Error("Please pick a room.");
    const checkOut = addDays(held.check_in_date, data.nights);
    const { count } = await db
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("room_id", data.roomId)
      .is("mirror_of", null)
      .not("status", "in", "(cancelled,blocked)")
      .lt("check_in_date", checkOut)
      .gt("check_out_date", held.check_in_date);
    if (count) throw new Error("That room already has a stay on those dates.");
    const { error } = await db
      .from("bookings")
      .update({
        room_id: data.roomId,
        check_out_date: checkOut,
        archived_at: null,
        room_check: null,
        manual_fields: ["room_id", "check_out_date", "guest_full_name"],
      })
      .eq("id", data.bookingId);
    if (error) throw new Error(error.message);
    await db
      .from("guest_register")
      .update({ room_name: room.display_name })
      .eq("booking_id", data.bookingId);
    await followDates(db, data.bookingId);
    return { ok: true };
  });
