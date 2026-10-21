/**
 * Recording visits for the super admin's analytics. Server only. Writes go
 * through the service role; nothing here ever blocks the page being viewed.
 */
import { botReason, cleanProps, cleanUtm, isEventName, parseUserAgent } from "./analytics";

const VISIT_GAP_MS = 30 * 60_000;
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any; rpc: (fn: string, a: Record<string, unknown>) => any };
}

export type Hit = {
  t: "view" | "leave" | "event";
  /** Events only: one of EVENT_NAMES, with small flat details. */
  name?: string;
  props?: unknown;
  v: string;
  id: string;
  path?: string;
  title?: string;
  ref?: string;
  ms?: number;
  wd?: boolean;
  tz?: string;
  lang?: string;
  /** utm_* (an object; older pages send just the source as a string). */
  utm?: unknown;
};

/**
 * Where the request came from: country and region, and a one-day hash of the
 * address (never the address itself, nor the town).
 */
export async function origin(request: Request) {
  const h = request.headers;
  const { hashIp, requestIp } = await import("./ip-hash.server");
  const cf = (request as unknown as { cf?: { country?: string; region?: string } }).cf ?? {};
  const decode = (s: string | null) => {
    if (!s) return null;
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  return {
    ip_hash: hashIp(requestIp(h)),
    country: cf.country ?? h.get("cf-ipcountry") ?? h.get("x-vercel-ip-country") ?? h.get("x-country-code") ?? null,
    region: cf.region ?? decode(h.get("cf-region") ?? h.get("x-vercel-ip-country-region")),
  };
}

const clip = (s: unknown, n: number) => (typeof s === "string" && s ? s.slice(0, n) : null);

export async function recordHit(hit: Hit, request: Request): Promise<void> {
  if (!uuidRe.test(hit.v ?? "") || !uuidRe.test(hit.id ?? "")) return;
  const d = await db();
  const now = new Date().toISOString();

  if (hit.t === "event") {
    if (!isEventName(hit.name)) return;
    const { data: open } = await d
      .from("analytics_visits")
      .select("id")
      .eq("visitor_id", hit.v)
      .gte("last_at", new Date(Date.now() - VISIT_GAP_MS).toISOString())
      .order("last_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    await d.from("analytics_events").insert({
      visitor_id: hit.v,
      visit_id: open?.id ?? null,
      name: hit.name,
      path: clip(hit.path, 300),
      ...cleanUtm(hit.utm),
      props: cleanProps(hit.props),
    });
    return;
  }

  if (hit.t === "leave") {
    const ms = Math.max(0, Math.min(6 * 3_600_000, Math.round(Number(hit.ms) || 0)));
    await d.rpc("analytics_leave", { _view: hit.id, _visitor: hit.v, _ms: ms });
    return;
  }

  const path = clip(hit.path, 300);
  if (!path || !path.startsWith("/")) return;
  const ua = clip(request.headers.get("user-agent"), 500);
  const agent = parseUserAgent(ua);
  const firstBot = botReason(ua, { webdriver: !!hit.wd });

  // The browser: created on its first page, kept up to date after.
  const { data: existing } = await d.from("analytics_visitors").select("id, is_bot").eq("id", hit.v).maybeSingle();
  if (!existing) {
    await d.from("analytics_visitors").upsert(
      {
        id: hit.v,
        user_agent: ua,
        browser: agent.browser,
        os: agent.os,
        device: firstBot ? "Bot" : agent.device,
        language: clip(hit.lang, 20),
        timezone: clip(hit.tz, 60),
        is_bot: !!firstBot,
        bot_reason: firstBot,
        first_referrer: clip(hit.ref, 500),
        first_path: path,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
  } else {
    await d.from("analytics_visitors").update({ last_seen: now }).eq("id", hit.v);
  }

  // Pages less than 30 minutes apart are one visit.
  const since = new Date(Date.now() - VISIT_GAP_MS).toISOString();
  const { data: open } = await d
    .from("analytics_visits")
    .select("id, pages, started_at")
    .eq("visitor_id", hit.v)
    .gte("last_at", since)
    .order("last_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let visitId = open?.id as string | undefined;
  if (!visitId) {
    const where = await origin(request);
    const utm = cleanUtm(hit.utm);
    const base = { visitor_id: hit.v, entry_path: path, exit_path: path, referrer: clip(hit.ref, 500), utm_source: utm.utm_source ?? null, is_bot: !!firstBot || !!existing?.is_bot, country: where.country, region: where.region };
    let made = (await d.from("analytics_visits").insert({ ...base, ...utm, ip_hash: where.ip_hash }).select("id").single()).data;
    // Before migration 0046 (no utm_medium… or ip_hash yet): the older columns only, still no address.
    if (!made) made = (await d.from("analytics_visits").insert(base).select("id").single()).data;
    visitId = made?.id;
    const { bumpUsage } = await import("./usage.server");
    await bumpUsage(null, "analytics:visit");
  }
  if (!visitId) return;

  const { error } = await d.from("analytics_views").insert({ id: hit.id, visit_id: visitId, visitor_id: hit.v, path, title: clip(hit.title, 200) });
  if (error) return; // a repeat of the same page view
  const pages = ((open?.pages as number | undefined) ?? 0) + 1;
  const seconds = open ? (Date.now() - Date.parse(open.started_at)) / 1000 : 0;
  const tooFast = botReason(ua, { pagesInVisit: pages, secondsInVisit: seconds });
  await d.from("analytics_visits").update({ pages, last_at: now, exit_path: path, ...(tooFast ? { is_bot: true } : {}) }).eq("id", visitId);
  if (tooFast && !firstBot) await d.from("analytics_visitors").update({ is_bot: true, bot_reason: tooFast }).eq("id", hit.v);
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Links this browser to a signed-in person (deterministic: user id and email). */
export async function identifyVisitor(visitorId: string, userId: string, email: string | null): Promise<void> {
  if (!uuidRe.test(visitorId)) return;
  const d = await db();
  const { data: member } = await d.from("host_members").select("host_id").eq("user_id", userId).limit(1).maybeSingle();
  const clean = email?.trim().toLowerCase() || null;
  await d.rpc("analytics_identify", {
    _visitor: visitorId,
    _user_id: userId,
    _user_hash: await sha256(`user:${userId}`),
    _email: clean,
    _email_hash: clean ? await sha256(`email:${clean}`) : null,
    _host_id: member?.host_id ?? null,
  });
}

/** Privacy: visits and funnel events are kept 13 months; addresses are never stored (older ones cleared). */
export async function pruneAnalytics(): Promise<void> {
  try {
    const d = await db();
    const keep = new Date(Date.now() - 395 * 86_400_000).toISOString();
    const ipKeep = new Date(Date.now() - 90 * 86_400_000).toISOString();
    await d.from("analytics_visits").delete().lt("started_at", keep);
    await d.from("analytics_visitors").delete().lt("last_seen", keep);
    await d.from("analytics_visits").update({ ip: null }).lt("started_at", ipKeep).not("ip", "is", null);
    await d.from("analytics_events").delete().lt("at", keep);
  } catch {
    // Before migration 0028.
  }
}
