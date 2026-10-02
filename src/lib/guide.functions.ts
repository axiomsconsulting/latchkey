/**
 * Host guide editor: house sections, room overrides, photos, basic/detailed
 * per room, starter text, and private guide links for bookings.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SECTIONS, STARTER, guideWindow, type SectionKey } from "./guide";

const uuid = z.string().uuid();
const sectionKey = z.enum(SECTIONS.map((s) => s.key) as [SectionKey, ...SectionKey[]]);

async function signPaths(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.from("guides").createSignedUrls(paths, 60 * 60 * 6);
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
        .select("id, room_id, section_key, summary, is_starter, pinned, sort_order, guide_steps(id, heading, body, image_url, sort_order)")
        .eq("property_id", data.propertyId)
        .not("section_key", "is", null),
    ]);
    const paths = (guides ?? []).flatMap((g) => (g.guide_steps ?? []).map((s) => s.image_url).filter((p): p is string => !!p));
    const signed = await signPaths(paths);
    return {
      rooms: rooms ?? [],
      sections: (guides ?? []).map((g) => ({
        roomId: g.room_id,
        sectionKey: g.section_key as SectionKey,
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
  const title = SECTIONS.find((s) => s.key === key)!.title;
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
    const title = SECTIONS.find((s) => s.key === data.sectionKey)!.title;
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
    const { data: prop } = await context.supabase.from("properties").select("id, host_id").eq("id", data.propertyId).maybeSingle();
    if (!prop) throw new Error("Property not found.");
    const { data: canEdit } = await context.supabase.rpc("is_host_member", { _host_id: prop.host_id });
    if (!canEdit) throw new Error("Only owners and co-hosts can upload files.");
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(data.dataUrl)!;
    const bytes = Buffer.from(m[2]!, "base64");
    if (bytes.length > 5 * 1024 * 1024) throw new Error("Photos must be under 5 MB.");
    const ext = m[1] === "jpeg" ? "jpg" : m[1]!;
    const path = `${data.propertyId}/${crypto.randomUUID()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up = await supabaseAdmin.storage.from("guides").upload(path, bytes, { contentType: `image/${m[1]}` });
    if (up.error) throw new Error(up.error.message);
    const signed = await signPaths([path]);
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
      .select("id, check_in_date, check_out_date, check_out_time, status, properties(timezone, default_check_out_time)")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!b) throw new Error("Booking not found.");
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
