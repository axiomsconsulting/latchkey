/**
 * Server only: which starter guide sections a property's host didn't start
 * with (the super admin took them out for new hosts before this host signed
 * up). Rules in guide.ts (startersOffFor, normaliseStarters).
 */
import { normaliseStarters, startersOffFor, type BuiltInKey } from "./guide";

type Loose = { from: (t: string) => any };
async function db(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

let cache: { at: number; removed: Record<string, string> } | null = null;

export async function starterSettings(): Promise<{ removed: Record<string, string> }> {
  if (cache && Date.now() - cache.at < 60_000) return { removed: cache.removed };
  let removed: Record<string, string> = {};
  try {
    const { data, error } = await (await db()).from("site_settings").select("guide_starters").eq("id", 1).maybeSingle();
    if (!error) removed = normaliseStarters(data?.guide_starters).removed;
  } catch {
    removed = {};
  }
  cache = { at: Date.now(), removed };
  return { removed };
}

export function forgetStarters() {
  cache = null;
}

export async function startersOffForProperty(propertyId: string): Promise<BuiltInKey[]> {
  const { removed } = await starterSettings();
  if (!Object.keys(removed).length) return [];
  const { data } = await (await db()).from("properties").select("hosts(created_at)").eq("id", propertyId).maybeSingle();
  return startersOffFor(removed, (data?.hosts as { created_at?: string } | null)?.created_at ?? null);
}
