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
import {
  TEST_LINK_HOURS,
  suggestedName,
  testNameProblem,
  testStayDates,
  testStayNote,
  testToken,
  testTokenValid,
} from "@/lib/test-stay";

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
    // The host's sample photos, and the kiosk link that uses them.
    const db = await admin();
    const { data: samples } = await db
      .from("test_check_in_samples")
      .select("id_ref, face_ref")
      .eq("property_id", data.propertyId)
      .maybeSingle()
      .then(
        (r: { data: unknown }) => r,
        () => ({ data: null }),
      );
    const { signingSecret } = await import("./private-store.server");
    const link = await testToken(
      signingSecret(),
      data.propertyId,
      Date.now() + TEST_LINK_HOURS * 3_600_000,
    ).catch(() => null);
    const s = samples as { id_ref: string | null; face_ref: string | null } | null;
    return {
      samples: { id: !!s?.id_ref, face: !!s?.face_ref },
      testToken: link,
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

const image = z
  .string()
  .max(4_000_000)
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/);

/** The host's own sample ID or selfie, kept privately until they remove it. */
export const saveTestSample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, kind: z.enum(["id", "face"]), image }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const db = await admin();
    const column = data.kind === "id" ? "id_ref" : "face_ref";
    const { data: before, error: readErr } = await db
      .from("test_check_in_samples")
      .select("id_ref, face_ref")
      .eq("property_id", data.propertyId)
      .maybeSingle();
    if (readErr) throw new Error("This needs the latest update (migration 0101).");
    const { storePrivate, guestOwner, removePrivate } = await import("./private-store.server");
    const owner = await guestOwner(data.propertyId);
    const ref = await storePrivate({
      kind: "test_sample",
      ownerKey: owner.key,
      ownerLabel: owner.label,
      name: `test-${data.kind}-${data.propertyId.slice(0, 8)}.jpg`,
      mime: "image/jpeg",
      bytes: Uint8Array.from(atob(data.image.split(",")[1] ?? ""), (c) => c.charCodeAt(0)),
      ref: { table: "test_check_in_samples", column },
    });
    const { error } = await db.from("test_check_in_samples").upsert(
      {
        property_id: data.propertyId,
        [column]: ref,
        updated_by: (context.claims as { sub?: string } | undefined)?.sub ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id" },
    );
    if (error) {
      await removePrivate([ref]).catch(() => undefined);
      throw new Error(error.message);
    }
    const old = (before as Record<string, string | null> | null)?.[column];
    if (old) await removePrivate([old]).catch(() => undefined);
    return { ok: true };
  });

/** Deletes the sample photos for good. */
export const removeTestSamples = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const db = await admin();
    const { data: row } = await db
      .from("test_check_in_samples")
      .select("id_ref, face_ref")
      .eq("property_id", data.propertyId)
      .maybeSingle();
    if (!row) return { ok: true };
    const { removePrivate } = await import("./private-store.server");
    await removePrivate([row.id_ref, row.face_ref]);
    await db.from("test_check_in_samples").delete().eq("property_id", data.propertyId);
    return { ok: true };
  });

/**
 * The kiosk opened from the test card's link: the host's sample photos, to show in place of the
 * camera. Only with a valid link for this property; never otherwise.
 */
export const getTestSamples = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().min(1).max(80), token: z.string().min(10).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: p } = await db
      .from("properties")
      .select("id")
      .eq("short_code", data.code.toLowerCase())
      .maybeSingle();
    if (!p) return { ok: false as const };
    const { signingSecret, readPrivate } = await import("./private-store.server");
    if (!(await testTokenValid(signingSecret(), p.id, data.token))) return { ok: false as const };
    const { data: row } = await db
      .from("test_check_in_samples")
      .select("id_ref, face_ref")
      .eq("property_id", p.id)
      .maybeSingle()
      .then(
        (r: { data: unknown }) => r,
        () => ({ data: null }),
      );
    const r = row as { id_ref: string | null; face_ref: string | null } | null;
    const asUrl = async (ref: string | null) => {
      if (!ref) return null;
      const file = await readPrivate(ref).catch(() => null);
      if (!file) return null;
      let bin = "";
      for (let i = 0; i < file.bytes.length; i += 0x8000)
        bin += String.fromCharCode(...file.bytes.subarray(i, i + 0x8000));
      return `data:image/jpeg;base64,${btoa(bin)}`;
    };
    const [id, face] = await Promise.all([asUrl(r?.id_ref ?? null), asUrl(r?.face_ref ?? null)]);
    return { ok: true as const, id, face };
  });
