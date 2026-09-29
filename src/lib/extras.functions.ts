/**
 * Price list (host), extras basket (guest, stay token) and request decisions (host).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_EXTRAS, availableWindows, basketAutoApproves, earlyCheckinOptions, lateCheckoutOptions, priceBasket,
  type ExtraItem, type ExtraUnit, type WindowKey,
} from "./extras";

const uuid = z.string().uuid();
const token = z.string().min(20).max(80);
const HOLD_MS = 2 * 3600_000;

type Row = {
  item_key: string | null; name: string; price_pence: number; unit: string; max_qty: number; is_free: boolean;
  auto_approve: boolean; active: boolean; is_loan: boolean; options: unknown; sort_order: number;
};

function toItem(r: Row): ExtraItem {
  const sizes = (r.options as { sizes?: ExtraItem["sizes"] } | null)?.sizes;
  return {
    key: r.item_key ?? r.name, name: r.name, pricePence: r.price_pence, unit: r.unit as ExtraUnit, maxQty: r.max_qty,
    isFree: r.is_free, autoApprove: r.auto_approve, active: r.active, isLoan: r.is_loan, ...(sizes ? { sizes } : {}),
  };
}

const COLS = "item_key, name, price_pence, unit, max_qty, is_free, auto_approve, active, is_loan, options, sort_order";

async function loadItems(db: any, propertyId: string, currency: string, seed: boolean): Promise<ExtraItem[]> {
  const { data } = await db.from("extras_catalogue").select(COLS).eq("property_id", propertyId).not("item_key", "is", null).order("sort_order");
  if ((data ?? []).length || !seed) return (data ?? []).map(toItem);
  const rows = DEFAULT_EXTRAS.map((e, i) => ({
    property_id: propertyId, item_key: e.key, name: e.name, price_pence: e.pricePence, unit: e.unit, max_qty: e.maxQty,
    is_free: e.isFree, auto_approve: e.autoApprove, active: e.active, is_loan: e.isLoan, sort_order: i, currency,
    requires_approval: !e.autoApprove, options: e.sizes ? { sizes: e.sizes } : {},
  }));
  await db.from("extras_catalogue").insert(rows);
  return DEFAULT_EXTRAS;
}

/* --------------------------------- host --------------------------------- */

export const getPriceList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: p } = await context.supabase.from("properties").select("id, hosts(currency, tax_registered, tax_label, tax_rate_bp, prices_include_tax, bank_details, out_until)").eq("id", data.propertyId).single();
    if (!p) throw new Error("Property not found.");
    const h = (p as any).hosts;
    const items = await loadItems(context.supabase, data.propertyId, h?.currency ?? "GBP", true);
    return {
      items,
      currency: h?.currency ?? "GBP",
      tax: { registered: !!h?.tax_registered, label: h?.tax_label ?? "VAT", rateBp: h?.tax_rate_bp ?? 2000, pricesInclude: h?.prices_include_tax ?? true },
      bankDetails: (h?.bank_details as string | null) ?? "",
      outUntil: (h?.out_until as string | null) ?? null,
    };
  });

const itemSchema = z.object({
  key: z.string().min(1).max(40), name: z.string().trim().min(1).max(80), pricePence: z.number().int().min(0).max(100000),
  unit: z.enum(["item", "hour", "bag_day", "pack"]), maxQty: z.number().int().min(1).max(20), isFree: z.boolean(),
  autoApprove: z.boolean(), active: z.boolean(), isLoan: z.boolean(),
});

export const savePriceItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, item: itemSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const i = data.item;
    const { error } = await context.supabase.from("extras_catalogue").update({
      name: i.name, price_pence: i.isFree ? 0 : i.pricePence, unit: i.unit, max_qty: i.maxQty, is_free: i.isFree,
      auto_approve: i.autoApprove, requires_approval: !i.autoApprove, active: i.active, is_loan: i.isLoan,
    }).eq("property_id", data.propertyId).eq("item_key", i.key);
    if (error) throw new Error("Couldn't save that item.");
    return { ok: true };
  });

export const saveMoneySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    hostId: uuid, registered: z.boolean(), label: z.string().trim().min(1).max(20), rateBp: z.number().int().min(0).max(5000),
    pricesInclude: z.boolean(), bankDetails: z.string().max(500), outUntil: z.string().datetime().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("hosts").update({
      tax_registered: data.registered, tax_label: data.label, tax_rate_bp: data.rateBp, prices_include_tax: data.pricesInclude,
      bank_details: data.bankDetails.trim() || null, out_until: data.outUntil,
    }).eq("id", data.hostId);
    if (error) throw new Error("Couldn't save your settings.");
    return { ok: true };
  });

export const listExtrasRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("requests")
      .select("id, status, items, time_window, total_pence, pay_by, suggested_window, suggestion_expires_at, late_until, early_from, message, created_at, bookings!inner(id, property_id, guest_full_name, rooms(display_name))")
      .eq("kind", "extras")
      .eq("bookings.property_id", data.propertyId)
      .order("created_at", { ascending: false })
      .limit(50);
    return (rows ?? []).map((r: any) => ({
      id: r.id, status: r.status as string, items: r.items as { name: string; qty: number; totalPence: number }[],
      window: r.time_window as string | null, totalPence: r.total_pence as number, payBy: r.pay_by as string | null,
      suggested: r.suggested_window as string | null, lateUntil: r.late_until as string | null, earlyFrom: r.early_from as string | null,
      note: r.message as string | null, createdAt: r.created_at as string,
      guest: (r.bookings?.guest_full_name as string | null) ?? "Guest", room: (r.bookings?.rooms?.display_name as string | null) ?? null,
    }));
  });

export const decideExtrasRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: uuid, action: z.enum(["approve", "decline", "suggest", "delivered", "mark_paid"]),
    window: z.enum(["asap", "evening", "morning", "door"]).nullable().default(null),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r } = await context.supabase.from("requests").select("id, booking_id, total_pence, status").eq("id", data.id).single();
    if (!r) throw new Error("Request not found.");
    const now = new Date();
    const patch: Record<string, unknown> =
      data.action === "approve" ? { status: r.total_pence > 0 ? "awaiting_payment" : "approved", pay_by: r.total_pence > 0 ? new Date(now.getTime() + HOLD_MS).toISOString() : null }
      : data.action === "decline" ? { status: "declined", resolved_at: now.toISOString() }
      : data.action === "suggest" ? { status: "suggested", suggested_window: data.window, suggestion_expires_at: new Date(now.getTime() + HOLD_MS).toISOString() }
      : data.action === "mark_paid" ? { status: "confirmed" }
      : { status: "delivered", resolved_at: now.toISOString() };
    const { error } = await context.supabase.from("requests").update(patch as never).eq("id", data.id);
    if (error) throw new Error("Couldn't update that request.");
    const body =
      data.action === "approve" ? (r.total_pence > 0 ? "Your request is approved. Please pay within 2 hours to confirm it." : "Your request is approved.")
      : data.action === "decline" ? "Sorry, your host can't do that request this time."
      : data.action === "suggest" ? "Your host has suggested another time. Please accept it within 2 hours."
      : data.action === "mark_paid" ? "Payment received. You're booked."
      : "Your request has been delivered.";
    await context.supabase.from("messages").insert({ booking_id: r.booking_id, direction: "outbound", channel: "stay_page", body, sent_at: now.toISOString() });
    return { ok: true };
  });

/* --------------------------------- guest -------------------------------- */

async function stayContext(t: string) {
  const { admin, sha256 } = await import("./checkin.server");
  const db = await admin();
  const { data: st } = await db.from("stay_tokens").select("booking_id, expires_at").eq("token_hash", sha256(t)).maybeSingle();
  if (!st || Date.parse(st.expires_at) < Date.now()) throw new Error("This stay link has expired.");
  const { data: b } = await db
    .from("bookings")
    .select("id, property_id, room_id, status, check_in_date, check_out_date, check_in_time, check_out_time, properties(host_id, timezone, quiet_hours_start, quiet_hours_end, default_check_in_time, default_check_out_time, hosts(currency, out_until))")
    .eq("id", st.booking_id)
    .single();
  if (!b || b.status === "cancelled") throw new Error("This stay link has expired.");
  return { db, b: b as any };
}

async function roomDayFlags(db: any, b: any) {
  if (!b.room_id) return { sameDayArrival: true, sameDayDeparture: true };
  const [{ count: arr }, { count: dep }] = await Promise.all([
    db.from("bookings").select("id", { count: "exact", head: true }).eq("room_id", b.room_id).eq("check_in_date", b.check_out_date).neq("id", b.id).not("status", "in", "(cancelled)").is("mirror_of", null),
    db.from("bookings").select("id", { count: "exact", head: true }).eq("room_id", b.room_id).eq("check_out_date", b.check_in_date).neq("id", b.id).not("status", "in", "(cancelled)").is("mirror_of", null),
  ]);
  return { sameDayArrival: (arr ?? 0) > 0, sameDayDeparture: (dep ?? 0) > 0 };
}

export const getStayExtras = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const { db, b } = await stayContext(data.token);
    const p = b.properties;
    const currency = p.hosts?.currency ?? "GBP";
    const items = (await loadItems(db, b.property_id, currency, true)).filter((i) => i.active);
    const flags = await roomDayFlags(db, b);
    const late = items.find((i) => i.key === "late_checkout");
    const early = items.find((i) => i.key === "early_checkin");
    const { data: reqs } = await db
      .from("requests").select("id, status, items, time_window, total_pence, pay_by, suggested_window, suggestion_expires_at, created_at")
      .eq("booking_id", b.id).eq("kind", "extras").order("created_at", { ascending: false }).limit(20);
    const outUntil = p.hosts?.out_until && Date.parse(p.hosts.out_until) > Date.now() ? p.hosts.out_until : null;
    return {
      currency,
      timezone: p.timezone ?? "Europe/London",
      items,
      windows: availableWindows((p.quiet_hours_start ?? "22:00").slice(0, 5), (p.quiet_hours_end ?? "07:00").slice(0, 5), []),
      outUntil,
      lateOptions: late ? lateCheckoutOptions({ checkOutTime: (b.check_out_time ?? p.default_check_out_time ?? "11:00").slice(0, 5), maxHours: late.maxQty, sameDayArrival: flags.sameDayArrival, blocked: [] }) : [],
      earlyOptions: early ? earlyCheckinOptions({ checkInTime: (b.check_in_time ?? p.default_check_in_time ?? "15:00").slice(0, 5), maxHours: early.maxQty, sameDayDeparture: flags.sameDayDeparture, blocked: [] }) : [],
      requests: (reqs ?? []).map((r: any) => ({
        id: r.id, status: r.status as string, items: r.items as { name: string; qty: number }[], totalPence: r.total_pence as number,
        payBy: r.pay_by as string | null, suggested: r.suggested_window as string | null, window: r.time_window as string | null,
      })),
    };
  });

export const createExtrasRequest = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    token,
    lines: z.array(z.object({ key: z.string().max(40), qty: z.number().int().min(1).max(20), size: z.string().max(20).nullable().default(null) })).min(1).max(12),
    window: z.enum(["asap", "evening", "morning", "door"]),
    note: z.string().trim().max(300).nullable().default(null),
  }).parse(d))
  .handler(async ({ data }) => {
    const { db, b } = await stayContext(data.token);
    const p = b.properties;
    const items = await loadItems(db, b.property_id, p.hosts?.currency ?? "GBP", true);
    const priced = priceBasket(items, data.lines);
    const flags = await roomDayFlags(db, b);

    let lateUntil: string | null = null;
    let earlyFrom: string | null = null;
    const lateLine = data.lines.find((l) => l.key === "late_checkout");
    if (lateLine) {
      const opts = lateCheckoutOptions({ checkOutTime: (b.check_out_time ?? p.default_check_out_time ?? "11:00").slice(0, 5), maxHours: 2, sameDayArrival: flags.sameDayArrival, blocked: [] });
      const o = opts.find((x) => x.hours === lateLine.qty);
      if (!o) throw new Error("Late check-out isn't available for that time.");
      lateUntil = o.until;
    }
    const earlyLine = data.lines.find((l) => l.key === "early_checkin");
    if (earlyLine) {
      const opts = earlyCheckinOptions({ checkInTime: (b.check_in_time ?? p.default_check_in_time ?? "15:00").slice(0, 5), maxHours: 3, sameDayDeparture: flags.sameDayDeparture, blocked: [] });
      const o = opts.find((x) => x.hours === earlyLine.qty);
      if (!o) throw new Error("Early check-in isn't available for that time.");
      earlyFrom = o.from;
    }

    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from("requests").select("id", { count: "exact", head: true }).eq("booking_id", b.id).gte("created_at", since);
    if ((count ?? 0) >= 10) throw new Error("You've sent a lot of requests. Please message your host.");

    const total = priced.reduce((s, l) => s + l.totalPence, 0);
    const auto = basketAutoApproves(items, data.lines);
    const status = auto ? (total > 0 ? "awaiting_payment" : "approved") : "requested";
    const { data: row, error } = await db.from("requests").insert({
      booking_id: b.id, kind: "extras", status, items: priced, time_window: data.window as WindowKey, total_pence: total,
      pay_by: status === "awaiting_payment" ? new Date(Date.now() + HOLD_MS).toISOString() : null,
      late_until: lateUntil, early_from: earlyFrom, message: data.note,
    }).select("id").single();
    if (error) throw new Error("We couldn't send that. Please try again.");

    const { raiseAlert } = await import("./checkin.server");
    await raiseAlert({
      hostId: p.host_id, propertyId: b.property_id, bookingId: b.id, kind: "extras_request",
      message: `${auto ? "Auto-approved" : "Needs approval"}: ${priced.map((l) => `${l.qty}× ${l.name}`).join(", ")}`,
    });
    return { id: row.id, status };
  });

export const cancelExtrasRequest = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, id: uuid }).parse(d))
  .handler(async ({ data }) => {
    const { db, b } = await stayContext(data.token);
    const { error } = await db.from("requests").update({ status: "cancelled", resolved_at: new Date().toISOString() })
      .eq("id", data.id).eq("booking_id", b.id).in("status", ["requested", "approved", "awaiting_payment", "suggested", "confirmed"]);
    if (error) throw new Error("Couldn't cancel that.");
    return { ok: true };
  });

export const acceptSuggestion = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, id: uuid }).parse(d))
  .handler(async ({ data }) => {
    const { db, b } = await stayContext(data.token);
    const { data: r } = await db.from("requests").select("suggested_window, suggestion_expires_at, total_pence").eq("id", data.id).eq("booking_id", b.id).single();
    if (!r?.suggestion_expires_at || Date.parse(r.suggestion_expires_at) < Date.now()) throw new Error("That suggested time has passed.");
    const paid = r.total_pence > 0;
    await db.from("requests").update({
      status: paid ? "awaiting_payment" : "approved", time_window: r.suggested_window,
      pay_by: paid ? new Date(Date.now() + HOLD_MS).toISOString() : null,
    }).eq("id", data.id);
    return { ok: true };
  });
