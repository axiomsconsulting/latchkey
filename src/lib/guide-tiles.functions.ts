/**
 * Stay guides → Quick tiles and room photos: the host chooses up to eight
 * tiles (src/lib/guide-tiles.ts) and a cover photo for each room's guide.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { requireWrite } from "@/lib/roles";
import { MAX_TILES, normaliseTiles } from "./guide-tiles";

const uuid = z.string().uuid();
type Loose = { from: (t: string) => any };

async function hostFor(supabase: unknown, propertyId: string): Promise<string> {
  const { data: prop } = await (supabase as Loose).from("properties").select("id, host_id").eq("id", propertyId).maybeSingle();
  if (!prop) throw new Error("Property not found.");
  return prop.host_id as string;
}

export const getGuideTiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const [{ data: p, error }, { data: rooms, error: roomsError }] = await Promise.all([
      sb.from("properties").select("guide_tiles").eq("id", data.propertyId).maybeSingle(),
      sb.from("rooms").select("id, display_name, cover_image_url").eq("property_id", data.propertyId).order("sort_order"),
    ]);
    const tiles = error ? null : normaliseTiles(p?.guide_tiles);
    // Photos and PDFs on the host's own tiles, so the editor can show them.
    const paths = (tiles ?? []).flatMap((t) => (t.content?.path ? [t.content.path] : []));
    const files: Record<string, string> = {};
    if (paths.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed } = await supabaseAdmin.storage.from("guides").createSignedUrls(paths, 60 * 5);
      for (const s of signed ?? []) if (s.path && s.signedUrl) files[s.path] = s.signedUrl;
    }
    const roomPhotos: Record<string, string | null> = {};
    for (const r of (roomsError ? [] : (rooms ?? [])) as Array<{ id: string; cover_image_url: string | null }>) roomPhotos[r.id] = r.cover_image_url;
    // Before migration 0041 nothing can be saved yet.
    return { available: !error && !roomsError, tiles, files, roomPhotos };
  });

const content = z
  .object({ type: z.enum(["text", "link", "image", "doc"]), body: z.string().max(4000).optional(), url: z.string().max(2000).optional(), path: z.string().max(200).optional(), name: z.string().max(120).optional() })
  .optional();

export const saveGuideTiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        // null = back to the automatic tiles.
        tiles: z
          .array(z.object({ id: z.string().max(40), kind: z.string().max(20), section: z.string().max(60).optional(), title: z.string().max(40).optional(), icon: z.string().max(40).optional(), content }))
          .max(MAX_TILES)
          .nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireWrite(context.supabase, await hostFor(context.supabase, data.propertyId));
    const tiles = data.tiles === null ? null : normaliseTiles(data.tiles);
    // A file can only be one this property uploaded.
    if (tiles?.some((t) => t.content?.path && !t.content.path.startsWith(`${data.propertyId}/`))) throw new Error("That file belongs to another property.");
    const { error } = await (context.supabase as unknown as Loose).from("properties").update({ guide_tiles: tiles }).eq("id", data.propertyId);
    if (error) throw new Error(error.message);
    return { ok: true, tiles };
  });

/** A photo or PDF for a tile, kept private in the "guides" bucket and shown through short-lived links. */
export const uploadTileFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, filename: z.string().max(120), dataUrl: z.string().max(11_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireWrite(context.supabase, await hostFor(context.supabase, data.propertyId));
    const m = /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,(.+)$/.exec(data.dataUrl);
    if (!m) throw new Error("Please choose a photo (JPG, PNG, WebP) or a PDF.");
    const bytes = Buffer.from(m[2]!, "base64");
    if (bytes.length > 8 * 1024 * 1024) throw new Error("Files must be under 8 MB.");
    const ext = m[1] === "application/pdf" ? "pdf" : m[1] === "image/jpeg" ? "jpg" : m[1]!.slice(6);
    const path = `${data.propertyId}/tiles/${crypto.randomUUID()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up = await supabaseAdmin.storage.from("guides").upload(path, bytes, { contentType: m[1]! });
    if (up.error) throw new Error(up.error.message);
    const { data: signed } = await supabaseAdmin.storage.from("guides").createSignedUrl(path, 60 * 60);
    const name = data.filename.replace(/[^\w .()-]/g, "").slice(0, 120) || `file.${ext}`;
    return { path, name, url: signed?.signedUrl ?? null, type: ext === "pdf" ? ("doc" as const) : ("image" as const) };
  });

/** A room guide's own cover photo; null goes back to the property's cover. */
export const saveRoomPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ roomId: uuid, dataUrl: z.string().max(7_000_000).regex(/^data:image\/(jpeg|png|webp);base64,/).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const sb = context.supabase as unknown as Loose;
    const { data: room } = await sb.from("rooms").select("id, property_id").eq("id", data.roomId).maybeSingle();
    if (!room) throw new Error("Room not found.");
    await requireWrite(context.supabase, await hostFor(context.supabase, room.property_id));
    let url: string | null = null;
    if (data.dataUrl) {
      const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(data.dataUrl)!;
      const bytes = Buffer.from(m[2]!, "base64");
      if (bytes.length > 5 * 1024 * 1024) throw new Error("Photos must be under 5 MB.");
      const path = `${room.property_id}/room-${room.id}-${Date.now()}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Same home as the property's cover photo: a long-lived link, like the theme's.
      const up = await supabaseAdmin.storage.from("branding").upload(path, bytes, { contentType: `image/${m[1]}`, upsert: true });
      if (up.error) throw new Error(up.error.message);
      const signed = await supabaseAdmin.storage.from("branding").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signed.error) throw new Error(signed.error.message);
      url = signed.data.signedUrl;
    }
    const { error } = await sb.from("rooms").update({ cover_image_url: url }).eq("id", data.roomId);
    if (error) throw new Error(error.message);
    return { ok: true, url };
  });
