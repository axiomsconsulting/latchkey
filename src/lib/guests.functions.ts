/**
 * One place for everything about a guest's stay, plus the tidy-up tools:
 * archive (hide from everyday screens), delete (remove the stay and all
 * that belongs to it) and re-sync every calendar link of a property.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hostOfProperty, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();
const ids = z.array(uuid).min(1).max(200);

/** Columns and functions from migration 0019, before the generated types know them. */
type Untyped = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
};
const untyped = (client: unknown) => client as Untyped;

/** Every stay in the list must belong to one host the caller can write to. */
async function requireWriteForBookings(supabase: Parameters<typeof requireWrite>[0], bookingIds: string[]) {
  const { data } = await supabase.from("bookings").select("property_id").in("id", bookingIds);
  const properties = [...new Set((data ?? []).map((b) => b.property_id))];
  if (properties.length === 0 || (data ?? []).length !== bookingIds.length) {
    throw new Error("Some of those stays no longer exist. Refresh and try again.");
  }
  for (const p of properties) await requireWrite(supabase, await hostOfProperty(supabase, p));
}

/** The guest card: the stay, its room and platform, messages, requests and activity. */
export const getGuestDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: booking, error } = await sb
      .from("bookings")
      .select("*, rooms(display_name, public_title), channel_connections(listing_name, channel)")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("We couldn't find that stay.");

    const [messages, requests, jobs, presence, people] = await Promise.all([
      sb
        .from("messages")
        .select("id, body, direction, created_at")
        .eq("booking_id", data.bookingId)
        .eq("channel", "stay_page")
        .order("created_at", { ascending: true })
        .limit(200),
      sb
        .from("requests")
        .select("id, status, items, total_pence, time_window, message, created_at, payment_method")
        .eq("booking_id", data.bookingId)
        .order("created_at", { ascending: false }),
      sb
        .from("service_jobs")
        .select("id, title, category, status, urgency, created_at")
        .eq("booking_id", data.bookingId)
        .order("created_at", { ascending: false }),
      sb
        .from("presence_log")
        .select("id, event, source, at")
        .eq("booking_id", data.bookingId)
        .order("at", { ascending: false })
        .limit(20),
      // Staff only by RLS: read-only viewers get an empty list.
      sb
        .from("guest_ids")
        .select(
          "id, position, kind, age, full_name, document_type, issuing_country, date_of_birth, document_expiry, document_last4, name_match, id_checked, skipped, id_photo_path, face_photo_path, delete_after",
        )
        .eq("booking_id", data.bookingId)
        .order("position", { ascending: true }),
    ]);
    const peopleRows = people.data ?? [];
    const { signGuestPhotos } = await import("./checkin.server");
    const signed = await signGuestPhotos(
      peopleRows.flatMap((p) => [p.id_photo_path, p.face_photo_path].filter((x): x is string => !!x)),
    );

    const b = booking as typeof booking & {
      rooms: { display_name: string; public_title: string | null } | null;
      channel_connections: { listing_name: string | null; channel: string } | null;
      archived_at?: string | null;
    };
    return {
      booking: {
        id: b.id,
        guestName: b.guest_full_name,
        status: b.status,
        channel: b.channel,
        source: b.source,
        reservationCode: b.reservation_code,
        guestCount: b.guest_count,
        phoneLast4: b.phone_last4,
        email: b.guest_email,
        checkIn: b.check_in_date,
        checkOut: b.check_out_date,
        checkInTime: b.check_in_time,
        checkOutTime: b.check_out_time,
        notes: b.notes,
        roomName: b.rooms?.display_name ?? null,
        roomTitle: b.rooms?.public_title ?? null,
        listingName: b.channel_connections?.listing_name ?? null,
        archived: !!b.archived_at,
        checkedInAt: b.checked_in_at,
        siteKey: b.site_key,
        arrivedAdults: b.arrived_adults,
        arrivedChildren: b.arrived_children,
        idCheckStatus: b.id_check_status,
      },
      people: peopleRows.map((p) => ({
        id: p.id,
        position: p.position,
        kind: p.kind as "adult" | "child",
        age: p.age,
        fullName: p.full_name,
        documentType: p.document_type,
        issuingCountry: p.issuing_country,
        dateOfBirth: p.date_of_birth,
        documentExpiry: p.document_expiry,
        documentLast4: p.document_last4,
        nameMatch: p.name_match as "matched" | "partial" | "not_matched" | null,
        idChecked: p.id_checked,
        skipped: p.skipped,
        idPhotoUrl: p.id_photo_path ? (signed[p.id_photo_path] ?? null) : null,
        facePhotoUrl: p.face_photo_path ? (signed[p.face_photo_path] ?? null) : null,
        deleteAfter: p.delete_after,
      })),
      messages: (messages.data ?? []).map((m) => ({
        id: m.id,
        body: m.body ?? "",
        fromHost: m.direction === "outbound",
        createdAt: m.created_at,
      })),
      requests: ((requests.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: r["id"] as string,
        status: r["status"] as string,
        items: ((r["items"] as Array<{ name: string; qty: number }> | null) ?? []).map((i) => ({ name: i.name, qty: i.qty })),
        totalPence: (r["total_pence"] as number | null) ?? 0,
        note: (r["message"] as string | null) ?? null,
        createdAt: r["created_at"] as string,
      })),
      jobs: (jobs.data ?? []).map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        urgency: j.urgency,
        createdAt: j.created_at,
      })),
      presence: (presence.data ?? []).map((p) => ({ id: p.id, event: p.event as string, createdAt: p.at })),
    };
  });

/** Hide stays from everyday screens, or bring them back. */
export const archiveBookings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids, archived: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWriteForBookings(context.supabase, data.ids);
    const { error } = await untyped(context.supabase)
      .from("bookings")
      .update({ archived_at: data.archived ? new Date().toISOString() : null })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { count: data.ids.length };
  });

/** Removes stays with their messages, requests, service jobs and alerts. */
export const deleteBookings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids }).parse(d))
  .handler(async ({ data, context }) => {
    // ID photos live in storage, which the database cascade can't reach.
    const { data: people } = await context.supabase
      .from("guest_ids")
      .select("id_photo_path, face_photo_path")
      .in("booking_id", data.ids);
    const { data: count, error } = await untyped(context.supabase).rpc("delete_bookings", { _ids: data.ids });
    if (error) throw new Error(error.message);
    const { removeGuestPhotos } = await import("./checkin.server");
    await removeGuestPhotos((people ?? []).flatMap((p) => [p.id_photo_path, p.face_photo_path].filter((x): x is string => !!x)));
    return { count: (count as number | null) ?? 0 };
  });

/** Re-reads every calendar link of a property; stays deleted by mistake come back. */
export const syncPropertyNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const { data: links } = await context.supabase
      .from("channel_connections")
      .select("id, channel, listing_name")
      .eq("property_id", data.propertyId);
    const { syncConnection } = await import("./ical-sync.server");
    let created = 0;
    let updated = 0;
    let cancelled = 0;
    const failed: string[] = [];
    for (const link of links ?? []) {
      try {
        const res = await syncConnection(link.id);
        created += res.created;
        updated += res.updated;
        cancelled += res.cancelled;
      } catch (err) {
        failed.push(`${link.listing_name ?? link.channel}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
    return { links: (links ?? []).length, created, updated, cancelled, failed };
  });

/** Service jobs: hide from the board, or delete outright. */
export const archiveJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids, archived: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await untyped(context.supabase)
      .from("service_jobs")
      .update({ archived_at: data.archived ? new Date().toISOString() : null })
      .in("id", data.ids)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Those jobs no longer exist. Refresh and try again.");
    return { count: rows.length };
  });

export const deleteJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("service_jobs").delete().in("id", data.ids).select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Those jobs no longer exist. Refresh and try again.");
    return { count: rows.length };
  });
