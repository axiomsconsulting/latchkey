/**
 * The one message thread per stay, shared by the guest's stay page and the
 * host's inbox. "outbound" is the host talking to the guest; "inbound" is the
 * guest talking to the host. Read marks on each side drive the unread badges.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const stayToken = z.string().min(20).max(80);
const uuid = z.string().uuid();
const body = z.string().trim().min(1).max(1000);

/* --------------------------------- guest --------------------------------- */

async function stayBooking(t: string) {
  const { admin, sha256 } = await import("./checkin.server");
  const db = await admin();
  const { data: st } = await db
    .from("stay_tokens")
    .select("booking_id, expires_at, valid_from")
    .eq("token_hash", sha256(t))
    .maybeSingle();
  if (!st || Date.parse(st.expires_at) < Date.now()) throw new Error("This stay link has expired.");
  const { data: b } = await db
    .from("bookings")
    .select("id, property_id, status, guest_full_name, properties(name, host_id, timezone)")
    .eq("id", st.booking_id)
    .single();
  if (!b || b.status === "cancelled") throw new Error("This stay link has expired.");
  return { db, booking: b as typeof b & { properties: { name: string; host_id: string; timezone: string | null } } };
}

export const getStayInbox = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: stayToken }).parse(d))
  .handler(async ({ data }) => {
    const { db, booking } = await stayBooking(data.token);
    const [{ data: msgs }, { data: extras }, { data: jobs }] = await Promise.all([
      db
        .from("messages")
        .select("id, body, direction, created_at, read_by_guest_at")
        .eq("booking_id", booking.id)
        .eq("channel", "stay_page")
        .order("created_at", { ascending: true })
        .limit(200),
      db
        .from("requests")
        .select("id, items, status, total_pence, created_at, time_window, host_note")
        .eq("booking_id", booking.id)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("service_jobs")
        .select("id, title, status, eta_at, created_at")
        .eq("booking_id", booking.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    const messages = msgs ?? [];
    return {
      timezone: booking.properties.timezone ?? "Europe/London",
      hostName: booking.properties.name,
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body ?? "",
        fromHost: m.direction === "outbound",
        createdAt: m.created_at,
      })),
      unread: messages.filter((m) => m.direction === "outbound" && !m.read_by_guest_at).length,
      requests: (extras ?? []).map((r) => ({
        id: r.id,
        kind: "extras" as const,
        label: (Array.isArray(r.items) ? (r.items as Array<{ name?: string; qty?: number }>) : [])
          .map((i) => `${i.qty ?? 1}× ${i.name ?? "Item"}`)
          .join(", "),
        status: r.status,
        totalPence: r.total_pence,
        note: r.host_note,
        when: r.created_at,
      })),
      jobs: (jobs ?? []).map((j) => ({
        id: j.id,
        kind: "job" as const,
        label: j.title,
        status: j.status,
        etaAt: j.eta_at,
        when: j.created_at,
      })),
    };
  });

export const sendGuestMessage = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: stayToken, body }).parse(d))
  .handler(async ({ data }) => {
    const { db, booking } = await stayBooking(data.token);

    // Light rate limit so a stuck tap cannot flood the host's inbox.
    const since = new Date(Date.now() - 600_000).toISOString();
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", booking.id)
      .eq("direction", "inbound")
      .gte("created_at", since);
    if ((count ?? 0) >= 20) throw new Error("That is a lot of messages. Please wait a moment.");

    const now = new Date().toISOString();
    await db.from("messages").insert({
      booking_id: booking.id,
      direction: "inbound",
      channel: "stay_page",
      body: data.body,
      sent_at: now,
    });
    const { raiseAlert } = await import("./checkin.server");
    await raiseAlert({
      hostId: booking.properties.host_id,
      propertyId: booking.property_id,
      bookingId: booking.id,
      kind: "service_request",
      message: `${booking.guest_full_name ?? "A guest"} sent a message: ${data.body.slice(0, 120)}`,
    });
    return { ok: true };
  });

export const markGuestRead = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: stayToken }).parse(d))
  .handler(async ({ data }) => {
    const { db, booking } = await stayBooking(data.token);
    await db
      .from("messages")
      .update({ read_by_guest_at: new Date().toISOString() })
      .eq("booking_id", booking.id)
      .eq("direction", "outbound")
      .is("read_by_guest_at", null);
    return { ok: true };
  });

/* --------------------------------- host ---------------------------------- */

export const listHostThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: bookings } = await context.supabase
      .from("bookings")
      .select("id, guest_full_name, check_out_date, status, rooms(display_name)")
      .eq("property_id", data.propertyId)
      .in("status", ["checked_in", "upcoming", "flagged"])
      .gte("check_out_date", new Date(Date.now() - 86_400_000).toISOString().slice(0, 10))
      .limit(60);

    const ids = (bookings ?? []).map((b) => b.id);
    if (ids.length === 0) return { threads: [], unread: 0 };

    const { data: msgs } = await context.supabase
      .from("messages")
      .select("id, booking_id, body, direction, created_at, read_by_host_at")
      .in("booking_id", ids)
      .eq("channel", "stay_page")
      .order("created_at", { ascending: false })
      .limit(400);

    const all = msgs ?? [];
    const threads = (bookings ?? [])
      .map((b) => {
        const mine = all.filter((m) => m.booking_id === b.id);
        const last = mine[0];
        return {
          bookingId: b.id,
          guest: b.guest_full_name ?? "Guest",
          room: (b.rooms as { display_name?: string } | null)?.display_name ?? null,
          lastBody: last?.body ?? null,
          lastAt: last?.created_at ?? null,
          unread: mine.filter((m) => m.direction === "inbound" && !m.read_by_host_at).length,
        };
      })
      .filter((t) => t.lastAt !== null)
      .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));

    return { threads, unread: threads.reduce((n, t) => n + t.unread, 0) };
  });

export const getHostThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: msgs, error } = await context.supabase
      .from("messages")
      .select("id, body, direction, created_at")
      .eq("booking_id", data.bookingId)
      .eq("channel", "stay_page")
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return (msgs ?? []).map((m) => ({
      id: m.id,
      body: m.body ?? "",
      fromHost: m.direction === "outbound",
      createdAt: m.created_at,
    }));
  });

export const sendHostMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid, body }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("messages").insert({
      booking_id: data.bookingId,
      direction: "outbound",
      channel: "stay_page",
      body: data.body,
      sent_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markHostRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("messages")
      .update({ read_by_host_at: new Date().toISOString() })
      .eq("booking_id", data.bookingId)
      .eq("direction", "inbound")
      .is("read_by_host_at", null);
    return { ok: true };
  });

/* --------------------------- Today's summary ----------------------------- */

/**
 * Every stay's conversation for Today: messages, extras (approve, pay,
 * deliver) and service requests, with what each is waiting on. "now" is
 * everyone staying today; "upcoming" the next 30 days; "past" the last 30.
 */
export const listStayConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, scope: z.enum(["now", "upcoming", "past"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: prop } = await sb.from("properties").select("timezone").eq("id", data.propertyId).maybeSingle();
    const tz = prop?.timezone ?? "Europe/London";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const shift = (days: number) => {
      const d = new Date(`${today}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    let q = sb
      .from("bookings")
      .select("id, guest_full_name, check_in_date, check_out_date, status, channel, mirror_of, archived_at, rooms(display_name)")
      .eq("property_id", data.propertyId)
      .not("status", "in", "(cancelled,blocked)")
      .is("mirror_of", null)
      .is("archived_at", null);
    q =
      data.scope === "now"
        ? q.lte("check_in_date", today).gte("check_out_date", today)
        : data.scope === "upcoming"
          ? q.gt("check_in_date", today).lte("check_in_date", shift(30))
          : q.lt("check_out_date", today).gte("check_out_date", shift(-30));
    const { data: bookings, error } = await q.order("check_in_date", { ascending: data.scope !== "past" }).limit(80);
    if (error) throw new Error(error.message);
    const ids = (bookings ?? []).map((b) => b.id);
    if (!ids.length) return { today, stays: [] };

    const [{ data: msgs }, { data: reqs }, { data: jobs }] = await Promise.all([
      sb.from("messages").select("booking_id, direction, created_at, read_by_host_at, read_by_guest_at, body").in("booking_id", ids).eq("channel", "stay_page").order("created_at", { ascending: true }).limit(2000),
      sb.from("requests").select("id, booking_id, status, total_pence, items, created_at").in("booking_id", ids).limit(1000),
      sb.from("service_jobs").select("id, booking_id, status, title, created_at, source").in("booking_id", ids).eq("source", "guest").limit(1000),
    ]);
    const { summarise, byAttention } = await import("./conversations");
    const stays = (bookings ?? []).map((b) => {
      const mine = <T extends { booking_id: string | null }>(rows: T[] | null) => (rows ?? []).filter((r) => r.booking_id === b.id);
      const r = mine(reqs as Array<{ id: string; booking_id: string; status: string; total_pence: number; items: unknown; created_at: string }> | null);
      const j = mine(jobs as Array<{ id: string; booking_id: string; status: string; title: string; created_at: string }> | null);
      return {
        bookingId: b.id,
        guest: b.guest_full_name,
        room: (b.rooms as { display_name?: string } | null)?.display_name ?? null,
        checkIn: b.check_in_date,
        checkOut: b.check_out_date,
        status: b.status,
        channel: b.channel,
        requests: r.map((x) => ({
          id: x.id,
          status: x.status,
          totalPence: x.total_pence,
          label: (Array.isArray(x.items) ? (x.items as Array<{ name?: string; qty?: number }>) : []).map((i) => `${i.qty ?? 1}× ${i.name ?? "Item"}`).join(", "),
        })),
        jobs: j.map((x) => ({ id: x.id, status: x.status, title: x.title })),
        conversation: summarise(mine(msgs as Array<{ booking_id: string; direction: string; created_at: string; read_by_host_at: string | null; read_by_guest_at: string | null; body: string | null }> | null), r, j),
      };
    });
    return { today, stays: byAttention(stays) };
  });
