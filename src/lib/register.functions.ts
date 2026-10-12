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

async function rowsBetween(supabase: any, hostId: string, from: string, to: string, propertyId?: string | null) {
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
  if (error) throw new Error(error.code === "42P01" ? "The guest register is being set up. Please try again shortly." : error.message);
  return (data ?? []) as RegisterRow[];
}

export const listRegister = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, from: day, to: day, propertyId: uuid.nullish() }).parse(d))
  .handler(async ({ data, context }) => ({
    rows: await rowsBetween(context.supabase, data.hostId, data.from, data.to, data.propertyId),
  }));

/** A spreadsheet of the register for the dates asked, ready to hand over. */
export const exportRegister = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, from: day, to: day, propertyId: uuid.nullish() }).parse(d))
  .handler(async ({ data, context }) => {
    const rows = await rowsBetween(context.supabase, data.hostId, data.from, data.to, data.propertyId);
    return { csv: registerCsv([...rows].reverse()), count: rows.length };
  });

const entryInput = z.object({
  id: uuid.optional(),
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
    const { data: property } = await context.supabase.from("properties").select("name").eq("id", data.propertyId).single();
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
      ? await context.supabase.from("guest_register").update(fields).eq("id", data.id).eq("host_id", hostId)
      : await context.supabase.from("guest_register").insert({ ...fields, host_id: hostId, source: "host" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
