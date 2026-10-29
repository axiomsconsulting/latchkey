/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
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
import { ROOM_CODE } from "@/lib/room-words";

type Loose = { from: (t: string) => any; rpc: (f: string, a?: object) => any };
const uuid = z.string().uuid();
const code = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9-]+$/i);
const roomCode = z.string().max(40).regex(ROOM_CODE);
const device = z.string().min(24).max(80);
const fix = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100000),
});

async function admin(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

const todayIn = (tz: string | null) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? "Europe/London" }).format(new Date());

/** Makes a paired-tablet token for a property; only its hash is kept. */
export async function pairDevice(
  db: Loose,
  propertyId: string,
  by: "pin" | "host",
): Promise<string | null> {
  const { newToken } = await import("./checkin.server");
  const { nextNumber } = await import("./kiosk-devices");
  const t = newToken();
  const row = { property_id: propertyId, token_hash: t.hash, paired_by: by };
  // Numbered like every other tablet (migration 0067); before it, without a number.
  const { data: taken, error: listErr } = await db
    .from("kiosk_devices")
    .select("number")
    .eq("property_id", propertyId);
  const number = listErr ? null : nextNumber((taken ?? []).map((r: any) => r.number));
  let { error } = await db.from("kiosk_devices").insert(number ? { ...row, number } : row);
  if (error && number) ({ error } = await db.from("kiosk_devices").insert(row));
  return error ? null : t.token;
}

/** The host, signed in on the tablet, pairs it as this property's door tablet. */
export const pairKioskAsHost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: p } = await db
      .from("properties")
      .select("id, host_id, is_demo")
      .eq("short_code", data.code.toLowerCase())
      .maybeSingle();
    if (!p || p.is_demo) return { device: null };
    await requireWrite(context.supabase, p.host_id);
    return { device: await pairDevice(db, p.id, "host") };
  });

/** A paired door tablet saying where it is: its connection now, and its location when it has one. */
export const kioskHere = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ code, device, fix: fix.nullable().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { sha256 } = await import("./checkin.server");
    const { data: dev } = await db
      .from("kiosk_devices")
      .select("id, property_id, properties(short_code)")
      .eq("token_hash", sha256(data.device))
      .maybeSingle();
    if (!dev || dev.properties?.short_code !== data.code.toLowerCase()) return { paired: false };
    const net = await (await import("./stay-access.server")).requestNet();
    const now = new Date().toISOString();
    const located =
      data.fix && data.fix.accuracy <= 500
        ? {
            lat: Math.round(data.fix.lat * 10_000) / 10_000,
            lng: Math.round(data.fix.lng * 10_000) / 10_000,
            accuracy_m: Math.round(data.fix.accuracy),
            located_at: now,
          }
        : {};
    await db
      .from("kiosk_devices")
      .update({
        net_hash: net?.hash ?? null,
        net_day: net?.day ?? null,
        last_seen_at: now,
        ...located,
      })
      .eq("id", dev.id);
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
  .inputValidator((d: unknown) =>
    z.object({ code: roomCode, fix: fix.nullable().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { roomByCode } = await import("./room-code.server");
    const room = await roomByCode<{ id: string; property_id: string; active: boolean }>(
      db,
      data.code,
      "id, property_id, active",
    );
    if (!room || room.active === false) return { status: "none" as const };
    return openFromRoom(db, room, data.fix ?? null);
  });

/** The phone's own stay at this property, from the cookie the stay guide leaves (lk_stay_<property>), while it's valid. */
async function stayFromCookie(db: Loose, propertyId: string): Promise<string | null> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const header = getRequest().headers.get("cookie") ?? "";
  const m = new RegExp(
    `(?:^|;\\s*)lk_stay_${propertyId.replace(/-/g, "")}=([A-Za-z0-9_-]{20,80})`,
  ).exec(header);
  if (!m) return null;
  const { sha256 } = await import("./checkin.server");
  const { data: t } = await db
    .from("stay_tokens")
    .select("booking_id, expires_at")
    .eq("token_hash", sha256(m[1]!))
    .maybeSingle();
  if (!t || Date.parse(t.expires_at) < Date.now()) return null;
  const { data: b } = await db
    .from("bookings")
    .select("property_id, status")
    .eq("id", t.booking_id)
    .maybeSingle();
  return b && b.property_id === propertyId && b.status !== "cancelled" ? m[1]! : null;
}

/**
 * Where a room's QR code goes, decided before the page is sent (so it never
 * loads twice): this phone's own stay at the property if it has one, else
 * the stay booked into the room today when the host allows it and the phone
 * is on the property's connection, else the room guide.
 */
export const roomEntry = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ code: z.string().max(40) }).parse(d))
  .handler(async ({ data }): Promise<{ to: "stay"; token: string } | { to: "room" }> => {
    if (!ROOM_CODE.test(data.code)) return { to: "room" };
    const db = await admin();
    const { roomByCode } = await import("./room-code.server");
    const room = await roomByCode<{ id: string; property_id: string; active: boolean }>(
      db,
      data.code,
      "id, property_id, active",
    );
    if (!room || room.active === false) return { to: "room" };
    const own = await stayFromCookie(db, room.property_id);
    if (own) return { to: "stay", token: own };
    const r = await openFromRoom(db, room, null);
    return r.status === "open" ? { to: "stay", token: r.token } : { to: "room" };
  });

async function openFromRoom(
  db: Loose,
  room: { id: string; property_id: string },
  guestFix: z.infer<typeof fix> | null,
) {
  const data = { fix: guestFix };
  const { normaliseStayAccess, nearKiosk } = await import("./stay-access");
  const { withLegacy } = await import("./checkin.server");
  const { data: p } = await withLegacy<any>(
    () =>
      db
        .from("properties")
        .select("id, timezone, default_check_out_time, stay_access, is_demo, active")
        .eq("id", room.property_id)
        .maybeSingle(),
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
  const named = (
    (stays ?? []) as Array<{
      id: string;
      guest_full_name: string | null;
      check_in_date: string;
      check_out_date: string;
      check_out_time: string | null;
    }>
  ).filter((x) => x.guest_full_name?.trim());
  const nowTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: p.timezone ?? "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const leaving = named.find(
    (x) =>
      x.check_out_date === today &&
      nowTime < (x.check_out_time ?? p.default_check_out_time ?? "11:00").slice(0, 5),
  );
  const b = leaving ?? named.find((x) => x.check_out_date > today);
  if (!b) return { status: "none" as const };

  // Here? The same connection as a door tablet seen in the last 20 minutes, or near one.
  const net = await (await import("./stay-access.server")).requestNet();
  const since = new Date(Date.now() - 20 * 60_000).toISOString();
  const { data: devices } = await db
    .from("kiosk_devices")
    .select("net_hash, net_day, last_seen_at, lat, lng, accuracy_m")
    .eq("property_id", p.id);
  const list = (devices ?? []) as Array<{
    net_hash: string | null;
    net_day: string | null;
    last_seen_at: string | null;
    lat: number | null;
    lng: number | null;
    accuracy_m: number | null;
  }>;
  const sameNet =
    !!net &&
    list.some(
      (d) => d.net_hash === net.hash && d.net_day === net.day && (d.last_seen_at ?? "") >= since,
    );
  const located = list.filter((d) => d.lat !== null && d.lng !== null);
  const canLocate = settings.presence === "network_or_location" && located.length > 0;
  let near = false;
  if (!sameNet && canLocate && data.fix) {
    if (tooManyTries(`${room.id}`)) return { status: "away" as const, locate: false };
    near = located.some((d) =>
      nearKiosk({ lat: d.lat!, lng: d.lng!, accuracy: d.accuracy_m ?? 0 }, data.fix!),
    );
  }
  if (!sameNet && !near) return { status: "away" as const, locate: canLocate && !data.fix };

  // A fresh link to their own guide, for the stay's own window.
  const { newToken } = await import("./checkin.server");
  const { guideWindow } = await import("./guide");
  const stay = newToken();
  const win = guideWindow(
    b.check_in_date,
    b.check_out_date,
    (b.check_out_time ?? p.default_check_out_time ?? "11:00").slice(0, 5),
    p.timezone ?? "Europe/London",
  );
  const { error } = await db.from("stay_tokens").insert({
    token_hash: stay.hash,
    booking_id: b.id,
    valid_from: win.validFrom.toISOString(),
    expires_at: win.expiresAt.toISOString(),
  });
  if (error) return { status: "away" as const, locate: false };
  return {
    status: "open" as const,
    token: stay.token,
    checkOut: b.check_out_date,
    via: sameNet ? ("network" as const) : ("location" as const),
  };
}

/* ---------------------------------- host ---------------------------------- */

export const getStayAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const { normaliseStayAccess } = await import("./stay-access");
    const { data: p, error } = await sb
      .from("properties")
      .select("stay_access")
      .eq("id", data.propertyId)
      .maybeSingle();
    const { data: devices, error: devError } = await sb
      .from("kiosk_devices")
      .select("id, paired_by, last_seen_at, located_at, created_at")
      .eq("property_id", data.propertyId)
      .order("last_seen_at", { ascending: false, nullsFirst: false });
    return {
      available: !error && !devError,
      settings: normaliseStayAccess(error ? null : p?.stay_access),
      tablets: ((devError ? [] : devices) ?? []) as Array<{
        id: string;
        paired_by: "pin" | "host";
        last_seen_at: string | null;
        located_at: string | null;
        created_at: string;
      }>,
    };
  });

export const saveStayAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, settings: z.record(z.string(), z.unknown()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const { normaliseStayAccess } = await import("./stay-access");
    // Each settings card sends only its own fields, so two cards never undo each other.
    const sb = context.supabase as unknown as Loose;
    const { data: cur } = await sb
      .from("properties")
      .select("stay_access")
      .eq("id", data.propertyId)
      .maybeSingle();
    const settings = normaliseStayAccess({
      ...normaliseStayAccess(cur?.stay_access),
      ...data.settings,
    });
    const { error } = await sb
      .from("properties")
      .update({ stay_access: settings })
      .eq("id", data.propertyId);
    if (error)
      throw new Error(
        /stay_access/.test(error.message)
          ? "This needs the latest database update (migration 0057)."
          : error.message,
      );
    return { ok: true, settings };
  });

export const forgetTablet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as unknown as Loose)
      .from("kiosk_devices")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
