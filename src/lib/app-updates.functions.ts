/* eslint-disable @typescript-eslint/no-explicit-any -- reads columns the generated Supabase types don't cover yet */
/**
 * Asking devices to update (src/lib/app-update.ts, migration 0069): Latchkey
 * admin for every host dashboard or every door tablet, now or at a set
 * time (hosts are told ahead in their alerts); a host for their own tablets.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normaliseUpdates } from "@/lib/app-update";
import { APP_VERSION } from "@/lib/app-version";
import { hostOfProperty, requireSuperAdmin, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();
const when = z.string().datetime({ offset: true }).nullable();

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const whenText = (at: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(at));

export const getAppUpdates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { data, error } = await (
      await admin()
    )
      .from("site_settings")
      .select("app_updates")
      .eq("id", 1)
      .maybeSingle();
    return {
      available: !error,
      version: APP_VERSION,
      updates: normaliseUpdates(error ? null : data?.app_updates),
    };
  });

/**
 * Asks every dashboard or every tablet to update: now (null `at` cancels),
 * or at a set time, in which case every business is told in its alerts.
 */
export const setAppUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ audience: z.enum(["hosts", "kiosks"]), at: when }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const db = await admin();
    const { data: row } = await db
      .from("site_settings")
      .select("app_updates")
      .eq("id", 1)
      .maybeSingle();
    const next = { ...normaliseUpdates(row?.app_updates), [data.audience]: data.at };
    const { error } = await db
      .from("site_settings")
      .update({ app_updates: next, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    // A scheduled one: every business hears about it in its alerts (the bell only, no emails or texts).
    let told = 0;
    const at = data.at;
    if (at && Date.parse(at) > Date.now() + 5 * 60_000) {
      const { data: hosts } = await db.from("hosts").select("id").limit(5000);
      const rows = ((hosts ?? []) as Array<{ id: string }>).map((h) => ({
        host_id: h.id,
        kind: "system_update",
        message:
          data.audience === "hosts"
            ? `Latchkey updates on ${whenText(at)}. Your dashboard reloads by itself once nobody has used it for 15 minutes.`
            : `Latchkey updates door tablets on ${whenText(at)}. Each reloads by itself once nobody has used it for 15 minutes and no welcome or goodbye is showing.`,
      }));
      for (let i = 0; i < rows.length; i += 500)
        await db.from("host_alerts").insert(rows.slice(i, i + 500));
      told = rows.length;
    }
    return { ok: true, updates: next, told };
  });

/** A host updates their own tablets: now (they reload when idle) or at a set time. Returns the code to ping. */
export const requestTabletUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        deviceIds: z.array(uuid).max(99).optional(),
        at: z.string().datetime({ offset: true }).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const db = await admin();
    let q = db
      .from("kiosk_devices")
      .update({ update_requested_at: data.at ?? new Date().toISOString() })
      .eq("property_id", data.propertyId)
      .eq("status", "confirmed");
    if (data.deviceIds?.length) q = q.in("id", data.deviceIds);
    const { error } = await q;
    if (error)
      throw new Error(
        /update_requested_at/.test(error.message)
          ? "Tablet updates need the latest database update (migration 0069)."
          : error.message,
      );
    const { data: p } = await db
      .from("properties")
      .select("short_code")
      .eq("id", data.propertyId)
      .maybeSingle();
    return { code: (p?.short_code as string) ?? "" };
  });
