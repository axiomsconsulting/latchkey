/**
 * Host guide editor: house sections, room overrides, photos, basic/detailed
 * per room, starter text, and private guide links for bookings.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { hostOfProperty, requireWrite } from "@/lib/roles";
import { SECTIONS, STARTER, guideWindow, isCustom, type SectionKey } from "./guide";
import { rebrand } from "@/lib/brand";

const uuid = z.string().uuid();
// Built-in sections, or the host's own (custom_ + a random id).
const sectionKey = z
  .string()
  .refine((k) => SECTIONS.some((s) => s.key === k) || isCustom(k), "Unknown section")
  .transform((k) => k as SectionKey);

async function signPaths(paths: string[], seconds = 60 * 60 * 6): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.from("guides").createSignedUrls(paths, seconds);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

export const getGuideEditor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: rooms }, { data: guides }] = await Promise.all([
      supabase.from("rooms").select("id, display_name, guide_mode, amenities").eq("property_id", data.propertyId).order("sort_order"),
      supabase
        .from("guides")
        .select("id, room_id, section_key, title, published, summary, is_starter, pinned, sort_order, guide_steps(id, heading, body, image_url, sort_order)")
        .eq("property_id", data.propertyId)
        .not("section_key", "is", null),
    ]);
    const paths = (guides ?? []).flatMap((g) => (g.guide_steps ?? []).map((s) => s.image_url).filter((p): p is string => !!p));
    const signed = await signPaths(paths);
    const { startersOffForProperty } = await import("./guide-starters.server");
    return {
      /** Starter sections this host didn't start with (they can still add them). */
      startersOff: await startersOffForProperty(data.propertyId),
      rooms: rooms ?? [],
      sections: (guides ?? []).map((g) => ({
        roomId: g.room_id,
        sectionKey: g.section_key as SectionKey,
        title: g.title as string,
        published: g.published !== false,
        summary: g.summary,
        isStarter: g.is_starter,
        pinned: g.pinned === true,
        sortOrder: g.sort_order ?? 0,
        steps: [...(g.guide_steps ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => ({ heading: s.heading, body: s.body, imagePath: s.image_url, imageUrl: s.image_url ? (signed[s.image_url] ?? null) : null })),
      })),
    };
  });

/**
 * Pinning and ordering live on the house row for a section, so the reminder
 * card and the running order are the same for every room.
 */
async function houseRow(supabase: any, propertyId: string, key: SectionKey): Promise<string> {
  const { data: existing } = await supabase
    .from("guides")
    .select("id")
    .eq("property_id", propertyId)
    .eq("section_key", key)
    .is("room_id", null)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const builtIn = SECTIONS.find((s) => s.key === key);
  if (!builtIn) throw new Error("That section no longer exists. Refresh and try again.");
  const title = builtIn.title;
  const { data: row, error } = await supabase
    .from("guides")
    .insert({ property_id: propertyId, room_id: null, section_key: key, title, published: true })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return row.id as string;
}

/** Pins or unpins a section on the "things people usually forget" card. */
export const setSectionPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, sectionKey, pinned: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await houseRow(context.supabase, data.propertyId, data.sectionKey);
    const { error } = await context.supabase.from("guides").update({ pinned: data.pinned }).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Saves the host's running order for the whole guide, in one go. */
export const reorderSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, order: z.array(sectionKey).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    for (let i = 0; i < data.order.length; i++) {
      const id = await houseRow(context.supabase, data.propertyId, data.order[i]!);
      const { error } = await context.supabase.from("guides").update({ sort_order: i + 1 }).eq("id", id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const saveGuideSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        roomId: uuid.nullable().default(null),
        sectionKey,
        summary: z.string().max(500).nullable().default(null),
        steps: z
          .array(z.object({ heading: z.string().max(120), body: z.string().max(2000).nullable().default(null), imagePath: z.string().max(300).nullable().default(null) }))
          .max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let title = SECTIONS.find((s) => s.key === data.sectionKey)?.title ?? "";
    if (!title) {
      // The host's own section: its title lives on the whole-property row.
      const { data: houseRowData } = await supabase.from("guides").select("title").eq("property_id", data.propertyId).eq("section_key", data.sectionKey).is("room_id", null).maybeSingle();
      if (!houseRowData) throw new Error("That section no longer exists. Refresh and try again.");
      title = houseRowData.title;
    }
    // Only allow photo paths inside this property's folder.
    for (const s of data.steps) if (s.imagePath && !s.imagePath.startsWith(`${data.propertyId}/`)) throw new Error("Invalid photo.");

    let q = supabase.from("guides").select("id").eq("property_id", data.propertyId).eq("section_key", data.sectionKey);
    q = data.roomId ? q.eq("room_id", data.roomId) : q.is("room_id", null);
    const { data: existing } = await q.maybeSingle();

    let guideId = existing?.id;
    if (guideId) {
      const { error } = await supabase
        .from("guides")
        .update({ summary: data.summary, is_starter: false, updated_at: new Date().toISOString() })
        .eq("id", guideId);
      if (error) throw new Error(error.message);
      await supabase.from("guide_steps").delete().eq("guide_id", guideId);
    } else {
      const { data: row, error } = await supabase
        .from("guides")
        .insert({ property_id: data.propertyId, room_id: data.roomId, section_key: data.sectionKey, title, summary: data.summary, published: true })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      guideId = row.id;
    }
    const steps = data.steps.filter((s) => s.heading.trim() || s.body?.trim() || s.imagePath);
    if (steps.length) {
      const { error } = await supabase.from("guide_steps").insert(
        steps.map((s, i) => ({ guide_id: guideId!, heading: s.heading.trim(), body: s.body?.trim() || null, image_url: s.imagePath, sort_order: i })),
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Removes a room's own version so it falls back to the house section. */
export const removeRoomSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, roomId: uuid, sectionKey }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("guides")
      .delete()
      .eq("property_id", data.propertyId)
      .eq("room_id", data.roomId)
      .eq("section_key", data.sectionKey);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const uploadGuidePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, dataUrl: z.string().max(7_000_000).regex(/^data:image\/(jpeg|png|webp);base64,/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const { data: prop } = await context.supabase.from("properties").select("id, host_id").eq("id", data.propertyId).maybeSingle();
    if (!prop) throw new Error("Property not found.");
    await requireWrite(context.supabase, prop.host_id);
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(data.dataUrl)!;
    const bytes = Buffer.from(m[2]!, "base64");
    if (bytes.length > 5 * 1024 * 1024) throw new Error("Photos must be under 5 MB.");
    const ext = m[1] === "jpeg" ? "jpg" : m[1]!;
    const path = `${data.propertyId}/${crypto.randomUUID()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up = await supabaseAdmin.storage.from("guides").upload(path, bytes, { contentType: `image/${m[1]}` });
    if (up.error) throw new Error(up.error.message);
    const signed = await signPaths([path], 60 * 5);
    return { path, url: signed[path] ?? null };
  });

export const setRoomGuideMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ roomId: uuid, mode: z.enum(["basic", "detailed"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("rooms").update({ guide_mode: data.mode }).eq("id", data.roomId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Adds starter text to any empty house section. Never overwrites. */
export const addStarterGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("guides")
      .select("section_key")
      .eq("property_id", data.propertyId)
      .is("room_id", null)
      .not("section_key", "is", null);
    const have = new Set((existing ?? []).map((g) => g.section_key));
    let added = 0;
    for (const s of SECTIONS) {
      if (have.has(s.key)) continue;
      const st = STARTER[s.key];
      if (!st.summary && st.steps.length === 0) continue;
      const { data: g, error } = await supabase
        .from("guides")
        .insert({ property_id: data.propertyId, room_id: null, section_key: s.key, title: s.title, summary: st.summary || null, is_starter: true, published: true })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      if (st.steps.length) {
        await supabase.from("guide_steps").insert(st.steps.map((x, i) => ({ guide_id: g.id, heading: x.heading, body: x.body, sort_order: i })));
      }
      added++;
    }
    return { added };
  });

/** Creates a fresh private guide link for a booking (arrival day → check-out). */
export const createGuideLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS: only staff of this booking's host can read it.
    const { data: b } = await context.supabase
      .from("bookings")
      .select("id, property_id, check_in_date, check_out_date, check_out_time, status, properties(timezone, default_check_out_time)")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!b) throw new Error("Booking not found.");
    // Viewers can read bookings, but minting a guest link is a write.
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, b.property_id));
    if (b.status === "cancelled" || b.status === "blocked") throw new Error("This booking has no guest.");
    const p = (b as any).properties ?? {};
    const tz = p.timezone ?? "Europe/London";
    const w = guideWindow(b.check_in_date, b.check_out_date, (b.check_out_time ?? p.default_check_out_time ?? "11:00").slice(0, 5), tz);
    if (w.expiresAt.getTime() < Date.now()) throw new Error("This stay has already ended.");
    const { admin, newToken } = await import("./checkin.server");
    const db = await admin();
    const t = newToken();
    const { error } = await db.from("stay_tokens").insert({
      token_hash: t.hash,
      booking_id: b.id,
      valid_from: w.validFrom.toISOString(),
      expires_at: w.expiresAt.toISOString(),
    });
    if (error) throw new Error("Couldn't create the link.");
    return { token: t.token, validFrom: w.validFrom.toISOString() };
  });

/** What's already in a room, so guests don't ask for a kettle that's there. */
export const saveRoomAmenities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ roomId: uuid, amenities: z.array(z.string().trim().min(1).max(60)).max(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("rooms").update({ amenities: data.amenities }).eq("id", data.roomId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------------------- in-room guides ----------------------------- */

const roomCode = z.string().regex(/^[a-z0-9]{10,24}$/);

function newRoomCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Each room's own QR code. Codes are made the first time the host asks, and
 * then stay the same, so a printed sign keeps working.
 */
export const getRoomGuideCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rooms, error } = await (context.supabase as any)
      .from("rooms")
      .select("id, display_name, public_title, guide_code, active")
      .eq("property_id", data.propertyId)
      .order("sort_order");
    if (error) return { available: false as const, rooms: [] as Array<{ id: string; name: string; code: string | null }> };
    const list = (rooms ?? []) as Array<{ id: string; display_name: string; public_title: string | null; guide_code: string | null; active: boolean }>;
    const missing = list.filter((r) => !r.guide_code);
    if (missing.length) {
      // Only people who can change the property make codes; viewers just see what's there.
      try {
        await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
        for (const r of missing) {
          const code = newRoomCode();
          const { error: e } = await (context.supabase as any).from("rooms").update({ guide_code: code }).eq("id", r.id).is("guide_code", null);
          if (!e) r.guide_code = code;
        }
      } catch {
        // Read-only: leave them for someone who can.
      }
    }
    return {
      available: true as const,
      rooms: list.filter((r) => r.active !== false).map((r) => ({ id: r.id, name: r.display_name, code: r.guide_code })),
    };
  });

/**
 * The guide behind a room's QR code: that room's sections (its own, or the
 * house's), wifi, today's closed times and the reminder card. Never the door
 * instructions: the code is printed in the room, so anyone could photograph it.
 */
export const getRoomGuide = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ code: roomCode }).parse(d))
  .handler(async ({ data }) => {
    const { admin } = await import("./checkin.server");
    const db = (await admin()) as any;
    const { data: room, error } = await db
      .from("rooms")
      .select("id, property_id, display_name, public_title, guide_mode, amenities, active")
      .eq("guide_code", data.code)
      .maybeSingle();
    if (error || !room || room.active === false) return { found: false as const };
    const [{ data: p }, { data: guides }, { data: windows }] = await Promise.all([
      db
        .from("properties")
        .select("id, host_id, is_demo, name, short_code, timezone, default_check_out_time, quiet_hours_start, quiet_hours_end, wifi_name, wifi_password, parking_notes, host_contact_name, host_contact_phone, theme_config, active")
        .eq("id", room.property_id)
        .single(),
      db
        .from("guides")
        .select("room_id, section_key, title, summary, published, pinned, sort_order, guide_steps(heading, body, image_url, sort_order)")
        .eq("property_id", room.property_id)
        // Removed sections come too, so they stay out even where Latchkey could fill them in.
        .not("section_key", "is", null),
      db.from("unavailability_windows").select("room_id, reason, starts_at, ends_at, day_of_week, start_time, end_time").eq("property_id", room.property_id),
    ]);
    if (!p || p.active === false) return { found: false as const };

    const { buildGuide, forgetCard, weeklyLines, windowsOn, DOOR_SECTIONS } = await import("./guide");
    const { normaliseTheme } = await import("./theme");
    const tz = p.timezone ?? "Europe/London";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const mode = (room.guide_mode === "basic" ? "basic" : "detailed") as "basic" | "detailed";
    const paths =
      mode === "detailed"
        ? ((guides ?? []) as any[]).flatMap((g) => (g.guide_steps ?? []).map((s: any) => s.image_url).filter((x: string | null): x is string => !!x))
        : [];
    const signed = await signPaths(paths);
    const stored = ((guides ?? []) as any[]).map((g) => ({
      roomId: g.room_id,
      sectionKey: g.section_key as SectionKey,
      summary: g.summary,
      pinned: g.pinned === true,
      sortOrder: g.sort_order ?? 0,
      title: g.title,
      published: g.published !== false,
      steps: [...(g.guide_steps ?? [])]
        .sort((a: any, c: any) => a.sort_order - c.sort_order)
        .map((s: any) => ({ heading: s.heading, body: s.body, imageUrl: s.image_url ? (signed[s.image_url] ?? null) : null })),
    }));
    const facts = {
      wifiName: p.wifi_name ?? null,
      wifiPassword: p.wifi_password ?? null,
      quietStart: (p.quiet_hours_start ?? "22:00").slice(0, 5),
      quietEnd: (p.quiet_hours_end ?? "07:00").slice(0, 5),
      checkOutTime: (p.default_check_out_time ?? "11:00").slice(0, 5),
      checkOutDateLabel: "your last day",
      parkingNotes: p.parking_notes ?? null,
      hostName: p.host_contact_name ?? null,
      hostPhone: p.host_contact_phone ?? null,
      roomName: room.display_name ?? null,
      unavailableLines: weeklyLines(windows ?? [], room.id),
    };
    const { startersOffForProperty } = await import("./guide-starters.server");
    const { attachmentsFor } = await import("./attachments.server");
    const { tilesForGuest, roomPhoto } = await import("./guide-tiles.server");
    const [off, files, { count: here }, tiles, photo] = await Promise.all([
      startersOffForProperty(p.id),
      attachmentsFor(p.id).catch(() => ({}) as Record<string, never>),
      // Someone has already checked in to this room today: no check-in invite (no guest details leave).
      db
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("room_id", room.id)
        .eq("status", "checked_in")
        .lte("check_in_date", today)
        .gte("check_out_date", today)
        .is("mirror_of", null),
      tilesForGuest(p.id),
      roomPhoto(room.id),
    ]);
    const sections = buildGuide(stored, room.id, mode, facts, off, Object.keys(files))
      .filter((sec) => !DOOR_SECTIONS.includes(sec.key))
      .map((sec) => ({ ...sec, attachments: (files as Record<string, import("./attachments.server").GuestAttachment[]>)[sec.key] ?? [] }));
    const forget = forgetCard(sections, windowsOn(windows ?? [], room.id, today, tz));
    const reminded = new Set(forget.map((i) => i.key));
    return {
      found: true as const,
      propertyId: p.id as string,
      propertyName: p.name as string,
      shortCode: p.short_code as string,
      occupied: (here ?? 0) > 0,
      demoCode: p.is_demo === true ? (p.short_code as string) : null,
      tiles,
      roomPhoto: photo,
      room: { name: room.display_name as string, title: (room.public_title as string | null) ?? null },
      wifi: p.wifi_name ? { name: p.wifi_name as string, password: (p.wifi_password as string | null) ?? null } : null,
      amenities: Array.isArray(room.amenities) ? (room.amenities as unknown[]).filter((a): a is string => typeof a === "string") : [],
      theme: await (await import("./group-brand.server")).withGroup(normaliseTheme(p.theme_config), p.host_id, p.name ?? ""),
      forget,
      guide: sections.filter((sec) => !reminded.has(sec.key)),
    };
  });

/* ------------------------- adding and removing ------------------------- */

/**
 * Adds a section to the guide: one of Latchkey's that was removed (back
 * where it was), or the host's own, at the end, with their title.
 */
export const addGuideSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ propertyId: uuid, sectionKey: sectionKey.optional(), title: z.string().trim().min(1).max(80).optional() })
      .refine((v) => v.sectionKey || v.title, "Choose a section or give yours a name")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const sb = context.supabase as any;
    if (data.sectionKey && !isCustom(data.sectionKey)) {
      const id = await houseRow(sb, data.propertyId, data.sectionKey);
      const { error } = await sb.from("guides").update({ published: true }).eq("id", id);
      if (error) throw new Error(error.message);
      return { key: data.sectionKey };
    }
    const { data: last } = await sb.from("guides").select("sort_order").eq("property_id", data.propertyId).is("room_id", null).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const key = `custom_${[...crypto.getRandomValues(new Uint8Array(8))].map((b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("")}`;
    const { error } = await sb
      .from("guides")
      .insert({ property_id: data.propertyId, room_id: null, section_key: key, title: data.title, published: true, sort_order: Math.max(100 + SECTIONS.length, (last?.sort_order ?? 0) + 1) });
    if (error) throw new Error(error.message);
    return { key };
  });

/**
 * Takes a section out of the guide. Latchkey's own sections are hidden (and
 * can be added back); the host's own sections are deleted with their steps.
 */
export const removeGuideSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, sectionKey }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const sb = context.supabase as any;
    // The section's photos and documents go with it, from the host's folder too.
    const { deleteAttachments } = await import("./attachments.server");
    await deleteAttachments(data.propertyId, data.sectionKey).catch(() => undefined);
    if (isCustom(data.sectionKey)) {
      const { error } = await sb.from("guides").delete().eq("property_id", data.propertyId).eq("section_key", data.sectionKey);
      if (error) throw new Error(error.message);
      return { deleted: true };
    }
    const id = await houseRow(sb, data.propertyId, data.sectionKey);
    const { error } = await sb.from("guides").update({ published: false, pinned: false }).eq("id", id);
    if (error) throw new Error(error.message);
    return { deleted: false };
  });

/** Renames one of the host's own sections. */
export const renameGuideSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, sectionKey, title: z.string().trim().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!isCustom(data.sectionKey)) throw new Error(rebrand("Latchkey's own sections keep their names."));
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const { error } = await (context.supabase as any).from("guides").update({ title: data.title }).eq("property_id", data.propertyId).eq("section_key", data.sectionKey);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
