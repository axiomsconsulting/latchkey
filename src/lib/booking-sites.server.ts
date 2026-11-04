/* eslint-disable @typescript-eslint/no-explicit-any -- site_settings.booking_sites is from migration 0087, newer than the generated types */
/** Server only: Latchkey admin's booking sites. site_settings is only readable with the service role. */
import { normalisePlatformSites, type PlatformSites } from "./booking-sites";

export async function platformSites(): Promise<PlatformSites> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("site_settings")
    .select("booking_sites")
    .eq("id", 1)
    .maybeSingle();
  return normalisePlatformSites(error ? null : data?.booking_sites);
}
