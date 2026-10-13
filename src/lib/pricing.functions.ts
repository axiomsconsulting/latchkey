import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_PRICING, type PricingConfig } from "./pricing";

const COLS = "base_pence, extra_room_pence, extra_property_pence, trial_days, currency";

export const getPricing = createServerFn({ method: "GET" }).handler(async (): Promise<PricingConfig> => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  const url = process.env["SUPABASE_URL"];
  if (!key || !url) return DEFAULT_PRICING;
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data } = await (db as any).from("platform_pricing").select(COLS).eq("id", 1).maybeSingle();
  return (data as PricingConfig | null) ?? DEFAULT_PRICING;
});

/** The backend's admin role, or the Latchkey super admin by email. */
async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const [{ data: role }, { data: superAdmin }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("is_super_admin"),
  ]);
  return role === true || superAdmin === true;
}

export const getAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return { isAdmin: await isAdmin(context.supabase, context.userId) };
  });

export const savePricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        base_pence: z.number().int().min(0).max(100000),
        extra_room_pence: z.number().int().min(0).max(100000),
        extra_property_pence: z.number().int().min(0).max(100000),
        trial_days: z.number().int().min(0).max(365),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    if (!(await isAdmin(sb, context.userId))) throw new Error("Only a super admin can change pricing.");
    const { error } = await sb.from("platform_pricing").update({ ...data, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
