/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * Server only: a property's quick tiles for a guest page, with short-lived
 * links to any photo or PDF on them, and a room's own cover photo. Both
 * columns come from migration 0041; before it, the automatic tiles and the
 * property's cover.
 */
import { normaliseTiles, type GuideTile } from "./guide-tiles";

type Loose = { from: (t: string) => any };

async function db(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

export type GuestTiles = { tiles: GuideTile[] | null; files: Record<string, string> };

export async function tilesForGuest(propertyId: string): Promise<GuestTiles> {
  const sb = await db();
  const { data, error } = await sb
    .from("properties")
    .select("guide_tiles")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) return { tiles: null, files: {} };
  const tiles = normaliseTiles(data?.guide_tiles);
  const paths = (tiles ?? []).flatMap((t) => (t.content?.path ? [t.content.path] : []));
  const files: Record<string, string> = {};
  if (paths.length) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await supabaseAdmin.storage
      .from("guides")
      .createSignedUrls(paths, 60 * 60 * 6);
    const byPath = new Map(
      (signed ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path!, s.signedUrl]),
    );
    for (const t of tiles ?? []) {
      const url = t.content?.path ? byPath.get(t.content.path) : undefined;
      if (url) files[t.id] = url;
    }
  }
  return { tiles, files };
}

export async function roomPhoto(roomId: string | null | undefined): Promise<string | null> {
  if (!roomId) return null;
  const { data, error } = await (
    await db()
  )
    .from("rooms")
    .select("cover_image_url")
    .eq("id", roomId)
    .maybeSingle();
  return error ? null : ((data?.cover_image_url as string | null) ?? null);
}
