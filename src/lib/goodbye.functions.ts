/* eslint-disable @typescript-eslint/no-explicit-any -- reads columns the generated Supabase types don't cover yet */
/**
 * The check-out goodbye (src/lib/checkout-goodbye.ts, migration 0068): the
 * host's settings, what the door tablet shows now, Express check-out from
 * the tablet or the guest guide, and the host taking a goodbye off.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  LATE_LEAD_CHOICES,
  START_CHOICES,
  goodbyeText,
  goodbyeWindow,
  normaliseGoodbye,
  showsGoodbye,
} from "@/lib/checkout-goodbye";
import { firstName } from "@/lib/checkin-logic";
import { todayInZone } from "@/lib/dates";
import { hostOfProperty, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();
const code = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9-]+$/i);

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** A stay handed to the tablet as a short-lived signed handle, never its id. */
async function handleFor(bookingId: string, propertyId: string): Promise<string> {
  const { createHmac } = await import("crypto");
  const exp = Date.now() + 12 * 3_600_000;
  const body = `${Buffer.from(bookingId).toString("base64url")}.${exp}`;
  const mac = createHmac("sha256", `goodbye:${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""}`)
    .update(`${body}.${propertyId}`)
    .digest("base64url");
  return `${body}.${mac}`;
}

async function readHandle(handle: string, propertyId: string): Promise<string | null> {
  const { createHmac, timingSafeEqual } = await import("crypto");
  const [id64, exp, mac] = handle.split(".");
  if (!id64 || !exp || !mac || Number(exp) < Date.now()) return null;
  const want = createHmac("sha256", `goodbye:${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""}`)
    .update(`${id64}.${exp}.${propertyId}`)
    .digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const id = Buffer.from(id64, "base64url").toString();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

const goodbyeInput = z.object({
  on: z.boolean(),
  message: z.string().max(300),
  keyDrop: z.string().max(300),
  lockDoor: z.boolean(),
  startBeforeMinutes: z.number().refine((n) => (START_CHOICES as readonly number[]).includes(n)),
  lateLeadMinutes: z.number().refine((n) => (LATE_LEAD_CHOICES as readonly number[]).includes(n)),
});

export const getGoodbyeSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: p, error } = await (context.supabase as any)
      .from("properties")
      .select("checkout_goodbye")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (error) return { available: false as const, goodbye: normaliseGoodbye(null) };
    return { available: true as const, goodbye: normaliseGoodbye(p?.checkout_goodbye) };
  });

export const saveGoodbyeSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, goodbye: goodbyeInput }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const { error } = await (context.supabase as any)
      .from("properties")
      .update({ checkout_goodbye: normaliseGoodbye(data.goodbye) })
      .eq("id", data.propertyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function propertyFor(shortCode: string) {
  const db = await admin();
  const { data: p, error } = await db
    .from("properties")
    .select("id, timezone, default_check_out_time, checkout_goodbye")
    .eq("short_code", shortCode.toLowerCase())
    .maybeSingle();
  return { db, p: error ? null : p };
}

export type GoodbyeCard = {
  handle: string;
  firstName: string;
  room: string | null;
  message: string;
  /** Their check-out time ("11:00", or their late one). */
  until: string;
  late: boolean;
};

/** The door tablet: the goodbyes showing now, the key drop and the door reminder. */
export const kioskGoodbyes = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ code }).parse(d))
  .handler(async ({ data }) => {
    const none = { cards: [] as GoodbyeCard[], keyDrop: "", lockDoor: false };
    const { db, p } = await propertyFor(data.code);
    if (!p) return none;
    const g = normaliseGoodbye(p.checkout_goodbye);
    if (!g.on) return none;
    const tz = p.timezone ?? "Europe/London";
    const today = todayInZone(tz);
    const standard = (p.default_check_out_time ?? "11:00").slice(0, 5);
    const { data: rows, error } = await db
      .from("bookings")
      .select(
        "id, status, check_out_date, check_out_time, guest_full_name, goodbye_dismissed_at, mirror_of, rooms(display_name, sort_order)",
      )
      .eq("property_id", p.id)
      .eq("check_out_date", today)
      .limit(200);
    if (error) return none;
    const now = Date.now();
    const showing = ((rows ?? []) as any[]).filter((b) =>
      showsGoodbye(b, today, now, standard, tz, g),
    );
    const cards = await Promise.all(
      showing
        .sort(
          (a, b) =>
            (a.rooms?.sort_order ?? 0) - (b.rooms?.sort_order ?? 0) ||
            String(a.rooms?.display_name ?? "").localeCompare(String(b.rooms?.display_name ?? "")),
        )
        .map(async (b): Promise<GoodbyeCard> => ({
          handle: await handleFor(b.id, p.id),
          firstName: firstName(b.guest_full_name),
          room: b.rooms?.display_name ?? null,
          message: goodbyeText(g, firstName(b.guest_full_name)),
          until: (b.check_out_time ?? standard).slice(0, 5),
          late: goodbyeWindow(b, standard, tz, g).late,
        })),
    );
    return { cards, keyDrop: g.keyDrop, lockDoor: g.lockDoor };
  });

/** Marks the stay checked out and takes its goodbye off the tablet. */
async function checkOut(db: any, bookingId: string, source: string) {
  const now = new Date().toISOString();
  await db
    .from("bookings")
    .update({ status: "checked_out", checked_out_at: now, goodbye_dismissed_at: now })
    .eq("id", bookingId)
    .in("status", ["checked_in", "upcoming", "flagged", "needs_details"]);
  await db.from("presence_log").insert({ booking_id: bookingId, event: "checked_out", source });
}

/**
 * Express check-out on the door tablet: the guest says they're leaving. The
 * tablet then reminds them of the keys, the door and a review (with their
 * guide's short link for it), and goes back to its usual screen after 10 minutes.
 */
export const kioskExpressCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code, handle: z.string().max(300) }).parse(d))
  .handler(async ({ data }) => {
    const { db, p } = await propertyFor(data.code);
    if (!p) throw new Error("We couldn't do that. Please tell your host you've left.");
    const id = await readHandle(data.handle, p.id);
    if (!id) throw new Error("We couldn't do that. Please tell your host you've left.");
    const { data: b } = await db
      .from("bookings")
      .select("id, guest_full_name, check_out_date, check_out_time")
      .eq("id", id)
      .eq("property_id", p.id)
      .maybeSingle();
    if (!b) throw new Error("We couldn't do that. Please tell your host you've left.");
    await checkOut(db, b.id, "express_checkout");
    // Their guide's short link, for the review (it works until their check-out time).
    const { guideWindow } = await import("./guide");
    const tz = p.timezone ?? "Europe/London";
    const win = guideWindow(
      b.check_out_date,
      b.check_out_date,
      (b.check_out_time ?? p.default_check_out_time ?? "11:00").slice(0, 5),
      tz,
    );
    const { shortLinkFor } = await import("./stay-links.server");
    const short = await shortLinkFor(b.id, win.expiresAt).catch(() => null);
    const g = normaliseGoodbye(p.checkout_goodbye);
    return {
      firstName: firstName(b.guest_full_name),
      keyDrop: g.keyDrop,
      lockDoor: g.lockDoor,
      reviewCode: short,
    };
  });

/** "I've checked out" in the guest's own guide. */
export const guideCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(20).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { sha256 } = await import("./checkin.server");
    const { data: t } = await db
      .from("stay_tokens")
      .select("booking_id, expires_at")
      .eq("token_hash", sha256(data.token))
      .maybeSingle();
    if (!t || Date.parse(t.expires_at) < Date.now()) throw new Error("This link has ended.");
    await checkOut(db, t.booking_id, "guest_guide");
    return { ok: true };
  });

/** The host takes a guest's goodbye off the tablet (they've said goodbye in person). Returns the code to ping. */
export const dismissGoodbye = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: b } = await db
      .from("bookings")
      .select("id, property_id, properties(host_id, short_code)")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!b?.properties) throw new Error("We couldn't find that stay.");
    await requireWrite(context.supabase, b.properties.host_id);
    await db
      .from("bookings")
      .update({ goodbye_dismissed_at: new Date().toISOString() })
      .eq("id", b.id);
    return { code: b.properties.short_code as string };
  });
