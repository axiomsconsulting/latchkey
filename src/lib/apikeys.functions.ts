/**
 * Hosts' API keys and their API access. Keys are shown once when made and
 * only a hash is kept; anyone who can make changes to the business can
 * make or revoke them.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { apiAllowance, apiAllowed, normaliseModel, planFor } from "@/lib/pricing-model";
import { requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();
type Loose = { from: (t: string) => any };
const loose = (c: unknown) => c as Loose;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function monthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export const getApiAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const [{ data: host, error }, { data: site }, { data: keys }, { data: usage }] = await Promise.all([
      loose(db).from("hosts").select("plan_key, api_addon").eq("id", data.hostId).maybeSingle(),
      loose(db).from("site_settings").select("pricing_model").eq("id", 1).maybeSingle(),
      loose(context.supabase)
        .from("api_keys")
        .select("id, name, prefix, scopes, created_at, last_used_at, revoked_at")
        .eq("host_id", data.hostId)
        .order("created_at", { ascending: false }),
      loose(db).from("usage_daily").select("count").eq("host_id", data.hostId).eq("metric", "api:request").gte("day", monthStart()),
    ]);
    if (error) return { available: false as const };
    const model = normaliseModel(site?.pricing_model);
    const plan = planFor(model, host?.plan_key);
    return {
      available: true as const,
      published: !!site?.pricing_model,
      planName: plan.name,
      allowed: apiAllowed(plan, host?.api_addon === true),
      allowance: apiAllowance(model, plan, host?.api_addon === true),
      used: ((usage ?? []) as Array<{ count: number }>).reduce((n, r) => n + Number(r.count), 0),
      included: plan.apiRequests > 0,
      addonPricePence: model.apiAddon.pricePence,
      addonRequests: model.apiAddon.includedRequests,
      currency: model.currency,
      keys: (keys ?? []) as Array<{ id: string; name: string; prefix: string; scopes: string[]; created_at: string; last_used_at: string | null; revoked_at: string | null }>,
    };
  });

/** Makes a key. The full key is returned this once and never again. */
export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, name: z.string().trim().min(1).max(60), write: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireWrite(context.supabase, data.hostId);
    const { randomBytes } = await import("crypto");
    const { hashKey } = await import("./api-handlers.server");
    const key = `lk_${randomBytes(30).toString("base64url").replace(/-/g, "x")}`;
    const db = await admin();
    const { error } = await loose(db)
      .from("api_keys")
      .insert({
        host_id: data.hostId,
        name: data.name,
        prefix: key.slice(0, 11),
        key_hash: hashKey(key),
        scopes: data.write ? ["read", "write"] : ["read"],
        created_by: context.userId,
      });
    if (error) throw new Error("We couldn't make that key. Please try again.");
    return { key };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, keyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, data.hostId);
    const db = await admin();
    await loose(db).from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", data.keyId).eq("host_id", data.hostId);
    return { ok: true };
  });
