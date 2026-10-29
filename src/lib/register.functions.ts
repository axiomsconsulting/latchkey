/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * The UK guest register for hosts: read it, download it for an inspecting
 * officer, correct an entry, or add someone who checked in with you in
 * person. Rules live in hotel-register.ts; RLS limits all of this to staff.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { cleanRegisterEntry, registerCsv, registerKeepUntil } from "@/lib/hotel-register";
import { hostOfProperty, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const COLUMNS =
  "id, property_id, property_name, booking_id, room_name, position, arrival_date, full_name, nationality, is_alien, document_number, place_of_issue, next_destination, next_address, source, keep_until, updated_at";

export type RegisterRow = {
  id: string;
  property_id: string | null;
  property_name: string;
  booking_id: string | null;
  room_name: string | null;
  position: number | null;
  arrival_date: string;
  full_name: string;
  nationality: string;
  is_alien: boolean;
  document_number: string | null;
  place_of_issue: string | null;
  next_destination: string | null;
  next_address: string | null;
  source: string;
  keep_until: string;
  updated_at: string;
};

async function rowsBetween(
  supabase: any,
  hostId: string,
  from: string,
  to: string,
  propertyId?: string | null,
) {
  let q = supabase
    .from("guest_register")
    .select(COLUMNS)
    .eq("host_id", hostId)
    .gte("arrival_date", from)
    .lte("arrival_date", to)
    .order("arrival_date", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(5000);
  if (propertyId) q = q.eq("property_id", propertyId);
  const { data, error } = await q;
  if (error)
    throw new Error(
      error.code === "42P01"
        ? "The guest register is being set up. Please try again shortly."
        : error.message,
    );
  return (data ?? []) as RegisterRow[];
}

export const listRegister = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ hostId: uuid, from: day, to: day, propertyId: uuid.nullish() }).parse(d),
  )
  .handler(async ({ data, context }) => ({
    rows: await rowsBetween(context.supabase, data.hostId, data.from, data.to, data.propertyId),
  }));

/** A spreadsheet of the register for the dates asked, ready to hand over. */
export const exportRegister = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ hostId: uuid, from: day, to: day, propertyId: uuid.nullish() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const rows = await rowsBetween(
      context.supabase,
      data.hostId,
      data.from,
      data.to,
      data.propertyId,
    );
    return { csv: registerCsv([...rows].reverse()), count: rows.length };
  });

const entryInput = z.object({
  id: uuid.optional(),
  /** Added from a guest's check-in (the "To add" list): their stay and place in it. */
  bookingId: uuid.optional(),
  position: z.number().int().min(0).max(29).optional(),
  propertyId: uuid,
  arrivalDate: day,
  roomName: z.string().trim().max(120).nullish(),
  fullName: z.string().max(200),
  nationality: z.string().max(10),
  documentNumber: z.string().max(60).nullish(),
  placeOfIssue: z.string().max(120).nullish(),
  nextDestination: z.string().max(200).nullish(),
  nextAddress: z.string().max(400).nullish(),
});

/** Adds someone the host checked in themselves, or corrects an entry. */
export const saveRegisterEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => entryInput.parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireWrite(context.supabase, hostId);
    const clean = cleanRegisterEntry(data);
    if (!clean.ok) return { ok: false as const, missing: clean.missing };
    const e = clean.entry;
    const { data: property } = await context.supabase
      .from("properties")
      .select("name")
      .eq("id", data.propertyId)
      .single();
    // Linked to a stay only if it's this property's (so it leaves the "To add" list).
    let stay: { booking_id: string; position: number } | null = null;
    if (!data.id && data.bookingId && data.position !== undefined) {
      const { data: b } = await context.supabase
        .from("bookings")
        .select("id")
        .eq("id", data.bookingId)
        .eq("property_id", data.propertyId)
        .maybeSingle();
      if (b) stay = { booking_id: b.id, position: data.position };
    }
    const fields = {
      property_id: data.propertyId,
      property_name: property?.name ?? "",
      room_name: data.roomName?.trim() || null,
      arrival_date: data.arrivalDate,
      full_name: e.fullName,
      nationality: e.nationality,
      is_alien: e.alien,
      document_number: e.documentNumber,
      place_of_issue: e.placeOfIssue,
      next_destination: e.nextDestination,
      next_address: e.nextAddress,
      keep_until: registerKeepUntil(data.arrivalDate),
    };
    const { error } = data.id
      ? await context.supabase
          .from("guest_register")
          .update(fields)
          .eq("id", data.id)
          .eq("host_id", hostId)
      : await context.supabase
          .from("guest_register")
          .insert({ ...fields, ...(stay ?? {}), host_id: hostId, source: "host" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type RegisterGap = {
  bookingId: string;
  position: number;
  propertyId: string;
  propertyName: string;
  roomName: string | null;
  arrivalDate: string;
  /** As read from their ID, or the booking's name for the lead guest. */
  name: string | null;
  bookingName: string | null;
  /** A 10-minute link to the kept ID photo, if one was kept. */
  photoUrl: string | null;
  hasPhoto: boolean;
};

/**
 * Guests who checked in at a UK property in the last 12 months but aren't
 * in the register yet: their ID couldn't be read automatically (the photo
 * is kept), or they had none. The host adds each from the photo, by hand or
 * with "Read the ID photo".
 */
export const listRegisterGaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, propertyId: uuid.nullish() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { registerApplies } = await import("@/lib/hotel-register");
    let pq = sb.from("properties").select("id, name, country_code").eq("host_id", data.hostId);
    if (data.propertyId) pq = pq.eq("id", data.propertyId);
    const { data: props } = await pq;
    const uk = (
      (props ?? []) as Array<{ id: string; name: string; country_code: string | null }>
    ).filter((p) => registerApplies(p.country_code));
    if (!uk.length) return { gaps: [] as RegisterGap[] };
    const today = new Date().toISOString().slice(0, 10);
    const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
    const { data: people, error } = await sb
      .from("guest_ids")
      .select(
        "booking_id, property_id, position, kind, age, full_name, id_photo_path, bookings!inner(check_in_date, guest_full_name, status, rooms(display_name))",
      )
      .in(
        "property_id",
        uk.map((p) => p.id),
      )
      .gte("bookings.check_in_date", yearAgo)
      .lte("bookings.check_in_date", today)
      .limit(500);
    if (error) return { gaps: [] as RegisterGap[] };
    const rows = ((people ?? []) as any[]).filter(
      (r) =>
        (r.kind === "adult" || (r.age ?? 0) >= 16) &&
        r.bookings?.status !== "cancelled" &&
        r.bookings?.status !== "blocked",
    );
    if (!rows.length) return { gaps: [] as RegisterGap[] };
    const { data: done } = await sb
      .from("guest_register")
      .select("booking_id, position")
      .in("booking_id", [...new Set(rows.map((r) => r.booking_id))]);
    const have = new Set(((done ?? []) as any[]).map((r) => `${r.booking_id}:${r.position}`));
    const gaps = rows.filter((r) => !have.has(`${r.booking_id}:${r.position}`));
    const { signGuestPhotos } = await import("./checkin.server");
    const signed = await signGuestPhotos(
      gaps.map((r) => r.id_photo_path).filter((x): x is string => !!x),
    );
    const names = new Map(uk.map((p) => [p.id, p.name]));
    return {
      gaps: gaps
        .map((r): RegisterGap => ({
          bookingId: r.booking_id,
          position: r.position,
          propertyId: r.property_id,
          propertyName: names.get(r.property_id) ?? "",
          roomName: r.bookings?.rooms?.display_name ?? null,
          arrivalDate: r.bookings?.check_in_date,
          name: r.full_name ?? null,
          bookingName: r.position === 0 ? (r.bookings?.guest_full_name ?? null) : null,
          photoUrl: r.id_photo_path ? (signed[r.id_photo_path] ?? null) : null,
          hasPhoto: !!r.id_photo_path,
        }))
        .sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate) || a.position - b.position)
        .slice(0, 100),
    };
  });

/**
 * Reads a kept ID photo for the register (the host asked: "Read the ID
 * photo"), with the same reader and switches as check-in. Nothing is saved:
 * the host checks the details and saves the entry.
 */
export const readRegisterPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ bookingId: uuid, position: z.number().int().min(0).max(29) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    // Readable only by those who may see private records (RLS).
    const { data: person } = await sb
      .from("guest_ids")
      .select("property_id, id_photo_path, full_name")
      .eq("booking_id", data.bookingId)
      .eq("position", data.position)
      .maybeSingle();
    if (!person?.id_photo_path) throw new Error("There's no ID photo kept for this guest.");
    const hostId = await hostOfProperty(context.supabase, person.property_id);
    await requireWrite(context.supabase, hostId);
    const { nationalityFromId } = await import("@/lib/hotel-register");
    const { hostModes, readIdDetails } = await import("./checkin.server");
    if ((await hostModes(hostId)).id_check === "demo")
      return {
        fullName: person.full_name ?? "Sample Guest",
        nationality: "GB",
        documentNumber: null,
        placeOfIssue: null,
      };
    const { jobAllowed, bumpUsage } = await import("./usage.server");
    if (!(await jobAllowed("ai_id_reading")))
      throw new Error(
        "Automatic ID reading is switched off. Please type the details from the photo.",
      );
    const { readPrivate } = await import("./private-store.server");
    const file = await readPrivate(person.id_photo_path);
    if (!file) throw new Error("We couldn't open the photo. Please try again.");
    let binary = "";
    for (let i = 0; i < file.bytes.length; i += 0x8000)
      binary += String.fromCharCode(...file.bytes.subarray(i, i + 0x8000));
    await bumpUsage(hostId, "ai:id_read");
    const read = await readIdDetails(
      `data:${file.mime.startsWith("image/") ? file.mime : "image/jpeg"};base64,${btoa(binary)}`,
    );
    return {
      fullName: read.fullName,
      nationality: nationalityFromId(read.nationality),
      documentNumber: read.documentNumber,
      placeOfIssue: read.placeOfIssue ?? read.issuingCountry,
    };
  });
