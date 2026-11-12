/* eslint-disable @typescript-eslint/no-explicit-any -- columns from migration 0110 */
/**
 * The AI receptionist (rules in receptionist.ts, server work in receptionist.server.ts): whether
 * it's here (and in which voice), asking it a question by text or voice, and the host's settings.
 * Where it may talk: a door tablet the host switched it on for, or a guest's own phone (stay
 * guide, room guide, check-in on their phone) when the host allows phones.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hostOfProperty, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();
const sex = z.enum(["M", "F", "X"]).nullable().default(null);

/** Where the guest is talking from. */
const where = z.discriminatedUnion("surface", [
  z.object({ surface: z.literal("stay"), token: z.string().min(20).max(80) }),
  z.object({ surface: z.literal("room"), code: z.string().min(3).max(80) }),
  z.object({
    surface: z.literal("kiosk"),
    code: z.string().min(2).max(60),
    /** A door tablet's own token (shared tablets), or none on a guest's phone. */
    device: z.string().min(10).max(200).nullable(),
    /** The check-in under way, once the stay is found. */
    session: z.string().min(10).max(200).nullable(),
  }),
]);
type Where = z.infer<typeof where>;

async function db(): Promise<any> {
  const { admin } = await import("./checkin.server");
  return admin();
}

/** The property, the stay (when known), whether it's a phone, and a key for the rate limit; null when the receptionist isn't here. */
async function resolve(w: Where) {
  const { sha256 } = await import("./checkin.server");
  const sb = await db();
  let propertyId: string | null = null;
  let bookingId: string | null = null;
  let phone = true;
  let key = "";
  if (w.surface === "stay") {
    const { data: t } = await sb
      .from("stay_tokens")
      .select("booking_id, expires_at, bookings(property_id)")
      .eq("token_hash", sha256(w.token))
      .maybeSingle();
    if (!t || Date.parse(t.expires_at) < Date.now()) return null;
    propertyId = t.bookings?.property_id ?? null;
    bookingId = t.booking_id;
    key = `stay:${t.booking_id}`;
  } else if (w.surface === "room") {
    const { roomByCode } = await import("./room-code.server");
    const room = await roomByCode<{ id: string; property_id: string }>(
      sb,
      w.code,
      "id, property_id",
    );
    if (!room) return null;
    propertyId = room.property_id;
    key = `room:${room.id}`;
  } else {
    const { data: p } = await sb
      .from("properties")
      .select("id")
      .eq("short_code", w.code.toLowerCase())
      .maybeSingle();
    if (!p) return null;
    propertyId = p.id;
    if (w.device) {
      // A shared door tablet: only one the host switched the receptionist on for.
      const { data: dev, error } = await sb
        .from("kiosk_devices")
        .select("id, receptionist, status, property_id")
        .eq("token_hash", sha256(w.device))
        .maybeSingle();
      if (
        error ||
        !dev ||
        dev.property_id !== p.id ||
        dev.status === "pending" ||
        dev.receptionist !== true
      )
        return null;
      phone = false;
      key = `tablet:${dev.id}`;
    } else key = `kiosk-phone:${p.id}`;
    if (w.session) {
      const { data: s } = await sb
        .from("checkin_sessions")
        .select("booking_id, property_id, expires_at")
        .eq("token_hash", sha256(w.session))
        .maybeSingle();
      if (s && s.property_id === p.id && Date.parse(s.expires_at) > Date.now() - 6 * 3_600_000) {
        bookingId = s.booking_id;
        key = `${key}:${s.booking_id}`;
      }
    }
  }
  if (!propertyId) return null;
  const { settingsFor, receptionistAllowed } = await import("./receptionist.server");
  const s = await settingsFor(sb, propertyId);
  if (!s.on || (phone && !s.guestPhones)) return null;
  const { data: prop } = await sb
    .from("properties")
    .select("host_id, name")
    .eq("id", propertyId)
    .maybeSingle();
  if (!prop || !(await receptionistAllowed(prop.host_id))) return null;
  return {
    propertyId,
    bookingId,
    phone,
    key,
    settings: s,
    hostId: prop.host_id as string,
    name: prop.name as string,
  };
}

/** Whether the receptionist is here, what it's called and how it says hello. */
export const receptionistHere = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ where }).parse(d))
  .handler(async ({ data }) => {
    const r = await resolve(data.where);
    if (!r) return null;
    const { greeting } = await import("./receptionist");
    let firstName: string | null = null;
    let directions: string[] | null = null;
    if (r.bookingId) {
      const sb = await db();
      const { data: b } = await sb
        .from("bookings")
        .select("guest_full_name, room_id, rooms(display_name, public_title)")
        .eq("id", r.bookingId)
        .maybeSingle();
      firstName = b?.guest_full_name ? String(b.guest_full_name).trim().split(/\s+/)[0]! : null;
      // The way to their room, from the host's floor plans (said after check-in on the tablet).
      if (b?.room_id && r.settings.topics.directions) {
        const { plansFor } = await import("./guest-extras.server");
        const { directionsTo } = await import("./floor-plans");
        directions =
          directionsTo(
            await plansFor(sb, r.propertyId),
            b.room_id,
            b.rooms?.public_title || b.rooms?.display_name || "Your room",
          )?.steps ?? null;
      }
    }
    const { hasStudioKey } = await import("./studio-voices.server");
    return {
      name: r.settings.name,
      voice: r.settings.voice,
      voiceMatch: r.settings.voiceMatch,
      greeting: greeting(r.settings, r.name, firstName),
      studio: await hasStudioKey(),
      directions,
    };
  });

/** One question, answered in a few sentences, with a part of the guide to open and the answer spoken. */
export const receptionistAsk = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        where,
        question: z.string().trim().min(1).max(600),
        history: z
          .array(z.object({ role: z.enum(["guest", "receptionist"]), text: z.string().max(1500) }))
          .max(20)
          .default([]),
        /** Speak it in the studio voice (voice mode). */
        speak: z.boolean().default(false),
        sex,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const r = await resolve(data.where);
    if (!r) throw new Error("The receptionist isn't available here.");
    const srv = await import("./receptionist.server");
    if (!srv.underLimit(r.key))
      return {
        reply: "One moment, please: ask me again in a minute.",
        open: null,
        audio: null,
        voice: r.settings.voice,
      };
    const k = await srv.knowledgeFor(r.propertyId, r.bookingId ? { bookingId: r.bookingId } : null);
    const answer = await srv.askModel(
      k,
      r.settings,
      r.phone ? "phone" : "tablet",
      data.question,
      data.history,
    );
    const { bumpUsage } = await import("./usage.server");
    await bumpUsage(r.hostId, "ai:receptionist");
    const { voiceForGuest } = await import("./receptionist");
    const voice = voiceForGuest(r.settings, data.sex);
    let audio: string | null = null;
    if (data.speak) {
      const { speakLive } = await import("./studio-voices.server");
      const bytes = await speakLive(answer.reply, voice);
      if (bytes) {
        audio = Buffer.from(bytes).toString("base64");
        await bumpUsage(r.hostId, "ai:receptionist_voice");
      }
    }
    return { ...answer, audio, voice };
  });

/** What the guest said, from a short recording (when the browser can't listen itself). */
export const receptionistListen = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        where,
        audio: z.string().min(100).max(2_500_000),
        mime: z.string().max(60),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const r = await resolve(data.where);
    if (!r) return { text: null };
    const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
    const { transcribeReply } = await import("./studio-voices.server");
    const text = await transcribeReply(bytes, data.mime.split(";")[0]!);
    const { bumpUsage } = await import("./usage.server");
    await bumpUsage(r.hostId, "ai:receptionist_listen");
    return { text };
  });

/* --------------------------------- host --------------------------------- */

export const getReceptionist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    const { data: p, error } = await (context.supabase as any)
      .from("properties")
      .select("receptionist")
      .eq("id", data.propertyId)
      .maybeSingle();
    const { normaliseReceptionist } = await import("./receptionist");
    const { receptionistAllowed } = await import("./receptionist.server");
    const { hasStudioKey } = await import("./studio-voices.server");
    return {
      available: !error,
      allowed: await receptionistAllowed(hostId),
      studio: await hasStudioKey(),
      settings: normaliseReceptionist(p?.receptionist),
    };
  });

export const saveReceptionist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, settings: z.record(z.string(), z.unknown()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireWrite(context.supabase, hostId);
    const { normaliseReceptionist } = await import("./receptionist");
    const settings = normaliseReceptionist(data.settings);
    if (settings.on) {
      const { receptionistAllowed } = await import("./receptionist.server");
      if (!(await receptionistAllowed(hostId)))
        throw new Error("The AI receptionist comes with the Pro plan.");
    }
    const { error } = await (context.supabase as any)
      .from("properties")
      .update({ receptionist: settings })
      .eq("id", data.propertyId);
    if (error)
      throw new Error(
        /receptionist/.test(error.message)
          ? "This needs the latest update (migration 0110)."
          : error.message,
      );
    return { ok: true, settings };
  });

/** The receptionist on one door tablet, or not. */
export const setKioskReceptionist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ deviceId: uuid, on: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await db();
    const { data: dev } = await sb
      .from("kiosk_devices")
      .select("id, property_id, properties(host_id, short_code)")
      .eq("id", data.deviceId)
      .maybeSingle();
    if (!dev) throw new Error("Tablet not found.");
    await requireWrite(context.supabase, dev.properties.host_id);
    const { error } = await sb
      .from("kiosk_devices")
      .update({ receptionist: data.on })
      .eq("id", dev.id);
    if (error) throw new Error("This needs the latest database update (migration 0110).");
    return { code: dev.properties.short_code as string };
  });
