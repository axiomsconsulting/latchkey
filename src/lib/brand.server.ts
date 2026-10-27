/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * Server only: which brand a request is shown under. The platform's own
 * (site_settings.brand, set by the super admin), or, on a host's own domain
 * (host_domains, live), that host's business name. Each request keeps its
 * own in AsyncLocalStorage, so concurrent requests never mix.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import { normaliseBrand, setBrandResolver, type Brand } from "./brand";

export type Tenant = { domain: string; hostId: string; name: string; shortCode: string | null };
type Site = { brand: Brand; platform: Brand; tenant: Tenant | null };

const store = new AsyncLocalStorage<Site>();
setBrandResolver(() => store.getStore()?.brand);

type Loose = { from: (t: string) => any };
async function db(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

const TTL = 60_000;
let platformCache: { at: number; brand: Brand } | null = null;
let uiCache: { at: number; ui: unknown } | null = null;
let artCache: { at: number; art: unknown } | null = null;

/** The home page's pictures (site_settings.home_art, migration 0058; null = defaults), re-read at most once a minute. */
export async function platformHomeArt(): Promise<unknown> {
  if (artCache && Date.now() - artCache.at < TTL) return artCache.art;
  let art: unknown = null;
  try {
    const { data, error } = await (
      await db()
    )
      .from("site_settings")
      .select("home_art")
      .eq("id", 1)
      .maybeSingle();
    if (!error) art = data?.home_art ?? null;
  } catch {
    art = null;
  }
  artCache = { at: Date.now(), art };
  return art;
}

/** The super admin's menu and page layouts (site_settings.ui), re-read at most once a minute. */
export async function platformUi(): Promise<unknown> {
  if (uiCache && Date.now() - uiCache.at < TTL) return uiCache.ui;
  let ui: unknown = null;
  try {
    const { data, error } = await (
      await db()
    )
      .from("site_settings")
      .select("ui")
      .eq("id", 1)
      .maybeSingle();
    if (!error) ui = data?.ui ?? null;
  } catch {
    ui = null;
  }
  uiCache = { at: Date.now(), ui };
  return ui;
}
const tenantCache = new Map<string, { at: number; tenant: Tenant | null }>();

/** The super admin's white label, re-read at most once a minute. */
export async function platformBrand(): Promise<Brand> {
  if (platformCache && Date.now() - platformCache.at < TTL) return platformCache.brand;
  let brand = normaliseBrand(null);
  try {
    const { data, error } = await (
      await db()
    )
      .from("site_settings")
      .select("brand")
      .eq("id", 1)
      .maybeSingle();
    if (!error) brand = normaliseBrand(data?.brand);
  } catch {
    // Before migration 0038, or offline: the default name.
  }
  platformCache = { at: Date.now(), brand };
  return brand;
}

/** Forget the cached brand (after the super admin saves it). */
export function forgetBrand() {
  platformCache = null;
  uiCache = null;
  artCache = null;
  tenantCache.clear();
}

/** The host whose live custom domain this is, if any. */
export async function tenantFor(hostname: string | null | undefined): Promise<Tenant | null> {
  const domain = (hostname ?? "").toLowerCase().replace(/:\d+$/, "");
  if (!domain) return null;
  const hit = tenantCache.get(domain);
  if (hit && Date.now() - hit.at < TTL) return hit.tenant;
  let tenant: Tenant | null = null;
  try {
    const sb = await db();
    const { data } = await sb
      .from("host_domains")
      .select(
        "domain, host_id, property_id, live_at, verified_at, hosts(business_name), properties(short_code)",
      )
      .eq("domain", domain)
      .maybeSingle();
    if (data?.live_at && data?.verified_at) {
      let shortCode = (data.properties?.short_code as string | undefined) ?? null;
      if (!shortCode) {
        const { data: p } = await sb
          .from("properties")
          .select("short_code")
          .eq("host_id", data.host_id)
          .eq("active", true)
          .order("created_at")
          .limit(1)
          .maybeSingle();
        shortCode = (p?.short_code as string | undefined) ?? null;
      }
      tenant = {
        domain,
        hostId: data.host_id,
        name: (data.hosts?.business_name as string | undefined) || "",
        shortCode,
      };
    }
  } catch {
    // No table yet: no custom domains.
  }
  tenantCache.set(domain, { at: Date.now(), tenant });
  return tenant;
}

/** Works out the brand for this request, then runs it under that brand. */
export async function withSiteBrand<T>(request: Request, run: () => T | Promise<T>): Promise<T> {
  const platform = await platformBrand();
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host;
  const tenant = await tenantFor(host);
  const brand = tenant?.name
    ? {
        ...platform,
        name: tenant.name,
        logoMark: "initial" as const,
        logoUrl: "",
        tagline: "",
        footer: `© ${new Date().getFullYear()} ${tenant.name}`,
      }
    : platform;
  return store.run({ brand, platform, tenant }, async () => run());
}

/** The site this request is for: its brand, and the host's domain if it's one. */
export function currentSite(): Site | undefined {
  return store.getStore();
}
