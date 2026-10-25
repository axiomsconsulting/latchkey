/**
 * Server functions for the host dashboard. Reads and writes go through the
 * signed-in user's client so row-level security is always applied; only the
 * calendar-secret and sync paths use elevated access.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { hostOfProperty, isSuperAdmin, requireOwner, requireWrite, SUPER_ADMIN_ONLY } from "@/lib/roles";
import { maskUrl } from "./ical";
import { RESERVED_SLUGS } from "./theme";
import { todayInZone } from "./dates";
import {
  DEMO_BOOKINGS,
  type DemoBooking,
  DEMO_CONNECTIONS,
  DEMO_JOBS,
  DEMO_MESSAGES,
  DEMO_PROPERTY,
  DEMO_ROOMS,
  DEMO_UNAVAILABILITY,
  buildRecordingBookings,
  demoDates,
} from "./demo-data";
import type { ShowcaseSpec } from "./demo-showcase";

const uuid = z.string().uuid();

/** Calls functions added after the generated types (migration 0017). */
type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

const HOST_COLUMNS = "id, business_name, contact_email, contact_phone, currency, timezone, channel_labels";

type Membership = { host_id: string; role: string; hosts: { business_name: string } | null };

/**
 * The signed-in user's active host workspace and their role in it. People
 * can belong to several hosts; the last one they switched to is remembered.
 * A first-time user gets a new workspace, unless an invitation is waiting
 * for them (they would otherwise get an empty "My rooms" before accepting).
 */
export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ create: z.boolean().optional() }).optional().parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rpc = supabase as unknown as RpcClient;

    const { data: rows } = await supabase
      .from("host_members")
      .select("host_id, role, hosts(business_name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    const memberships = (rows ?? []) as unknown as Membership[];

    let hostId: string | null = null;
    if (memberships.length > 1) {
      // user_prefs arrives with migration 0017; until then, the first host.
      const { data: prefs } = await (supabase as unknown as { from: (t: string) => any })
        .from("user_prefs")
        .select("last_host_id")
        .eq("user_id", userId)
        .maybeSingle();
      const last = (prefs as { last_host_id?: string } | null)?.last_host_id;
      hostId = memberships.find((m) => m.host_id === last)?.host_id ?? null;
    }
    hostId ??= memberships[0]?.host_id ?? null;

    // The super admin can look at any business as support; changes need the
    // host's permission, which the database checks on every write.
    const { data: superAdmin } = await rpc.rpc("is_super_admin");
    const isSuperAdmin = superAdmin === true;
    let support: { hostId: string; businessName: string; writable: boolean; until: string | null } | null = null;
    if (isSuperAdmin) {
      const { data: prefs } = await (supabase as unknown as { from: (t: string) => any })
        .from("user_prefs")
        .select("support_host_id")
        .eq("user_id", userId)
        .maybeSingle();
      const target = (prefs as { support_host_id?: string | null } | null)?.support_host_id ?? null;
      if (target) {
        const { data: t } = await supabase.from("hosts").select("id, business_name, support_access_until").eq("id", target).maybeSingle();
        if (t) {
          const { data: writable } = await rpc.rpc("support_can_write", { _host_id: t.id });
          support = { hostId: t.id, businessName: t.business_name, writable: writable === true, until: t.support_access_until };
          hostId = t.id;
        }
      }
    }

    if (!hostId) {
      if (!data?.create) {
        const { data: pending } = await rpc.rpc("has_pending_invite");
        if (pending === true) {
          // The app shows "accept your invitation" instead of a workspace.
          return {
            hostId: "",
            role: "viewer",
            host: null,
            properties: [],
            hasDemo: false,
            memberships: [],
            pendingInvite: true,
            isSuperAdmin,
            support: null,
            access: true,
            billingPhase: "trial" as const,
            trialDaysLeft: null,
          };
        }
      }
      // Atomic, server-side: creates the host and owner membership together
      // (a plain insert+select fails RLS because the user isn't a member yet).
      const { data: newId, error } = await supabase.rpc("create_host_workspace", {
        _business_name: "My rooms",
        _contact_email: (context.claims?.email as string | undefined) ?? "",
      });
      if (error) throw new Error(error.message);
      hostId = newId as string;
      memberships.push({ host_id: hostId, role: "owner", hosts: { business_name: "My rooms" } });
    }

    const [{ data: host, error: hostErr }, { data: properties }] = await Promise.all([
      (async () => {
        const { withLegacy } = await import("./checkin.server");
        // Newest columns first, falling back while migrations are pending.
        return withLegacy(
          () =>
            supabase
              .from("hosts")
              .select(`${HOST_COLUMNS}, booking_sites, subscription_status, trial_ends_at, stripe_subscription_id, support_access_until`)
              .eq("id", hostId)
              .single(),
          () =>
            withLegacy(
              () => supabase.from("hosts").select(`${HOST_COLUMNS}, booking_sites`).eq("id", hostId).single(),
              () => supabase.from("hosts").select(HOST_COLUMNS).eq("id", hostId).single(),
            ),
        );
      })(),
      supabase.from("properties").select("*").eq("host_id", hostId).order("created_at", { ascending: true }),
    ]);
    if (hostErr) throw new Error(hostErr.message);

    const billing = host as { subscription_status?: string; trial_ends_at?: string | null } | null;
    const { hasAccess, billingPhase, trialDaysLeft } = await import("./billing");
    const known = !!billing?.subscription_status;
    return {
      hostId,
      role: support
        ? support.writable
          ? "manager"
          : "viewer"
        : (memberships.find((m) => m.host_id === hostId)?.role ?? "owner"),
      isSuperAdmin,
      support,
      // Before migration 0024 there's no subscription yet, so access is open.
      access: known ? hasAccess(billing as never) : true,
      billingPhase: known ? billingPhase(billing as never) : "trial",
      trialDaysLeft: known ? trialDaysLeft(billing as never) : null,
      host,
      properties: properties ?? [],
      hasDemo: (properties ?? []).some((p) => p.is_demo),
      memberships: memberships.map((m) => ({
        hostId: m.host_id,
        businessName: m.hosts?.business_name ?? "",
        role: m.role,
      })),
      pendingInvite: false,
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

    // What each stay has waiting: unread guest messages and open requests.
    const [{ data: unread }, { data: openRequests }, { data: openJobs }] = await Promise.all([
      supabase
        .from("messages")
        .select("booking_id, bookings!inner(property_id)")
        .eq("bookings.property_id", data.propertyId)
        .eq("direction", "inbound")
        .is("read_by_host_at", null)
        .limit(500),
      supabase
        .from("requests")
        .select("booking_id, bookings!inner(property_id)")
        .eq("bookings.property_id", data.propertyId)
        .in("status", ["pending", "awaiting_payment", "suggested", "approved"])
        .limit(500),
      supabase
        .from("service_jobs")
        .select("booking_id")
        .eq("property_id", data.propertyId)
        .not("booking_id", "is", null)
        .not("status", "in", "(done,declined,cancelled)")
        .limit(500),
    ]);
    const activity: Record<string, { messages: number; requests: number }> = {};
    const bump = (id: string | null, key: "messages" | "requests") => {
      if (!id) return;
      activity[id] ??= { messages: 0, requests: 0 };
      activity[id][key] += 1;
    };
    for (const m of unread ?? []) bump(m.booking_id, "messages");
    for (const r of openRequests ?? []) bump(r.booking_id, "requests");
    for (const j of openJobs ?? []) bump(j.booking_id, "requests");

    return {
      property,
      rooms: rooms ?? [],
      bookings: bookings ?? [],
      windows: windows ?? [],
      activity,
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
  country_code: z.string().length(2).transform((v) => v.toUpperCase()),
  // Empty on a new property: a free one is made from its name (property-codes.ts).
  short_code: z.string().regex(/^([a-z0-9-]{2,})?$/).default(""),
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
    if (RESERVED_SLUGS.has(fields.short_code)) {
      const { data: current } = id
        ? await context.supabase.from("properties").select("short_code").eq("id", id).maybeSingle()
        : { data: null };
      if (current?.short_code !== fields.short_code) throw new Error("That short link is reserved. Try another.");
    }
    // Guest links and door PINs are unique across every host: fill in free ones
    // for a new property, and say plainly (with free alternatives) when one is taken.
    const codes = await import("./property-codes.server");
    const { linkAlternatives } = await import("./property-codes");
    const ctx = { name: fields.name, address: fields.address, postcode: fields.postcode };
    if (!fields.short_code) fields.short_code = await codes.freeGuestLink(ctx, id);
    else if ((await codes.takenAmong("short_code", [fields.short_code], id)).size) {
      const pool = linkAlternatives(fields.short_code, ctx, () => true, 40);
      const used = await codes.takenAmong("short_code", pool, id);
      const free = linkAlternatives(fields.short_code, ctx, (c) => !used.has(c));
      throw new Error(`The guest link "${fields.short_code}" is already used by another property.${free.length ? ` Free ones: ${free.join(", ")}.` : ""}`);
    }
    if (!fields.check_in_pin && !id) fields.check_in_pin = await codes.freeDoorPin();
    else if (fields.check_in_pin && (await codes.takenAmong("check_in_pin", [fields.check_in_pin], id)).size) {
      throw new Error("That door PIN is already used by another property. Choose another, or make a new one.");
    }
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
  max_guests: z.number().int().min(1).max(30),
  children_allowed: z.boolean().default(true),
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

/** The property's or a room's links to its own listings on the booking sites (migration 0051). */
export const saveListingLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ propertyId: uuid, roomId: uuid.nullable(), urls: z.array(z.string().max(2000)).max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    const { normaliseListingLinks } = await import("./listing-links");
    const listing_links = normaliseListingLinks(data.urls);
    const sb = context.supabase as unknown as { from: (t: string) => any };
    const q = data.roomId
      ? sb.from("rooms").update({ listing_links }).eq("id", data.roomId).eq("property_id", data.propertyId)
      : sb.from("properties").update({ listing_links }).eq("id", data.propertyId);
    const { error } = await q;
    if (error) throw new Error(/listing_links/.test(error.message) ? "Listing links need the latest update (migration 0051)." : error.message);
    return { ok: true, listing_links };
  });

/** A room's own Wi-Fi network (migration 0057); empty means the property's. */
export const saveRoomWifi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ roomId: uuid, name: z.string().trim().max(64), password: z.string().trim().max(128) }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as { from: (t: string) => any };
    const { error } = await sb
      .from("rooms")
      .update({ wifi_name: data.name || null, wifi_password: data.name ? data.password || null : null })
      .eq("id", data.roomId);
    if (error) throw new Error(/wifi_name/.test(error.message) ? "Room Wi-Fi needs the latest update (migration 0057)." : error.message);
    return { ok: true };
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

const siteKey = z
  .string()
  .regex(/^site_[a-z0-9]{4,24}$/)
  .nullable()
  .default(null);

const bookingInput = z.object({
  id: uuid.optional(),
  property_id: uuid,
  room_id: uuid.nullable(),
  channel: z.enum(["airbnb", "booking_com", "homestay", "vrbo", "agoda", "direct", "other"]),
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
  /** The guest's full number (E.164); sets phone_last4 too. Only sent when the form has it (migration 0050). */
  guest_phone: z.string().regex(/^\+[1-9]\d{6,14}$/).nullable().optional(),
  // Only sent when the form has it, so saving works before migration 0030.
  guest_address: z.string().trim().max(400).nullable().optional(),
  /** A booking site the host added; the stay is then stored as channel "other". */
  site_key: siteKey,
  /** What the guest paid, for invoices; left out entirely when not given. */
  stay_amount_pence: z.number().int().min(0).max(100_000_000).nullable().optional(),
  stay_amount_includes_tax: z.boolean().optional(),
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
    const { id, site_key, stay_amount_pence, stay_amount_includes_tax, guest_address, guest_phone, ...base } = data;
    // A stay waiting for details that now has the guest's name is an ordinary upcoming stay.
    if (base.status === "needs_details" && base.guest_full_name?.trim()) base.status = "upcoming";
    // A full number also gives the last 4 digits guests confirm at check-in.
    if (guest_phone) base.phone_last4 = guest_phone.replace(/\D/g, "").slice(-4);
    // The amount is only written when given, so saving works before migration 0023.
    // The address is added separately below, so saving works before migration 0031.
    const address = {
      ...(guest_address !== undefined ? { guest_address: guest_address || null } : {}),
      // Written with the newest columns, so saving still works before migration 0050.
      ...(guest_phone !== undefined ? { guest_phone } : {}),
    };
    const rest = {
      ...base,
      ...(stay_amount_pence !== undefined ? { stay_amount_pence } : {}),
      ...(stay_amount_includes_tax !== undefined ? { stay_amount_includes_tax } : {}),
    };
    // An added site is stored as "other" plus its key. site_key is only sent
    // when there is one to set or clear, so saving works before migration 0021.
    const fields: typeof rest & { site_key?: string | null } = site_key
      ? { ...rest, channel: "other", site_key }
      : rest;

    if (!id) {
      const { withLegacy } = await import("./checkin.server");
      const { data: row, error } = await withLegacy(
        () => supabase.from("bookings").insert({ ...fields, ...address, source: "manual" } as typeof fields & { source: "manual" }).select("*").single(),
        () => supabase.from("bookings").insert({ ...fields, source: "manual" }).select("*").single(),
      );
      if (error) throw new Error(error.message);
      return row;
    }

    const { data: existing, error: readErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();
    if (readErr) throw new Error(readErr.message);

    if (!site_key && (existing as { site_key?: string | null }).site_key) fields.site_key = null;

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

    const { withLegacy } = await import("./checkin.server");
    const { data: row, error } = await withLegacy(
      () =>
        supabase
          .from("bookings")
          .update({ ...fields, ...address, manual_fields: Array.from(manual) } as typeof fields & { manual_fields: string[] })
          .eq("id", id)
          .select("*")
          .single(),
      () => supabase.from("bookings").update({ ...fields, manual_fields: Array.from(manual) }).eq("id", id).select("*").single(),
    );
    if (error) throw new Error(error.message);
    const timeWarning = await afterTimeChange(supabase, existing as never, row as never);
    return { ...row, timeWarning };
  });

/**
 * The host moved a stay's check-in or check-out time (an early check-in or
 * late check-out of their own): the guest is told in their messages, and the
 * host is warned if it leaves less than their buffer next to another stay in
 * the room. The timelines, housekeeping and the next guest's choices follow
 * from the stay's times by themselves.
 */
async function afterTimeChange(
  db: any,
  before: { check_in_time: string | null; check_out_time: string | null },
  b: { id: string; room_id: string | null; property_id: string; status: string; check_in_date: string; check_out_date: string; check_in_time: string | null; check_out_time: string | null },
): Promise<string | null> {
  const t = (v: string | null) => (v ?? "").slice(0, 5);
  const inChanged = t(before.check_in_time) !== t(b.check_in_time) && !!b.check_in_time;
  const outChanged = t(before.check_out_time) !== t(b.check_out_time) && !!b.check_out_time;
  if ((!inChanged && !outChanged) || ["cancelled", "checked_out", "blocked"].includes(b.status)) return null;
  const { formatUkDate } = await import("./dates");
  const lines = [
    inChanged ? `Your check-in time is now ${t(b.check_in_time)} on ${formatUkDate(b.check_in_date)}.` : null,
    outChanged ? `Your check-out time is now ${t(b.check_out_time)} on ${formatUkDate(b.check_out_date)}.` : null,
  ].filter(Boolean);
  await db.from("messages").insert({ booking_id: b.id, direction: "outbound", channel: "stay_page", body: lines.join(" "), sent_at: new Date().toISOString() });
  if (!b.room_id) return null;
  const { data: p } = await db.from("properties").select("default_check_in_time, default_check_out_time").eq("id", b.property_id).maybeSingle();
  const [{ data: next }, { data: prev }] = await Promise.all([
    db.from("bookings").select("check_in_time").eq("room_id", b.room_id).eq("check_in_date", b.check_out_date).neq("id", b.id).neq("status", "cancelled").is("mirror_of", null).limit(1).maybeSingle(),
    db.from("bookings").select("check_out_time").eq("room_id", b.room_id).eq("check_out_date", b.check_in_date).neq("id", b.id).neq("status", "cancelled").is("mirror_of", null).limit(1).maybeSingle(),
  ]);
  const { stayAccessFor } = await import("./stay-access.server");
  const { bufferClash } = await import("./stay-times");
  return bufferClash({
    checkOut: outChanged ? t(b.check_out_time) : null,
    nextArrival: next ? t(next.check_in_time ?? p?.default_check_in_time ?? "15:00") : null,
    checkIn: inChanged ? t(b.check_in_time) : null,
    prevDeparture: prev ? t(prev.check_out_time ?? p?.default_check_out_time ?? "11:00") : null,
    bufferMinutes: (await stayAccessFor(db, b.property_id)).bufferMinutes,
  });
}

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
              channel: z.enum(["airbnb", "booking_com", "homestay", "vrbo", "agoda", "direct", "other"]),
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
        channel: z.enum(["airbnb", "booking_com", "homestay", "vrbo", "agoda", "direct", "other"]),
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
        channel: z.enum(["airbnb", "booking_com", "homestay", "vrbo", "agoda", "direct", "other"]),
        listing_name: z.string().nullable(),
        ical_url: z.string().min(8).optional(),
        external_listing_id: z.string().nullable().default(null),
        external_listing_title: z.string().nullable().default(null),
        site_key: siteKey,
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

    // An added site is stored as "other" plus its key; the key is only sent
    // when set or being cleared, so this works before migration 0021.
    const { data: before } = data.id
      ? await context.supabase.from("channel_connections").select("*").eq("id", data.id).maybeSingle()
      : { data: null };
    const base = {
      property_id: data.property_id,
      room_id: data.room_id,
      channel: data.site_key ? ("other" as const) : data.channel,
      listing_name: data.listing_name,
      ...(data.site_key ? { site_key: data.site_key } : before?.site_key ? { site_key: null } : {}),
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

    // Moving a link to another site moves its stays too, so the next sync
    // recognises them instead of adding them again.
    if (before && (before.channel !== base.channel || (before.site_key ?? null) !== (data.site_key ?? null))) {
      const { error: moveErr } = await context.supabase
        .from("bookings")
        .update({ channel: base.channel, ...("site_key" in base ? { site_key: base.site_key } : {}) })
        .eq("connection_id", before.id);
      if (moveErr) console.error("Moving stays to the new site failed", moveErr.message);
    }

    if (data.ical_url) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: secretErr } = await supabaseAdmin
        .from("connection_secrets")
        .upsert({ connection_id: row.id, ical_url: data.ical_url.trim() });
      if (secretErr) throw new Error(secretErr.message);
    }

    // A new link records which listing feeds the room; editing doesn't add another.
    if (data.room_id && !data.id) {
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
  .inputValidator((input: unknown) =>
    z.object({ id: uuid, withBookings: z.boolean().default(false) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let removed = 0;
    let archived = 0;
    if (data.withBookings) {
      // The stays this link brought in go too. Any with payments are archived
      // instead, so money records are never lost.
      const { data: stays } = await context.supabase.from("bookings").select("id").eq("connection_id", data.id);
      const ids = (stays ?? []).map((b) => b.id);
      if (ids.length) {
        const { data: paid } = await context.supabase.from("payments").select("booking_id").in("booking_id", ids);
        const keep = new Set((paid ?? []).map((p) => p.booking_id));
        const db = context.supabase as unknown as RpcClient & { from: (t: string) => any };
        const gone = ids.filter((id) => !keep.has(id));
        if (gone.length) {
          const { error } = await db.rpc("delete_bookings", { _ids: gone });
          if (error) throw new Error(error.message);
          removed = gone.length;
        }
        if (keep.size) {
          await db.from("bookings").update({ archived_at: new Date().toISOString() }).in("id", [...keep]);
          archived = keep.size;
        }
      }
    }
    const { error } = await context.supabase
      .from("channel_connections")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, removed, archived };
  });

/** Manual "sync now". Membership is confirmed through the user's own client. */
export const syncConnectionNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase
      .from("channel_connections")
      .select("id, property_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!allowed) throw new Error("You do not have access to that connection.");
    // Viewers can see connections, but the sync itself writes bookings.
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, allowed.property_id));

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
    // The shared demo resets itself; one visitor must not wipe it for everyone.
    assertNotSharedDemo(context.claims);
    // Sample data is Latchkey's admins' to give, for any business. The one exception:
    // an owner at first set-up, with no real property yet, may start from it.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await isSuperAdmin(context.supabase))) {
      await requireOwner(context.supabase, data.hostId);
      const { count } = await supabaseAdmin.from("properties").select("id", { count: "exact", head: true }).eq("host_id", data.hostId).eq("is_demo", false);
      if ((count ?? 0) > 0) throw new Error(SUPER_ADMIN_ONLY);
    }
    // Only Latchkey's server may mark rows as demo, so seed with the service role.
    const property = await seedDemo(supabaseAdmin, data.hostId);
    return { propertyId: property.id };
  });

export type DemoSeed = {
  bookings?: DemoBooking[];
  jobs?: typeof DEMO_JOBS;
  messages?: typeof DEMO_MESSAGES;
  /** Start today's housekeeping board (rooms leaving today: one to clean, one being cleaned). */
  readiness?: boolean;
  /** A whole demo property of its own (the regional demos): its details, look, rooms and work. */
  property?: Record<string, unknown>;
  theme?: Record<string, unknown>;
  rooms?: typeof DEMO_ROOMS;
  connections?: Array<{ roomKey: string; channel: DemoBooking["channel"]; listing_name: string }>;
  extras?: Array<{ key: string; name: string; description?: string; pricePence: number; unit: string; maxQty: number; isFree?: boolean; autoApprove?: boolean; isLoan?: boolean; breakfast?: unknown }>;
  trades?: Array<{ name: string; company_name: string; category: string; phone: string; area: string; notes: string; rating: number; is_preferred?: boolean }>;
  guides?: Array<{ section_key: string; summary: string }>;
  windows?: typeof DEMO_UNAVAILABILITY;
};

/**
 * Wipes and re-creates a demo property for a host: a host's own sample data
 * (no code: all their sample rows are replaced), or one named demo property
 * (a code: only that property is replaced, so the public demo's properties
 * never wipe each other). Used by the public demo and the recording account too.
 */
export async function seedDemo(supabase: Client, hostId: string, shortCode?: string, seed: DemoSeed = {}) {
  const bookings = seed.bookings ?? DEMO_BOOKINGS;
  const jobs = seed.jobs ?? DEMO_JOBS;
  const messages = seed.messages ?? DEMO_MESSAGES;
  const demoRooms = seed.rooms ?? DEMO_ROOMS;
  const db = supabase as unknown as { from: (t: string) => any };
  if (shortCode) {
    await db.from("properties").delete().eq("host_id", hostId).eq("is_demo", true).eq("short_code", shortCode);
  } else {
    await removeDemoRows(supabase, hostId);
  }

    const suffix = Math.random().toString(36).slice(2, 6);
    const base = {
      ...DEMO_PROPERTY,
      check_in_pin: String(100000 + Math.floor(Math.random() * 899999)),
      ...(seed.property ?? {}),
      ...(seed.theme ? { theme_config: seed.theme } : {}),
      short_code: shortCode ?? `${DEMO_PROPERTY.short_code}-${suffix}`,
      host_id: hostId,
      is_demo: true,
    } as Record<string, unknown>;
    const { withLegacy } = await import("./checkin.server");
    // A property's own currency needs migration 0047; before it, the business's.
    const { currency: _currency, ...withoutCurrency } = base;
    const { data: property, error } = await withLegacy<{ id: string; short_code: string; timezone: string | null } | null>(
      () => db.from("properties").insert(base).select("*").single(),
      () => db.from("properties").insert(withoutCurrency).select("*").single(),
    );
    if (error || !property) throw new Error(error?.message ?? "Couldn't create the demo property.");

    const { data: rooms, error: roomErr } = await supabase
      .from("rooms")
      .insert(
        demoRooms.map((r) => ({
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
      demoRooms.map((r, i) => [r.key, rooms?.[i]?.id ?? null] as const),
    );

    const today = todayInZone(property.timezone ?? "Europe/London");
    const { data: stays } = await db.from("bookings").insert(
      bookings.map((b) => ({
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
    ).select("id, guest_full_name");

    // Open work and a conversation, so Services, housekeeping and messages aren't empty.
    const stayOf = new Map(((stays ?? []) as Array<{ id: string; guest_full_name: string | null }>).map((x) => [x.guest_full_name, x.id]));
    await supabase.from("service_jobs").insert(
      jobs.map((j) => ({
        host_id: hostId,
        property_id: property.id,
        room_id: roomByKey.get(j.roomKey) ?? null,
        booking_id: j.guest ? (stayOf.get(j.guest) ?? null) : null,
        source: j.source,
        category: j.category,
        title: j.title,
        note: j.note,
        urgency: j.urgency,
        status: j.status,
        is_demo: true,
      })),
    );
    await supabase.from("messages").insert(
      messages.filter((m) => stayOf.get(m.guest)).map((m) => {
        const at = new Date(Date.now() - m.minutesAgo * 60_000).toISOString();
        return { booking_id: stayOf.get(m.guest)!, direction: m.direction, channel: "stay_page", body: m.body, sent_at: at, created_at: at };
      }),
    );

    if (seed.readiness) {
      // Today's departures on the housekeeping board (migration 0042; skipped before it).
      const leaving = bookings.filter((b) => b.check_out_offset === 0);
      await db
        .from("room_readiness")
        .insert(
          leaving.map((b, i) => ({
            property_id: property.id,
            room_id: roomByKey.get(b.roomKey),
            day: today,
            status: i === 0 ? "cleaning" : "to_clean",
            assignee: i === 0 ? (seed.trades?.find((t) => t.category === "cleaning")?.name ?? "Marta (housekeeping)") : null,
          })),
        )
        .then(() => undefined, () => undefined);
    }

    await supabase.from("unavailability_windows").insert(
      (seed.windows ?? DEMO_UNAVAILABILITY).map((w) => ({
        property_id: property.id,
        room_id: null,
        reason: w.reason,
        day_of_week: w.day_of_week,
        start_time: w.start_time,
        end_time: w.end_time,
        is_demo: true,
      })),
    );

    await db.from("channel_connections").insert(
      (seed.connections ?? DEMO_CONNECTIONS).map((c) => ({
        property_id: property.id,
        room_id: roomByKey.get(c.roomKey) ?? null,
        channel: c.channel,
        listing_name: c.listing_name,
        masked_url: "example-calendar.test/…demo",
        sync_status: "ok" as const,
        last_synced_at: new Date(Date.now() - 12 * 60_000).toISOString(),
        is_demo: true,
      })),
    );

    // The regional demos' own price list (with breakfast), tradespeople and guide text.
    if (seed.extras?.length) {
      const currency = (base["currency"] as string | undefined) ?? "GBP";
      await db.from("extras_catalogue").insert(
        seed.extras.map((e, i) => ({
          property_id: property.id,
          item_key: e.key,
          name: e.name,
          description: e.description ?? null,
          price_pence: e.isFree ? 0 : e.pricePence,
          unit: e.unit,
          max_qty: e.maxQty,
          is_free: !!e.isFree,
          auto_approve: !!e.autoApprove,
          requires_approval: !e.autoApprove,
          active: true,
          is_loan: !!e.isLoan,
          sort_order: i,
          currency,
          options: e.breakfast ? { breakfast: e.breakfast } : {},
          is_demo: true,
        })),
      );
    }
    if (seed.trades?.length) {
      await db.from("trades").insert(seed.trades.map((t) => ({ ...t, host_id: hostId, property_id: property.id, source: "manual", is_demo: true })));
    }
    if (seed.guides?.length) {
      const { SECTIONS } = await import("./guide");
      await db.from("guides").insert(
        seed.guides.map((g, i) => ({
          property_id: property.id,
          room_id: null,
          section_key: g.section_key,
          title: SECTIONS.find((x) => x.key === g.section_key)?.title ?? g.section_key,
          summary: g.summary,
          published: true,
          sort_order: i + 1,
          is_demo: true,
        })),
      );
    }

    return property as { id: string; short_code: string };
}

/** One regional demo property (src/lib/demo-showcase.ts) on a host: rebuilt from scratch, dates relative to today. */
export async function seedShowcase(supabase: Client, hostId: string, spec: ShowcaseSpec) {
  const stays = buildRecordingBookings(spec.rooms, {
    guests: spec.guests,
    channels: spec.channels,
    checkIn: spec.checkIn,
    checkOut: spec.checkOut,
    lateArrival: spec.lateArrival,
    from: -10,
    to: 14,
    namedToday: true,
  });
  const staying = stays.filter((b) => b.status === "checked_in" && b.guest_full_name);
  const arriving = stays.find((b) => b.check_in_offset === 0 && b.guest_full_name);
  const asker = staying[0];
  return seedDemo(supabase, hostId, spec.short_code, {
    property: spec.property,
    theme: spec.theme,
    rooms: spec.rooms,
    bookings: stays,
    connections: spec.rooms.map((r, i) => ({ roomKey: r.key, channel: spec.channels[i % spec.channels.length]!, listing_name: `${spec.property.name} · ${r.display_name}` })).filter((c) => c.channel !== "direct"),
    extras: spec.extras,
    trades: spec.trades,
    guides: spec.guides,
    windows: [],
    readiness: true,
    jobs: [
      ...(asker ? [{ roomKey: asker.roomKey, guest: asker.guest_full_name, source: "guest" as const, category: spec.request.category, title: spec.request.title, note: spec.request.note, urgency: "normal" as const, status: "new" as const }] : []),
      { roomKey: spec.maintenance.roomKey, guest: null, source: "maintenance" as const, category: spec.maintenance.category, title: spec.maintenance.title, note: spec.maintenance.note, urgency: "low" as const, status: "acknowledged" as const },
    ] as never,
    messages: [
      ...(asker?.guest_full_name
        ? [
            { guest: asker.guest_full_name, direction: "inbound" as const, minutesAgo: 140, body: spec.conversation.ask },
            { guest: asker.guest_full_name, direction: "outbound" as const, minutesAgo: 120, body: spec.conversation.reply },
          ]
        : []),
      ...(arriving?.guest_full_name ? [{ guest: arriving.guest_full_name, direction: "inbound" as const, minutesAgo: 35, body: spec.conversation.waiting }] : []),
    ] as never,
  });
}

export const removeDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ hostId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    // Owners can always clear sample data from their own account; admins for any business.
    if (await isSuperAdmin(context.supabase)) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await removeDemoRows(supabaseAdmin as unknown as Client, data.hostId);
      return { ok: true };
    }
    await requireOwner(context.supabase, data.hostId);
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
        contact_phone: z.string().max(30).nullable(),
        currency: z.string().min(3).max(3),
        timezone: z.string().min(3).max(60),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, data.id);
    const { checkPhone, isCurrency, isTimeZone } = await import("./world");
    if (!isCurrency(data.currency)) throw new Error("Please pick a currency from the list.");
    if (!isTimeZone(data.timezone)) throw new Error("Please pick a time zone from the list.");
    if (data.contact_phone) {
      const p = checkPhone(data.contact_phone, "GB");
      if (!p.ok) throw new Error("Please check the phone number, with its country code.");
      data.contact_phone = p.e164;
    }
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

/** Who's staying, ID checks for every adult, and what is kept and for how long. */
export const saveGuestRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        propertyId: uuid,
        records: z.object({
          askWhoIsStaying: z.boolean(),
          checkEveryAdult: z.boolean(),
          idPhoto: z.boolean(),
          facePhoto: z.boolean(),
          keepDays: z.union([z.literal(7), z.literal(14), z.literal(30)]),
          regulatorConfirmed: z.boolean(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("properties")
      .update({ guest_records: data.records })
      .eq("id", data.propertyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Unseen alerts for the business being viewed (a super admin can read every business's, so always filter). */
export const listAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data: input, context }) => {
    const { data } = await context.supabase
      .from("host_alerts")
      .select("id, kind, message, booking_id, property_id, created_at, read_at")
      .eq("host_id", input.hostId)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    return { alerts: data ?? [] };
  });

export const markAlertRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("host_alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("This alert belongs to a business you can't change.");
    return { ok: true };
  });

/**
 * Puts a checked-in stay back to upcoming: wrong guest tapped through, or the
 * host checked someone in by mistake. Old stay links stop working, so the
 * guest checks in again and gets a fresh one.
 */
export const undoCheckIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ bookingId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: b } = await context.supabase
      .from("bookings")
      .select("id, status, property_id")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!b) throw new Error("Booking not found.");
    if (b.status !== "checked_in") throw new Error("This guest isn't checked in.");
    // The steps below use the admin client, so check before RLS would.
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, b.property_id));

    const { error } = await context.supabase
      .from("bookings")
      .update({ status: "upcoming", checked_in_at: null })
      .eq("id", data.bookingId);
    if (error) throw new Error(error.message);

    // Close the session and the stay link that check-in created.
    const { admin } = await import("./checkin.server");
    const db = await admin();
    const nowIso = new Date().toISOString();
    await db.from("checkin_sessions").update({ expires_at: nowIso }).eq("booking_id", data.bookingId);
    await db.from("stay_tokens").update({ expires_at: nowIso }).eq("booking_id", data.bookingId);
    await db.from("presence_log").insert({ booking_id: data.bookingId, event: "left", source: "host_undo" });
    return { ok: true };
  });

/**
 * The host's booking sites: names and icons for the built-in platforms plus
 * any they added. Built-in ids never change, so calendars keep matching.
 */
export const saveBookingSites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        hostId: uuid,
        sites: z
          .array(
            z.object({
              key: z.string().max(40),
              label: z.string().trim().max(40),
              icon_url: z.string().max(40_000).nullable(),
            }),
          )
          .max(40),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { isBuiltIn, normaliseStoredSites } = await import("./booking-sites");
    if (data.sites.some((s) => !isBuiltIn(s.key) && !s.label.trim())) throw new Error("Give each site you add a name.");
    const sites = normaliseStoredSites(data.sites);
    // Older screens still read channel_labels, so keep it in step.
    const labels: Record<string, string> = {};
    for (const s of sites) if (isBuiltIn(s.key) && s.label) labels[s.key] = s.label;
    const { error } = await (context.supabase as unknown as RpcClient).rpc("update_host_sites", {
      _host_id: data.hostId,
      _channel_labels: labels,
      _booking_sites: sites,
    });
    if (error?.code === "PGRST202") {
      // Before migration 0021 is applied the function doesn't exist yet.
      throw new Error("Adding booking sites needs the latest database update. Please try again shortly.");
    } else if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Host wording for each booking platform; internal ids are never changed. */
export const saveChannelLabels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ hostId: uuid, labels: z.record(z.string(), z.string().trim().max(40)) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.labels)) if (v.trim()) clean[k] = v.trim();
    // Managers may rename platforms, but hosts itself is owner-only, so this
    // goes through a narrow function that checks write access.
    const { error } = await (context.supabase as unknown as RpcClient).rpc("update_host_ops", {
      _host_id: data.hostId,
      _channel_labels: clean,
    });
    if (error?.code === "PGRST202") {
      // Before migration 0017 is applied the function doesn't exist yet.
      const { error: e2 } = await context.supabase.from("hosts").update({ channel_labels: clean }).eq("id", data.hostId);
      if (e2) throw new Error(e2.message);
    } else if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Where this business's first visit came from (utm_*, ref): saved once, at set-up (migration 0044). */
export const recordSignupSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        hostId: uuid,
        attribution: z.object({
          utm_source: z.string().max(200).optional(),
          utm_medium: z.string().max(200).optional(),
          utm_campaign: z.string().max(200).optional(),
          utm_content: z.string().max(200).optional(),
          utm_term: z.string().max(200).optional(),
          ref: z.string().max(200).optional(),
          clickId: z.boolean().optional(),
          landing_path: z.string().max(200).optional(),
          captured_at: z.string().max(40).optional(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, data.hostId);
    // Only the first time; quietly nothing before migration 0044.
    await (context.supabase as unknown as { from: (t: string) => any })
      .from("hosts")
      .update({ signup_utm: data.attribution })
      .eq("id", data.hostId)
      .is("signup_utm", null);
    return { ok: true };
  });

