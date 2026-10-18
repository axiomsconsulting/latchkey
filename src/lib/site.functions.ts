/**
 * The site a page is shown on: the brand (the super admin's white label, or a
 * host's name on their own domain) and, on a host's domain, which property
 * "/" opens. The super admin's brand settings live here too.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normaliseBrand, type Brand } from "@/lib/brand";

export type SiteContext = { brand: Brand; tenant: { name: string; shortCode: string | null } | null };

export const getSiteContext = createServerFn({ method: "GET" }).handler(async (): Promise<SiteContext> => {
  const { currentSite, platformBrand } = await import("./brand.server");
  const site = currentSite();
  return {
    brand: site?.brand ?? (await platformBrand()),
    tenant: site?.tenant ? { name: site.tenant.name, shortCode: site.tenant.shortCode } : null,
  };
});

type Loose = { from: (t: string) => any; rpc: (fn: string) => any };

async function requireSuperAdmin(supabase: unknown) {
  const { data } = await (supabase as Loose).rpc("is_super_admin");
  if (data !== true) throw new Error("Super admin only.");
}

/** Super admin: the white label as stored. */
export const getBrandSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { platformBrand } = await import("./brand.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as unknown as Loose).from("site_settings").select("brand").eq("id", 1).maybeSingle();
    return { available: !error, brand: await platformBrand() };
  });

export const saveBrandSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().max(40), tagline: z.string().max(120), footer: z.string().max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const brand = normaliseBrand(data);
    const { error } = await (context.supabase as unknown as Loose).from("site_settings").update({ brand, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error(error.message);
    const { forgetBrand } = await import("./brand.server");
    forgetBrand();
    return { ok: true, brand };
  });
