/**
 * The room QR opening a guest's own guide before check-in is finished, and
 * the door tablets that show a phone is at the property (src/lib/stay-access.ts,
 * migration 0057).
 *
 * A door tablet is paired once (the host's PIN on it, or the host signed in
 * on it) and then reports every few minutes: a one-day pseudonym of its
 * internet connection and, if allowed, its location. When someone scans a
 * room's QR, their phone counts as here if its connection matches a tablet's
 * (a router's isolated guest network shares the same public address), or,
 * if the host allows it, if it's near the tablet. Then, with the host's
 * permission and a named stay in that room today, the guest's own guide
 * opens; otherwise they check in first.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hostOfProperty, requireWrite } from "@/lib/roles";

type Loose = { from: (t: string) => any; rpc: (f: string, a?: object) => any };
const uuid = z.string().uuid();
const code = z.string().min(2).max(60).regex(/^[a-z0-9-]+$/i);
const roomCode = z.string().regex(/^[a-z0-9]{8,24}$/);
const device = z.string().min(24).max(80);
const fix = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100000) });

async function admin(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

const todayIn = (tz: string | null) => new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? "Europe/London" }).format(new Date());

/** This request's connection as a one-day pseudonym, or null. */
async function requestNet(): Promise<{ hash: string; day: string } | null> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { requestIp, hashIp } = await import("./ip-hash.server");
  const { networkKey } = await import("./stay-access");
  const key = networkKey(requestIp(getRequest().headers));
  const day = new Date().toISOString().slice(0, 10);
  const hash = key ? hashIp(key, day) : null;
  return hash ? { hash, day } : null;
}

/** Makes a paired-tablet token for a property; only its hash is kept. */
export async function pairDevice(db: Loose, propertyId: string, by: "pin" | "host"): Promise<string | null> {
  const { newToken } = await import("./checkin.server");
  const t = newToken();
  const { error } = await db.from("kiosk_devices").insert({ property_id: propertyId, token_hash: t.hash, paired_by: by });
  return error ? null : t.token;
}

/** The host, signed in on the tablet, pairs it as this property's door tablet. */
export const pairKioskAsHost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: p } = await db.from("properties").select("id, host_id, is_demo").eq("short_code", data.code.toLowerCase()).maybeSingle();
    if (!p || p.is_demo) return { device: null };
    await requireWrite(context.supabase, p.host_id);
    return { device: await pairDevice(db, p.id, "host") };
  });

/** A paired door tablet saying where it is: its connection now, and its location when it has one. */
export const kioskHere = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code, device, fix: fix.nullable().optional() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { sha256 } = await import("./checkin.server");
    const { data: dev } = await db.from("kiosk_devices").select("id, property_id, properties(short_code)").eq("token_hash", sha256(data.device)).maybeSingle();
    if (!dev || dev.properties?.short_code !== data.code.toLowerCase()) return { paired: false };
    const net = await requestNet();
    const now = new Date().toISOString();
    const located = data.fix && data.fix.accuracy <= 500
      ? { lat: Math.round(data.fix.lat * 10_000) / 10_000, lng: Math.round(data.fix.lng * 10_000) / 10_000, accuracy_m: Math.round(data.fix.accuracy), located_at: now }
      : {};
    await db.from("kiosk_devices").update({ net_hash: net?.hash ?? null, net_day: net?.day ?? null, last_seen_at: now, ...located }).eq("id", dev.id);
    return { paired: true };
  });

/* --------------------------- the room QR code --------------------------- */

// Location tries per room, kept in memory: a guess at the property's position shouldn't be repeatable endlessly.
const tries = new Map<string, number[]>();
function tooManyTries(key: string): boolean {
  const now = Date.now();
  const recent = (tries.get(key) ?? []).filter((t) => now - t < 3_600_000);
  recent.push(now);
  tries.set(key, recent);
  return recent.length > 12;
}

/**
 * Someone scanned a room's QR: open the stay booked into that room today, if
 * the host allows it and the phone is at the property. Never says who is
 * staying unless it opens.
 */
export const openRoomStay = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: roomCode, fix: fix.nullable().optional() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { normaliseStayAccess, nearKiosk } = await import("./stay-access");
    const { data: room } = await db.from("rooms").select("id, property_id, active").eq("guide_code", data.code).maybeSingle();
    if (!room || room.active === false) return { status: "none" as const };
    const { withLegacy } = await import("./checkin.server");
    const { data: p } = await withLegacy<any>(
      () => db.from("properties").select("id, timezone, default_check_out_time, stay_access, is_demo, active").eq("id", room.property_id).maybeSingle(),
      () => Promise.resolve({ data: null, error: null }),
    );
    if (!p || p.active === false) return { status: "none" as const };
    const settings = normaliseStayAccess(p.stay_access);
    if (!settings.roomQrEarly) return { status: "off" as const };

    const today = todayIn(p.timezone);
    const { data: stays } = await db
      .from("bookings")
      .select("id, guest_full_name, check_in_date, check_out_date, check_out_time, status")
      .eq("room_id", room.id)
      .is("mirror_of", null)
      .is("archived_at", null)
      .in("status", ["upcoming", "checked_in", "needs_details", "flagged"])
      .lte("check_in_date", today)
      .gte("check_out_date", today)
      .order("check_in_date", { ascending: false });
    // A changeover day: the guest leaving keeps the room until their check-out time, then it's the one arriving.
    // Either way the stay must have a name the host has given it.
    const named = ((stays ?? []) as Array<{ id: string; guest_full_name: string | null; check_in_date: string; check_out_date: string; check_out_time: string | null }>).filter((x) => x.guest_full_name?.trim());
    const nowTime = new Intl.DateTimeFormat("en-GB", { timeZone: p.timezone ?? "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    const leaving = named.find((x) => x.check_out_date === today && nowTime < (x.check_out_time ?? p.default_check_out_time ?? "11:00").slice(0, 5));
    const b = leaving ?? named.find((x) => x.check_out_date > today);
    if (!b) return { status: "none" as const };

    // Here? The same connection as a door tablet seen in the last 20 minutes, or near one.
    const net = await requestNet();
    const since = new Date(Date.now() - 20 * 60_000).toISOString();
    const { data: devices } = await db.from("kiosk_devices").select("net_hash, net_day, last_seen_at, lat, lng, accuracy_m").eq("property_id", p.id);
    const list = (devices ?? []) as Array<{ net_hash: string | null; net_day: string | null; last_seen_at: string | null; lat: number | null; lng: number | null; accuracy_m: number | null }>;
    const sameNet = !!net && list.some((d) => d.net_hash === net.hash && d.net_day === net.day && (d.last_seen_at ?? "") >= since);
    const located = list.filter((d) => d.lat !== null && d.lng !== null);
    const canLocate = settings.presence === "network_or_location" && located.length > 0;
    let near = false;
    if (!sameNet && canLocate && data.fix) {
      if (tooManyTries(`${room.id}`)) return { status: "away" as const, locate: false };
      near = located.some((d) => nearKiosk({ lat: d.lat!, lng: d.lng!, accuracy: d.accuracy_m ?? 0 }, data.fix!));
    }
    if (!sameNet && !near) return { status: "away" as const, locate: canLocate && !data.fix };

    // A fresh link to their own guide, for the stay's own window.
    const { newToken } = await import("./checkin.server");
    const { guideWindow } = await import("./guide");
    const stay = newToken();
    const win = guideWindow(b.check_in_date, b.check_out_date, (b.check_out_time ?? p.default_check_out_time ?? "11:00").slice(0, 5), p.timezone ?? "Europe/London");
    const { error } = await db.from("stay_tokens").insert({ token_hash: stay.hash, booking_id: b.id, valid_from: win.validFrom.toISOString(), expires_at: win.expiresAt.toISOString() });
    if (error) return { status: "away" as const, locate: false };
    return { status: "open" as const, token: stay.token, checkOut: b.check_out_date, via: sameNet ? ("network" as const) : ("location" as const) };
  });

/* ---------------------------------- host ---------------------------------- */

export const getStayAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const { normaliseStayAccess } = await import("./stay-access");
    const { data: p, error } = await sb.from("properties").select("stay_access").eq("id", data.propertyId).maybeSingle();
    const { data: devices, error: devError } = await sb
      .from("kiosk_devices")
      .select("id, paired_by, last_seen_at, located_at, created_at")
      .eq("property_id", data.propertyId)
      .order("last_seen_at", { ascending: false, nullsFirst: false });
    return {
      available: !error && !devError,
      settings: normaliseStayAccess(error ? null : p?.stay_access),
      tablets: ((devError ? [] : devices) ?? []) as Array<{ id: string; paired_by: "pin" | "host"; last_seen_at: string | null; located_at: string | null; created_at: string }>,
    };
  });

export const saveStayAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, settings: z.record(z.string(), z.unknown()) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const { normaliseStayAccess } = await import("./stay-access");
    const settings = normaliseStayAccess(data.settings);
    const { error } = await (context.supabase as unknown as Loose).from("properties").update({ stay_access: settings }).eq("id", data.propertyId);
    if (error) throw new Error(/stay_access/.test(error.message) ? "This needs the latest database update (migration 0057)." : error.message);
    return { ok: true, settings };
  });

export const forgetTablet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as unknown as Loose).from("kiosk_devices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
