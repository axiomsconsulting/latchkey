/* eslint-disable @typescript-eslint/no-explicit-any -- is_test and test_room_id are from migration 0092 */
/**
 * A host trying their own check-in, from Today (TestStayCard): start one, change its name or room,
 * or reset it, which removes everything it saved.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { todayInZone } from "@/lib/dates";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { hostOfProperty, requireWrite } from "@/lib/roles";
import { suggestedName, testNameProblem, testStayDates, testStayNote } from "@/lib/test-stay";

const uuid = z.string().uuid();
const name = z.string().trim().min(3).max(120);

const COLS =
  "id, guest_full_name, status, check_out_date, test_room_id, id_check_status, checked_in_at";

async function admin() {
  const { admin: get } = await import("./checkin.server");
  return (await get()) as any;
}

export const getTestStay = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const claims = context.claims as { user_metadata?: Record<string, unknown> } | undefined;
    const { data: stay, error } = await (context.supabase as any)
      .from("bookings")
      .select(COLS)
      .eq("property_id", data.propertyId)
      .eq("is_test", true)
      .maybeSingle();
    return {
      available: !error,
      stay: (error ? null : stay) as {
        id: string;
        guest_full_name: string;
        status: string;
        check_out_date: string;
        test_room_id: string | null;
        id_check_status: string | null;
        checked_in_at: string | null;
      } | null,
      name: suggestedName(claims?.user_metadata),
    };
  });

export const startTestStay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, name, roomId: uuid.nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    if (testNameProblem(data.name)) throw new Error("Please type a first name and surname.");
    const db = await admin();
    const { data: p } = await db
      .from("properties")
      .select("timezone")
      .eq("id", data.propertyId)
      .single();
    const today = todayInZone(p?.timezone ?? "Europe/London");
    const { data: made, error } = await db
      .from("bookings")
      .insert({
        property_id: data.propertyId,
        ...testStayDates(today),
        guest_full_name: data.name,
        channel: "direct",
        status: "upcoming",
        is_test: true,
        test_room_id: data.roomId,
        guest_count: 1,
        notes: testStayNote(data.name),
      })
      .select("id")
      .single();
    if (error)
      throw new Error(
        /bookings_one_test/.test(error.message)
          ? "There's already a test check-in here. Reset it to start again."
          : /is_test/.test(error.message)
            ? "This needs the latest update (migration 0092)."
            : error.message,
      );
    return { id: made.id as string };
  });

/** Their name or the room to try, at any point. The stay's real room stays empty. */
export const updateTestStay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, name, roomId: uuid.nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    if (testNameProblem(data.name)) throw new Error("Please type a first name and surname.");
    const db = await admin();
    const { error } = await db
      .from("bookings")
      .update({
        guest_full_name: data.name,
        test_room_id: data.roomId,
        notes: testStayNote(data.name),
      })
      .eq("property_id", data.propertyId)
      .eq("is_test", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Removes the test stay and everything it saved, so the check-in can start again. */
export const resetTestStay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const db = await admin();
    const { data: stay } = await db
      .from("bookings")
      .select("id")
      .eq("property_id", data.propertyId)
      .eq("is_test", true)
      .maybeSingle();
    if (!stay) return { ok: true };
    const { wipeTestStay } = await import("./test-stay.server");
    await wipeTestStay(db, stay.id);
    return { ok: true };
  });
