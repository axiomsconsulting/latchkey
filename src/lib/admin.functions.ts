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
    return { hosts: (hosts ?? []) as HostStats[], flags: flags ?? [], pricing };
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

export const getSiteSettings = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await loose(db).from("site_settings").select("signups_open, support_email, notice").eq("id", 1).maybeSingle();
  return (data as { signups_open: boolean; support_email: string | null; notice: string | null } | null) ?? {
    signups_open: true,
    support_email: null,
    notice: null,
  };
});

export const saveSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        signupsOpen: z.boolean(),
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
        support_email: data.supportEmail || null,
        notice: data.notice || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
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
