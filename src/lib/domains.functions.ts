/**
 * Hosts' own domains for their guests (host_domains, migration 0038). The
 * owner adds one and proves it's theirs with a DNS TXT record; the super
 * admin then connects it on the hosting and switches it live. Rules in
 * domains.ts; requests on a live domain are served under the host's name
 * (brand.server.ts).
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { isPlatformDomain, normaliseDomain, txtMatches, verifyRecord } from "@/lib/domains";
import { requireOwner } from "@/lib/roles";

const uuid = z.string().uuid();
type Loose = { from: (t: string) => any; rpc: (fn: string) => any };

async function admin(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

/** Where a host's domain should point: the address this app is served from. */
function platformHost(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.["PUBLIC_SITE_URL"];
  if (env) return new URL(env).host;
  const req = getRequest();
  return req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
}

export type HostDomain = {
  domain: string;
  propertyId: string | null;
  verified: boolean;
  live: boolean;
  createdAt: string;
  /** The records the owner adds at their domain's DNS provider. */
  records: Array<{ type: "CNAME" | "TXT"; name: string; value: string }>;
};

function toDomain(r: any, target: string): HostDomain {
  const proof = verifyRecord(r.domain, r.verify_token);
  return {
    domain: r.domain,
    propertyId: r.property_id,
    verified: !!r.verified_at,
    live: !!r.live_at,
    createdAt: r.created_at,
    records: [
      { type: "CNAME", name: r.domain, value: target },
      { type: "TXT", name: proof.name, value: proof.value },
    ],
  };
}

/** A host's domains, with the DNS records each needs. */
export const listHostDomains = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, data.hostId);
    const { data: rows, error } = await (await admin()).from("host_domains").select("*").eq("host_id", data.hostId).order("created_at");
    if (error) return { available: false as const, domains: [] as HostDomain[] };
    const target = platformHost();
    return { available: true as const, domains: ((rows ?? []) as any[]).map((r) => toDomain(r, target)) };
  });

export const addHostDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, domain: z.string().max(260), propertyId: uuid.nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireOwner(context.supabase, data.hostId);
    const domain = normaliseDomain(data.domain);
    if (!domain) throw new Error("That doesn't look like a web address. Try something like stay.yourhotel.co.uk.");
    if (isPlatformDomain(domain, [platformHost()])) throw new Error("That address belongs to the platform. Use one of your own.");
    const db = await admin();
    const { data: taken } = await db.from("host_domains").select("host_id").eq("domain", domain).maybeSingle();
    if (taken) throw new Error(taken.host_id === data.hostId ? "You've added that address already." : "That address is already in use.");
    if (data.propertyId) {
      const { data: p } = await db.from("properties").select("host_id").eq("id", data.propertyId).maybeSingle();
      if (p?.host_id !== data.hostId) throw new Error("Not available.");
    }
    const token = crypto.randomUUID().replace(/-/g, "");
    const { error } = await db.from("host_domains").insert({ domain, host_id: data.hostId, property_id: data.propertyId, verify_token: token });
    if (error) throw new Error(error.message);
    return { ok: true, domain };
  });

/** Looks up the proof record over DNS (DNS over HTTPS, so it works anywhere). */
export const checkHostDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, domain: z.string().max(253) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, data.hostId);
    const db = await admin();
    const { data: row } = await db.from("host_domains").select("*").eq("domain", data.domain).eq("host_id", data.hostId).maybeSingle();
    if (!row) throw new Error("Not available.");
    if (row.verified_at) return { verified: true };
    const proof = verifyRecord(row.domain, row.verify_token);
    let answers: string[] = [];
    try {
      const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(proof.name)}&type=TXT`, { headers: { accept: "application/dns-json" } });
      const json = (await res.json()) as { Answer?: Array<{ data: string }> };
      answers = (json.Answer ?? []).map((a) => a.data);
    } catch {
      throw new Error("Couldn't check DNS just now. Please try again in a minute.");
    }
    if (!txtMatches(answers, proof.value)) return { verified: false };
    await db.from("host_domains").update({ verified_at: new Date().toISOString() }).eq("domain", row.domain);
    return { verified: true };
  });

/** Which property the address's home page opens. */
export const setHostDomainProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, domain: z.string().max(253), propertyId: uuid.nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, data.hostId);
    const db = await admin();
    if (data.propertyId) {
      const { data: p } = await db.from("properties").select("host_id").eq("id", data.propertyId).maybeSingle();
      if (p?.host_id !== data.hostId) throw new Error("Not available.");
    }
    await db.from("host_domains").update({ property_id: data.propertyId }).eq("domain", data.domain).eq("host_id", data.hostId);
    const { forgetBrand } = await import("./brand.server");
    forgetBrand();
    return { ok: true };
  });

export const removeHostDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, domain: z.string().max(253) }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireOwner(context.supabase, data.hostId);
    await (await admin()).from("host_domains").delete().eq("domain", data.domain).eq("host_id", data.hostId);
    const { forgetBrand } = await import("./brand.server");
    forgetBrand();
    return { ok: true };
  });

/* ------------------------------ super admin ------------------------------ */

async function requireSuperAdmin(supabase: unknown) {
  const { data } = await (supabase as Loose).rpc("is_super_admin");
  if (data !== true) throw new Error("Super admin only.");
}

/** Every host's domain, for connecting them on the hosting. */
export const listAllDomains = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { data, error } = await (await admin()).from("host_domains").select("*, hosts(business_name)").order("created_at", { ascending: false });
    if (error) return { available: false as const, domains: [] as Array<HostDomain & { business: string }> };
    const target = platformHost();
    return { available: true as const, domains: ((data ?? []) as any[]).map((r) => ({ ...toDomain(r, target), business: r.hosts?.business_name ?? "" })) };
  });

/** Switched on once the domain is connected on the hosting; only verified domains. */
export const setDomainLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ domain: z.string().max(253), live: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const db = await admin();
    const { data: row } = await db.from("host_domains").select("verified_at").eq("domain", data.domain).maybeSingle();
    if (data.live && !row?.verified_at) throw new Error("The owner hasn't proved this address is theirs yet.");
    await db.from("host_domains").update({ live_at: data.live ? new Date().toISOString() : null }).eq("domain", data.domain);
    const { forgetBrand } = await import("./brand.server");
    forgetBrand();
    return { ok: true };
  });
