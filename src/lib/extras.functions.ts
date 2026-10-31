/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * Price list (host), extras basket (guest, stay token) and request decisions (host).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { DEFAULT_SLOT, earlyChoices, lateChoices, normaliseSlot } from "./stay-times";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOwner } from "@/lib/roles";
import {
  DEFAULT_EXTRAS,
  availableWindows,
  basketAutoApproves,
  breakfastMornings,
  breakfastProblem,
  breakfastTimes,
  normaliseBreakfast,
  priceBasket,
  BREAKFAST_STYLES,
  type ExtraItem,
  type ExtraUnit,
  type WindowKey,
} from "./extras";
import { rebrand } from "@/lib/brand";

const uuid = z.string().uuid();
const token = z.string().min(20).max(80);
const HOLD_MS = 2 * 3600_000;

type Row = {
  item_key: string | null;
  name: string;
  price_pence: number;
  unit: string;
  max_qty: number;
  is_free: boolean;
  auto_approve: boolean;
  active: boolean;
  is_loan: boolean;
  options: unknown;
  sort_order: number;
  description?: string | null;
};

function toItem(r: Row): ExtraItem {
  const options = (r.options ?? {}) as {
    sizes?: ExtraItem["sizes"];
    breakfast?: unknown;
    slot?: unknown;
  };
  const breakfast = normaliseBreakfast(options.breakfast);
  const slotKind =
    r.item_key === "late_checkout" ? "late" : r.item_key === "early_checkin" ? "early" : null;
  return {
    key: r.item_key ?? r.name,
    name: r.name,
    pricePence: r.price_pence,
    unit: r.unit as ExtraUnit,
    maxQty: r.max_qty,
    isFree: r.is_free,
    autoApprove: r.auto_approve,
    active: r.active,
    isLoan: r.is_loan,
    ...(options.sizes ? { sizes: options.sizes } : {}),
    ...(r.description ? { description: r.description } : {}),
    ...(breakfast ? { breakfast } : {}),
    ...(slotKind ? { slot: normaliseSlot(options.slot, slotKind) } : {}),
  };
}

/**
 * The guests either side of a stay in its room, at their own times (which
 * already include early check-in / late check-out they've had approved):
 * who arrives on the day this stay leaves, and who leaves on the day it arrives.
 */
async function roomNeighbours(
  db: any,
  b: { id: string; room_id: string | null; check_in_date: string; check_out_date: string },
  defaults: { checkIn: string; checkOut: string },
) {
  if (!b.room_id)
    return {
      nextArrival: null as string | null,
      prevDeparture: null as string | null,
      unknownRoom: true,
    };
  const [{ data: next }, { data: prev }] = await Promise.all([
    db
      .from("bookings")
      .select("check_in_time")
      .eq("room_id", b.room_id)
      .eq("check_in_date", b.check_out_date)
      .neq("id", b.id)
      .neq("status", "cancelled")
      .is("mirror_of", null)
      .limit(1)
      .maybeSingle(),
    db
      .from("bookings")
      .select("check_out_time")
      .eq("room_id", b.room_id)
      .eq("check_out_date", b.check_in_date)
      .neq("id", b.id)
      .neq("status", "cancelled")
      .is("mirror_of", null)
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    nextArrival: next
      ? ((next.check_in_time as string | null) ?? defaults.checkIn).slice(0, 5)
      : null,
    prevDeparture: prev
      ? ((prev.check_out_time as string | null) ?? defaults.checkOut).slice(0, 5)
      : null,
    unknownRoom: false,
  };
}

/** The early check-in and late check-out choices for a stay, priced, within the host's limits and buffer. */
async function timeChoices(db: any, b: any, items: ExtraItem[]) {
  const p = b.properties;
  const defaults = {
    checkIn: (p.default_check_in_time ?? "15:00").slice(0, 5),
    checkOut: (p.default_check_out_time ?? "11:00").slice(0, 5),
  };
  const n = await roomNeighbours(db, b, defaults);
  const { stayAccessFor } = await import("./stay-access.server");
  const { bufferMinutes } = await stayAccessFor(db, b.property_id);
  const late = items.find((i) => i.key === "late_checkout" && i.active);
  const early = items.find((i) => i.key === "early_checkin" && i.active);
  // Without a room we can't tell who's next: nothing is offered, the guest can still ask.
  return {
    late:
      late && !n.unknownRoom
        ? lateChoices({
            checkOut: (b.check_out_time ?? defaults.checkOut).slice(0, 5),
            slot: late.slot ?? DEFAULT_SLOT.late,
            pricePence: late.isFree ? 0 : late.pricePence,
            maxSteps: late.maxQty,
            nextArrival: n.nextArrival,
            bufferMinutes,
          })
        : [],
    early:
      early && !n.unknownRoom
        ? earlyChoices({
            checkIn: (b.check_in_time ?? defaults.checkIn).slice(0, 5),
            slot: early.slot ?? DEFAULT_SLOT.early,
            pricePence: early.isFree ? 0 : early.pricePence,
            maxSteps: early.maxQty,
            prevDeparture: n.prevDeparture,
            bufferMinutes,
          })
        : [],
  };
}

/**
 * An early check-in or late check-out that's been approved (free) or paid
 * moves the stay's own times, so the guide, the door details, Today,
 * Bookings, Housekeeping and the next guest's choices all follow.
 */
export async function applyStayTimes(db: any, requestId: string) {
  const { data: r } = await db
    .from("requests")
    .select("booking_id, status, late_until, early_from")
    .eq("id", requestId)
    .maybeSingle();
  if (
    !r ||
    !["approved", "confirmed", "delivered"].includes(r.status) ||
    (!r.late_until && !r.early_from)
  )
    return;
  await db
    .from("bookings")
    .update({
      ...(r.late_until ? { check_out_time: r.late_until } : {}),
      ...(r.early_from ? { check_in_time: r.early_from } : {}),
    })
    .eq("id", r.booking_id);
}

const COLS =
  "item_key, name, description, price_pence, unit, max_qty, is_free, auto_approve, active, is_loan, options, sort_order";

/**
 * The currency a property's extras are priced in: its own (migration 0047,
 * regional pricing) or the business's.
 */
async function currencyFor(
  db: any,
  propertyId: string,
  hostCurrency: string | null | undefined,
): Promise<string> {
  const { data, error } = await db
    .from("properties")
    .select("currency")
    .eq("id", propertyId)
    .maybeSingle();
  return (!error && (data?.currency as string | null)) || hostCurrency || "GBP";
}

async function loadItems(
  db: any,
  propertyId: string,
  currency: string,
  seed: boolean,
): Promise<ExtraItem[]> {
  const { data } = await db
    .from("extras_catalogue")
    .select(COLS)
    .eq("property_id", propertyId)
    .not("item_key", "is", null)
    .is("deleted_at", null)
    .order("sort_order");
  if ((data ?? []).length || !seed) return (data ?? []).map(toItem);
  const rows = DEFAULT_EXTRAS.map((e, i) => ({
    property_id: propertyId,
    item_key: e.key,
    name: e.name,
    price_pence: e.pricePence,
    unit: e.unit,
    max_qty: e.maxQty,
    is_free: e.isFree,
    auto_approve: e.autoApprove,
    active: e.active,
    is_loan: e.isLoan,
    sort_order: i,
    currency,
    requires_approval: !e.autoApprove,
    options: e.sizes ? { sizes: e.sizes } : {},
  }));
  await db.from("extras_catalogue").insert(rows);
  return DEFAULT_EXTRAS;
}

/* --------------------------------- host --------------------------------- */

export const getPriceList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: p } = await context.supabase
      .from("properties")
      .select(
        "id, country_code, host_id, hosts(currency, tax_registered, tax_label, tax_rate_bp, prices_include_tax, bank_details, out_until)",
      )
      .eq("id", data.propertyId)
      .single();
    if (!p) throw new Error("Property not found.");
    const h = (p as any).hosts;
    const currency = await currencyFor(context.supabase, data.propertyId, h?.currency);
    const items = await loadItems(context.supabase, data.propertyId, currency, true);
    const { data: own, error: ownError } = await (context.supabase as any)
      .from("properties")
      .select("currency")
      .eq("id", data.propertyId)
      .maybeSingle();
    return {
      items,
      currency,
      hostCurrency: (h?.currency as string | null) ?? "GBP",
      /** null = the business's currency; undefined before migration 0047 (can't be set yet). */
      propertyCurrency: ownError ? undefined : ((own?.currency as string | null) ?? null),
      tax: {
        registered: !!h?.tax_registered,
        label: h?.tax_label ?? "VAT",
        rateBp: h?.tax_rate_bp ?? 2000,
        pricesInclude: h?.prices_include_tax ?? true,
      },
      bankDetails: (h?.bank_details as string | null) ?? "",
      outUntil: (h?.out_until as string | null) ?? null,
      country: ((p as any).country_code as string | null) ?? "GB",
      // Structured bank details (migration 0053); before it, the text box only.
      bankAccount: await (async () => {
        const { normaliseBankAccount } = await import("./bank-details");
        const { data: b, error } = await (context.supabase as any)
          .from("hosts")
          .select("bank_account")
          .eq("id", (p as any).host_id)
          .maybeSingle();
        return error
          ? null
          : normaliseBankAccount(
              b?.bank_account,
              ((p as any).country_code as string | null) ?? "GB",
            );
      })(),
    };
  });

const itemSchema = z.object({
  key: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  pricePence: z.number().int().min(0).max(100000),
  unit: z.enum(["item", "hour", "bag_day", "pack"]),
  maxQty: z.number().int().min(1).max(20),
  isFree: z.boolean(),
  autoApprove: z.boolean(),
  active: z.boolean(),
  isLoan: z.boolean(),
  description: z.string().trim().max(200).optional(),
  breakfast: z
    .object({ style: z.enum(BREAKFAST_STYLES), section: z.string().trim().max(40).optional() })
    .nullable()
    .optional(),
});

/** The item's options with its breakfast details set or cleared, keeping anything else (bag sizes). */
function withBreakfast(
  options: unknown,
  b: { style: (typeof BREAKFAST_STYLES)[number]; section?: string | undefined } | null | undefined,
): Record<string, unknown> {
  const o = {
    ...((options && typeof options === "object" ? options : {}) as Record<string, unknown>),
  };
  if (b === undefined) return o;
  if (b === null) delete o["breakfast"];
  else o["breakfast"] = b.section ? { style: b.style, section: b.section } : { style: b.style };
  return o;
}

export const savePriceItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, item: itemSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const i = data.item;
    const { data: before } = await context.supabase
      .from("extras_catalogue")
      .select("options")
      .eq("property_id", data.propertyId)
      .eq("item_key", i.key)
      .maybeSingle();
    const { error } = await context.supabase
      .from("extras_catalogue")
      .update({
        name: i.name,
        price_pence: i.isFree ? 0 : i.pricePence,
        unit: i.unit,
        max_qty: i.maxQty,
        is_free: i.isFree,
        auto_approve: i.autoApprove,
        requires_approval: !i.autoApprove,
        active: i.active,
        is_loan: i.isLoan,
        ...(i.description !== undefined ? { description: i.description || null } : {}),
        options: withBreakfast(
          (before as { options?: unknown } | null)?.options,
          i.breakfast,
        ) as never,
      })
      .eq("property_id", data.propertyId)
      .eq("item_key", i.key);
    if (error) throw new Error("Couldn't save that item.");
    return { ok: true };
  });

const timeRule = z.object({
  active: z.boolean(),
  pricePence: z.number().int().min(0).max(100000),
  stepHours: z.number().int().min(1).max(3),
  limit: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  maxSteps: z.number().int().min(1).max(12),
  autoApprove: z.boolean(),
});

/**
 * Properties → Extras → Early check-in and late check-out: blocks of hours,
 * the price a block, the latest check-out / earliest check-in, the most
 * blocks, whether it's confirmed straight away, and the buffer kept between
 * guests (properties.stay_access.bufferMinutes).
 */
export const saveStayTimes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        late: timeRule,
        early: timeRule,
        bufferMinutes: z.number().int().min(0).max(240),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireWrite, hostOfProperty } = await import("./roles");
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const sb = context.supabase as any;
    const { data: p } = await sb
      .from("properties")
      .select("hosts(currency)")
      .eq("id", data.propertyId)
      .single();
    const currency = await currencyFor(sb, data.propertyId, p?.hosts?.currency);
    await loadItems(sb, data.propertyId, currency, true);
    for (const [key, r] of [
      ["late_checkout", data.late],
      ["early_checkin", data.early],
    ] as const) {
      const { data: before } = await sb
        .from("extras_catalogue")
        .select("options")
        .eq("property_id", data.propertyId)
        .eq("item_key", key)
        .maybeSingle();
      const options = {
        ...((before?.options && typeof before.options === "object" ? before.options : {}) as Record<
          string,
          unknown
        >),
        slot: { stepHours: r.stepHours, limit: r.limit },
      };
      const { error } = await sb
        .from("extras_catalogue")
        .update({
          price_pence: r.pricePence,
          is_free: r.pricePence === 0,
          unit: "hour",
          max_qty: r.maxSteps,
          active: r.active,
          auto_approve: r.autoApprove,
          requires_approval: !r.autoApprove,
          options,
        })
        .eq("property_id", data.propertyId)
        .eq("item_key", key);
      if (error) throw new Error("Couldn't save those times.");
    }
    const { normaliseStayAccess } = await import("./stay-access");
    const { data: cur } = await sb
      .from("properties")
      .select("stay_access")
      .eq("id", data.propertyId)
      .maybeSingle();
    const { error } = await sb
      .from("properties")
      .update({
        stay_access: normaliseStayAccess({
          ...normaliseStayAccess(cur?.stay_access),
          bufferMinutes: data.bufferMinutes,
        }),
      })
      .eq("id", data.propertyId);
    if (error && !/stay_access/.test(error.message)) throw new Error(error.message);
    return { ok: true };
  });

/** The buffer kept between guests in a room (Properties → Extras). */
export const getStayBuffer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { stayAccessFor } = await import("./stay-access.server");
    return {
      bufferMinutes: (await stayAccessFor(context.supabase as any, data.propertyId)).bufferMinutes,
    };
  });

/** Add a new item the host has invented (key derived from the name). */
export const addPriceItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, item: itemSchema.omit({ key: true }) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const i = data.item;
    const base =
      i.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 32) || "item";
    const { data: p } = await context.supabase
      .from("properties")
      .select("hosts(currency)")
      .eq("id", data.propertyId)
      .single();
    const currency = await currencyFor(
      context.supabase,
      data.propertyId,
      (p as any)?.hosts?.currency,
    );
    const { data: existing } = await context.supabase
      .from("extras_catalogue")
      .select("item_key, sort_order")
      .eq("property_id", data.propertyId);
    const keys = new Set((existing ?? []).map((r: any) => r.item_key));
    let key = base;
    let n = 2;
    while (keys.has(key)) key = `${base}_${n++}`;
    const nextOrder = Math.max(0, ...(existing ?? []).map((r: any) => r.sort_order ?? 0)) + 1;
    const { error } = await context.supabase.from("extras_catalogue").insert({
      property_id: data.propertyId,
      item_key: key,
      name: i.name,
      price_pence: i.isFree ? 0 : i.pricePence,
      unit: i.unit,
      max_qty: i.maxQty,
      is_free: i.isFree,
      auto_approve: i.autoApprove,
      requires_approval: !i.autoApprove,
      active: i.active,
      is_loan: i.isLoan,
      sort_order: nextOrder,
      currency,
      options: withBreakfast({}, i.breakfast) as never,
      description: i.description || null,
    });
    if (error) throw new Error("Couldn't add that item.");
    return { ok: true, key };
  });

/** Soft delete: past requests keep the item details they were priced with. */
export const deletePriceItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, key: z.string().min(1).max(40) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("extras_catalogue")
      .update({ deleted_at: new Date().toISOString(), active: false })
      .eq("property_id", data.propertyId)
      .eq("item_key", data.key);
    if (error) throw new Error("Couldn't remove that item.");
    return { ok: true };
  });

/** Swap this item with its neighbour in the list. */
export const reorderPriceItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        key: z.string().min(1).max(40),
        direction: z.enum(["up", "down"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("extras_catalogue")
      .select("item_key, sort_order")
      .eq("property_id", data.propertyId)
      .is("deleted_at", null)
      .order("sort_order");
    const list = (rows ?? []) as { item_key: string; sort_order: number }[];
    const idx = list.findIndex((r) => r.item_key === data.key);
    const swap = data.direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swap < 0 || swap >= list.length) return { ok: true };
    const a = list[idx]!;
    const b = list[swap]!;
    await Promise.all([
      context.supabase
        .from("extras_catalogue")
        .update({ sort_order: b.sort_order })
        .eq("property_id", data.propertyId)
        .eq("item_key", a.item_key),
      context.supabase
        .from("extras_catalogue")
        .update({ sort_order: a.sort_order })
        .eq("property_id", data.propertyId)
        .eq("item_key", b.item_key),
    ]);
    return { ok: true };
  });

/** Saves the whole running order after the host drags an item. */
export const setPriceOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ propertyId: uuid, keys: z.array(z.string().min(1).max(40)).min(1).max(100) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("extras_catalogue")
      .select("item_key")
      .eq("property_id", data.propertyId)
      .is("deleted_at", null);
    const known = new Set(((rows ?? []) as { item_key: string }[]).map((r) => r.item_key));
    // Anything not in the new order keeps its place at the end.
    const order = [
      ...data.keys.filter((k) => known.has(k)),
      ...[...known].filter((k) => !data.keys.includes(k)),
    ];
    const results = await Promise.all(
      order.map((key, i) =>
        context.supabase
          .from("extras_catalogue")
          .update({ sort_order: (i + 1) * 10 })
          .eq("property_id", data.propertyId)
          .eq("item_key", key),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
    return { ok: true };
  });

/** Regional pricing: price this property's extras in its own currency (null = the business's). */
export const setPropertyCurrency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { isCurrency } = await import("./world");
    if (data.currency && !isCurrency(data.currency))
      throw new Error("Please pick a currency from the list.");
    const { data: p } = await context.supabase
      .from("properties")
      .select("host_id")
      .eq("id", data.propertyId)
      .single();
    if (!p) throw new Error("Property not found.");
    await requireOwner(context.supabase, (p as { host_id: string }).host_id);
    const { error } = await (context.supabase as any)
      .from("properties")
      .update({ currency: data.currency })
      .eq("id", data.propertyId);
    if (error)
      throw new Error(
        error.message.includes("currency")
          ? "Regional pricing needs the latest update (migration 0047)."
          : "Couldn't save the currency.",
      );
    // Existing items follow the property's currency (or the business's again).
    const { data: h } = await context.supabase
      .from("hosts")
      .select("currency")
      .eq("id", (p as { host_id: string }).host_id)
      .single();
    await (context.supabase as any)
      .from("extras_catalogue")
      .update({ currency: data.currency ?? (h as { currency?: string } | null)?.currency ?? "GBP" })
      .eq("property_id", data.propertyId);
    return { ok: true };
  });

export const saveMoneySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        hostId: uuid,
        registered: z.boolean(),
        label: z.string().trim().min(1).max(20),
        rateBp: z.number().int().min(0).max(5000),
        pricesInclude: z.boolean(),
        bankDetails: z.string().max(500),
        outUntil: z.string().datetime().nullable(),
        /** Structured for the bank's country (migration 0053). */
        bankAccount: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, data.hostId);
    const { error } = await context.supabase
      .from("hosts")
      .update({
        tax_registered: data.registered,
        tax_label: data.label,
        tax_rate_bp: data.rateBp,
        prices_include_tax: data.pricesInclude,
        bank_details: data.bankDetails.trim() || null,
        out_until: data.outUntil,
      })
      .eq("id", data.hostId);
    if (error) throw new Error("Couldn't save your settings.");
    if (data.bankAccount) {
      const { normaliseBankAccount, bankProblems } = await import("./bank-details");
      const acct = normaliseBankAccount(data.bankAccount);
      const problems = bankProblems(acct).filter((p) => acct[p.key]);
      if (problems.length) throw new Error(problems[0]!.message);
      const { error: bankError } = await (context.supabase as any)
        .from("hosts")
        .update({ bank_account: acct })
        .eq("id", data.hostId);
      if (bankError && !/bank_account/.test(bankError.message))
        throw new Error("Couldn't save your bank details.");
    }
    return { ok: true };
  });

export const listExtrasRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("requests")
      .select(
        "id, status, items, time_window, total_pence, pay_by, suggested_window, suggestion_expires_at, late_until, early_from, message, host_note, created_at, payment_method, bookings!inner(id, property_id, guest_full_name, rooms(display_name))",
      )
      .eq("kind", "extras")
      .eq("bookings.property_id", data.propertyId)
      .order("created_at", { ascending: false })
      .limit(50);
    // Breakfast orders: which morning, what time and how it's served (migration 0047).
    const ids = (rows ?? []).map((r: any) => r.id);
    const { data: bf, error: bfError } = ids.length
      ? await (context.supabase as any)
          .from("requests")
          .select("id, breakfast_at, breakfast_style")
          .in("id", ids)
      : { data: [], error: null };
    const breakfastOf = new Map(
      ((bfError ? [] : bf) ?? [])
        .filter((x: any) => x.breakfast_style)
        .map((x: any) => [
          x.id,
          { at: x.breakfast_at as string | null, style: x.breakfast_style as string },
        ]),
    );
    return (rows ?? []).map((r: any) => ({
      breakfast:
        (breakfastOf.get(r.id) as { at: string | null; style: string } | undefined) ?? null,
      id: r.id,
      status: r.status as string,
      items: r.items as { name: string; qty: number; totalPence: number }[],
      window: r.time_window as string | null,
      totalPence: r.total_pence as number,
      payBy: r.pay_by as string | null,
      suggested: r.suggested_window as string | null,
      lateUntil: r.late_until as string | null,
      earlyFrom: r.early_from as string | null,
      note: r.message as string | null,
      hostNote: (r.host_note as string | null) ?? null,
      createdAt: r.created_at as string,
      paymentMethod: (r.payment_method as string | null) ?? null,
      guest: (r.bookings?.guest_full_name as string | null) ?? "Guest",
      room: (r.bookings?.rooms?.display_name as string | null) ?? null,
    }));
  });

export const decideExtrasRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        action: z.enum(["approve", "approve_free", "decline", "suggest", "delivered", "mark_paid"]),
        window: z.enum(["asap", "evening", "morning", "door"]).nullable().default(null),
        note: z.string().trim().max(200).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: r } = await context.supabase
      .from("requests")
      .select("id, booking_id, total_pence, status")
      .eq("id", data.id)
      .single();
    if (!r) throw new Error("Request not found.");
    const now = new Date();
    const patch: Record<string, unknown> =
      data.action === "approve"
        ? {
            status: r.total_pence > 0 ? "awaiting_payment" : "approved",
            pay_by: r.total_pence > 0 ? new Date(now.getTime() + HOLD_MS).toISOString() : null,
          }
        : data.action === "approve_free"
          ? // The host gives it free (a favour, or settled another way): nothing to pay, and the times apply now.
            { status: "approved", total_pence: 0, pay_by: null }
          : data.action === "decline"
            ? { status: "declined", resolved_at: now.toISOString() }
            : data.action === "suggest"
              ? {
                  status: "suggested",
                  suggested_window: data.window,
                  suggestion_expires_at: new Date(now.getTime() + HOLD_MS).toISOString(),
                }
              : data.action === "mark_paid"
                ? { status: "confirmed", paid_at: now.toISOString() }
                : { status: "delivered", resolved_at: now.toISOString() };
    if (data.note) patch["host_note"] = data.note;
    const { error } = await context.supabase
      .from("requests")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error("Couldn't update that request.");
    if (data.action === "approve" || data.action === "approve_free" || data.action === "mark_paid")
      await applyStayTimes(context.supabase, data.id);
    const body =
      data.action === "approve"
        ? r.total_pence > 0
          ? "Your request is approved. Please pay within 2 hours to confirm it."
          : "Your request is approved."
        : data.action === "approve_free"
          ? "Your request is approved, free of charge."
          : data.action === "decline"
            ? "Sorry, your host can't do that request this time."
            : data.action === "suggest"
              ? "Your host has suggested another time. Please accept it within 2 hours."
              : data.action === "mark_paid"
                ? "Payment received. You're booked."
                : "Your request has been delivered.";
    await context.supabase.from("messages").insert({
      booking_id: r.booking_id,
      direction: "outbound",
      channel: "stay_page",
      body: data.note ? `${body} ${data.note}` : body,
      sent_at: now.toISOString(),
    });
    return { ok: true };
  });

/* --------------------------------- guest -------------------------------- */

async function stayContext(t: string) {
  const { admin, sha256 } = await import("./checkin.server");
  const db = await admin();
  const { data: st } = await db
    .from("stay_tokens")
    .select("booking_id, expires_at")
    .eq("token_hash", sha256(t))
    .maybeSingle();
  if (!st || Date.parse(st.expires_at) < Date.now()) throw new Error("This stay link has expired.");
  const { data: b } = await db
    .from("bookings")
    .select(
      "id, property_id, room_id, status, check_in_date, check_out_date, check_in_time, check_out_time, guest_full_name, guest_email, properties(name, host_id, timezone, quiet_hours_start, quiet_hours_end, default_check_in_time, default_check_out_time, hosts(business_name, currency, out_until, bank_details, contact_phone, contact_email, tax_registered, tax_label, tax_rate_bp, prices_include_tax))",
    )
    .eq("id", st.booking_id)
    .single();
  if (!b || b.status === "cancelled") throw new Error("This stay link has expired.");
  return { db, b: b as any };
}

/** Short human receipt number, e.g. LK-260430-8F2C. Stable for one request. */
function receiptNumber(id: string, createdAt: string) {
  const d = new Date(createdAt);
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `LK-${ymd}-${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

export const getStayExtras = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const { db, b } = await stayContext(data.token);
    const p = b.properties;
    const currency = await currencyFor(db, b.property_id, p.hosts?.currency);
    const items = (await loadItems(db, b.property_id, currency, true)).filter((i) => i.active);
    const tz = p.timezone ?? "Europe/London";
    const now = new Date();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
    const nowTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    const choices = await timeChoices(db, b, items);
    const { data: reqs } = await db
      .from("requests")
      .select(
        "id, status, items, time_window, total_pence, pay_by, suggested_window, suggestion_expires_at, created_at, host_note, late_until, early_from, payment_method, receipt_number, paid_at",
      )
      .eq("booking_id", b.id)
      .eq("kind", "extras")
      .order("created_at", { ascending: false })
      .limit(20);
    // A confirmed request has been settled one way or another, so it earns a
    // receipt number the guest can quote. Numbered once, then kept.
    for (const r of (reqs ?? []) as any[]) {
      if (r.status === "confirmed" && !r.receipt_number) {
        r.receipt_number = receiptNumber(r.id, r.created_at);
        await db.from("requests").update({ receipt_number: r.receipt_number }).eq("id", r.id);
      }
    }
    const outUntil =
      p.hosts?.out_until && Date.parse(p.hosts.out_until) > Date.now() ? p.hosts.out_until : null;
    return {
      currency,
      timezone: p.timezone ?? "Europe/London",
      items,
      windows: availableWindows(
        (p.quiet_hours_start ?? "22:00").slice(0, 5),
        (p.quiet_hours_end ?? "07:00").slice(0, 5),
        [],
      ),
      outUntil,
      // Everything the receipt and the "card didn't work" fallback need.
      propertyName: (p.name as string | null) ?? "Your stay",
      hostName: (p.hosts?.business_name as string | null) ?? "your host",
      hostPhone: (p.hosts?.contact_phone as string | null) ?? null,
      bankDetails: (p.hosts?.bank_details as string | null) ?? "",
      // The host's structured bank details (migration 0053), local to the host's bank.
      bankLines: await (async () => {
        const { normaliseBankAccount, bankLinesFor, bankReady } = await import("./bank-details");
        const { data: hb, error } = await (db as any)
          .from("hosts")
          .select("bank_account")
          .eq("id", p.host_id)
          .maybeSingle();
        if (error) return [] as Array<{ label: string; value: string }>;
        const acct = normaliseBankAccount(hb?.bank_account);
        return bankReady(acct) ? bankLinesFor(acct, null) : [];
      })(),
      guestName: (b.guest_full_name as string | null) ?? null,
      guestEmail: (b.guest_email as string | null) ?? null,
      tax: {
        registered: !!p.hosts?.tax_registered,
        label: (p.hosts?.tax_label as string | null) ?? "VAT",
        rateBp: (p.hosts?.tax_rate_bp as number | null) ?? 2000,
        pricesInclude: p.hosts?.prices_include_tax ?? true,
      },
      // Breakfast: the mornings and times it can be ordered for, in the property's time.
      breakfastMornings: breakfastMornings({
        today,
        nowTime,
        checkIn: b.check_in_date,
        checkOut: b.check_out_date,
      }),
      breakfastTimes: breakfastTimes(),
      // Early check-in and late check-out: blocks within the host's limits, the buffer and the neighbouring stays.
      lateOptions: choices.late.map((c) => ({
        steps: c.steps,
        hours: c.hours,
        until: c.time,
        pricePence: c.pricePence,
      })),
      earlyOptions: choices.early.map((c) => ({
        steps: c.steps,
        hours: c.hours,
        from: c.time,
        pricePence: c.pricePence,
      })),
      requests: (reqs ?? []).map((r: any) => ({
        id: r.id,
        status: r.status as string,
        items: r.items as { name: string; qty: number; totalPence?: number }[],
        totalPence: r.total_pence as number,
        payBy: r.pay_by as string | null,
        suggested: r.suggested_window as string | null,
        window: r.time_window as string | null,
        hostNote: (r.host_note as string | null) ?? null,
        lateUntil: (r.late_until as string | null) ?? null,
        earlyFrom: (r.early_from as string | null) ?? null,
        paymentMethod: (r.payment_method as string | null) ?? null,
        receiptNumber: (r.receipt_number as string | null) ?? null,
        paidAt: (r.paid_at as string | null) ?? null,
        createdAt: r.created_at as string,
      })),
    };
  });

export const createExtrasRequest = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token,
        lines: z
          .array(
            z.object({
              key: z.string().max(40),
              qty: z.number().int().min(1).max(20),
              size: z.string().max(20).nullable().default(null),
            }),
          )
          .min(1)
          .max(12),
        window: z.enum(["asap", "evening", "morning", "door"]),
        note: z.string().trim().max(300).nullable().default(null),
        /** A breakfast order: how it's served, and when. */
        breakfast: z
          .object({
            style: z.enum(BREAKFAST_STYLES),
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            time: z.string().regex(/^\d{2}:\d{2}$/),
          })
          .nullable()
          .default(null),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { db, b } = await stayContext(data.token);
    const p = b.properties;
    const items = await loadItems(
      db,
      b.property_id,
      await currencyFor(db, b.property_id, p.hosts?.currency),
      true,
    );
    const priced = priceBasket(items, data.lines);
    let breakfastAt: string | null = null;
    if (data.breakfast) {
      const problem = breakfastProblem(items, data.lines, data.breakfast.style);
      if (problem) throw new Error(problem);
      const tz = p.timezone ?? "Europe/London";
      const now = new Date();
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
      const nowTime = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now);
      if (
        !breakfastMornings({
          today,
          nowTime,
          checkIn: b.check_in_date,
          checkOut: b.check_out_date,
        }).includes(data.breakfast.date)
      )
        throw new Error("Breakfast can't be ordered for that morning.");
      if (!breakfastTimes().includes(data.breakfast.time))
        throw new Error("Please pick a breakfast time.");
      const { zonedToUtc } = await import("./guide");
      breakfastAt = zonedToUtc(data.breakfast.date, data.breakfast.time, tz).toISOString();
    }
    // Early check-in and late check-out: the number of blocks must be one still on offer (checked again here).
    let lateUntil: string | null = null;
    let earlyFrom: string | null = null;
    const choices = await timeChoices(db, b, items);
    const lateLine = data.lines.find((l) => l.key === "late_checkout");
    if (lateLine) {
      const o = choices.late.find((x) => x.steps === lateLine.qty);
      if (!o)
        throw new Error(
          "Late check-out isn't available for that time any more. Please pick another.",
        );
      lateUntil = o.time;
    }
    const earlyLine = data.lines.find((l) => l.key === "early_checkin");
    if (earlyLine) {
      const o = choices.early.find((x) => x.steps === earlyLine.qty);
      if (!o)
        throw new Error(
          "Early check-in isn't available for that time any more. Please pick another.",
        );
      earlyFrom = o.time;
    }

    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", b.id)
      .gte("created_at", since);
    if ((count ?? 0) >= 10)
      throw new Error("You've sent a lot of requests. Please message your host.");

    const total = priced.reduce((s, l) => s + l.totalPence, 0);
    const auto = basketAutoApproves(items, data.lines);
    const status = auto ? (total > 0 ? "awaiting_payment" : "approved") : "requested";
    const base = {
      booking_id: b.id,
      kind: "extras",
      status,
      items: priced,
      time_window: (data.breakfast ? "morning" : data.window) as WindowKey,
      total_pence: total,
      pay_by: status === "awaiting_payment" ? new Date(Date.now() + HOLD_MS).toISOString() : null,
      late_until: lateUntil,
      early_from: earlyFrom,
      message: data.note,
    };
    const { withLegacy } = await import("./checkin.server");
    const breakfastLine = data.breakfast
      ? `Breakfast (${data.breakfast.style === "packed" ? "light or packed" : data.breakfast.style === "delivered" ? "delivered to the room" : "in the dining room"}) for ${data.breakfast.date} at ${data.breakfast.time}.`
      : null;
    const { data: row, error } = await withLegacy(
      () =>
        db
          .from("requests")
          .insert({
            ...base,
            ...(data.breakfast
              ? { breakfast_at: breakfastAt, breakfast_style: data.breakfast.style }
              : {}),
          } as never)
          .select("id")
          .single(),
      // Before migration 0047: the breakfast time goes in the guest's note instead.
      () =>
        db
          .from("requests")
          .insert({
            ...base,
            message: [breakfastLine, data.note].filter(Boolean).join(" ") || null,
          } as never)
          .select("id")
          .single(),
    );
    if (error || !row) throw new Error("We couldn't send that. Please try again.");
    if (status === "approved") await applyStayTimes(db, row.id);

    const { raiseAlert } = await import("./checkin.server");
    await raiseAlert({
      hostId: p.host_id,
      propertyId: b.property_id,
      bookingId: b.id,
      kind: "service_request",
      message: `${auto ? "Auto-approved" : "Needs approval"}: ${priced.map((l) => `${l.qty}× ${l.name}`).join(", ")}${breakfastLine ? ` · ${breakfastLine}` : ""}`,
    });
    return { id: row.id, status };
  });

export const cancelExtrasRequest = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, id: uuid }).parse(d))
  .handler(async ({ data }) => {
    const { db, b } = await stayContext(data.token);
    const { error } = await db
      .from("requests")
      .update({ status: "cancelled", resolved_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("booking_id", b.id)
      .in("status", ["requested", "approved", "awaiting_payment", "suggested", "confirmed"]);
    if (error) throw new Error("Couldn't cancel that.");
    return { ok: true };
  });

export const acceptSuggestion = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, id: uuid }).parse(d))
  .handler(async ({ data }) => {
    const { db, b } = await stayContext(data.token);
    const { data: r } = await db
      .from("requests")
      .select("suggested_window, suggestion_expires_at, total_pence")
      .eq("id", data.id)
      .eq("booking_id", b.id)
      .single();
    if (!r?.suggestion_expires_at || Date.parse(r.suggestion_expires_at) < Date.now())
      throw new Error("That suggested time has passed.");
    const paid = r.total_pence > 0;
    await db
      .from("requests")
      .update({
        status: paid ? "awaiting_payment" : "approved",
        time_window: r.suggested_window,
        pay_by: paid ? new Date(Date.now() + HOLD_MS).toISOString() : null,
      })
      .eq("id", data.id);
    return { ok: true };
  });

/**
 * Card payment didn't work (or the guest would rather not use one). They tell
 * us how they'll settle up instead: bank transfer or cash to the host. The
 * request stays unpaid until the host confirms the money arrived, and the
 * guest is told as much.
 */
export const chooseOfflinePayment = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, id: uuid, method: z.enum(["bank", "cash"]) }).parse(d))
  .handler(async ({ data }) => {
    const { db, b } = await stayContext(data.token);
    const { data: r } = await db
      .from("requests")
      .select("id, status, items, total_pence")
      .eq("id", data.id)
      .eq("booking_id", b.id)
      .maybeSingle();
    if (!r) throw new Error("We couldn't find that request.");
    if (r.status !== "awaiting_payment") throw new Error("That request isn't waiting for payment.");
    // No countdown once they've chosen to pay the host directly.
    await db.from("requests").update({ payment_method: data.method, pay_by: null }).eq("id", r.id);
    const { raiseAlert } = await import("./checkin.server");
    const names = Array.isArray(r.items)
      ? (r.items as any[]).map((i) => `${i.qty ?? 1}× ${i.name}`).join(", ")
      : "Extras";
    await raiseAlert({
      hostId: b.properties.host_id,
      propertyId: b.property_id,
      bookingId: b.id,
      kind: "service_request",
      message: `Guest will pay ${data.method === "bank" ? "by bank transfer" : "in cash"} for: ${names}. Confirm once the money arrives.`,
    });
    return { ok: true };
  });

/**
 * Emails the itemised receipt to the guest. Sending only happens when a real
 * email sender is configured; otherwise we say so honestly and the guest can
 * still print or save the receipt.
 */
export const emailReceipt = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, id: uuid, to: z.null().optional() }).parse(d))
  .handler(async ({ data }) => {
    const { db, b } = await stayContext(data.token);
    const { data: r } = await db
      .from("requests")
      .select("id, status, items, total_pence, receipt_number, payment_method, created_at")
      .eq("id", data.id)
      .eq("booking_id", b.id)
      .maybeSingle();
    if (!r) throw new Error("We couldn't find that request.");
    if (r.status !== "confirmed")
      throw new Error("The receipt is ready once payment is confirmed.");
    // Only ever sent to the address on the booking, never a caller-chosen one.
    const to = (b.guest_email as string | null) ?? null;
    if (!to) return { sent: false, reason: "no_address" as const };

    const number = r.receipt_number ?? receiptNumber(r.id, r.created_at);
    const lines = (Array.isArray(r.items) ? (r.items as any[]) : [])
      .map((i) => `${i.qty ?? 1} × ${i.name}`)
      .join("\n");
    const { sendGuestEmail } = await import("./alert-email.server");
    const sent = await sendGuestEmail({
      to,
      subject: `Receipt ${number} · ${b.properties.name ?? "your stay"}`,
      body: `Receipt ${number}\n\n${lines}\n\nTotal: ${(r.total_pence / 100).toFixed(2)} ${b.properties.hosts?.currency ?? "GBP"}\nPaid by: ${r.payment_method ?? "card"}`,
      from: b.properties.name ?? rebrand("Latchkey"),
      key: `receipt-${r.id}`,
    });
    if (sent)
      await db
        .from("requests")
        .update({ receipt_number: number, receipt_emailed_at: new Date().toISOString() })
        .eq("id", r.id);
    return { sent, reason: sent ? null : ("not_configured" as const) };
  });
