/* eslint-disable @typescript-eslint/no-explicit-any -- direct_vouchers is from migration 0082, newer than the generated types */
/**
 * Loyalty discount vouchers (vouchers.ts): hosts make, list and cancel them
 * on Direct stays; guests check a code on the booking page. Booking with
 * one is reserveDirect (direct-booking.functions.ts), which checks and holds
 * it again on the server.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hostOfProperty, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
type Loose = { from: (t: string) => any };

async function admin(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

const todayIn = (tz: string | null | undefined) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? "Europe/London" }).format(new Date());

/* --------------------------------- guest --------------------------------- */

/**
 * A guest's code on the booking page. Its details come back only for the
 * guest it was made for (the name must match), so a guessed code shows
 * nothing; `problem` says why it doesn't apply to what's chosen yet.
 */
export const checkVoucher = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().min(2).max(60),
        voucher: z.string().min(1).max(30),
        name: z.string().max(120),
        roomIds: z.array(uuid).max(6),
        checkIn: iso,
        checkOut: iso,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: p } = await db
      .from("properties")
      .select("id, timezone, active")
      .eq("short_code", data.code.toLowerCase())
      .maybeSingle();
    if (!p || p.active === false) return { ok: false as const, problem: "This code isn't right." };
    const { voucherByCode } = await import("./vouchers.server");
    const { voucherProblem } = await import("./vouchers");
    const v = await voucherByCode(db, p.id, data.voucher);
    if (!v) return { ok: false as const, problem: "That code isn't right. Please check it." };
    if (data.name.trim().length < 2)
      return {
        ok: false as const,
        problem: "Please enter your name as the booker first: the code is in your name.",
      };
    const problem = voucherProblem(v, {
      roomIds: data.roomIds.length ? data.roomIds : v.roomIds,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      name: data.name,
      today: todayIn(p.timezone),
    });
    // Someone else's code (or one used or cancelled): nothing about it is shown.
    if (problem && /name|used|no longer/.test(problem)) return { ok: false as const, problem };
    return {
      ok: true as const,
      problem,
      voucher: {
        code: v.code,
        kind: v.kind,
        value: v.value,
        roomIds: v.roomIds,
        periods: v.periods,
      },
    };
  });

/* --------------------------------- host ---------------------------------- */

/** A property's vouchers, its rooms, and past guests to pick from. */
export const listVouchers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const [{ data: prop }, { data: rooms }, vouchers, { data: stays }] = await Promise.all([
      sb
        .from("properties")
        .select("id, name, short_code, currency, hosts(currency)")
        .eq("id", data.propertyId)
        .maybeSingle(),
      sb
        .from("rooms")
        .select("id, display_name, public_title, base_rate_pence, sort_order")
        .eq("property_id", data.propertyId)
        .neq("active", false)
        .order("sort_order"),
      sb
        .from("direct_vouchers")
        .select(
          "id, code, guest_name, guest_email, guest_phone, room_ids, periods, kind, value, currency, note, status, used_at, created_at, direct_reservations(reference)",
        )
        .eq("property_id", data.propertyId)
        .order("created_at", { ascending: false })
        .limit(200),
      sb
        .from("bookings")
        .select("guest_full_name, guest_email, guest_phone, check_out_date")
        .eq("property_id", data.propertyId)
        .not("guest_full_name", "is", null)
        .neq("status", "blocked")
        .order("check_out_date", { ascending: false })
        .limit(400),
    ]);
    if (!prop) throw new Error("Property not found.");
    // One row per guest (name and email), most recent first.
    const seen = new Set<string>();
    const guests: Array<{ name: string; email: string | null; phone: string | null }> = [];
    for (const b of (stays ?? []) as any[]) {
      const name = String(b.guest_full_name ?? "").trim();
      if (name.length < 2) continue;
      const key = `${name.toLowerCase()}|${(b.guest_email ?? "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Booking-site relay addresses aren't the guest's own.
      const email =
        b.guest_email &&
        !/@(guest\.airbnb|m\.expediapartnercentral|guest\.booking)\./i.test(b.guest_email)
          ? (b.guest_email as string)
          : null;
      guests.push({ name, email, phone: (b.guest_phone as string | null) ?? null });
      if (guests.length >= 150) break;
    }
    const { normalisePeriods } = await import("./vouchers");
    return {
      available: !vouchers.error,
      property: {
        name: prop.name as string,
        shortCode: prop.short_code as string,
        currency: (prop.currency as string | null) || prop.hosts?.currency || "GBP",
      },
      rooms: ((rooms ?? []) as any[]).map((r) => ({
        id: r.id as string,
        name: (r.public_title as string | null) || (r.display_name as string),
        ratePence: typeof r.base_rate_pence === "number" ? (r.base_rate_pence as number) : null,
      })),
      vouchers: ((vouchers.data ?? []) as any[]).map((v) => ({
        id: v.id as string,
        code: v.code as string,
        guestName: v.guest_name as string,
        guestEmail: (v.guest_email as string | null) ?? null,
        guestPhone: (v.guest_phone as string | null) ?? null,
        roomIds: (v.room_ids ?? []) as string[],
        periods: normalisePeriods(v.periods),
        kind: v.kind as "percent" | "price",
        value: v.value as number,
        currency: v.currency as string,
        note: (v.note as string | null) ?? null,
        status: v.status as "active" | "used" | "cancelled",
        usedAt: (v.used_at as string | null) ?? null,
        reference: (v.direct_reservations?.reference as string | null) ?? null,
        createdAt: v.created_at as string,
      })),
      guests,
    };
  });

export const createVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        guestName: z.string().trim().min(2).max(120),
        guestEmail: z.string().trim().email().max(254).nullable(),
        guestPhone: z
          .string()
          .regex(/^\+[1-9]\d{6,14}$/)
          .nullable(),
        roomIds: z.array(uuid).min(1).max(50),
        periods: z
          .array(z.object({ from: iso, to: iso }))
          .min(1)
          .max(12),
        kind: z.enum(["percent", "price"]),
        value: z.number().int().positive().max(10_000_000),
        note: z.string().trim().max(500).nullable(),
      })
      .refine((v) => v.kind !== "percent" || v.value <= 100, "A discount can be at most 100%.")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireWrite(context.supabase, hostId);
    const db = await admin();
    const { newVoucherCode, normalisePeriods } = await import("./vouchers");
    const { data: prop } = await db
      .from("properties")
      .select("id, currency, hosts(currency), rooms(id)")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (!prop) throw new Error("Property not found.");
    const own = new Set(((prop.rooms ?? []) as Array<{ id: string }>).map((r) => r.id));
    const roomIds = [...new Set(data.roomIds)].filter((id) => own.has(id));
    if (!roomIds.length) throw new Error("Pick at least one room.");
    const periods = normalisePeriods(data.periods);
    if (!periods.length) throw new Error("Pick when the code can be used.");
    // A fresh code; tried again in the rare case it's taken.
    for (let i = 0; i < 5; i++) {
      const code = newVoucherCode();
      const { data: row, error } = await db
        .from("direct_vouchers")
        .insert({
          host_id: hostId,
          property_id: data.propertyId,
          code,
          guest_name: data.guestName,
          guest_email: data.guestEmail?.toLowerCase() ?? null,
          guest_phone: data.guestPhone,
          room_ids: roomIds,
          periods,
          kind: data.kind,
          value: data.value,
          currency: (prop.currency as string | null) || prop.hosts?.currency || "GBP",
          note: data.note || null,
          created_by: context.userId ?? null,
        })
        .select("id, code")
        .single();
      if (!error && row) return { id: row.id as string, code: row.code as string };
      if (error && !/duplicate|unique/i.test(error.message))
        throw new Error(
          /direct_vouchers/.test(error.message)
            ? "Vouchers need the latest update (migration 0082)."
            : error.message,
        );
    }
    throw new Error("Couldn't make a code. Please try again.");
  });

export const cancelVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: v } = await db
      .from("direct_vouchers")
      .select("id, host_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!v) throw new Error("Voucher not found.");
    await requireWrite(context.supabase, v.host_id);
    if (v.status !== "active") throw new Error("Only an unused code can be cancelled.");
    await db.from("direct_vouchers").update({ status: "cancelled" }).eq("id", data.id);
    return { ok: true };
  });
