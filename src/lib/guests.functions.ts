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

    const [messages, requests, jobs, presence, people, register] = await Promise.all([
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
      // The UK guest register entries for this stay (staff only by RLS).
      sb
        .from("guest_register")
        .select("position, full_name, nationality, document_number, place_of_issue, next_destination, next_address")
        .eq("booking_id", data.bookingId),
    ]);
    const registerAt = new Map((register.data ?? []).map((r) => [r.position, r]));
    const peopleRows = people.data ?? [];
    // A closed night says why it's closed instead of showing a guest name.
    let closed: string | null = null;
    const raw = booking as { mirror_of?: string | null; status: string; notes?: string | null; channel: string };
    if (raw.mirror_of || raw.status === "blocked") {
      const { closedReason } = await import("./booking-list");
      const { channels } = await import("@/content/copy");
      const label = (x: { channel: string }) => (channels as Record<string, string>)[x.channel] ?? x.channel;
      const { data: original } = raw.mirror_of
        ? await sb.from("bookings").select("id, channel, guest_full_name, status, check_in_date, check_out_date, room_id").eq("id", raw.mirror_of).maybeSingle()
        : { data: null };
      closed = closedReason(raw as never, original ? [original as never] : [], label as never);
    }
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
        closedReason: closed,
        status: b.status,
        channel: b.channel,
        source: b.source,
        reservationCode: b.reservation_code,
        guestCount: b.guest_count,
        phoneLast4: b.phone_last4,
        email: b.guest_email,
        address: ((b as { guest_address?: string | null }).guest_address ?? null) as string | null,
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
        register: (() => {
          const r = registerAt.get(p.position);
          return r
            ? {
                fullName: r.full_name,
                nationality: r.nationality,
                documentNumber: r.document_number,
                placeOfIssue: r.place_of_issue,
                nextDestination: r.next_destination,
                nextAddress: r.next_address,
              }
            : null;
        })(),
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

/**
 * The quick choices on a stay without a guest name: "not a booking" closes
 * the nights; "it's a booking" (unblock) puts it back to needing a name.
 * Recorded as the host's own choice, so the feed doesn't flip it back.
 */
export const setBookingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["blocked", "needs_details"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWriteForBookings(context.supabase, [data.id]);
    const { data: b, error: readErr } = await context.supabase.from("bookings").select("id, status, mirror_of, manual_fields").eq("id", data.id).maybeSingle();
    if (readErr || !b) throw new Error("That stay no longer exists. Refresh and try again.");
    if (b.mirror_of) throw new Error("These nights mirror a booking on another site. They open again when that booking changes.");
    if (!["blocked", "needs_details", "upcoming"].includes(b.status)) throw new Error("This stay has moved on (checked in, out or cancelled), so it can't be changed here.");
    const manual = Array.from(new Set([...(b.manual_fields ?? []), "status"]));
    const { error } = await context.supabase.from("bookings").update({ status: data.status, manual_fields: manual }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
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
