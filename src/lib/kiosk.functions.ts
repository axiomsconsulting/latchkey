/**
 * The welcome a host puts on the front-door kiosk for a guest about to
 * arrive. The host sets, changes or removes it; the kiosk reads it by the
 * property's code and records when the guest taps it away.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { hostOfProperty, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();
type Loose = { from: (t: string) => any };

export type KioskWelcome = {
  headline: string;
  body: string | null;
  version: number;
  bookingId: string | null;
  updatedAt: string;
  expiresAt: string;
  dismissedAt: string | null;
  /** The guest tapped this version away. */
  dismissed: boolean;
};

const live = (r: { cleared_at: string | null; expires_at: string } | null) => !!r && !r.cleared_at && Date.parse(r.expires_at) > Date.now();

function toWelcome(r: any): KioskWelcome {
  return {
    headline: r.headline,
    body: r.body,
    version: r.version,
    bookingId: r.booking_id,
    updatedAt: r.updated_at,
    expiresAt: r.expires_at,
    dismissedAt: r.dismissed_at,
    dismissed: r.dismissed_version === r.version,
  };
}

/** The host's view: what's on the kiosk now, if anything, and whether the guest has tapped it. */
export const getKioskWelcome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await (context.supabase as unknown as Loose).from("kiosk_messages").select("*").eq("property_id", data.propertyId).maybeSingle();
    if (error) return { available: false as const, message: null };
    return { available: true as const, message: live(r) ? toWelcome(r) : null };
  });

/** Shows (or updates) the welcome on the kiosk now. */
export const setKioskWelcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        headline: z.string().trim().min(1).max(80),
        body: z.string().trim().max(300).nullable(),
        bookingId: uuid.nullable(),
        minutes: z.number().int().min(5).max(24 * 60),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const sb = context.supabase as unknown as Loose;
    const { data: prev } = await sb.from("kiosk_messages").select("version").eq("property_id", data.propertyId).maybeSingle();
    const { error } = await sb.from("kiosk_messages").upsert(
      {
        property_id: data.propertyId,
        headline: data.headline,
        body: data.body || null,
        booking_id: data.bookingId,
        version: (prev?.version ?? 0) + 1,
        created_by: context.userId,
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + data.minutes * 60_000).toISOString(),
        cleared_at: null,
        dismissed_at: null,
        dismissed_version: null,
      },
      { onConflict: "property_id" },
    );
    if (error) throw new Error(error.message.includes("kiosk_messages") ? "Kiosk welcomes need the latest update (migration 0034)." : error.message);
    return { ok: true };
  });

/** Takes the welcome off the kiosk. */
export const clearKioskWelcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const { error } = await (context.supabase as unknown as Loose)
      .from("kiosk_messages")
      .update({ cleared_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("property_id", data.propertyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function propertyByCode(code: string) {
  const { admin } = await import("./checkin.server");
  const db = (await admin()) as unknown as Loose;
  const { data } = await db.from("properties").select("id").eq("short_code", code.toLowerCase()).maybeSingle();
  return { db, id: (data?.id as string | undefined) ?? null };
}

const code = z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/i);

/** The kiosk's view: the welcome to show now, if any (first name and words only). */
export const kioskWelcome = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ code }).parse(d))
  .handler(async ({ data }) => {
    const { db, id } = await propertyByCode(data.code);
    if (!id) return null;
    const { data: r, error } = await db.from("kiosk_messages").select("headline, body, version, cleared_at, expires_at").eq("property_id", id).maybeSingle();
    if (error || !live(r)) return null;
    return { headline: r.headline as string, body: (r.body as string | null) ?? null, version: r.version as number };
  });

/** The guest tapped the welcome away: the host sees it. */
export const dismissKioskWelcome = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code, version: z.number().int().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { db, id } = await propertyByCode(data.code);
    if (!id) return { ok: false };
    await db.from("kiosk_messages").update({ dismissed_at: new Date().toISOString(), dismissed_version: data.version }).eq("property_id", id).eq("version", data.version);
    return { ok: true };
  });

/* ---------------------------- screensaver look ---------------------------- */

async function saverDefaults(db: Loose) {
  const { normaliseDefaults } = await import("./kiosk-saver");
  const { data, error } = await db.from("site_settings").select("kiosk_saver").eq("id", 1).maybeSingle();
  return normaliseDefaults(error ? null : data?.kiosk_saver);
}

async function hostByCode(db: Loose, code: string) {
  const { withLegacy } = await import("./checkin.server");
  // kiosk_rest is from migration 0049.
  const { data } = await withLegacy<any>(
    () => db.from("properties").select("host_id, is_demo, kiosk_rest").eq("short_code", code.toLowerCase()).maybeSingle(),
    () => db.from("properties").select("host_id, is_demo").eq("short_code", code.toLowerCase()).maybeSingle(),
  );
  return data ? { hostId: data.host_id as string, demo: data.is_demo === true, rest: (data.kiosk_rest as unknown) ?? null } : null;
}

const optional = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));

/**
 * The kiosk at rest: the clock screensaver's brightness and clock size (the
 * host's own, or Latchkey's starting point), what this property shows at
 * rest (night light, clock or nothing) and the night light's own look.
 */
export const kioskSaverLook = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ code }).parse(d))
  .handler(async ({ data }) => {
    const { admin, withLegacy } = await import("./checkin.server");
    const { lookFor } = await import("./kiosk-saver");
    const { nightLookFor, normaliseRest } = await import("./kiosk-rest");
    const db = (await admin()) as unknown as Loose;
    const defaults = await saverDefaults(db);
    const host = await hostByCode(db, data.code);
    const { data: own, error } = host
      ? await withLegacy<any>(
          () => db.from("kiosk_looks").select("brightness, size, night_brightness, night_depth").eq("host_id", host.hostId).maybeSingle(),
          () => db.from("kiosk_looks").select("brightness, size").eq("host_id", host.hostId).maybeSingle(),
        )
      : { data: null, error: null };
    const row = error || !own ? null : own;
    return {
      defaults,
      look: lookFor(defaults, row ? { brightness: optional(row.brightness), size: optional(row.size) } : null),
      rest: normaliseRest(host?.rest),
      night: nightLookFor(row ? { brightness: optional(row.night_brightness), depth: optional(row.night_depth) } : null),
    };
  });

/** Changed on the night light's bands: kept for every kiosk of this host, inside the limits. */
export const saveKioskNightLook = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code, brightness: z.number().finite(), depth: z.number().finite() }).parse(d))
  .handler(async ({ data }) => {
    const { admin } = await import("./checkin.server");
    const { nightLookFor } = await import("./kiosk-rest");
    const db = (await admin()) as unknown as Loose;
    const host = await hostByCode(db, data.code);
    const night = nightLookFor(data);
    // The shared demo and tour kiosks keep the starting look for every visitor.
    if (!host || host.demo) return { ok: false, night };
    const { error } = await db
      .from("kiosk_looks")
      .upsert({ host_id: host.hostId, night_brightness: night.brightness, night_depth: night.depth, updated_at: new Date().toISOString() }, { onConflict: "host_id" });
    return { ok: !error, night };
  });

/** The host chooses what the property's kiosk shows at rest (night light, clock screensaver or nothing). */
export const saveKioskRest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, rest: z.record(z.string(), z.unknown()) }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const { normaliseRest } = await import("./kiosk-rest");
    const rest = normaliseRest(data.rest);
    const { error } = await (context.supabase as unknown as Loose).from("properties").update({ kiosk_rest: rest }).eq("id", data.propertyId);
    if (error) throw new Error(/kiosk_rest/.test(error.message) ? "The night light needs the latest update (migration 0049)." : error.message);
    return { ok: true, rest };
  });

/** Changed on the screensaver's bands: kept for every kiosk of this host, inside the limits. */
export const saveKioskSaverLook = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code, brightness: z.number().finite(), size: z.number().finite() }).parse(d))
  .handler(async ({ data }) => {
    const { admin } = await import("./checkin.server");
    const { lookFor } = await import("./kiosk-saver");
    const db = (await admin()) as unknown as Loose;
    const host = await hostByCode(db, data.code);
    const look = lookFor(await saverDefaults(db), data);
    // The shared demo and tour kiosks keep Latchkey's look for every visitor.
    if (!host || host.demo) return { ok: false, look };
    const { error } = await db.from("kiosk_looks").upsert({ host_id: host.hostId, ...look, updated_at: new Date().toISOString() }, { onConflict: "host_id" });
    return { ok: !error, look };
  });
