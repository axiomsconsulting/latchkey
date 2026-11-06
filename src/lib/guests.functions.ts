/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
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
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: any; error: { message: string } | null }>;
};
const untyped = (client: unknown) => client as Untyped;

/** Every stay in the list must belong to one host the caller can write to. */
async function requireWriteForBookings(
  supabase: Parameters<typeof requireWrite>[0],
  bookingIds: string[],
) {
  const { data } = await supabase.from("bookings").select("property_id").in("id", bookingIds);
  const properties = [...new Set((data ?? []).map((b) => b.property_id))];
  if (properties.length === 0 || (data ?? []).length !== bookingIds.length) {
    throw new Error("Some of those stays no longer exist. Refresh and try again.");
  }
  for (const p of properties) await requireWrite(supabase, await hostOfProperty(supabase, p));
}

/** The guest card: the stay, its room and platform, messages, requests and activity. */
/**
 * For the bookings list: how many IDs were checked on each stay and a short-lived link to the
 * lead guest's face photo. Never an ID photo. Rows go when the host's keep days end, and only
 * people who may see private records get any.
 */
export const getCheckInMarks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyIds: z.array(uuid).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!data.propertyIds.length) return { marks: {} };
    const { data: rows } = await context.supabase
      .from("guest_ids")
      .select("booking_id, position, kind, id_checked, face_photo_path")
      .in("property_id", data.propertyIds)
      .order("created_at", { ascending: false })
      .limit(600);
    const list = (rows ?? []) as Array<{
      booking_id: string;
      position: number;
      id_checked: boolean;
      face_photo_path: string | null;
    }>;
    const { signGuestPhotos } = await import("./checkin.server");
    const lead = (id: string) =>
      list
        .filter((r) => r.booking_id === id && r.face_photo_path)
        .sort((a, b) => a.position - b.position)[0]?.face_photo_path ?? null;
    const ids = [...new Set(list.map((r) => r.booking_id))];
    const faces = ids.map(lead).filter((x): x is string => !!x);
    const signed = await signGuestPhotos(faces);
    const marks: Record<string, { faceUrl: string | null; idsChecked: number }> = {};
    for (const id of ids) {
      const face = lead(id);
      marks[id] = {
        faceUrl: face ? (signed[face] ?? null) : null,
        idsChecked: list.filter((r) => r.booking_id === id && r.id_checked).length,
      };
    }
    return { marks };
  });

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
        .select(
          "position, full_name, nationality, document_number, place_of_issue, next_destination, next_address",
        )
        .eq("booking_id", data.bookingId),
    ]);
    const registerAt = new Map((register.data ?? []).map((r) => [r.position, r]));
    const peopleRows = people.data ?? [];
    // A closed night says why it's closed instead of showing a guest name.
    let closed: string | null = null;
    const raw = booking as {
      mirror_of?: string | null;
      status: string;
      notes?: string | null;
      channel: string;
    };
    if (raw.mirror_of || raw.status === "blocked") {
      const { closedReason } = await import("./booking-list");
      const { channels } = await import("@/content/copy");
      const label = (x: { channel: string }) =>
        (channels as Record<string, string>)[x.channel] ?? x.channel;
      const { data: original } = raw.mirror_of
        ? await sb
            .from("bookings")
            .select("id, channel, guest_full_name, status, check_in_date, check_out_date, room_id")
            .eq("id", raw.mirror_of)
            .maybeSingle()
        : { data: null };
      closed = closedReason(raw as never, original ? [original as never] : [], label as never);
    }
    const { signGuestPhotos } = await import("./checkin.server");
    const signed = await signGuestPhotos(
      peopleRows.flatMap((p) =>
        [p.id_photo_path, p.face_photo_path].filter((x): x is string => !!x),
      ),
    );

    const b = booking as typeof booking & {
      rooms: { display_name: string; public_title: string | null } | null;
      channel_connections: { listing_name: string | null; channel: string } | null;
      archived_at?: string | null;
    };
    const { isRepeatStay } = await import("./repeat-guest.server");
    const stayedBefore = await isRepeatStay(sb, b.id);
    // Whether the host can add photos here (AddGuestPhotos): only once they've confirmed registration.
    const { data: recRow } = await sb
      .from("properties")
      .select("guest_records")
      .eq("id", (b as unknown as { property_id: string }).property_id)
      .maybeSingle();
    const { normaliseRecords } = await import("./guest-records");
    const keepsPhotos = normaliseRecords(
      (recRow as { guest_records?: unknown } | null)?.guest_records,
    ).regulatorConfirmed;
    return {
      keepsPhotos,
      booking: {
        id: b.id,
        stayedBefore,
        isTest: (b as unknown as { is_test?: boolean }).is_test === true,
        guestName: b.guest_full_name,
        closedReason: closed,
        status: b.status,
        channel: b.channel,
        source: b.source,
        reservationCode: b.reservation_code,
        guestCount: b.guest_count,
        phoneLast4: b.phone_last4,
        phone: ((b as { guest_phone?: string | null }).guest_phone ?? null) as string | null,
        propertyId: b.property_id,
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
        items: ((r["items"] as Array<{ name: string; qty: number }> | null) ?? []).map((i) => ({
          name: i.name,
          qty: i.qty,
        })),
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
      presence: (presence.data ?? []).map((p) => ({
        id: p.id,
        event: p.event as string,
        createdAt: p.at,
      })),
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
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["blocked", "needs_details"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireWriteForBookings(context.supabase, [data.id]);
    const { data: b, error: readErr } = await context.supabase
      .from("bookings")
      .select("id, status, mirror_of, manual_fields")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr || !b) throw new Error("That stay no longer exists. Refresh and try again.");
    if (b.mirror_of)
      throw new Error(
        "These nights mirror a booking on another site. They open again when that booking changes.",
      );
    if (!["blocked", "needs_details", "upcoming"].includes(b.status))
      throw new Error(
        "This stay has moved on (checked in, out or cancelled), so it can't be changed here.",
      );
    const manual = Array.from(new Set([...(b.manual_fields ?? []), "status"]));
    const { error } = await context.supabase
      .from("bookings")
      .update({ status: data.status, manual_fields: manual })
      .eq("id", data.id);
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
    // A host's test stay leaves nothing behind, however it's removed.
    const { admin } = await import("./checkin.server");
    const { testIds, wipeTestStay } = await import("./test-stay.server");
    const db = await admin();
    const tests = await testIds(db, data.ids);
    for (const id of tests) await wipeTestStay(db, id);
    const rest = data.ids.filter((id) => !tests.has(id));
    if (!rest.length) return { count: tests.size };
    const { data: count, error } = await untyped(context.supabase).rpc("delete_bookings", {
      _ids: rest,
    });
    if (error) throw new Error(error.message);
    const { removeGuestPhotos } = await import("./checkin.server");
    await removeGuestPhotos(
      (people ?? []).flatMap((p) =>
        [p.id_photo_path, p.face_photo_path].filter((x): x is string => !!x),
      ),
    );
    return { count: ((count as number | null) ?? 0) + tests.size };
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
        failed.push(
          `${link.listing_name ?? link.channel}: ${err instanceof Error ? err.message : "failed"}`,
        );
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
    const { data: rows, error } = await context.supabase
      .from("service_jobs")
      .delete()
      .in("id", data.ids)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Those jobs no longer exist. Refresh and try again.");
    return { count: rows.length };
  });

/**
 * The host adds a guest's ID or face photo themselves (from a file, or their phone's camera or
 * photo library), when the guest couldn't check in at the door or the host turned the photo steps
 * off. Kept exactly like the kiosk's: only once the host has confirmed their data regulator
 * registration, in the private store, and deleted with the property's keep days.
 */
export const addGuestPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        bookingId: uuid,
        position: z.number().int().min(0).max(29),
        kind: z.enum(["id", "face"]),
        image: z
          .string()
          .max(560_000)
          .regex(/^data:image\/jpeg;base64,/),
        /** A larger copy for reading the ID; never kept. */
        full: z
          .string()
          .max(3_000_000)
          .regex(/^data:image\/jpeg;base64,/)
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertNotSharedDemo } = await import("./demo-account");
    assertNotSharedDemo(context.claims);
    // RLS: only this business's team can see the stay.
    const { data: b } = await context.supabase
      .from("bookings")
      .select(
        "id, property_id, check_in_date, check_out_date, guest_full_name, id_check_status, room_id",
      )
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!b) throw new Error("We couldn't find that stay.");
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, b.property_id));
    const { admin, storeGuestPhoto, removeGuestPhotos } = await import("./checkin.server");
    const db = (await admin()) as unknown as { from: (t: string) => any };
    const { data: p } = await db
      .from("properties")
      .select("guest_records, is_demo, host_id, name, country_code, timezone")
      .eq("id", b.property_id)
      .single();
    if (p?.is_demo) throw new Error("Photos aren't kept in the demo.");
    const { normaliseRecords, deleteAfter } = await import("./guest-records");
    const rec = normaliseRecords(p?.guest_records);
    if (!rec.regulatorConfirmed)
      throw new Error(
        "Photos can only be kept once you've confirmed your data regulator registration in Settings → Check-in → Who's staying and ID records.",
      );
    const col = data.kind === "id" ? "id_photo_path" : "face_photo_path";
    const { data: prev } = await db
      .from("guest_ids")
      .select(`id, ${col}`)
      .eq("booking_id", b.id)
      .eq("position", data.position)
      .maybeSingle();
    const path = await storeGuestPhoto(b.id, data.kind, data.image, b.property_id);
    if (prev) {
      const { error } = await db
        .from("guest_ids")
        .update({ [col]: path })
        .eq("id", prev.id);
      if (error) throw new Error(error.message);
      if (prev[col]) await removeGuestPhotos([prev[col] as string]);
    } else {
      const { error } = await db.from("guest_ids").insert({
        booking_id: b.id,
        property_id: b.property_id,
        position: data.position,
        kind: "adult",
        full_name: data.position === 0 ? b.guest_full_name : null,
        id_checked: false,
        skipped: false,
        [col]: path,
        delete_after: deleteAfter(b.check_out_date, rec.keepDays),
      });
      if (error) throw new Error(error.message);
    }
    if (data.kind === "face") return { ok: true as const, read: null };
    const read = await readHostUpload(db, {
      booking: b,
      property: p,
      position: data.position,
      image: data.full ?? data.image,
    });
    return { ok: true as const, read };
  });

/**
 * The ID photo a host added is checked like one taken at the door: read (same reader, demo/live
 * switch and usage count as the kiosk), judged, the person's details and check filled in, the stay's
 * status set (hostReadOutcome), and the UK register entry written when everything it needs was on
 * the ID. Anything missing (the next destination, say) is left for the register's own form.
 */
async function readHostUpload(
  db: { from: (t: string) => any },
  o: {
    booking: {
      id: string;
      property_id: string;
      check_in_date: string;
      guest_full_name: string | null;
      id_check_status: string | null;
      room_id: string | null;
    };
    property: {
      host_id: string;
      name: string;
      country_code: string | null;
      timezone: string | null;
    };
    position: number;
    image: string;
  },
): Promise<{ result: string; register: "saved" | "missing" | "none"; expired: boolean } | null> {
  const { hostModes, readIdDetails } = await import("./checkin.server");
  const { judgeId } = await import("./guest-records");
  const { hostReadOutcome } = await import("./host-id-read");
  const { todayInZone } = await import("./dates");
  let read: import("./guest-records").IdRead;
  if ((await hostModes(o.property.host_id)).id_check === "demo") {
    // Demo mode: a sample read, as at the door.
    read = {
      isIdDocument: true,
      hasHolderPhoto: true,
      looksHomemade: false,
      documentType: "passport",
      fullName: o.position === 0 ? (o.booking.guest_full_name ?? "Sample Guest") : "Sample Guest",
      dateOfBirth: null,
      expiryDate: "2031-01-01",
      issuingCountry: "United Kingdom",
      numberLast4: "0000",
      nationality: "GBR",
      documentNumber: null,
      placeOfIssue: null,
    };
  } else {
    const { jobAllowed, bumpUsage } = await import("./usage.server");
    // Reading switched off: the photo is kept as added by the host, for checking by eye.
    if (!(await jobAllowed("ai_id_reading"))) {
      const out = hostReadOutcome({
        position: o.position,
        readable: false,
        idName: null,
        bookingName: o.booking.guest_full_name,
      });
      if (out.status) await markStay(db, o.booking, out.status);
      return null;
    }
    await bumpUsage(o.property.host_id, "ai:id_read");
    try {
      read = await readIdDetails(o.image);
    } catch {
      return null;
    }
  }
  const verdict = judgeId(read, todayInZone(o.property.timezone ?? "Europe/London"));
  const out = hostReadOutcome({
    position: o.position,
    readable: verdict.ok,
    idName: read.fullName,
    bookingName: o.booking.guest_full_name,
  });
  await db
    .from("guest_ids")
    .update({
      ...(verdict.ok
        ? {
            full_name: read.fullName,
            document_type: read.documentType,
            issuing_country: read.issuingCountry,
            date_of_birth: read.dateOfBirth,
            document_expiry: read.expiryDate,
            document_last4: read.numberLast4,
          }
        : {}),
      name_match: out.nameMatch,
      id_checked: out.idChecked,
    })
    .eq("booking_id", o.booking.id)
    .eq("position", o.position);
  if (out.status) await markStay(db, o.booking, out.status);
  // A stay with no name yet takes the one on the lead guest's ID.
  if (o.position === 0 && verdict.ok && !o.booking.guest_full_name?.trim() && read.fullName)
    await db.from("bookings").update({ guest_full_name: read.fullName }).eq("id", o.booking.id);

  // The UK register: written when the ID had everything it needs.
  let register: "saved" | "missing" | "none" = "none";
  const { registerApplies, registerFromRead, registerKeepUntil } = await import("./hotel-register");
  if (verdict.ok && registerApplies(o.property.country_code)) {
    const plan = registerFromRead(read);
    register = "missing";
    if (plan.kind === "saved") {
      const { data: room } = o.booking.room_id
        ? await db.from("rooms").select("display_name").eq("id", o.booking.room_id).maybeSingle()
        : { data: null };
      const { data: test } = await db
        .from("bookings")
        .select("is_test")
        .eq("id", o.booking.id)
        .maybeSingle();
      const row = {
        host_id: o.property.host_id,
        property_id: o.booking.property_id,
        property_name: o.property.name,
        booking_id: o.booking.id,
        room_name: room?.display_name ?? null,
        position: o.position,
        arrival_date: o.booking.check_in_date,
        full_name: plan.entry.fullName,
        nationality: plan.entry.nationality,
        is_alien: plan.entry.alien,
        document_number: plan.entry.documentNumber,
        place_of_issue: plan.entry.placeOfIssue,
        next_destination: plan.entry.nextDestination,
        next_address: plan.entry.nextAddress,
        source: "host",
        keep_until: registerKeepUntil(o.booking.check_in_date),
        ...(test?.is_test ? { is_demo: true } : {}),
      };
      const { data: prev } = await db
        .from("guest_register")
        .select("id")
        .eq("booking_id", o.booking.id)
        .eq("position", o.position)
        .maybeSingle();
      const { error } = prev
        ? await db.from("guest_register").update(row).eq("id", prev.id)
        : await db.from("guest_register").insert(row);
      register = error ? "missing" : "saved";
    }
  }
  return {
    result: out.status ?? (out.idChecked ? "id_read" : "host_added"),
    register,
    expired: verdict.ok && verdict.expired,
  };
}

/** The lead guest's ID: a real check that already passed at the door is never replaced by a weaker one. */
async function markStay(
  db: { from: (t: string) => any },
  b: { id: string; id_check_status: string | null },
  status: string,
) {
  const passed = ["matched", "id_read"];
  if (passed.includes(b.id_check_status ?? "") && !passed.includes(status)) return;
  await db.from("bookings").update({ id_check_status: status }).eq("id", b.id);
}
