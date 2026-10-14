/**
 * Runs Latchkey API actions for the REST endpoints and the MCP server.
 * Every call is authenticated by an API key, checked against the routine
 * switch, the host's subscription, their plan's monthly allowance and the
 * key's scope, counted, and kept to the key owner's own properties.
 */
import { createHash } from "crypto";

import { OPERATIONS, type Operation, type ParsedInput } from "./api-spec";
import { todayInZone } from "./dates";
import { apiAllowance, normaliseModel, planFor } from "./pricing-model";
import { bumpUsage, jobAllowed } from "./usage.server";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type Db = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };

async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

export type ApiCaller = { hostId: string; keyId: string; scopes: string[]; allowance: number; used: number };

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function monthStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

/** Who is calling, and whether they may. Throws ApiError with a plain reason. */
export async function authenticate(key: string | null): Promise<ApiCaller> {
  if (!(await jobAllowed("api"))) throw new ApiError(503, "api_paused", "The Latchkey API is paused for maintenance. Please try again later.");
  if (!key || !/^lk_[A-Za-z0-9_]{20,80}$/.test(key)) {
    throw new ApiError(401, "missing_key", "Send your Latchkey API key as: Authorization: Bearer lk_…");
  }
  const db = await admin();
  const { data: k } = await db.from("api_keys").select("id, host_id, scopes, revoked_at, last_used_at").eq("key_hash", hashKey(key)).maybeSingle();
  if (!k || k.revoked_at) throw new ApiError(401, "bad_key", "That API key isn't valid. It may have been revoked; make a new one in Settings → API & MCP.");

  const { data: access } = await db.rpc("host_has_access", { _host_id: k.host_id });
  if (access === false) throw new ApiError(403, "subscription_ended", "This Latchkey account's trial or subscription has ended.");

  const [{ data: host }, { data: site }, { data: usage }] = await Promise.all([
    db.from("hosts").select("plan_key, api_addon").eq("id", k.host_id).maybeSingle(),
    db.from("site_settings").select("pricing_model").eq("id", 1).maybeSingle(),
    db.from("usage_daily").select("count").eq("host_id", k.host_id).eq("metric", "api:request").gte("day", monthStart()),
  ]);
  const model = normaliseModel((site as { pricing_model?: unknown } | null)?.pricing_model);
  const plan = planFor(model, (host as { plan_key?: string } | null)?.plan_key);
  const allowance = apiAllowance(model, plan, (host as { api_addon?: boolean } | null)?.api_addon === true);
  if (allowance === 0) {
    throw new ApiError(403, "not_on_plan", "The API and MCP server aren't on this plan. Add them in Billing (API add-on) or move to Pro.");
  }
  const used = ((usage ?? []) as Array<{ count: number }>).reduce((n, r) => n + Number(r.count), 0);
  if (used >= allowance) {
    throw new ApiError(429, "allowance_used", `This month's ${allowance.toLocaleString("en-GB")} requests are used up. It resets on the 1st, or upgrade in Billing.`);
  }
  if (!k.last_used_at || Date.now() - Date.parse(k.last_used_at) > 5 * 60_000) {
    await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", k.id);
  }
  return { hostId: k.host_id, keyId: k.id, scopes: k.scopes ?? ["read"], allowance, used };
}

/** Runs one action for an authenticated caller and counts it. */
export async function runOperation(caller: ApiCaller, op: Operation, input: ParsedInput, via: "rest" | "mcp"): Promise<unknown> {
  if (op.scope === "write" && !caller.scopes.includes("write")) {
    throw new ApiError(403, "read_only_key", "This key can only read. Make a key with write access to change bookings or message guests.");
  }
  await bumpUsage(caller.hostId, "api:request");
  await bumpUsage(caller.hostId, `api:${via}`);
  const handler = HANDLERS[op.id];
  if (!handler) throw new ApiError(404, "unknown_action", "That action doesn't exist.");
  return handler(caller, input);
}

/* -------------------------------- helpers -------------------------------- */

async function myProperties(hostId: string) {
  const db = await admin();
  const { data } = await db
    .from("properties")
    .select("id, name, short_code, timezone, default_check_in_time, default_check_out_time")
    .eq("host_id", hostId)
    .eq("is_demo", false);
  return (data ?? []) as Array<{ id: string; name: string; short_code: string; timezone: string | null; default_check_in_time: string | null; default_check_out_time: string | null }>;
}

async function requireProperty(hostId: string, id: string) {
  const p = (await myProperties(hostId)).find((x) => x.id === id);
  if (!p) throw new ApiError(404, "not_found", "No property with that id in your account.");
  return p;
}

async function requireBooking(hostId: string, id: string) {
  const db = await admin();
  const ids = (await myProperties(hostId)).map((p) => p.id);
  const { data } = await db.from("bookings").select("*, rooms(display_name)").eq("id", id).maybeSingle();
  if (!data || !ids.includes(data.property_id)) throw new ApiError(404, "not_found", "No booking with that id in your account.");
  return data as any;
}

function nightsOf(a: string, b: string) {
  return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));
}

function bookingOut(b: any) {
  return {
    id: b.id,
    property_id: b.property_id,
    room: b.rooms?.display_name ?? null,
    guest_name: b.guest_full_name ?? null,
    check_in: b.check_in_date,
    check_out: b.check_out_date,
    nights: nightsOf(b.check_in_date, b.check_out_date),
    guests: b.guest_count ?? null,
    status: b.status,
    booked_on: b.channel,
    reference: b.reservation_code ?? null,
    checked_in_at: b.checked_in_at ?? null,
    adults: b.arrived_adults ?? null,
    children: b.arrived_children ?? null,
    notes: b.notes ?? null,
  };
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/* -------------------------------- actions -------------------------------- */

type Handler = (c: ApiCaller, i: ParsedInput) => Promise<unknown>;

const HANDLERS: Record<string, Handler> = {
  async list_properties(c) {
    return {
      data: (await myProperties(c.hostId)).map((p) => ({
        id: p.id,
        name: p.name,
        short_code: p.short_code,
        check_in_from: (p.default_check_in_time ?? "15:00").slice(0, 5),
        check_out_by: (p.default_check_out_time ?? "11:00").slice(0, 5),
      })),
    };
  },

  async list_rooms(c, i) {
    await requireProperty(c.hostId, String(i["property_id"]));
    const db = await admin();
    const { data } = await db.from("rooms").select("*").eq("property_id", i["property_id"]).eq("active", true).order("sort_order");
    return {
      data: ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        name: r.display_name,
        title: r.public_title ?? null,
        sleeps: r.max_guests,
        children_allowed: r.children_allowed ?? true,
      })),
    };
  },

  async list_bookings(c, i) {
    const props = await myProperties(c.hostId);
    const ids = i["property_id"] ? [String((await requireProperty(c.hostId, String(i["property_id"]))).id)] : props.map((p) => p.id);
    if (!ids.length) return { data: [] };
    const today = todayInZone(props[0]?.timezone ?? "Europe/London");
    const from = String(i["from"] ?? today);
    const to = String(i["to"] ?? addDays(from, 30));
    const db = await admin();
    let q = db
      .from("bookings")
      .select("*, rooms(display_name)")
      .in("property_id", ids)
      .lte("check_in_date", to)
      .gt("check_out_date", from)
      .is("mirror_of", null)
      .order("check_in_date", { ascending: false })
      .limit(Math.min(200, Number(i["limit"] ?? 50)));
    if (i["status"]) q = q.eq("status", i["status"]);
    const { data } = await q;
    return { data: ((data ?? []) as any[]).map(bookingOut) };
  },

  async get_booking(c, i) {
    return { data: bookingOut(await requireBooking(c.hostId, String(i["booking_id"]))) };
  },

  async todays_arrivals(c, i) {
    const props = i["property_id"] ? [await requireProperty(c.hostId, String(i["property_id"]))] : await myProperties(c.hostId);
    const date = String(i["date"] ?? todayInZone(props[0]?.timezone ?? "Europe/London"));
    if (!props.length) return { data: { date, arriving: [], leaving: [], staying: [] } };
    const db = await admin();
    const { data } = await db
      .from("bookings")
      .select("*, rooms(display_name)")
      .in("property_id", props.map((p) => p.id))
      .lte("check_in_date", date)
      .gte("check_out_date", date)
      .is("mirror_of", null)
      .not("status", "in", "(cancelled,blocked)");
    const rows = (data ?? []) as any[];
    const brief = (b: any) => ({ booking_id: b.id, guest_name: b.guest_full_name ?? null, room: b.rooms?.display_name ?? null, status: b.status });
    return {
      data: {
        date,
        arriving: rows.filter((b) => b.check_in_date === date).map(brief),
        leaving: rows.filter((b) => b.check_out_date === date).map(brief),
        staying: rows.filter((b) => b.check_in_date < date && b.check_out_date > date).map(brief),
      },
    };
  },

  async create_booking(c, i) {
    const p = await requireProperty(c.hostId, String(i["property_id"]));
    const db = await admin();
    if (i["room_id"]) {
      const { data: room } = await db.from("rooms").select("id").eq("id", i["room_id"]).eq("property_id", p.id).maybeSingle();
      if (!room) throw new ApiError(400, "bad_room", "That room isn't in this property.");
    }
    const checkIn = String(i["check_in"]);
    const checkOut = String(i["check_out"]);
    if (checkOut <= checkIn) throw new ApiError(400, "bad_dates", "check_out must be after check_in.");
    const row: Record<string, unknown> = {
      property_id: p.id,
      room_id: i["room_id"] ?? null,
      source: "api",
      channel: "direct",
      guest_full_name: String(i["guest_name"]).trim().slice(0, 120),
      guest_count: Math.max(1, Math.min(30, Number(i["guests"] ?? 1))),
      guest_email: i["email"] ? String(i["email"]).trim().slice(0, 254) : null,
      check_in_date: checkIn,
      check_out_date: checkOut,
      check_in_time: p.default_check_in_time ?? "15:00",
      check_out_time: p.default_check_out_time ?? "11:00",
      status: "upcoming",
      notes: i["notes"] ? String(i["notes"]).slice(0, 2000) : null,
    };
    if (i["amount"] !== undefined) row["stay_amount_pence"] = Math.round(Number(i["amount"]) * 100);
    let { data, error } = await db.from("bookings").insert(row).select("id, status").single();
    if (error && row["stay_amount_pence"] !== undefined) {
      delete row["stay_amount_pence"];
      ({ data, error } = await db.from("bookings").insert(row).select("id, status").single());
    }
    if (error) throw new ApiError(400, "not_saved", "That booking couldn't be saved. Check the dates and room.");
    return { data };
  },

  async update_booking(c, i) {
    const b = await requireBooking(c.hostId, String(i["booking_id"]));
    const db = await admin();
    const patch: Record<string, unknown> = {};
    if (i["guest_name"] !== undefined) patch["guest_full_name"] = String(i["guest_name"]).trim().slice(0, 120);
    if (i["email"] !== undefined) patch["guest_email"] = String(i["email"]).trim().slice(0, 254) || null;
    if (i["notes"] !== undefined) patch["notes"] = String(i["notes"]).slice(0, 2000);
    if (i["status"] !== undefined) {
      patch["status"] = i["status"];
      if (i["status"] === "checked_in" && !b.checked_in_at) patch["checked_in_at"] = new Date().toISOString();
    }
    if (i["room_id"] !== undefined) {
      const { data: room } = await db.from("rooms").select("id").eq("id", i["room_id"]).eq("property_id", b.property_id).maybeSingle();
      if (!room) throw new ApiError(400, "bad_room", "That room isn't in this booking's property.");
      patch["room_id"] = i["room_id"];
    }
    if (Object.keys(patch).length === 0) throw new ApiError(400, "nothing_to_change", "Send at least one field to change.");
    // A host's hand edits win over calendar syncs, the same as in the app.
    const manual = new Set<string>(b.manual_fields ?? []);
    for (const k of Object.keys(patch)) if (["guest_full_name", "status"].includes(k) && b.source === "ical") manual.add(k);
    const { data, error } = await db.from("bookings").update({ ...patch, manual_fields: [...manual] }).eq("id", b.id).select("id, status").single();
    if (error) throw new ApiError(400, "not_saved", "That change couldn't be saved.");
    return { data };
  },

  async list_requests(c, i) {
    const ids = (await myProperties(c.hostId)).map((p) => p.id);
    if (!ids.length) return { data: [] };
    const db = await admin();
    const openOnly = i["open_only"] !== false;
    const limit = Math.min(100, Number(i["limit"] ?? 30));
    const { data: bookings } = await db.from("bookings").select("id, guest_full_name").in("property_id", ids);
    const names = new Map(((bookings ?? []) as Array<{ id: string; guest_full_name: string | null }>).map((b) => [b.id, b.guest_full_name]));
    const bookingIds = [...names.keys()];
    const [extras, jobs] = await Promise.all([
      bookingIds.length
        ? db.from("requests").select("id, booking_id, status, items, created_at").in("booking_id", bookingIds).order("created_at", { ascending: false }).limit(limit)
        : Promise.resolve({ data: [] }),
      db.from("service_jobs").select("id, booking_id, title, status, created_at, source").eq("host_id", c.hostId).eq("source", "guest").order("created_at", { ascending: false }).limit(limit),
    ]);
    const done = ["done", "declined", "cancelled", "confirmed", "delivered", "rejected"];
    const rows = [
      ...((extras.data ?? []) as any[]).map((r) => ({
        id: r.id,
        kind: "extras",
        guest_name: names.get(r.booking_id) ?? null,
        what: Array.isArray(r.items) ? r.items.map((x: any) => `${x.qty ?? 1} × ${x.name ?? x.key}`).join(", ") : "Extras",
        status: r.status,
        created_at: r.created_at,
        booking_id: r.booking_id,
      })),
      ...((jobs.data ?? []) as any[]).map((j) => ({
        id: j.id,
        kind: "request",
        guest_name: j.booking_id ? (names.get(j.booking_id) ?? null) : null,
        what: j.title,
        status: j.status,
        created_at: j.created_at,
        booking_id: j.booking_id,
      })),
    ]
      .filter((r) => !openOnly || !done.includes(r.status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
    return { data: rows };
  },

  async send_guest_message(c, i) {
    const b = await requireBooking(c.hostId, String(i["booking_id"]));
    const db = await admin();
    const sentAt = new Date().toISOString();
    const { data, error } = await db
      .from("messages")
      .insert({ booking_id: b.id, direction: "outbound", channel: "stay_page", body: String(i["message"]).slice(0, 2000), sent_at: sentAt })
      .select("id")
      .single();
    if (error) throw new ApiError(400, "not_sent", "That message couldn't be sent.");
    return { data: { id: data.id, sent_at: sentAt } };
  },

  async get_usage(c) {
    return { data: { month: monthStart().slice(0, 7), requests: c.used + 1, included: c.allowance } };
  },
};

/** For the docs page's sanity: every action has a handler. */
export function missingHandlers(): string[] {
  return OPERATIONS.filter((o) => !HANDLERS[o.id]).map((o) => o.id);
}

