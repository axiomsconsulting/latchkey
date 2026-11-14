/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * Server only: which starter guide sections a property's host didn't start
 * with (the super admin took them out for new hosts before this host signed
 * up). Rules in guide.ts (startersOffFor, normaliseStarters).
 */
import {
  normaliseStarters,
  starterNamesFor,
  startersOffFor,
  type BuiltInKey,
  type StarterName,
} from "./guide";

type Loose = { from: (t: string) => any };
async function db(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

type Settings = { removed: Record<string, string>; names: Record<string, StarterName[]> };
let cache: { at: number; settings: Settings } | null = null;

export async function starterSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < 60_000) return cache.settings;
  let settings: Settings = { removed: {}, names: {} };
  try {
    const { data, error } = await (
      await db()
    )
      .from("site_settings")
      .select("guide_starters")
      .eq("id", 1)
      .maybeSingle();
    if (!error) settings = normaliseStarters(data?.guide_starters);
  } catch {
    // Defaults.
  }
  cache = { at: Date.now(), settings };
  return settings;
}

export function forgetStarters() {
  cache = null;
}

/** For one property: starters its host didn't start with, and the names its host's starters have. */
export async function startersForProperty(
  propertyId: string,
): Promise<{ off: BuiltInKey[]; names: Record<string, { title: string; hint: string }> }> {
  const { removed, names } = await starterSettings();
  if (!Object.keys(removed).length && !Object.keys(names).length) return { off: [], names: {} };
  const { data } = await (
    await db()
  )
    .from("properties")
    .select("hosts(created_at)")
    .eq("id", propertyId)
    .maybeSingle();
  const created = (data?.hosts as { created_at?: string } | null)?.created_at ?? null;
  return { off: startersOffFor(removed, created), names: starterNamesFor(names, created) };
}

export async function startersOffForProperty(propertyId: string): Promise<BuiltInKey[]> {
  return (await startersForProperty(propertyId)).off;
}
