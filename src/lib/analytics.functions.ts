/**
 * Visitor analytics: linking a browser to the signed-in person, and the
 * super admin's dashboard. Matching happens in the database
 * (analytics_identify); summarising is pure (analytics.ts).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Loose = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };
const loose = (c: unknown) => c as Loose;

/** Called by the browser when someone signs in, or adds an email to a trial. */
export const identifyVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ visitorId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    try {
      const { jobAllowed } = await import("./usage.server");
      if (!(await jobAllowed("visitor_analytics"))) return { ok: false };
      const claims = context.claims as { sub: string; email?: string; is_anonymous?: boolean };
      // Every demo visitor shares one account: matching on it would make them one person.
      const { DEMO_EMAIL } = await import("./demo-account");
      if (claims.email?.toLowerCase() === DEMO_EMAIL) return { ok: false };
      const { identifyVisitor } = await import("./analytics.server");
      await identifyVisitor(data.visitorId, claims.sub, claims.is_anonymous ? null : claims.email || null);
    } catch {
      // Analytics never gets in the way of signing in.
    }
    return { ok: true };
  });

const PAGE = 1000;

/** Reads up to `max` rows, a page at a time (the API returns 1,000 at most). */
async function all<T>(query: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>, max = 20_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

/** Everything the visitor dashboard needs for a period; summarised in the browser. */
export const getVisitorAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(1).max(395) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await loose(context.supabase).rpc("is_super_admin");
    if (isAdmin !== true) throw new Error("Super admin only.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = loose(supabaseAdmin);
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();

    const probe = await db.from("analytics_visits").select("id").limit(1);
    if (probe.error) return { migrationPending: true, visits: [], visitors: [], profiles: [], views: [], truncated: false };

    const visits = await all<any>((a, b) =>
      db
        .from("analytics_visits")
        .select("id, visitor_id, started_at, pages, duration_ms, entry_path, referrer, utm_source, ip, country, region, city, is_bot")
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .range(a, b),
    );
    const views = await all<any>((a, b) =>
      db.from("analytics_views").select("visit_id, path, title, at, duration_ms").gte("at", since).order("at", { ascending: false }).range(a, b),
      50_000,
    );
    const visitorIds = [...new Set(visits.map((v) => v.visitor_id as string))];
    const visitors: Array<any> = [];
    for (let i = 0; i < visitorIds.length; i += 200) {
      const { data: rows } = await db
        .from("analytics_visitors")
        .select("id, profile_id, first_seen, last_seen, browser, os, device, is_bot, bot_reason")
        .in("id", visitorIds.slice(i, i + 200));
      visitors.push(...(rows ?? []));
    }
    const profileIds = [...new Set(visitors.map((v) => v.profile_id).filter(Boolean) as string[])];
    const profiles: Array<any> = [];
    for (let i = 0; i < profileIds.length; i += 200) {
      const { data: rows } = await db
        .from("analytics_profiles")
        .select("id, user_id, email, host_id, known_at, first_seen")
        .in("id", profileIds.slice(i, i + 200));
      profiles.push(...(rows ?? []));
    }
    const { data: team } = await db.from("super_admins").select("email");
    const teamEmails = new Set(((team ?? []) as Array<{ email: string }>).map((t) => t.email.toLowerCase()));

    return {
      migrationPending: false,
      truncated: visits.length >= 20_000,
      visits: visits.map((v) => ({
        id: v.id as string,
        visitorId: v.visitor_id as string,
        startedAt: v.started_at as string,
        pages: Number(v.pages),
        durationMs: Number(v.duration_ms),
        entryPath: v.entry_path as string | null,
        referrer: v.referrer as string | null,
        utmSource: v.utm_source as string | null,
        ip: v.ip as string | null,
        country: v.country as string | null,
        region: v.region as string | null,
        city: v.city as string | null,
        isBot: !!v.is_bot,
      })),
      visitors: visitors.map((v) => ({
        id: v.id as string,
        profileId: v.profile_id as string | null,
        firstSeen: v.first_seen as string,
        lastSeen: v.last_seen as string,
        browser: v.browser as string | null,
        os: v.os as string | null,
        device: v.device as string | null,
        isBot: !!v.is_bot,
        botReason: v.bot_reason as string | null,
      })),
      profiles: profiles.map((p) => ({
        id: p.id as string,
        userId: p.user_id as string | null,
        email: p.email as string | null,
        hostId: p.host_id as string | null,
        knownAt: p.known_at as string | null,
        firstSeen: p.first_seen as string,
        isTeam: !!p.email && teamEmails.has(String(p.email).toLowerCase()),
      })),
      views: views.map((v) => ({ visitId: v.visit_id as string, path: v.path as string, title: v.title as string | null, at: v.at as string, durationMs: Number(v.duration_ms) })),
    };
  });
