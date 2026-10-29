/* eslint-disable @typescript-eslint/no-explicit-any -- reads columns the generated Supabase types don't cover yet */
/**
 * Paired door tablets (kiosk_devices) and their screen calibration
 * (src/lib/kiosk-calibration.ts, migration 0065). The tablet reports its
 * display and reads its calibration by its own device token; the host lists
 * the property's tablets and calibrates one from the dashboard, then pings
 * it (kiosk-ping.ts) so it applies the change at once.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normaliseCalibrations, type Calibration } from "@/lib/kiosk-calibration";
import { requireWrite } from "@/lib/roles";

type Loose = { from: (t: string) => any };
const uuid = z.string().uuid();
const code = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9-]+$/i);
const device = z.string().min(24).max(80);
const px = z.number().int().min(0).max(10_000);
const display = z.object({
  w: px,
  h: px,
  screenW: px,
  screenH: px,
  orientation: z.enum(["landscape", "portrait"]),
  /** Learned (largest seen) or calibrated: what the kiosk lays out for. */
  usedW: px,
  usedH: px,
});
export type ReportedDisplay = z.infer<typeof display>;

async function admin(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

/** The tablet's side: says what its display is now and gets its calibration back. */
export const kioskDisplay = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code, device, display: display.optional() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { sha256 } = await import("./checkin.server");
    const { data: dev, error } = await db
      .from("kiosk_devices")
      .select("id, calibration, properties(short_code)")
      .eq("token_hash", sha256(data.device))
      .maybeSingle();
    if (error || !dev || dev.properties?.short_code !== data.code.toLowerCase())
      return { paired: false as const, calibration: {} };
    if (data.display)
      await db
        .from("kiosk_devices")
        .update({ display: { ...data.display, at: new Date().toISOString() } })
        .eq("id", dev.id);
    return { paired: true as const, calibration: normaliseCalibrations(dev.calibration) };
  });

export type KioskDevice = {
  id: string;
  label: string | null;
  pairedBy: string;
  lastSeenAt: string | null;
  createdAt: string;
  display: (ReportedDisplay & { at?: string }) | null;
  calibration: ReturnType<typeof normaliseCalibrations>;
};

/** The host's view: this property's paired tablets, most recently seen first. */
export const listKioskDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as unknown as Loose)
      .from("kiosk_devices")
      .select("id, label, paired_by, last_seen_at, created_at, display, calibration")
      .eq("property_id", data.propertyId)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(20);
    // Before migration 0065 there's nothing to calibrate yet.
    if (error) return { available: false as const, devices: [] as KioskDevice[] };
    return {
      available: true as const,
      devices: (rows ?? []).map((r: any): KioskDevice => ({
        id: r.id,
        label: r.label ?? null,
        pairedBy: r.paired_by,
        lastSeenAt: r.last_seen_at,
        createdAt: r.created_at,
        display: r.display ?? null,
        calibration: normaliseCalibrations(r.calibration),
      })),
    };
  });

async function deviceProperty(db: Loose, id: string) {
  const { data } = await db
    .from("kiosk_devices")
    .select("id, calibration, properties(host_id, short_code)")
    .eq("id", id)
    .maybeSingle();
  if (!data?.properties) throw new Error("That tablet isn't paired any more.");
  return data as {
    id: string;
    calibration: unknown;
    properties: { host_id: string; short_code: string };
  };
}

const area = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite(),
  h: z.number().finite(),
  zoom: z.number().finite(),
});

/** Saves (or with null, resets) one way up's calibration for a tablet. Returns the code to ping. */
export const saveKioskCalibration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        deviceId: uuid,
        orientation: z.enum(["landscape", "portrait"]),
        calibration: z.object({ area, base: z.object({ w: px, h: px }) }).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const dev = await deviceProperty(db, data.deviceId);
    await requireWrite(context.supabase, dev.properties.host_id);
    const all = normaliseCalibrations(dev.calibration);
    if (data.calibration) {
      const one = normaliseCalibrations({
        [data.orientation]: { ...data.calibration, at: new Date().toISOString() },
      })[data.orientation] as Calibration | undefined;
      if (!one) throw new Error("That calibration doesn't fit this tablet.");
      all[data.orientation] = one;
    } else delete all[data.orientation];
    const { error } = await db.from("kiosk_devices").update({ calibration: all }).eq("id", dev.id);
    if (error) throw new Error(error.message);
    return { code: dev.properties.short_code, calibration: all };
  });

/** A name for a tablet, so the host can tell them apart ("Front door"). */
export const renameKioskDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ deviceId: uuid, label: z.string().trim().max(40) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const dev = await deviceProperty(db, data.deviceId);
    await requireWrite(context.supabase, dev.properties.host_id);
    const { error } = await db
      .from("kiosk_devices")
      .update({ label: data.label || null })
      .eq("id", dev.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
