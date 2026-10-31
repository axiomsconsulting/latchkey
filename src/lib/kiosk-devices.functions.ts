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
import {
  PAIR_CODE_HOURS,
  besideTabletInUse,
  newPairCode,
  nextNumber,
  readPairCode,
} from "@/lib/kiosk-devices";
import { effectiveCompat } from "@/lib/kiosk-compat";
import { SCREEN_VIEWS, normaliseScreen, type KioskScreen } from "@/lib/kiosk-screen";
import { hostOfProperty, requireWrite } from "@/lib/roles";

const secureRandom = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! / 2 ** 32;
};

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

/** What the tablet shows now (kiosk-screen.ts): which screen only, no guest details. */
const screen = z.object({
  view: z.enum(SCREEN_VIEWS),
  step: z.string().max(24).nullable().optional(),
  fullscreen: z.boolean().optional(),
  lite: z.boolean().optional(),
  camera: z.boolean().optional(),
});

/** Before migration 0073 there's no column: the report is simply dropped. */
async function saveScreen(db: Loose, id: string, s: z.infer<typeof screen>) {
  const value = normaliseScreen({ ...s, at: new Date().toISOString() });
  if (!value) return;
  await db
    .from("kiosk_devices")
    .update({ screen: value })
    .eq("id", id)
    .then(
      () => {},
      () => {},
    );
}

const fix = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100000),
});

/** What a tablet learns about itself each time it checks in. */
export type TabletState = {
  paired: boolean;
  /** Its token, only when it has just joined (the tablet keeps it). */
  device: string | null;
  status: "pending" | "confirmed" | null;
  number: number | null;
  label: string | null;
  /** Shown on a pending tablet for the host to type into the dashboard. */
  pairCode: string | null;
  calibration: ReturnType<typeof normaliseCalibrations>;
  /** The host is watching its camera until then (the tablet sends snapshots and says so on screen). */
  watchUntil: string | null;
  /** The host asked it to update: at once, or once nobody has used it for 15 minutes, from that time. */
  update: { at: string; mode: "now" | "idle" } | null;
  /** Runs the compatible kiosk for older tablets (/lite/<code>): the host's choice, else what it detected. */
  compat: boolean;
  /** The host chose compatibility mode on or off (null: it follows the detection). */
  compatChosen: boolean | null;
  /** The bell that puts today's guest cards up from the tablet itself (properties.kiosk_card_picker). */
  cardPicker: boolean;
};

const notPaired: TabletState = {
  paired: false,
  device: null,
  status: null,
  number: null,
  label: null,
  pairCode: null,
  calibration: {},
  watchUntil: null,
  update: null,
  compat: false,
  compatChosen: null,
  cardPicker: false,
};

/**
 * The tablet's side, on start, every few minutes and whenever its host
 * pings: says what it is (display, app version, connection, location when
 * already allowed) and gets back its number, name, setup code, calibration
 * and whether it's being watched. A tablet without a token joins: on the
 * same Wi-Fi as (or close by) a tablet already in use, and when the host
 * allows it, straight in (the host is told); otherwise pending, with a code.
 */
export const kioskTablet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code,
        device: device.optional(),
        display: display.optional(),
        version: z.string().max(20).optional(),
        fix: fix.nullable().optional(),
        /** What this browser says about itself: whether it needs compatibility mode (kiosk-compat.ts). */
        compat: z
          .object({ detected: z.boolean(), reason: z.string().max(120).nullable() })
          .optional(),
        screen: screen.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<TabletState> => {
    const db = await admin();
    const { sha256, newToken, withLegacy } = await import("./checkin.server");
    const { data: p } = await withLegacy<any>(
      () =>
        db
          .from("properties")
          .select("id, host_id, name, is_demo, kiosk_auto_pair")
          .eq("short_code", data.code.toLowerCase())
          .maybeSingle(),
      () =>
        db
          .from("properties")
          .select("id, host_id, name, is_demo")
          .eq("short_code", data.code.toLowerCase())
          .maybeSingle(),
    );
    // The demo properties' tour never pairs anything.
    if (!p || p.is_demo) return notPaired;
    // Before migration 0072 there's no bell setting: it's off until then.
    const { data: pick, error: pickErr } = await db
      .from("properties")
      .select("kiosk_card_picker")
      .eq("id", p.id)
      .maybeSingle();
    const cardPicker = !pickErr && pick?.kiosk_card_picker !== false;
    const { requestNet } = await import("./stay-access.server");
    const net = await requestNet();
    const now = new Date();
    const located =
      data.fix && data.fix.accuracy <= 500
        ? {
            lat: Math.round(data.fix.lat * 10_000) / 10_000,
            lng: Math.round(data.fix.lng * 10_000) / 10_000,
            accuracy_m: Math.round(data.fix.accuracy),
            located_at: now.toISOString(),
          }
        : {};
    const report = {
      net_hash: net?.hash ?? null,
      net_day: net?.day ?? null,
      last_seen_at: now.toISOString(),
      ...(data.display ? { display: { ...data.display, at: now.toISOString() } } : {}),
      ...(data.version ? { app_version: data.version } : {}),
      ...located,
    };
    // Also before migration 0072: written on its own so the rest of the report never fails with it.
    const reportCompat = async (id: string) => {
      if (!data.compat) return;
      await db
        .from("kiosk_devices")
        .update({ compat_detected: data.compat.detected, compat_reason: data.compat.reason })
        .eq("id", id)
        .then(
          () => {},
          () => {},
        );
    };
    const state = (r: any, token: string | null): TabletState => ({
      paired: r.status !== "pending",
      device: token,
      status: r.status ?? "confirmed",
      number: r.number ?? null,
      label: r.label ?? null,
      pairCode: r.status === "pending" ? (r.pair_code ?? null) : null,
      calibration: normaliseCalibrations(r.calibration),
      watchUntil:
        r.camera_allowed && r.watch_until && Date.parse(r.watch_until) > Date.now()
          ? r.watch_until
          : null,
      update: r.update_requested_at
        ? { at: r.update_requested_at, mode: r.update_mode === "now" ? "now" : "idle" }
        : null,
      compat: effectiveCompat(
        r.compat,
        data.compat ? data.compat.detected : r.compat_detected === true,
      ),
      compatChosen: typeof r.compat === "boolean" ? r.compat : null,
      cardPicker: cardPicker && r.status !== "pending",
    });

    if (data.device) {
      const { data: dev, error } = await db
        .from("kiosk_devices")
        .select("*")
        .eq("token_hash", sha256(data.device))
        .eq("property_id", p.id)
        .maybeSingle();
      // Before migration 0067 the newer columns aren't there: it still works as a paired tablet.
      if (!error && dev) {
        const renew =
          dev.status === "pending" &&
          (!dev.pair_code_expires_at || Date.parse(dev.pair_code_expires_at) < Date.now())
            ? {
                pair_code: newPairCode(secureRandom),
                pair_code_expires_at: new Date(
                  Date.now() + PAIR_CODE_HOURS * 3_600_000,
                ).toISOString(),
              }
            : {};
        await db
          .from("kiosk_devices")
          .update({ ...report, ...renew })
          .eq("id", dev.id);
        await reportCompat(dev.id);
        if (data.screen) await saveScreen(db, dev.id, data.screen);
        return state({ ...dev, ...renew }, null);
      }
      if (error) return notPaired;
    }

    // A new tablet: numbered, then straight in beside a tablet in use (if allowed), or pending with a code.
    const { data: all, error: listErr } = await db
      .from("kiosk_devices")
      .select(
        "id, number, status, net_hash, net_day, last_seen_at, lat, lng, accuracy_m, created_at",
      )
      .eq("property_id", p.id);
    if (listErr) return notPaired;
    const rows = (all ?? []) as any[];
    // Pending tablets that never came back are tidied away; a flood of new ones is refused.
    const stale = rows.filter(
      (r) =>
        r.status === "pending" &&
        Date.parse(r.last_seen_at ?? r.created_at) < Date.now() - 7 * 86_400_000,
    );
    if (stale.length)
      await db
        .from("kiosk_devices")
        .delete()
        .in(
          "id",
          stale.map((r) => r.id),
        );
    const live = rows.filter((r) => !stale.includes(r));
    if (live.filter((r) => r.status === "pending").length >= 10) return notPaired;
    const number = nextNumber(live.map((r) => r.number));
    if (number === null) return notPaired;
    const inUse = live
      .filter((r) => r.status !== "pending")
      .map((r) => ({
        netHash: r.net_hash,
        netDay: r.net_day,
        lastSeenAt: r.last_seen_at,
        fix:
          r.lat !== null && r.lng !== null
            ? { lat: r.lat, lng: r.lng, accuracy: r.accuracy_m ?? 100 }
            : null,
      }));
    const auto =
      p.kiosk_auto_pair !== false &&
      besideTabletInUse(
        { netHash: net?.hash ?? null, day: now.toISOString().slice(0, 10), fix: data.fix ?? null },
        inUse,
        Date.now(),
      );
    const t = newToken();
    const row = {
      property_id: p.id,
      token_hash: t.hash,
      number,
      status: auto ? "confirmed" : "pending",
      paired_by: auto ? "network" : "pending",
      pair_code: auto ? null : newPairCode(secureRandom),
      pair_code_expires_at: auto
        ? null
        : new Date(Date.now() + PAIR_CODE_HOURS * 3_600_000).toISOString(),
      ...report,
    };
    const { data: made, error: insErr } = await db
      .from("kiosk_devices")
      .insert(row)
      .select("*")
      .single();
    if (insErr || !made) return notPaired;
    await reportCompat(made.id);
    if (auto) {
      const { raiseAlert } = await import("./checkin.server");
      await raiseAlert({
        hostId: p.host_id,
        propertyId: p.id,
        kind: "tablet_joined",
        message: `A new door tablet joined at ${p.name} as Tablet ${number}: it opened the kiosk on the same Wi-Fi as a tablet in use. Not yours? Remove it in Settings → Door tablets.`,
      }).catch(() => {});
    }
    return state(made, t.token);
  });

/** The tablet's screen changed (a check-in step, the screensaver, cards): for the host's live view. */
export const kioskScreenReport = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code, device, screen }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { sha256 } = await import("./checkin.server");
    const { data: dev } = await db
      .from("kiosk_devices")
      .select("id, properties(short_code)")
      .eq("token_hash", sha256(data.device))
      .maybeSingle();
    if (!dev || dev.properties?.short_code !== data.code.toLowerCase()) return { ok: false };
    await db
      .from("kiosk_devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", dev.id);
    await saveScreen(db, dev.id, data.screen);
    return { ok: true };
  });

/** The tablet's camera picture while its host watches (latest only); says how long they'll keep watching. */
export const kioskSnapshotUpload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code,
        device,
        image: z
          .string()
          .max(280_000)
          .regex(/^data:image\/jpeg;base64,/),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { sha256 } = await import("./checkin.server");
    const { data: dev } = await db
      .from("kiosk_devices")
      .select("id, property_id, camera_allowed, watch_until, status, properties(short_code)")
      .eq("token_hash", sha256(data.device))
      .maybeSingle();
    const watching =
      !!dev &&
      dev.status === "confirmed" &&
      dev.camera_allowed &&
      dev.properties?.short_code === data.code.toLowerCase() &&
      !!dev.watch_until &&
      Date.parse(dev.watch_until) > Date.now();
    if (!watching) return { watchUntil: null };
    await db.from("kiosk_snapshots").upsert(
      {
        device_id: dev.id,
        property_id: dev.property_id,
        image: data.image,
        taken_at: new Date().toISOString(),
      },
      { onConflict: "device_id" },
    );
    return { watchUntil: dev.watch_until as string };
  });

export type KioskDevice = {
  id: string;
  label: string | null;
  number: number | null;
  status: "pending" | "confirmed";
  pairedBy: string;
  lastSeenAt: string | null;
  createdAt: string;
  appVersion: string | null;
  cameraAllowed: boolean;
  /** What it shows now, as it last said (the host's live view). */
  screen: KioskScreen | null;
  /** Compatibility mode: on (chosen or detected), the host's choice, and what the tablet detected. */
  compat: boolean;
  compatChosen: boolean | null;
  compatDetected: boolean;
  compatReason: string | null;
  display: (ReportedDisplay & { at?: string }) | null;
  calibration: ReturnType<typeof normaliseCalibrations>;
};

/** The host's view: this property's tablets by number, and whether new ones on its Wi-Fi join by themselves. */
export const listKioskDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const { data: rows, error } = await sb
      .from("kiosk_devices")
      .select("*")
      .eq("property_id", data.propertyId)
      .order("number", { ascending: true, nullsFirst: false })
      .limit(99);
    // Before migration 0065 there's nothing to calibrate yet.
    if (error)
      return {
        available: false as const,
        devices: [] as KioskDevice[],
        autoPair: true,
        cardPicker: true,
        compatAvailable: false,
      };
    const { data: prop } = await sb
      .from("properties")
      .select("kiosk_auto_pair")
      .eq("id", data.propertyId)
      .maybeSingle();
    // Migration 0072: the bell and compatibility mode.
    const { data: pick, error: pickErr } = await sb
      .from("properties")
      .select("kiosk_card_picker")
      .eq("id", data.propertyId)
      .maybeSingle();
    return {
      available: true as const,
      autoPair: prop?.kiosk_auto_pair !== false,
      cardPicker: !pickErr && pick?.kiosk_card_picker !== false,
      compatAvailable: !pickErr,
      devices: (rows ?? []).map((r: any): KioskDevice => ({
        id: r.id,
        label: r.label ?? null,
        number: r.number ?? null,
        status: r.status === "pending" ? "pending" : "confirmed",
        pairedBy: r.paired_by,
        lastSeenAt: r.last_seen_at,
        createdAt: r.created_at,
        appVersion: r.app_version ?? null,
        cameraAllowed: r.camera_allowed === true,
        screen: normaliseScreen(r.screen),
        compat: effectiveCompat(r.compat, r.compat_detected === true),
        compatChosen: typeof r.compat === "boolean" ? r.compat : null,
        compatDetected: r.compat_detected === true,
        compatReason: r.compat_reason ?? null,
        display: r.display ?? null,
        calibration: normaliseCalibrations(r.calibration),
      })),
    };
  });

/** The host types the six digits shown on a new tablet: it's theirs now. Returns the code to ping. */
export const pairKioskByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, pairCode: z.string().max(20) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const pairCode = readPairCode(data.pairCode);
    if (!pairCode) throw new Error("Type the six digits shown on the tablet.");
    const db = await admin();
    // A wrong code costs a moment, so codes can't be tried quickly.
    await new Promise((r) => setTimeout(r, 500));
    const { data: dev } = await db
      .from("kiosk_devices")
      .select("id, number, pair_code_expires_at, properties(short_code)")
      .eq("property_id", data.propertyId)
      .eq("status", "pending")
      .eq("pair_code", pairCode)
      .maybeSingle();
    if (!dev || (dev.pair_code_expires_at && Date.parse(dev.pair_code_expires_at) < Date.now()))
      throw new Error(
        "That code doesn't match a tablet waiting at this property. Check the digits on the tablet (and that it shows this property).",
      );
    await db
      .from("kiosk_devices")
      .update({
        status: "confirmed",
        paired_by: "code",
        pair_code: null,
        pair_code_expires_at: null,
      })
      .eq("id", dev.id);
    return { code: dev.properties?.short_code as string, number: dev.number as number };
  });

/** Whether tablets that open the kiosk on this property's Wi-Fi (or close by) join by themselves. */
export const setKioskAutoPair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, on: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const { error } = await (
      await admin()
    )
      .from("properties")
      .update({ kiosk_auto_pair: data.on })
      .eq("id", data.propertyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Whether the door tablet's bell can put today's guest cards up (on by default). */
export const setKioskCardPicker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, on: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const { data: p, error } = await (
      await admin()
    )
      .from("properties")
      .update({ kiosk_card_picker: data.on })
      .eq("id", data.propertyId)
      .select("short_code")
      .single();
    if (error)
      throw new Error(
        /kiosk_card_picker/.test(error.message)
          ? "The bell needs the latest update (migration 0072)."
          : error.message,
      );
    return { code: p.short_code as string };
  });

/**
 * Compatibility mode for one tablet: on, off, or null to follow what the
 * tablet detected. Returns the code to ping, so it switches at once.
 */
export const setKioskCompat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ deviceId: uuid, on: z.boolean().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const dev = await deviceProperty(db, data.deviceId);
    await requireWrite(context.supabase, dev.properties.host_id);
    const { error } = await db
      .from("kiosk_devices")
      .update({ compat: data.on })
      .eq("id", data.deviceId);
    if (error)
      throw new Error(
        /compat/.test(error.message)
          ? "Compatibility mode needs the latest update (migration 0072)."
          : error.message,
      );
    return { code: dev.properties.short_code as string };
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

/** Removes a tablet: it starts again as a new, pending one if it opens the kiosk. */
export const removeKioskDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ deviceId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const dev = await deviceProperty(db, data.deviceId);
    await requireWrite(context.supabase, dev.properties.host_id);
    const { error } = await db.from("kiosk_devices").delete().eq("id", dev.id);
    if (error) throw new Error(error.message);
    return { code: dev.properties.short_code };
  });

/**
 * Lets the host view a tablet's camera. Switching it on needs the host to
 * confirm guests are told (a notice by the tablet, and their privacy notice).
 */
export const setKioskCamera = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ deviceId: uuid, allowed: z.boolean(), guestsTold: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const dev = await deviceProperty(db, data.deviceId);
    await requireWrite(context.supabase, dev.properties.host_id);
    if (data.allowed && !data.guestsTold)
      throw new Error("Please confirm guests are told about the camera first.");
    await db
      .from("kiosk_devices")
      .update({ camera_allowed: data.allowed, ...(data.allowed ? {} : { watch_until: null }) })
      .eq("id", dev.id);
    if (!data.allowed) await db.from("kiosk_snapshots").delete().eq("device_id", dev.id);
    return { code: dev.properties.short_code };
  });

/**
 * The host is watching these tablets' cameras: keeps them sending a picture
 * every few seconds for the next minute, and returns the latest ones. Only
 * tablets the host switched the camera on for; nothing is kept afterwards.
 */
export const watchKiosks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, deviceIds: z.array(uuid).max(99) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const db = await admin();
    const until = new Date(Date.now() + 60_000).toISOString();
    if (data.deviceIds.length)
      await db
        .from("kiosk_devices")
        .update({ watch_until: until })
        .eq("property_id", data.propertyId)
        .eq("camera_allowed", true)
        .eq("status", "confirmed")
        .in("id", data.deviceIds);
    const { data: shots } = data.deviceIds.length
      ? await db
          .from("kiosk_snapshots")
          .select("device_id, image, taken_at")
          .eq("property_id", data.propertyId)
          .in("device_id", data.deviceIds)
      : { data: [] };
    return {
      shots: ((shots ?? []) as any[]).map((r) => ({
        deviceId: r.device_id as string,
        image: r.image as string,
        takenAt: r.taken_at as string,
      })),
    };
  });

/** The host stopped watching: the tablets stop sending, and the last pictures are deleted. */
export const stopWatchingKiosks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const db = await admin();
    await db.from("kiosk_devices").update({ watch_until: null }).eq("property_id", data.propertyId);
    await db.from("kiosk_snapshots").delete().eq("property_id", data.propertyId);
    return { ok: true };
  });
