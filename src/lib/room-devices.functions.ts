/* eslint-disable @typescript-eslint/no-explicit-any -- room_devices is from migration 0098, newer than the generated types */
/**
 * Room lights and switches (room-devices.ts). Hosts connect their
 * SmartThings account, link devices to rooms and try them; the guest staying
 * in the room controls them from their stay guide, from check-in until
 * check-out (deviceAccess). In demo mode (the business's "smart_home"
 * switch) nothing leaves Latchkey: one pretend bulb.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { hostOfProperty, requireSuperAdmin, requireWrite } from "@/lib/roles";
import {
  UNKNOWN_STATE,
  cleanCommand,
  controlsFor,
  isEmpty,
  isLight,
  knownCapabilities,
  type DeviceState,
} from "./room-devices";

const uuid = z.string().uuid();
const token = z.string().min(20).max(80);
const command = z.object({
  power: z.boolean().optional(),
  level: z.number().min(0).max(100).optional(),
  kelvin: z.number().min(1000).max(10000).optional(),
  hue: z.number().min(0).max(360).optional(),
  saturation: z.number().min(0).max(100).optional(),
});

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Plain words for SmartThings trouble; never the raw error. */
function friendly(e: unknown): Error {
  const reason =
    e instanceof Error && e.message.startsWith("smart_home:") ? e.message.slice(11) : "";
  const words: Record<string, string> = {
    not_connected: "Connect SmartThings first.",
    signed_out: "SmartThings signed Latchkey out. Connect SmartThings again.",
    busy: "SmartThings is busy. Try again in a moment.",
    offline: "SmartThings didn't answer. The light may be offline; try again in a moment.",
    refused: "SmartThings didn't accept that.",
    not_found: "That device isn't in the SmartThings account any more.",
  };
  return new Error(words[reason] ?? (e instanceof Error ? e.message : "Something went wrong."));
}

function origin(): string {
  const req = getRequest();
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}

/* ---------------------------------- host ---------------------------------- */

export const getRoomDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    const { data: member } = await context.supabase.rpc("is_host_member", { _host_id: hostId });
    if (member !== true) throw new Error("Property not found.");
    const sb = context.supabase as any;
    const [{ data: rooms }, devices, { data: staff }] = await Promise.all([
      sb
        .from("rooms")
        .select("id, display_name, sort_order")
        .eq("property_id", data.propertyId)
        .eq("active", true)
        .order("sort_order"),
      sb
        .from("room_devices")
        .select("id, room_id, label, capabilities, guest_on")
        .eq("property_id", data.propertyId)
        .order("created_at"),
      context.supabase.rpc("is_host_staff", { _host_id: hostId }),
    ]);
    const { linkInfo, smartThingsConfigured } = await import("./smartthings.server");
    const { smartHomeMode } = await import("./room-devices.server");
    return {
      hostId,
      mode: await smartHomeMode(hostId),
      configured: await smartThingsConfigured(),
      link: await linkInfo(hostId),
      canWrite: staff === true,
      // Before migration 0098 there's nothing to show.
      ready: !devices.error,
      rooms: ((rooms ?? []) as Array<{ id: string; display_name: string }>).map((r) => ({
        id: r.id,
        name: r.display_name,
      })),
      devices: ((devices.data ?? []) as any[]).map((d) => ({
        id: d.id as string,
        roomId: d.room_id as string,
        label: d.label as string,
        controls: controlsFor(d.capabilities ?? []),
        light: isLight(d.capabilities ?? []),
        guestOn: !!d.guest_on,
      })),
    };
  });

/** Where to send the host to sign in to SmartThings. */
export const smartThingsConnectUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, data.hostId);
    assertNotSharedDemo(context.claims as { email?: unknown });
    const { consentUrl, makeState, smartThingsConfigured } = await import("./smartthings.server");
    if (!(await smartThingsConfigured()))
      throw new Error("SmartThings isn't set up on Latchkey yet. Ask Latchkey support.");
    return { url: await consentUrl(await makeState(data.hostId, context.userId as string)) };
  });

export const disconnectSmartThings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, data.hostId);
    const { disconnect } = await import("./smartthings.server");
    await disconnect(data.hostId);
    return { ok: true };
  });

/** The devices in the business's SmartThings account (demo: one sample bulb). */
export const findSmartDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, data.hostId);
    const { smartHomeMode } = await import("./room-devices.server");
    const { demoDevices, listDevices } = await import("./smartthings.server");
    if ((await smartHomeMode(data.hostId)) === "demo") return { devices: demoDevices() };
    try {
      return { devices: await listDevices(data.hostId) };
    } catch (e) {
      throw friendly(e);
    }
  });

export const linkRoomDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ roomId: uuid, deviceId: z.string().trim().min(1).max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: room } = await context.supabase
      .from("rooms")
      .select("id, property_id")
      .eq("id", data.roomId)
      .maybeSingle();
    if (!room) throw new Error("Room not found.");
    const hostId = await hostOfProperty(context.supabase, room.property_id);
    await requireWrite(context.supabase, hostId);
    // What it can do comes from the account, never from the page.
    const { smartHomeMode } = await import("./room-devices.server");
    const { demoDevices, listDevices } = await import("./smartthings.server");
    const mode = await smartHomeMode(hostId);
    let found;
    try {
      found = (mode === "demo" ? demoDevices() : await listDevices(hostId)).find(
        (d) => d.deviceId === data.deviceId,
      );
    } catch (e) {
      throw friendly(e);
    }
    if (!found) throw new Error("That device isn't in the SmartThings account.");
    const { error } = await (await admin()).from("room_devices").upsert(
      {
        host_id: hostId,
        property_id: room.property_id,
        room_id: room.id,
        provider: "smartthings",
        device_id: found.deviceId,
        label: found.label,
        capabilities: knownCapabilities(found.capabilities),
      },
      { onConflict: "room_id,device_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function hostDevice(context: { supabase: any }, id: string) {
  // RLS: only members (and only their properties) see the row.
  const { data } = await context.supabase
    .from("room_devices")
    .select("id, host_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new Error("Device not found.");
  await requireWrite(context.supabase, data.host_id);
  const { DEVICE_COLUMNS } = await import("./room-devices.server");
  const { data: row } = await (
    await admin()
  )
    .from("room_devices")
    .select(DEVICE_COLUMNS)
    .eq("id", id)
    .single();
  return row as import("./room-devices.server").DeviceRow;
}

export const updateRoomDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        guestOn: z.boolean().optional(),
        label: z.string().trim().min(1).max(80).optional(),
        remove: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const row = await hostDevice(context, data.id);
    const sb = await admin();
    if (data.remove) {
      await sb.from("room_devices").delete().eq("id", row.id);
      return { ok: true };
    }
    const patch: Record<string, unknown> = {};
    if (data.guestOn !== undefined) patch["guest_on"] = data.guestOn;
    if (data.label) patch["label"] = data.label;
    if (Object.keys(patch).length) await sb.from("room_devices").update(patch).eq("id", row.id);
    return { ok: true };
  });

/** The host reads or tries a device from the dashboard (any time, whoever is staying). */
export const hostDeviceControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, command: command.optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const row = await hostDevice(context, data.id);
    const { commandDevice, readDevice, smartHomeMode } = await import("./room-devices.server");
    const mode = await smartHomeMode(row.host_id);
    try {
      const state = await readDevice(mode, row);
      if (!data.command) return { state };
      const cmd = cleanCommand(data.command, controlsFor(row.capabilities));
      if (isEmpty(cmd)) return { state };
      return { state: await commandDevice(mode, row, cmd, state) };
    } catch (e) {
      throw friendly(e);
    }
  });

/* ---------------------------------- guest ---------------------------------- */

const GUEST_WORDS = {
  expired: "This stay link has expired.",
  closed: "Room controls aren't available right now.",
  tooMany: "That's a lot of taps. Wait a moment and try again.",
};

/** The stay's room devices and their state, if the guest may use them now. */
export const getStayDevices = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const { guestRoom, readDevice } = await import("./room-devices.server");
    const g = await guestRoom(data.token).catch(() => null);
    if (!g || !g.devices.length) return { access: null, devices: [] };
    if (!g.access.ok) return { access: g.access, devices: [] };
    const devices = await Promise.all(
      g.devices.map(async (d) => {
        let state: DeviceState = UNKNOWN_STATE;
        try {
          state = await readDevice(g.mode, d);
        } catch {
          state = UNKNOWN_STATE;
        }
        return {
          id: d.id,
          label: d.label,
          controls: controlsFor(d.capabilities),
          light: isLight(d.capabilities),
          state,
        };
      }),
    );
    return { access: g.access, devices };
  });

export const controlStayDevice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token,
        id: uuid,
        command,
        /** What the page shows now, so a quick tap doesn't wait for a status read. */
        state: z
          .object({
            on: z.boolean().nullable(),
            level: z.number().nullable(),
            kelvin: z.number().nullable(),
            hue: z.number().nullable(),
            saturation: z.number().nullable(),
            online: z.boolean(),
          })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { guestRoom, commandDevice, countUse } = await import("./room-devices.server");
    const g = await guestRoom(data.token).catch(() => null);
    if (!g) throw new Error(GUEST_WORDS.expired);
    const row = g.devices.find((d) => d.id === data.id);
    if (!row || !g.access.ok) throw new Error(GUEST_WORDS.closed);
    const cmd = cleanCommand(data.command, controlsFor(row.capabilities));
    if (isEmpty(cmd)) return { state: data.state ?? UNKNOWN_STATE };
    if (!(await countUse(g.bookingId, row.id))) throw new Error(GUEST_WORDS.tooMany);
    try {
      return { state: await commandDevice(g.mode, row, cmd, data.state ?? UNKNOWN_STATE) };
    } catch (e) {
      throw friendly(e);
    }
  });

/* --------------------------- Latchkey's SmartThings app --------------------------- */

/** Latchkey admin → System → SmartThings: whether Latchkey's app exists, and its return address. */
export const getSmartThingsApp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { appStatus, callbackFor } = await import("./smartthings.server");
    return { app: await appStatus(), callback: callbackFor(origin()) };
  });

/** Makes Latchkey's SmartThings app with a token pasted once; the token itself isn't kept. */
export const setupSmartThingsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().trim().min(20).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { callbackFor, createApp } = await import("./smartthings.server");
    const { brandName } = await import("./brand");
    const site = origin();
    await createApp(data.token, callbackFor(site), brandName(), `${site}/privacy`);
    return { ok: true };
  });

export const forgetSmartThingsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { forgetApp } = await import("./smartthings.server");
    await forgetApp();
    return { ok: true };
  });
