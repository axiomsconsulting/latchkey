/**
 * The super admin's tools: every business at a glance, billing and trial
 * overrides, trial-abuse flags, feedback, announcements and site settings,
 * and "view as host" for support. Every function checks is_super_admin()
 * in the database first; the database enforces it again on each table.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOwner } from "@/lib/roles";

const uuid = z.string().uuid();

type Loose = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };
const loose = (c: unknown) => c as Loose;

async function requireSuperAdmin(supabase: unknown) {
  const { data } = await loose(supabase).rpc("is_super_admin");
  if (data !== true) throw new Error("Super admin only.");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* -------------------------------- overview -------------------------------- */

export type HostStats = {
  host_id: string;
  business_name: string;
  owner_email: string | null;
  created_at: string;
  subscription_status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  support_access_until: string | null;
  properties: number;
  rooms_per_property: number[];
  bookings_total: number;
  bookings_30d: number;
  checkins_30d: number;
  channels: Record<string, number>;
  last_sign_in_at: string | null;
  is_demo: boolean;
  plan_key?: string | null;
  api_addon?: boolean;
};

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const db = loose(context.supabase);
    const [{ data: hosts, error }, { data: flags }, { data: pricing }] = await Promise.all([
      db.rpc("admin_host_stats"),
      db.from("trial_flags").select("id, host_id, matched_host_id, reason, detail, created_at, resolved_at, resolution").order("created_at", { ascending: false }).limit(200),
      db.from("platform_pricing").select("base_pence, extra_room_pence, extra_property_pence, trial_days, currency").eq("id", 1).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    // Plans arrive with migration 0027; before that the column is missing and plans stay blank.
    const { data: plans } = await loose(await admin()).from("hosts").select("id, plan_key, api_addon");
    const byId = new Map(((plans ?? []) as Array<{ id: string; plan_key: string; api_addon: boolean }>).map((p) => [p.id, p]));
    const merged = ((hosts ?? []) as HostStats[]).map((h) => ({ ...h, plan_key: byId.get(h.host_id)?.plan_key ?? null, api_addon: byId.get(h.host_id)?.api_addon ?? false }));
    return { hosts: merged, flags: flags ?? [], pricing };
  });

/** Comp a business, extend its trial, or end its access. */
export const setHostPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        hostId: uuid,
        action: z.enum(["comp", "extend_trial", "end_access", "back_to_trial"]),
        days: z.number().int().min(1).max(365).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const db = await admin();
    const now = Date.now();
    const update =
      data.action === "comp"
        ? { subscription_status: "comped" }
        : data.action === "end_access"
          ? { subscription_status: "canceled", canceled_at: new Date(now).toISOString() }
          : {
              subscription_status: "trialing",
              canceled_at: null,
              trial_ends_at: new Date(now + (data.days ?? 14) * 86_400_000).toISOString(),
            };
    const { error } = await db.from("hosts").update(update).eq("id", data.hostId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Look at a business as support (null to go back to your own). */
export const viewAsHost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid.nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { error } = await loose(context.supabase)
      .from("user_prefs")
      .upsert({ user_id: context.userId, support_host_id: data.hostId, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resolveTrialFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, resolution: z.string().trim().max(400) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { error } = await loose(context.supabase)
      .from("trial_flags")
      .update({ resolved_at: new Date().toISOString(), resolution: data.resolution || "Reviewed" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------- feedback -------------------------------- */

export const listAllFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { data, error } = await loose(context.supabase)
      .from("feedback")
      .select("id, kind, rating, message, host_id, page, status, created_at, hosts(business_name)")
      .neq("kind", "guest_review")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      kind: string;
      rating: number | null;
      message: string | null;
      host_id: string | null;
      page: string | null;
      status: string;
      created_at: string;
      hosts: { business_name: string } | null;
    }>;
  });

export const setFeedbackStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, status: z.enum(["new", "seen", "planned", "done"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { error } = await loose(context.supabase).from("feedback").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------ announcements ----------------------------- */

export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { data } = await loose(context.supabase)
      .from("announcements")
      .select("id, host_id, title, body, active, expires_at, created_at, hosts(business_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    return (data ?? []) as Array<{
      id: string;
      host_id: string | null;
      title: string;
      body: string;
      active: boolean;
      expires_at: string | null;
      created_at: string;
      hosts: { business_name: string } | null;
    }>;
  });

/** A broadcast to every host (hostId null), or a message to one business. */
export const sendAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        hostId: uuid.nullable(),
        title: z.string().trim().min(1).max(120),
        body: z.string().trim().min(1).max(2000),
        expiresInDays: z.number().int().min(1).max(365).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { error } = await loose(context.supabase)
      .from("announcements")
      .insert({
        host_id: data.hostId,
        title: data.title,
        body: data.body,
        expires_at: data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString() : null,
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAnnouncementActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { error } = await loose(context.supabase).from("announcements").update({ active: data.active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** For everyone signed in: announcements and messages not yet dismissed. */
export const myAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = loose(context.supabase);
    const [{ data: list, error }, { data: seen }] = await Promise.all([
      db.from("announcements").select("id, host_id, title, body, created_at").eq("active", true).order("created_at", { ascending: true }).limit(20),
      db.from("announcement_dismissals").select("announcement_id").eq("user_id", context.userId),
    ]);
    if (error) return [];
    const done = new Set(((seen ?? []) as Array<{ announcement_id: string }>).map((d) => d.announcement_id));
    const { data: isAdmin } = await db.rpc("is_super_admin");
    // The super admin reads every message in the admin page, not as pop-ups.
    return ((list ?? []) as Array<{ id: string; host_id: string | null; title: string; body: string; created_at: string }>).filter(
      (a) => !done.has(a.id) && !(isAdmin === true && a.host_id),
    );
  });

export const dismissAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await loose(context.supabase).from("announcement_dismissals").insert({ announcement_id: data.id, user_id: context.userId });
    return { ok: true };
  });

/* ------------------------------ site settings ----------------------------- */

type SiteSettings = { signups_open: boolean; support_email: string | null; notice: string | null; invoice_nightly_lines: boolean };

export const getSiteSettings = createServerFn({ method: "GET" }).handler(async (): Promise<SiteSettings> => {
  const db = await admin();
  const { withLegacy } = await import("./checkin.server");
  const cols = "signups_open, support_email, notice";
  const { data } = await withLegacy(
    () => loose(db).from("site_settings").select(`${cols}, invoice_nightly_lines`).eq("id", 1).maybeSingle(),
    () => loose(db).from("site_settings").select(cols).eq("id", 1).maybeSingle(),
  );
  const row = (data ?? {}) as Partial<SiteSettings>;
  return {
    signups_open: row.signups_open ?? true,
    support_email: row.support_email ?? null,
    notice: row.notice ?? null,
    invoice_nightly_lines: row.invoice_nightly_lines ?? true,
  };
});

export const saveSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        signupsOpen: z.boolean(),
        invoiceNightlyLines: z.boolean(),
        supportEmail: z.string().trim().max(254),
        notice: z.string().trim().max(300),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { error } = await loose(context.supabase)
      .from("site_settings")
      .update({
        signups_open: data.signupsOpen,
        invoice_nightly_lines: data.invoiceNightlyLines,
        support_email: data.supportEmail || null,
        notice: data.notice || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------------------- kiosk screensaver ---------------------------- */

/** Every kiosk's starting brightness and the clock size limits hosts can choose between. */
export const getKioskSaverDefaults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { normaliseDefaults } = await import("./kiosk-saver");
    const { data, error } = await loose(await admin()).from("site_settings").select("kiosk_saver").eq("id", 1).maybeSingle();
    return { available: !error, defaults: normaliseDefaults(error ? null : data?.kiosk_saver) };
  });

export const saveKioskSaverDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        brightness: z.number().finite(),
        size: z.number().finite(),
        sizeMin: z.number().finite(),
        sizeMax: z.number().finite(),
        resetMinutes: z.number().finite(),
        saverMinutes: z.number().finite(),
        welcomeMinutes: z.number().finite(),
        qrStyle: z.enum(["panel", "icon"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { normaliseDefaults } = await import("./kiosk-saver");
    const kiosk_saver = normaliseDefaults(data);
    const { error } = await loose(context.supabase).from("site_settings").update({ kiosk_saver, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true, defaults: kiosk_saver };
  });

/* ----------------------------- support access ----------------------------- */

/** The owner lets Latchkey support make changes for 30 days, or stops it now. */
export const setSupportAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, allow: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, data.hostId);
    const { error } = await context.supabase
      .from("hosts")
      .update({ support_access_until: data.allow ? new Date(Date.now() + 30 * 86_400_000).toISOString() : null })
      .eq("id", data.hostId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------ super admins ------------------------------ */

/** Everyone who can manage Latchkey. Their email must be confirmed to count. */
export const listSuperAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const db = await admin();
    const { withLegacy } = await import("./checkin.server");
    const { data } = await withLegacy(
      () => loose(db).from("super_admins").select("email, added_by, added_at").order("email"),
      () => loose(db).from("super_admins").select("email").order("email"),
    );
    return ((data ?? []) as Array<{ email: string; added_by?: string | null; added_at?: string | null }>).map((r) => ({
      email: r.email,
      addedBy: r.added_by ?? null,
      addedAt: r.added_at ?? null,
      you: r.email === String(context.claims?.email ?? "").toLowerCase(),
    }));
  });

export const addSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().toLowerCase().email().max(254) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const db = await admin();
    const { error } = await loose(db)
      .from("super_admins")
      .upsert({ email: data.email, added_by: String(context.claims?.email ?? "") || null }, { onConflict: "email" });
    if (error) {
      // Before migration 0026 there are no added_by/added_at columns.
      const { error: e2 } = await loose(db).from("super_admins").upsert({ email: data.email }, { onConflict: "email" });
      if (e2) throw new Error(e2.message);
    }
    return { ok: true };
  });

export const removeSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().toLowerCase().email() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const db = await admin();
    const { count } = await loose(db).from("super_admins").select("email", { count: "exact", head: true });
    if ((count ?? 0) <= 1) throw new Error("Latchkey needs at least one super admin.");
    const { error } = await loose(db).from("super_admins").delete().eq("email", data.email);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** For the public developer docs: the API allowances on each plan. */
export const getPublicApiPlans = createServerFn({ method: "GET" }).handler(async () => {
  // Public docs page: never fail, fall back to the default plans.
  let stored: unknown = null;
  try {
    const db = await admin();
    const { data } = await loose(db).from("site_settings").select("pricing_model").eq("id", 1).maybeSingle();
    stored = data?.pricing_model ?? null;
  } catch {
    stored = null;
  }
  const { normaliseModel } = await import("./pricing-model");
  const model = normaliseModel(stored);
  return {
    published: !!stored,
    currency: model.currency,
    addon: model.apiAddon,
    plans: model.plans.map((p) => ({ key: p.key, name: p.name, apiRequests: p.apiRequests })),
  };
});

/* ---------------------------- pricing studio ----------------------------- */

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Usage counters summed by metric since a day (all hosts and Latchkey itself). */
async function usageSince(since: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    const db = await admin();
    const { data, error } = await loose(db).from("usage_daily").select("metric, count").gte("day", since).limit(20000);
    if (error) return out;
    for (const r of (data ?? []) as Array<{ metric: string; count: number }>) out[r.metric] = (out[r.metric] ?? 0) + Number(r.count);
  } catch {
    // Before migration 0027: nothing counted yet.
  }
  return out;
}

/** Every business's plan, status and size, for the studio's live numbers. */
async function hostRows(supabase: unknown) {
  const { data: stats } = await loose(supabase).rpc("admin_host_stats");
  const db = await admin();
  const plans = new Map<string, { plan_key: string | null; api_addon: boolean }>();
  const { data, error } = await loose(db).from("hosts").select("id, plan_key, api_addon");
  if (!error) for (const r of (data ?? []) as Array<{ id: string; plan_key: string | null; api_addon: boolean }>) plans.set(r.id, r);
  return ((stats ?? []) as HostStats[]).map((h) => ({
    hostId: h.host_id,
    planKey: plans.get(h.host_id)?.plan_key ?? null,
    apiAddon: plans.get(h.host_id)?.api_addon ?? false,
    status: h.subscription_status,
    rooms: (h.rooms_per_property ?? []).reduce((a, b) => a + b, 0),
    properties: h.properties,
    isDemo: h.is_demo,
  }));
}

async function siteModels() {
  const db = await admin();
  const { data, error } = await loose(db).from("site_settings").select("pricing_model, cost_model, projection").eq("id", 1).maybeSingle();
  const pm = await import("./pricing-model");
  return {
    migrationPending: !!error,
    published: !!data?.pricing_model,
    model: pm.normaliseModel(data?.pricing_model),
    costs: pm.normaliseCosts(data?.cost_model),
    projection: pm.normaliseProjection(data?.projection),
  };
}

async function saveSite(patch: Record<string, unknown>) {
  const db = await admin();
  const { error } = await loose(db).from("site_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) throw new Error(error.message.includes("column") ? "Run migration 0027 first (Lovable applies it on the next sync)." : error.message);
}

export const getPricingStudio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const since = isoDay(new Date(Date.now() - 30 * 86_400_000));
    const [site, hosts, usage30] = await Promise.all([siteModels(), hostRows(context.supabase), usageSince(since)]);
    return { ...site, hosts, usage30, today: isoDay(new Date()) };
  });

const planSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{2,30}$/),
  name: z.string().trim().min(1).max(40),
  tagline: z.string().trim().max(120),
  basePence: z.number().int().min(0).max(1_000_000),
  includedRooms: z.number().int().min(0).max(1000),
  extraRoomPence: z.number().int().min(0).max(100_000),
  maxProperties: z.number().int().min(1).max(1000).nullable(),
  features: z.array(z.string()).max(30),
  apiRequests: z.number().int().min(0).max(10_000_000),
  aiReads: z.number().int().min(0).max(100_000),
  highlight: z.boolean(),
});

/**
 * Publishes plans: from now on new and changing hosts see these prices.
 * Current subscribers keep their price unless moved, from their next bill.
 */
export const publishPricingModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        model: z.object({
          currency: z.string().regex(/^[A-Z]{3}$/),
          trialDays: z.number().int().min(0).max(90),
          plans: z.array(planSchema).min(1).max(5),
          apiAddon: z.object({ pricePence: z.number().int().min(0).max(1_000_000), includedRequests: z.number().int().min(0).max(10_000_000) }),
        }),
        moveSubscribers: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const keys = data.model.plans.map((p) => p.key);
    if (new Set(keys).size !== keys.length) throw new Error("Each plan needs its own key.");
    const { normaliseModel } = await import("./pricing-model");
    const model = normaliseModel(data.model);
    await saveSite({ pricing_model: model });
    let moved = 0;
    let failed = 0;
    if (data.moveSubscribers) {
      const db = await admin();
      const { data: subs } = await loose(db).from("hosts").select("id").in("subscription_status", ["active", "past_due"]).not("stripe_subscription_id", "is", null);
      const { updateStripePrice } = await import("./billing.functions");
      for (const h of (subs ?? []) as Array<{ id: string }>) {
        try {
          await updateStripePrice(h.id, "next_bill");
          moved++;
        } catch {
          failed++;
        }
      }
    }
    return { moved, failed };
  });

/** Back to the original per-room pricing (plans hidden from hosts). */
export const unpublishPricingModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    await saveSite({ pricing_model: null });
    return { ok: true };
  });

export const saveCostModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ costs: z.record(z.string(), z.number().min(0).max(1_000_000)) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { normaliseCosts } = await import("./pricing-model");
    await saveSite({ cost_model: normaliseCosts(data.costs) });
    return { ok: true };
  });

export const saveProjection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projection: z.record(z.string(), z.unknown()) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { normaliseProjection } = await import("./pricing-model");
    const current = (await siteModels()).projection;
    // History only changes through calibration.
    await saveSite({ projection: { ...normaliseProjection(data.projection), history: current.history } });
    return { ok: true };
  });

/** Starts the projection again from today's real hosts, rooms and add-on take-up. */
export const rebaseProjection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const [site, hosts] = await Promise.all([siteModels(), hostRows(context.supabase)]);
    const pm = await import("./pricing-model");
    const summary = pm.summariseHosts(site.model, hosts);
    await saveSite({ projection: pm.rebase(site.projection, summary.state, isoDay(new Date())) });
    return { ok: true };
  });

/**
 * Tunes the cost model from Lovable's Usage page (credits over the last 30
 * days) against what Latchkey counted, and records this month's actuals.
 */
export const calibrateCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ totalCredits: z.number().min(0).max(1_000_000), aiCredits: z.number().min(0).max(1_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    if (data.aiCredits > data.totalCredits) throw new Error("AI credits can't be more than the total.");
    const since = isoDay(new Date(Date.now() - 30 * 86_400_000));
    const [site, hosts, usage] = await Promise.all([siteModels(), hostRows(context.supabase), usageSince(since)]);
    const pm = await import("./pricing-model");
    const summary = pm.summariseHosts(site.model, hosts);
    const costs = pm.calibrate(site.costs, {
      totalCredits: data.totalCredits,
      aiCredits: data.aiCredits,
      roomMonths: summary.activeRooms,
      aiReads: usage["ai:id_read"] ?? 0,
      apiRequests: usage["api:request"] ?? 0,
    });
    const projection = pm.recordHistory(site.projection, {
      month: isoDay(new Date()).slice(0, 7),
      hosts: summary.payers,
      revenuePence: summary.revenuePence,
      costPence: pm.actualCost(costs, data.totalCredits, summary.revenuePence, summary.payers),
    });
    await saveSite({ cost_model: costs, projection });
    return { costs, before: site.costs };
  });

/** The super admin moves a business to a plan, or turns its API add-on on or off. */
export const setHostPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, planKey: z.string().regex(/^[a-z0-9_]{2,30}$/), apiAddon: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const db = await admin();
    const { error } = await loose(db).from("hosts").update({ plan_key: data.planKey, api_addon: data.apiAddon }).eq("id", data.hostId);
    if (error) throw new Error(error.message);
    // Their card is charged the new price from the next bill, no surprise charge now.
    try {
      const { updateStripePrice } = await import("./billing.functions");
      await updateStripePrice(data.hostId, "next_bill");
    } catch {
      return { ok: true, stripe: false };
    }
    return { ok: true, stripe: true };
  });

/* ------------------------------- routines -------------------------------- */

export type RoutineRow = {
  key: string;
  enabled: boolean;
  every_minutes: number | null;
  last_run_at: string | null;
  last_status: string | null;
  last_duration_ms: number | null;
};

export const listRoutines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const db = await admin();
    const { data, error } = await loose(db).from("job_settings").select("key, enabled, every_minutes, last_run_at, last_status, last_duration_ms");
    const now = new Date();
    const monthStart = `${isoDay(now).slice(0, 7)}-01`;
    const [usageMonth, site] = await Promise.all([usageSince(monthStart), siteModels()]);
    return { settings: (error ? [] : data ?? []) as RoutineRow[], usageMonth, costs: site.costs, migrationPending: !!error };
  });

export const saveRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ key: z.string().regex(/^[a-z0-9_]{2,40}$/), enabled: z.boolean(), everyMinutes: z.number().int().min(5).max(44_640).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { JOBS } = await import("./jobs");
    if (!JOBS.some((j) => j.key === data.key)) throw new Error("Unknown routine.");
    const db = await admin();
    const { error } = await loose(db)
      .from("job_settings")
      .upsert({ key: data.key, enabled: data.enabled, every_minutes: data.everyMinutes, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message.includes("job_settings") ? "Run migration 0027 first (Lovable applies it on the next sync)." : error.message);
    const { forgetJobSettings } = await import("./usage.server");
    forgetJobSettings();
    return { ok: true };
  });

/** Runs a routine now, whether or not it's switched on or due. */
export const runRoutineNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.enum(["calendar_sync", "retention", "demo_tour"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { recordRun } = await import("./usage.server");
    const started = Date.now();
    try {
      if (data.key === "calendar_sync") {
        const { syncAllConnections } = await import("./ical-sync.server");
        const r = await syncAllConnections();
        const status = `${r.connections} calendars, ${r.errors} errors (run by hand)`;
        await recordRun(data.key, status, started);
        return { status };
      }
      if (data.key === "retention") {
        const { runRetentionSweep } = await import("./ical-sync.server");
        const n = await runRetentionSweep();
        const status = `Anonymised ${n} stays (run by hand)`;
        await recordRun(data.key, status, started);
        return { status };
      }
      const { ensureTour } = await import("./demo.functions");
      await ensureTour(await admin(), true);
      return { status: "Rebuilt (run by hand)" };
    } catch (e) {
      const status = `Failed: ${e instanceof Error ? e.message : "unknown error"}`;
      await recordRun(data.key, status, started);
      throw new Error(status);
    }
  });

/* ------------------------------ launch offer ----------------------------- */

/** For the home page and billing: the campaign running today, if any. Never fails. */
export const getPublicOffer = createServerFn({ method: "GET" }).handler(async () => {
  const { normaliseOffer, offerRunning, ukToday } = await import("./offer");
  try {
    const db = await admin();
    const { data, error } = await loose(db).from("site_settings").select("offer").eq("id", 1).maybeSingle();
    if (error || !data?.offer) return null;
    const offer = normaliseOffer(data.offer);
    return offerRunning(offer, ukToday()) ? offer : null;
  } catch {
    return null;
  }
});

export const getOfferSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { normaliseOffer, DEFAULT_OFFER } = await import("./offer");
    const db = await admin();
    const { data, error } = await loose(db).from("site_settings").select("offer").eq("id", 1).maybeSingle();
    const { count: waiting } = await loose(db).from("hosts").select("id", { count: "exact", head: true }).not("offer_pence", "is", null).is("offer_used_at", null);
    const { count: used } = await loose(db).from("hosts").select("id", { count: "exact", head: true }).not("offer_used_at", "is", null);
    return { migrationPending: !!error, offer: data?.offer ? normaliseOffer(data.offer) : DEFAULT_OFFER, waiting: waiting ?? 0, used: used ?? 0 };
  });

/** Sets the campaign. Accounts already opened keep the offer they joined with. */
export const saveOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        enabled: z.boolean(),
        pricePence: z.number().int().min(0).max(100_000),
        label: z.string().trim().min(1).max(60),
        startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    if (data.endsOn < data.startsOn) throw new Error("The offer has to end on or after the day it starts.");
    const db = await admin();
    const { error } = await loose(db).from("site_settings").update({ offer: data, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error(error.message.includes("offer") ? "Run migration 0029 first (Lovable applies it on the next sync)." : error.message);
    return { ok: true };
  });

/* ------------------------------ integrations ----------------------------- */

/** Which Latchkey-wide integrations are set up, without ever returning a secret. */
export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const i = await import("./integrations.server");
    const settings = await i.integrationSettings();
    let bot: string | null = null;
    let webhook: string | null = null;
    if (i.telegramToken()) {
      const me = await i.telegramCall<{ username: string }>("getMe", {});
      bot = me.ok ? (me.result?.username ?? null) : null;
      const info = await i.telegramCall<{ url: string }>("getWebhookInfo", {});
      webhook = info.ok ? (info.result?.url || null) : null;
    }
    const origin = i.publicOrigin();
    const secret = i.inboundSecret();
    return {
      origin,
      push: { ready: !!i.pushKeys() },
      telegram: { tokenSet: !!i.telegramToken(), bot, webhookSet: !!webhook && webhook.startsWith(origin) },
      sms: { ready: !!i.twilio() },
      inbound: {
        secretSet: !!secret,
        address: settings.inboundAddress,
        // Only the end of the secret, so the super admin can match it up.
        webhookUrl: secret ? `${origin}/api/public/inbound-email/${secret.slice(0, 4)}…` : null,
      },
    };
  });

export const saveIntegrationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ inboundAddress: z.string().trim().max(200).refine((v) => v === "" || (v.includes("{code}") && /@/.test(v)), "Include {code} and an @") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const db = await admin();
    const { error } = await loose(db)
      .from("site_settings")
      .update({ integrations: { inboundAddress: data.inboundAddress || null }, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message.includes("integrations") ? "Run migration 0032 first (Lovable applies it on the next sync)." : error.message);
    return { ok: true };
  });

/** Points the Telegram bot at Latchkey, so "/start" links reach us. */
export const connectTelegramWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const i = await import("./integrations.server");
    const secret = await i.telegramSecret();
    if (!secret) throw new Error("Add TELEGRAM_BOT_TOKEN in Lovable Cloud secrets first.");
    const r = await i.telegramCall("setWebhook", {
      url: `${i.publicOrigin()}/api/public/telegram/${secret}`,
      secret_token: secret,
      allowed_updates: ["message"],
    });
    if (!r.ok) throw new Error(r.description ?? "Telegram refused the webhook.");
    return { ok: true };
  });

/** A fresh VAPID key pair for push alerts, to paste into Lovable Cloud secrets once. */
export const makeVapidKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { newVapidKeys } = await import("./webpush");
    return newVapidKeys();
  });

export const sendTestSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ to: z.string().regex(/^\+[1-9]\d{6,14}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { sendSms } = await import("./integrations.server");
    const ok = await sendSms(data.to, "Latchkey test: SMS alerts are working.");
    if (!ok) throw new Error("Twilio didn't send it. Check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM.");
    return { ok: true };
  });
