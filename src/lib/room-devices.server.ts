/* eslint-disable @typescript-eslint/no-explicit-any -- room_devices is from migration 0098, newer than the generated types */
/**
 * Server only: room devices for a guest's stay token, and reading or
 * switching a device in demo mode (pretend state on the row) or live
 * (SmartThings, smartthings.server.ts). Rules in room-devices.ts.
 */
import { normaliseModes, type Mode } from "./integration-modes";
import {
  applyCommand,
  commandsFor,
  controlsFor,
  deviceAccess,
  demoState,
  normaliseProvider,
  stateFromTapo,
  tapoParams,
  USES_PER_MINUTE,
  type Access,
  type Command,
  type DeviceState,
  type Provider,
} from "./room-devices";

type Loose = { from: (t: string) => any };
async function db(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

export type DeviceRow = {
  id: string;
  host_id: string;
  provider: Provider;
  server_url: string | null;
  model: string | null;
  property_id: string;
  room_id: string;
  device_id: string;
  label: string;
  capabilities: string[];
  guest_on: boolean;
  demo_state: unknown;
};

export const DEVICE_COLUMNS =
  "id, host_id, provider, server_url, model, property_id, room_id, device_id, label, capabilities, guest_on, demo_state";

const PROVIDER_KEY = "room_lights";

/** Which service hosts connect with (Latchkey admin → System → Room lights). */
export async function activeProvider(): Promise<Provider> {
  const { data } = await (
    await db()
  )
    .from("platform_secrets")
    .select("value")
    .eq("key", PROVIDER_KEY)
    .maybeSingle();
  return normaliseProvider((data?.value as { provider?: unknown } | undefined)?.provider);
}

export async function setActiveProvider(provider: Provider): Promise<void> {
  const { error } = await (
    await db()
  )
    .from("platform_secrets")
    .upsert(
      { key: PROVIDER_KEY, value: { provider }, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw new Error(error.message);
}

export async function smartHomeMode(hostId: string): Promise<Mode> {
  const { data } = await (
    await db()
  )
    .from("hosts")
    .select("integration_modes")
    .eq("id", hostId)
    .maybeSingle();
  return normaliseModes(data?.integration_modes).smart_home;
}

export async function readDevice(mode: Mode, row: DeviceRow): Promise<DeviceState> {
  if (mode === "demo") return demoState(row.demo_state);
  if (row.provider === "tapo") {
    const { tapoInfo } = await import("./tapo.server");
    return stateFromTapo(await tapoInfo(row.host_id, row.server_url ?? "", row.device_id));
  }
  const { deviceState } = await import("./smartthings.server");
  return deviceState(row.host_id, row.device_id);
}

/** Sends the command; returns the state it should now be in (SmartThings confirms a moment later). */
export async function commandDevice(
  mode: Mode,
  row: DeviceRow,
  cmd: Command,
  before: DeviceState,
): Promise<DeviceState> {
  const after = applyCommand(mode === "demo" ? demoState(row.demo_state) : before, cmd);
  if (mode === "demo") {
    await (await db()).from("room_devices").update({ demo_state: after }).eq("id", row.id);
    return after;
  }
  if (row.provider === "tapo") {
    const { tapoSet } = await import("./tapo.server");
    await tapoSet(row.host_id, row.server_url ?? "", row.device_id, tapoParams(cmd));
    return after;
  }
  const { sendCommands } = await import("./smartthings.server");
  await sendCommands(row.host_id, row.device_id, commandsFor(cmd));
  return after;
}

export type GuestRoom = {
  bookingId: string;
  hostId: string;
  roomId: string | null;
  access: Access;
  devices: DeviceRow[];
  mode: Mode;
};

/** The stay behind a guest's token, whether they may use the room's devices now, and which devices. */
export async function guestRoom(token: string): Promise<GuestRoom | null> {
  const { admin, sha256 } = await import("./checkin.server");
  const sb = (await admin()) as unknown as Loose;
  const { data: t } = await sb
    .from("stay_tokens")
    .select("booking_id, expires_at")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (!t || Date.parse(t.expires_at) < Date.now()) return null;
  const { data: b } = await sb
    .from("bookings")
    .select(
      "id, property_id, room_id, status, check_in_date, check_out_date, check_in_time, check_out_time, archived_at, room_check, properties(host_id, timezone, default_check_in_time, default_check_out_time)",
    )
    .eq("id", t.booking_id)
    .maybeSingle();
  if (!b) return null;
  const { testRoomOf } = await import("./test-stay.server");
  const test = await testRoomOf(sb as never, b.id);
  const roomId: string | null = test.isTest ? (test.roomId ?? null) : (b.room_id ?? null);
  const { normaliseRoomCheck } = await import("./room-allocation");
  const held = !!normaliseRoomCheck(b.room_check)?.held || !roomId;
  const p = b.properties as {
    host_id: string;
    timezone: string | null;
    default_check_in_time: string | null;
    default_check_out_time: string | null;
  };
  const tz = p.timezone ?? "Europe/London";
  const now = new Date();
  let roomTaken = false;
  if (roomId) {
    const { todayInZone } = await import("./dates");
    const { zonedToUtc } = await import("./guide");
    const { data: others } = await sb
      .from("bookings")
      .select("id, check_out_date, check_out_time")
      .eq("room_id", roomId)
      .eq("status", "checked_in")
      .neq("id", b.id)
      .gte("check_out_date", todayInZone(tz));
    const out = (p.default_check_out_time ?? "11:00").slice(0, 5);
    roomTaken = (
      (others ?? []) as Array<{ check_out_date: string; check_out_time: string | null }>
    ).some((o) => zonedToUtc(o.check_out_date, (o.check_out_time ?? out).slice(0, 5), tz) > now);
  }
  const access = deviceAccess({
    now,
    timezone: tz,
    checkInDate: b.check_in_date,
    checkOutDate: b.check_out_date,
    checkInTime: (b.check_in_time ?? p.default_check_in_time ?? "15:00").slice(0, 5),
    checkOutTime: (b.check_out_time ?? p.default_check_out_time ?? "11:00").slice(0, 5),
    status: b.status,
    roomTaken,
    held,
  });
  let devices: DeviceRow[] = [];
  if (roomId) {
    const { data, error } = await sb
      .from("room_devices")
      .select(DEVICE_COLUMNS)
      .eq("room_id", roomId)
      .eq("guest_on", true)
      .order("created_at");
    devices = error
      ? []
      : ((data ?? []) as DeviceRow[]).filter((d) => controlsFor(d.capabilities).length > 0);
  }
  return {
    bookingId: b.id,
    hostId: p.host_id,
    roomId,
    access,
    devices,
    mode: await smartHomeMode(p.host_id),
  };
}

/** Counts a guest's tap; false when they've tapped too often this minute. */
export async function countUse(bookingId: string, deviceId: string): Promise<boolean> {
  const sb = await db();
  const { count } = await sb
    .from("room_device_uses")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId)
    .gte("at", new Date(Date.now() - 60_000).toISOString());
  if ((count ?? 0) >= USES_PER_MINUTE) return false;
  await sb.from("room_device_uses").insert({ booking_id: bookingId, device_id: deviceId });
  return true;
}

/** Whether a room has devices offered to guests (getStay shows the panel and its tile). */
export async function roomHasDevices(roomId: string | null | undefined): Promise<boolean> {
  if (!roomId) return false;
  const { count, error } = await (
    await db()
  )
    .from("room_devices")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("guest_on", true);
  return !error && (count ?? 0) > 0;
}
