/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * Server only: a property's look with its group applied (src/lib/group-brand.ts),
 * for guest pages. Before migration 0048 there is no group brand: the theme
 * is returned as it is.
 */
import type { ThemeConfig } from "./theme";
import { applyGroup, normaliseGroupBrand, type GroupLine } from "./group-brand";

export async function withGroup<T extends ThemeConfig>(
  theme: T,
  hostId: string | null | undefined,
  propertyName: string,
): Promise<T & { group?: GroupLine }> {
  if (!hostId) return theme;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as { from: (t: string) => any })
      .from("hosts")
      .select("business_name, group_brand")
      .eq("id", hostId)
      .maybeSingle();
    if (error || !data) return theme;
    return applyGroup(theme, normaliseGroupBrand(data.group_brand), {
      name: (data.business_name as string | null) ?? "",
      propertyName,
    });
  } catch {
    return theme;
  }
}
