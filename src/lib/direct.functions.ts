/**
 * Repeat direct stays (src/lib/direct.ts, migration 0043): the public
 * enquiry page and the stay guide's "stay with us again" card (by the
 * guest's own stay link), and the host's Direct stays page. Consent is
 * written only here, with its exact wording; withdrawing deletes it.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ENQUIRY_STATUSES, consentText, enquiryProblem, isReturning, normaliseEmail } from "./direct";
import { partyText } from "./direct-booking";

type Loose = { from: (t: string) => any };
const uuid = z.string().uuid();
const code = z.string().min(2).max(60).regex(/^[a-z0-9-]+$/i);
const stayToken = z.string().min(20).max(80);

async function admin(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

async function propertyByCode(db: Loose, c: string) {
  const { data } = await db
    .from("properties")
    .select("id, host_id, name, short_code, timezone, theme_config, active, currency, country_code, hosts(business_name, currency)")
    .eq("short_code", c.toLowerCase())
    .maybeSingle();
  return data && data.active !== false ? data : null;
}

const todayIn = (tz: string | null) => new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? "Europe/London" }).format(new Date());

/** The property's currency for its rates: its own, or the business's. */
const currencyOf = (p: { currency?: string | null; hosts?: { currency?: string | null } | null }) => p.currency || p.hosts?.currency || "GBP";

/**
 * What the "Stay with us" page offers: each active room with its base rate
 * (migration 0052), the seasonal offers still to come, and which nights each
 * room is already taken (dates only, never who), for the next two years.
 */
async function pageRooms(db: Loose, propertyId: string, today: string) {
  const { withLegacy } = await import("./checkin.server");
  const { addDays } = await import("./dates");
  const { normaliseOffers, upcomingOffers } = await import("./direct-rates");
  const roomCols = "id, display_name, public_title, description, max_guests, has_ensuite, cover_image_url, sort_order";
  const [{ data: rooms }, { data: prop }, { data: stays }] = await Promise.all([
    withLegacy<any>(
      () => db.from("rooms").select(`${roomCols}, base_rate_pence`).eq("property_id", propertyId).neq("active", false).order("sort_order"),
      () => db.from("rooms").select(roomCols).eq("property_id", propertyId).neq("active", false).order("sort_order"),
    ),
    withLegacy<any>(
      () => db.from("properties").select("direct_offers").eq("id", propertyId).maybeSingle(),
      () => Promise.resolve({ data: null, error: null }),
    ),
    db
      .from("bookings")
      .select("room_id, check_in_date, check_out_date, status")
      .eq("property_id", propertyId)
      .is("mirror_of", null)
      .neq("status", "cancelled")
      .gte("check_out_date", today)
      .lte("check_in_date", addDays(today, 730)),
  ]);
  const taken: Record<string, Array<{ from: string; to: string }>> = {};
  for (const b of (stays ?? []) as Array<{ room_id: string | null; check_in_date: string; check_out_date: string }>) {
    if (!b.room_id) continue;
    (taken[b.room_id] ??= []).push({ from: b.check_in_date, to: b.check_out_date });
  }
  return {
    rooms: ((rooms ?? []) as Array<{ id: string; display_name: string; public_title: string | null; description: string | null; max_guests: number | null; has_ensuite: boolean | null; cover_image_url: string | null; base_rate_pence?: number | null }>).map((r) => ({
      id: r.id,
      name: r.public_title || r.display_name,
      description: r.description ?? null,
      maxGuests: r.max_guests ?? 2,
      ensuite: r.has_ensuite === true,
      photo: r.cover_image_url ?? null,
      ratePence: typeof r.base_rate_pence === "number" ? r.base_rate_pence : null,
    })),
    offers: upcomingOffers(normaliseOffers(prop?.direct_offers), today),
    taken,
  };
}

/* ------------------------------- public -------------------------------- */

/** The property's own enquiry page. */
export const getEnquiryPage = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ code }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const p = await propertyByCode(db, data.code);
    if (!p) return { found: false as const };
    const { normaliseTheme } = await import("./theme");
    const business = (p.hosts?.business_name as string | undefined) || (p.name as string);
    const today = todayIn(p.timezone);
    return {
      found: true as const,
      propertyName: p.name as string,
      shortCode: p.short_code as string,
      business,
      theme: await (await import("./group-brand.server")).withGroup(normaliseTheme(p.theme_config), p.host_id, p.name ?? ""),
      today,
      consent: consentText(business),
      currency: currencyOf(p),
      country: (p.country_code as string | null) ?? "GB",
      ...(await pageRooms(db, p.id, today)),
      // Booking and paying here, when the host has turned it on (migration 0053).
      booking: await (async () => {
        const { bookingSetup } = await import("./direct-booking.functions");
        const s = await bookingSetup(db, p);
        return { instant: s.settings.instant && s.methods.length > 0, methods: s.methods, freeCancelDays: s.settings.freeCancelDays, nonRef: s.settings.nonRef, bankPayDays: s.settings.bankPayDays, children: s.settings.children };
      })(),
    };
  });

export const submitEnquiry = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code,
        name: z.string().max(120),
        email: z.string().max(254),
        phone: z.string().max(30).nullable(),
        checkIn: z.string().max(10),
        checkOut: z.string().max(10),
        guests: z.number().int(),
        /** How many of the guests are children, when the host asks. */
        children: z.number().int().min(0).max(19).default(0),
        message: z.string().max(2000).nullable(),
        futureStays: z.boolean(),
        /** The room the guest chose, if any: priced and checked again here. */
        roomId: uuid.nullable().default(null),
        /** Left empty by people; filled by bots. */
        website: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    // Bots fill every field: pretend it worked.
    if (data.website) return { ok: true };
    const db = await admin();
    const p = await propertyByCode(db, data.code);
    if (!p) throw new Error("This page isn't taking enquiries.");
    const problem = enquiryProblem({ ...data, phone: data.phone }, todayIn(p.timezone));
    if (problem) throw new Error(problem);
    const email = normaliseEmail(data.email);
    // Gentle limits: a few a day per address, a busy hour per property.
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const [{ count: mine }, { count: busy }] = await Promise.all([
      db.from("direct_enquiries").select("id", { count: "exact", head: true }).eq("host_id", p.host_id).ilike("email", email).gte("created_at", dayAgo),
      db.from("direct_enquiries").select("id", { count: "exact", head: true }).eq("property_id", p.id).gte("created_at", hourAgo),
    ]);
    if ((mine ?? 0) >= 3 || (busy ?? 0) >= 30) throw new Error("Thanks, we've already got your enquiry. We'll be in touch.");
    // Returning: they've stayed before (an email on a past stay) or left their details.
    const { data: props } = await db.from("properties").select("id").eq("host_id", p.host_id);
    const ids = ((props ?? []) as Array<{ id: string }>).map((x) => x.id);
    const [{ data: past }, { data: contacts }] = await Promise.all([
      db.from("bookings").select("guest_email").in("property_id", ids).ilike("guest_email", email).limit(1),
      db.from("guest_contacts").select("email").eq("host_id", p.host_id).ilike("email", email).limit(1),
    ]);
    const known = [...((past ?? []) as Array<{ guest_email: string }>).map((x) => x.guest_email), ...((contacts ?? []) as Array<{ email: string }>).map((x) => x.email)];
    // The room asked for: still free for those nights, and the estimate worked out here, never trusted from the page.
    let chosen: { room_id: string; quoted_pence: number | null; currency: string } | null = null;
    let roomName: string | null = null;
    if (data.roomId) {
      const { quoteStay, roomTaken } = await import("./direct-rates");
      const page = await pageRooms(db, p.id, todayIn(p.timezone));
      const room = page.rooms.find((r) => r.id === data.roomId);
      if (!room) throw new Error("That room isn't available to request. Please pick another.");
      if (roomTaken(page.taken[room.id] ?? [], data.checkIn, data.checkOut)) throw new Error("That room has just been taken for some of those nights. Please pick other dates or another room.");
      if (data.guests > room.maxGuests) throw new Error(`That room sleeps up to ${room.maxGuests}.`);
      roomName = room.name;
      chosen = { room_id: room.id, quoted_pence: room.ratePence !== null ? quoteStay(room.ratePence, page.offers, room.id, data.checkIn, data.checkOut).total : null, currency: currencyOf(p) };
    }
    const row = {
      host_id: p.host_id,
      property_id: p.id,
      name: data.name.trim(),
      email,
      phone: data.phone?.trim() || null,
      check_in: data.checkIn,
      check_out: data.checkOut,
      guests: data.guests,
      // Children are noted in the message (the enquiry keeps one guest count).
      message: [data.children > 0 && data.children < data.guests ? `${partyText(data.guests - data.children, data.children)}.` : null, data.message?.trim() || null].filter(Boolean).join(" ") || null,
      is_returning: isReturning(email, known),
    };
    const { withLegacy } = await import("./checkin.server");
    // The room and estimate need migration 0052; before it the request still arrives.
    const { error } = await withLegacy(
      () => db.from("direct_enquiries").insert({ ...row, ...(chosen ?? {}) }),
      () => db.from("direct_enquiries").insert(row),
    );
    if (error) throw new Error("That enquiry couldn't be sent. Please try again.");
    const business = (p.hosts?.business_name as string | undefined) || (p.name as string);
    if (data.futureStays) {
      await db.from("guest_contacts").upsert(
        { host_id: p.host_id, property_id: p.id, name: data.name.trim(), email, consent_text: consentText(business), consent_at: new Date().toISOString(), source: "enquiry" },
        { onConflict: "host_id,email", ignoreDuplicates: true },
      );
    }
    const { raiseAlert } = await import("./checkin.server");
    await raiseAlert({
      hostId: p.host_id,
      propertyId: p.id,
      kind: "direct_enquiry",
      message: `${data.name.trim()} asked about ${roomName ? `${roomName}, ` : ""}${data.checkIn} to ${data.checkOut} (${data.guests} ${data.guests === 1 ? "guest" : "guests"}) at ${p.name}.`,
    }).catch(() => undefined);
    return { ok: true };
  });

/** A stay link's booking, while the link works. */
async function stayFromToken(db: Loose, token: string) {
  const { sha256 } = await import("./checkin.server");
  const { data: t } = await db.from("stay_tokens").select("booking_id, expires_at").eq("token_hash", sha256(token)).maybeSingle();
  if (!t || Date.parse(t.expires_at) < Date.now()) return null;
  const { data: b } = await db
    .from("bookings")
    .select("id, property_id, guest_full_name, guest_email, properties(host_id, name, short_code, hosts(business_name))")
    .eq("id", t.booking_id)
    .maybeSingle();
  return b ?? null;
}

/** The stay guide's "stay with us again" card: whether this guest is on the list. */
export const getStayAgain = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: stayToken }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const b = await stayFromToken(db, data.token);
    if (!b) return { found: false as const };
    const business = (b.properties?.hosts?.business_name as string | undefined) || (b.properties?.name as string);
    const { data: c, error } = await db.from("guest_contacts").select("withdraw_token").eq("booking_id", b.id).maybeSingle();
    return {
      // Before migration 0043, no card.
      found: !error,
      business,
      shortCode: (b.properties?.short_code as string | null) ?? null,
      email: (b.guest_email as string | null) ?? "",
      consent: consentText(business),
      withdrawToken: (c?.withdraw_token as string | null) ?? null,
    };
  });

export const saveStayAgain = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: stayToken, email: z.string().max(254), agree: z.literal(true) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const b = await stayFromToken(db, data.token);
    if (!b) throw new Error("This guide link has ended.");
    const email = normaliseEmail(data.email);
    if (!/^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[^\s@<>"]{2,24}$/.test(email)) throw new Error("Please check your email address.");
    const business = (b.properties?.hosts?.business_name as string | undefined) || (b.properties?.name as string);
    const row = {
      host_id: b.properties.host_id,
      property_id: b.property_id,
      booking_id: b.id,
      name: (b.guest_full_name as string | null) ?? null,
      email,
      consent_text: consentText(business),
      consent_at: new Date().toISOString(),
      source: "stay_page",
    };
    const { data: saved, error } = await db.from("guest_contacts").upsert(row, { onConflict: "host_id,email" }).select("withdraw_token").single();
    if (error) throw new Error("That couldn't be saved. Please try again.");
    return { ok: true, withdrawToken: saved.withdraw_token as string };
  });

/** One link, no sign-in: stop hearing from the business. Always says done, so links can't be tested. */
export const withdrawContact = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().regex(/^[0-9a-f]{32,80}$/) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    await db.from("guest_contacts").delete().eq("withdraw_token", data.token);
    return { ok: true };
  });

/* -------------------------------- host --------------------------------- */

export const listDirect = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const [{ data: props }, enquiries, contacts, { data: host }, reservations] = await Promise.all([
      sb.from("properties").select("id, name, short_code").eq("host_id", data.hostId).order("created_at"),
      sb
        .from("direct_enquiries")
        .select("*")
        .eq("host_id", data.hostId)
        .order("created_at", { ascending: false })
        .limit(200),
      sb.from("guest_contacts").select("id, property_id, name, email, consent_text, consent_at, source, withdraw_token").eq("host_id", data.hostId).order("consent_at", { ascending: false }).limit(500),
      sb.from("hosts").select("business_name").eq("id", data.hostId).maybeSingle(),
      // Bookings made on the Stay with us page (migration 0053).
      sb.from("direct_reservations").select("*, rooms(display_name)").eq("host_id", data.hostId).order("created_at", { ascending: false }).limit(200),
    ]);
    return {
      // Before migration 0043 the page explains what's coming.
      available: !enquiries.error && !contacts.error,
      business: (host?.business_name as string | null) ?? "",
      properties: (props ?? []) as Array<{ id: string; name: string; short_code: string | null }>,
      enquiries: (enquiries.error ? [] : (enquiries.data ?? [])) as Array<{
        id: string;
        property_id: string;
        name: string;
        email: string;
        phone: string | null;
        check_in: string;
        check_out: string;
        guests: number;
        message: string | null;
        is_returning: boolean;
        status: (typeof ENQUIRY_STATUSES)[number];
        booking_id: string | null;
        created_at: string;
        room_id?: string | null;
        quoted_pence?: number | null;
        currency?: string | null;
      }>,
      contacts: (contacts.error ? [] : (contacts.data ?? [])) as Array<{ id: string; property_id: string | null; name: string | null; email: string; consent_text: string; consent_at: string; source: string; withdraw_token: string }>,
      reservations: (reservations.error ? [] : (reservations.data ?? [])) as Array<{
        id: string;
        property_id: string;
        booking_id: string | null;
        reference: string;
        name: string;
        email: string;
        phone: string | null;
        check_in: string;
        check_out: string;
        guests: number;
        plan: "flex" | "nonref";
        method: "card" | "bank" | "property";
        total_pence: number;
        currency: string;
        free_cancel_until: string | null;
        status: "pending" | "confirmed" | "paid" | "cancelled" | "expired";
        pay_by: string | null;
        created_at: string;
        rooms: { display_name: string } | null;
        /** Every room in the booking (migration 0055). */
        room_list?: Array<{ name: string }> | null;
      }>,
    };
  });

export const setEnquiryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, status: z.enum(ENQUIRY_STATUSES) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as unknown as Loose).from("direct_enquiries").update({ status: data.status, updated_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** The enquiry becomes a direct stay on Bookings (room picked there if not here). */
export const convertEnquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, roomId: uuid.nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const { data: e } = await sb.from("direct_enquiries").select("*").eq("id", data.id).maybeSingle();
    if (!e) throw new Error("Enquiry not found.");
    if (e.booking_id) return { bookingId: e.booking_id as string };
    const { data: b, error } = await sb
      .from("bookings")
      .insert({
        property_id: e.property_id,
        room_id: data.roomId ?? (e.room_id as string | null) ?? null,
        channel: "direct",
        source: "manual",
        status: "upcoming",
        guest_full_name: e.name,
        guest_email: e.email,
        guest_count: Math.min(12, e.guests),
        check_in_date: e.check_in,
        check_out_date: e.check_out,
        notes: e.message ? `From a direct enquiry: ${String(e.message).slice(0, 400)}` : "From a direct enquiry.",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await sb.from("direct_enquiries").update({ status: "booked", booking_id: b.id, updated_at: new Date().toISOString() }).eq("id", data.id);
    return { bookingId: b.id as string };
  });

export const removeDirectRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: z.enum(["enquiry", "contact"]), id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const table = data.kind === "enquiry" ? "direct_enquiries" : "guest_contacts";
    const { error } = await (context.supabase as unknown as Loose).from(table).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ----------------------------- rates (host) ----------------------------- */

/** The host's rates for the "Stay with us" page: each room's base nightly rate and the seasonal offers. */
export const getDirectRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const { normaliseOffers } = await import("./direct-rates");
    const [rooms, prop] = await Promise.all([
      sb.from("rooms").select("id, display_name, base_rate_pence").eq("property_id", data.propertyId).neq("active", false).order("sort_order"),
      sb.from("properties").select("direct_offers, currency, short_code, hosts(currency)").eq("id", data.propertyId).maybeSingle(),
    ]);
    return {
      // Before migration 0052 the card explains what's coming.
      available: !rooms.error && !prop.error,
      currency: prop.data ? currencyOf(prop.data) : "GBP",
      shortCode: (prop.data?.short_code as string | null) ?? null,
      rooms: ((rooms.data ?? []) as Array<{ id: string; display_name: string; base_rate_pence: number | null }>).map((r) => ({ id: r.id, name: r.display_name, ratePence: r.base_rate_pence ?? null })),
      offers: normaliseOffers(prop.data?.direct_offers),
    };
  });

export const saveDirectRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        rates: z.array(z.object({ roomId: uuid, ratePence: z.number().int().min(0).max(100_000_000).nullable() })).max(200),
        offers: z.array(z.record(z.string(), z.unknown())).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireWrite, hostOfProperty } = await import("./roles");
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const { normaliseOffers } = await import("./direct-rates");
    const sb = context.supabase as unknown as Loose;
    for (const r of data.rates) {
      const { error } = await sb.from("rooms").update({ base_rate_pence: r.ratePence }).eq("id", r.roomId).eq("property_id", data.propertyId);
      if (error) throw new Error(/base_rate/.test(error.message) ? "Rates need the latest update (migration 0052)." : error.message);
    }
    const offers = normaliseOffers(data.offers);
    const { error } = await sb.from("properties").update({ direct_offers: offers }).eq("id", data.propertyId);
    if (error) throw new Error(error.message);
    return { ok: true, offers };
  });
