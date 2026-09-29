/**
 * Server functions for the host dashboard. Reads and writes go through the
 * signed-in user's client so row-level security is always applied; only the
 * calendar-secret and sync paths use elevated access.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { maskUrl } from "./ical";
import { todayInZone } from "./dates";
import {
  DEMO_BOOKINGS,
  DEMO_CONNECTIONS,
  DEMO_PROPERTY,
  DEMO_ROOMS,
  DEMO_UNAVAILABILITY,
  demoDates,
} from "./demo-data";

const uuid = z.string().uuid();

/** Ensures the signed-in user has a host workspace, creating one on first use. */
export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: membership } = await supabase
      .from("host_members")
      .select("host_id, role, hosts(id, business_name, contact_email, contact_phone, currency, timezone)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let hostId = membership?.host_id ?? null;
    let host = (membership as { hosts?: unknown } | null)?.hosts ?? null;

    if (!hostId) {
      // Atomic, server-side: creates the host and owner membership together
      // (a plain insert+select fails RLS because the user isn't a member yet).
      const { data: newId, error } = await supabase.rpc("create_host_workspace", {
        _business_name: "My rooms",
        _contact_email: (context.claims?.email as string | undefined) ?? "",
      });
      if (error) throw new Error(error.message);
      const { data: created, error: readErr } = await supabase
        .from("hosts")
        .select("id, business_name, contact_email, contact_phone, currency, timezone")
        .eq("id", newId as string)
        .single();
      if (readErr) throw new Error(readErr.message);
      hostId = created.id;
      host = created;
    }

    const { data: properties } = await supabase
      .from("properties")
      .select("*")
      .eq("host_id", hostId)
      .order("created_at", { ascending: true });

    return {
      hostId: hostId!,
      role: membership?.role ?? "owner",
      host,
      properties: properties ?? [],
      hasDemo: (properties ?? []).some((p) => p.is_demo),
    };
  });

const propertyScope = z.object({ propertyId: uuid });

/** Everything the dashboard needs for one property. */
export const getPropertyBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => propertyScope.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: property }, { data: rooms }, { data: bookings }, { data: windows }] =
      await Promise.all([
        supabase.from("properties").select("*").eq("id", data.propertyId).maybeSingle(),
        supabase
          .from("rooms")
          .select("*")
          .eq("property_id", data.propertyId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("bookings")
          .select("*")
          .eq("property_id", data.propertyId)
          .order("check_in_date", { ascending: true }),
        supabase.from("unavailability_windows").select("*").eq("property_id", data.propertyId),
      ]);

    return {
      property,
      rooms: rooms ?? [],
      bookings: bookings ?? [],
      windows: windows ?? [],
      today: todayInZone(property?.timezone ?? "Europe/London"),
    };
  });

/* ------------------------------- properties ------------------------------ */

const propertyInput = z.object({
  id: uuid.optional(),
  hostId: uuid,
  name: z.string().min(1),
  address: z.string().nullable().default(null),
  postcode: z.string().nullable().default(null),
  short_code: z.string().min(2).regex(/^[a-z0-9-]+$/),
  check_in_pin: z.string().regex(/^\d{6}$/).nullable().default(null),
  timezone: z.string().nullable().default(null),
  default_check_in_time: z.string(),
  default_check_out_time: z.string(),
  quiet_hours_start: z.string(),
  quiet_hours_end: z.string(),
  parking_notes: z.string().nullable().default(null),
  wifi_name: z.string().nullable().default(null),
  wifi_password: z.string().nullable().default(null),
  host_contact_name: z.string().nullable().default(null),
  host_contact_phone: z.string().nullable().default(null),
});

export const saveProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => propertyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, hostId, ...fields } = data;
    const payload = { ...fields, host_id: hostId };
    const q = id
      ? context.supabase.from("properties").update(payload).eq("id", id).select("*").single()
      : context.supabase.from("properties").insert(payload).select("*").single();
    const { data: row, error } = await q;
    if (error) {
      throw new Error(
        error.code === "23505"
          ? "That short link or door PIN is already used by another property."
          : error.message,
      );
    }
    return row;
  });

const roomInput = z.object({
  id: uuid.optional(),
  property_id: uuid,
  room_number: z.string().nullable().default(null),
  display_name: z.string().min(1),
  public_title: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  max_guests: z.number().int().min(1).max(12),
  has_ensuite: z.boolean(),
  sort_order: z.number().int(),
  active: z.boolean(),
});

export const saveRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => roomInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...fields } = data;
    const q = id
      ? context.supabase.from("rooms").update(fields).eq("id", id).select("*").single()
      : context.supabase.from("rooms").insert(fields).select("*").single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("rooms").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const windowInput = z.object({
  id: uuid.optional(),
  property_id: uuid,
  room_id: uuid.nullable(),
  reason: z.string().nullable().default(null),
  day_of_week: z.number().int().min(0).max(6).nullable(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
});

export const saveUnavailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => windowInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...fields } = data;
    const q = id
      ? context.supabase
          .from("unavailability_windows")
          .update(fields)
          .eq("id", id)
          .select("*")
          .single()
      : context.supabase.from("unavailability_windows").insert(fields).select("*").single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteUnavailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("unavailability_windows")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------- bookings ------------------------------- */

const bookingInput = z.object({
  id: uuid.optional(),
  property_id: uuid,
  room_id: uuid.nullable(),
  channel: z.enum(["airbnb", "booking_com", "homestay", "direct", "other"]),
  guest_full_name: z.string().nullable(),
  reservation_code: z.string().nullable(),
  guest_count: z.number().int().min(1).max(12),
  phone_last4: z
    .string()
    .regex(/^\d{4}$/)
    .nullable(),
  check_in_date: z.string(),
  check_out_date: z.string(),
  check_in_time: z.string().nullable(),
  check_out_time: z.string().nullable(),
  status: z.enum(["needs_details", "upcoming", "checked_in", "checked_out", "cancelled", "flagged", "blocked"]),
  notes: z.string().nullable(),
  guest_email: z.string().trim().email().max(254).nullable().default(null),
});

const TRACKED = [
  "guest_full_name",
  "reservation_code",
  "guest_count",
  "phone_last4",
  "check_in_date",
  "check_out_date",
  "check_in_time",
  "check_out_time",
  "status",
] as const;

/** Creates or edits a booking, remembering which fields the host set by hand. */
export const saveBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bookingInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...fields } = data;

    if (!id) {
      const { data: row, error } = await supabase
        .from("bookings")
        .insert({ ...fields, source: "manual" })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return row;
    }

    const { data: existing, error: readErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();
    if (readErr) throw new Error(readErr.message);

    const manual = new Set<string>(existing.manual_fields ?? []);
    const cameFromFeed = existing.source === "ical";
    for (const key of TRACKED) {
      const next = (fields as Record<string, unknown>)[key];
      const prev = (existing as Record<string, unknown>)[key];
      const same = key.endsWith("_time")
        ? String(next ?? "").slice(0, 5) === String(prev ?? "").slice(0, 5)
        : next === prev;
      if (!same && cameFromFeed) manual.add(key);
    }

    const { data: row, error } = await supabase
      .from("bookings")
      .update({ ...fields, manual_fields: Array.from(manual) })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const importBookings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        property_id: uuid,
        rows: z
          .array(
            z.object({
              room_id: uuid.nullable(),
              channel: z.enum(["airbnb", "booking_com", "homestay", "direct", "other"]),
              guest_full_name: z.string().nullable(),
              reservation_code: z.string().nullable(),
              guest_count: z.number().int().min(1).max(12),
              phone_last4: z.string().nullable(),
              check_in_date: z.string(),
              check_out_date: z.string(),
              notes: z.string().nullable(),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: property } = await context.supabase
      .from("properties")
      .select("default_check_in_time, default_check_out_time")
      .eq("id", data.property_id)
      .maybeSingle();

    const payload = data.rows.map((r) => ({
      ...r,
      property_id: data.property_id,
      source: "csv" as const,
      status: r.guest_full_name ? ("upcoming" as const) : ("needs_details" as const),
      check_in_time: property?.default_check_in_time ?? "15:00",
      check_out_time: property?.default_check_out_time ?? "11:00",
    }));

    const { data: rows, error } = await context.supabase.from("bookings").insert(payload).select("id");
    if (error) throw new Error(error.message);
    return { imported: rows?.length ?? 0 };
  });

/* ------------------------------ connections ------------------------------ */

export const listConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => propertyScope.parse(input))
  .handler(async ({ data, context }) => {
    const { data: connections } = await context.supabase
      .from("channel_connections")
      .select("*, rooms(display_name)")
      .eq("property_id", data.propertyId)
      .order("created_at", { ascending: true });

    const ids = (connections ?? []).map((c) => c.id);
    const { data: runs } = ids.length
      ? await context.supabase
          .from("sync_runs")
          .select("*")
          .in("connection_id", ids)
          .order("started_at", { ascending: false })
          .limit(40)
      : { data: [] };

    return { connections: connections ?? [], runs: runs ?? [] };
  });

/** Reads a feed without saving anything, so the host can check it first. */
export const testFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        url: z.string().min(8),
        channel: z.enum(["airbnb", "booking_com", "homestay", "direct", "other"]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { fetchFeed, FeedError } = await import("./ical-sync.server");
    const { parseIcs, mapEventsToBookings } = await import("./ical");
    try {
      const text = await fetchFeed(data.url);
      const events = parseIcs(text);
      const { bookings, skipped } = mapEventsToBookings(events, {
        channel: data.channel,
        defaultCheckInTime: "15:00",
        defaultCheckOutTime: "11:00",
      });
      const upcoming = bookings.slice(0, 3).map((b) => ({
        guest: b.guestFullName,
        checkIn: b.checkInDate,
        checkOut: b.checkOutDate,
        reference: b.reservationCode,
      }));
      return { ok: true as const, total: bookings.length, skipped, preview: upcoming };
    } catch (err) {
      const message =
        err instanceof FeedError ? err.message : "We could not read that calendar link.";
      return { ok: false as const, message };
    }
  });

export const saveConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid.optional(),
        property_id: uuid,
        room_id: uuid.nullable(),
        channel: z.enum(["airbnb", "booking_com", "homestay", "direct", "other"]),
        listing_name: z.string().nullable(),
        ical_url: z.string().min(8).optional(),
        external_listing_id: z.string().nullable().default(null),
        external_listing_title: z.string().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertSafeFeedUrl } = await import("./ical-sync.server");

    let masked: string | null = null;
    let fingerprint: string | null = null;
    if (data.ical_url) {
      assertSafeFeedUrl(data.ical_url);
      masked = maskUrl(data.ical_url);
      const { createHash } = await import("node:crypto");
      fingerprint = createHash("sha256").update(data.ical_url.trim()).digest("hex");
    }

    const base = {
      property_id: data.property_id,
      room_id: data.room_id,
      channel: data.channel,
      listing_name: data.listing_name,
      ...(masked ? { masked_url: masked, url_fingerprint: fingerprint } : {}),
    };

    const { data: row, error } = data.id
      ? await context.supabase
          .from("channel_connections")
          .update(base)
          .eq("id", data.id)
          .select("*")
          .single()
      : await context.supabase.from("channel_connections").insert(base).select("*").single();

    if (error) {
      throw new Error(
        error.code === "23505"
          ? "That calendar link is already connected to this property."
          : error.message,
      );
    }

    if (data.ical_url) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: secretErr } = await supabaseAdmin
        .from("connection_secrets")
        .upsert({ connection_id: row.id, ical_url: data.ical_url.trim() });
      if (secretErr) throw new Error(secretErr.message);
    }

    if (data.room_id) {
      await context.supabase.from("room_listings").insert({
        room_id: data.room_id,
        channel: data.channel,
        external_listing_id: data.external_listing_id ?? null,
        external_listing_title: data.external_listing_title ?? data.listing_name ?? null,
        connection_id: row.id,
      });
    }

    return row;
  });

export const deleteConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("channel_connections")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Manual "sync now". Membership is confirmed through the user's own client. */
export const syncConnectionNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase
      .from("channel_connections")
      .select("id")
      .eq("id", data.id)
      .maybeSingle();
    if (!allowed) throw new Error("You do not have access to that connection.");

    const { syncConnection, FeedError } = await import("./ical-sync.server");
    try {
      return { ok: true as const, ...(await syncConnection(data.id)) };
    } catch (err) {
      return {
        ok: false as const,
        message: err instanceof FeedError ? err.message : "Sync failed.",
      };
    }
  });

/* --------------------------------- demo ---------------------------------- */

export const loadDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ hostId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await removeDemoRows(supabase, data.hostId);

    const suffix = Math.random().toString(36).slice(2, 6);
    const { data: property, error } = await supabase
      .from("properties")
      .insert({
        ...DEMO_PROPERTY,
        short_code: `${DEMO_PROPERTY.short_code}-${suffix}`,
        check_in_pin: String(100000 + Math.floor(Math.random() * 899999)),
        host_id: data.hostId,
        is_demo: true,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { data: rooms, error: roomErr } = await supabase
      .from("rooms")
      .insert(
        DEMO_ROOMS.map((r) => ({
          property_id: property.id,
          room_number: r.room_number,
          display_name: r.display_name,
          public_title: r.public_title,
          description: r.description,
          max_guests: r.max_guests,
          has_ensuite: r.has_ensuite,
          sort_order: r.sort_order,
          is_demo: true,
        })),
      )
      .select("*");
    if (roomErr) throw new Error(roomErr.message);

    const roomByKey = new Map(
      DEMO_ROOMS.map((r, i) => [r.key, rooms?.[i]?.id ?? null] as const),
    );

    const today = todayInZone(property.timezone ?? "Europe/London");
    await supabase.from("bookings").insert(
      DEMO_BOOKINGS.map((b) => ({
        property_id: property.id,
        room_id: roomByKey.get(b.roomKey) ?? null,
        channel: b.channel,
        source: b.source,
        guest_full_name: b.guest_full_name,
        reservation_code: b.reservation_code,
        guest_count: b.guest_count,
        phone_last4: b.phone_last4,
        check_in_time: b.check_in_time,
        check_out_time: b.check_out_time,
        status: b.status,
        notes: b.notes,
        is_demo: true,
        ...demoDates(today, b),
      })),
    );

    await supabase.from("unavailability_windows").insert(
      DEMO_UNAVAILABILITY.map((w) => ({
        property_id: property.id,
        room_id: null,
        reason: w.reason,
        day_of_week: w.day_of_week,
        start_time: w.start_time,
        end_time: w.end_time,
        is_demo: true,
      })),
    );

    await supabase.from("channel_connections").insert(
      DEMO_CONNECTIONS.map((c) => ({
        property_id: property.id,
        room_id: roomByKey.get(c.roomKey) ?? null,
        channel: c.channel,
        listing_name: c.listing_name,
        masked_url: "example-calendar.test/…demo",
        sync_status: "never" as const,
        is_demo: true,
      })),
    );

    return { propertyId: property.id };
  });

export const removeDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ hostId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await removeDemoRows(context.supabase, data.hostId);
    return { ok: true };
  });

type Client = { from: (table: string) => any };

async function removeDemoRows(supabase: Client, hostId: string) {
  const { data: demoProperties } = await supabase
    .from("properties")
    .select("id")
    .eq("host_id", hostId)
    .eq("is_demo", true);
  const ids = (demoProperties ?? []).map((p: { id: string }) => p.id);
  if (ids.length === 0) return;
  await supabase.from("properties").delete().in("id", ids);
}

/* -------------------------------- host ---------------------------------- */

export const saveHost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid,
        business_name: z.string().min(1),
        contact_email: z.string().email().nullable(),
        contact_phone: z.string().nullable(),
        currency: z.string().min(3).max(3),
        timezone: z.string().min(3),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, ...fields } = data;
    const { data: row, error } = await context.supabase
      .from("hosts")
      .update(fields)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/* ------------------------------ check-in ------------------------------- */

const methodKey = z.enum(["photo_id", "last4", "self_declare"]);

export const saveCheckinMethods = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        propertyId: uuid,
        methods: z.object({
          order: z.array(methodKey).max(3),
          enabled: z.object({ photo_id: z.boolean(), last4: z.boolean(), self_declare: z.boolean() }),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("properties")
      .update({ checkin_methods: data.methods })
      .eq("id", data.propertyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("host_alerts")
      .select("id, kind, message, booking_id, property_id, created_at, read_at")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    return { alerts: data ?? [] };
  });

export const markAlertRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("host_alerts").update({ read_at: new Date().toISOString() }).eq("id", data.id);
    return { ok: true };
  });
