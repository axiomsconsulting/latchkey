/**
 * The host's own address book of tradespeople. Everything runs as the signed-in
 * host, so row-level security keeps one host's contacts away from another's.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TRADE_CATEGORIES } from "./trade-contacts";

const uuid = z.string().uuid();
const categoryIds = TRADE_CATEGORIES.map((c) => c.id) as [string, ...string[]];
const text = (max: number) => z.string().trim().max(max).nullable().default(null);

const tradeShape = {
  name: z.string().trim().min(1).max(120),
  company_name: text(120),
  category: z.enum(categoryIds).default("other"),
  phone: text(40),
  whatsapp_phone: text(40),
  email: text(160),
  website: text(300),
  area: text(120),
  notes: text(800),
  is_preferred: z.boolean().default(false),
};

export const listTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, propertyId: uuid.nullable().default(null) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("trades")
      .select("*")
      .eq("host_id", data.hostId)
      .order("is_preferred", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    // Contacts with no property are the host's general list, shown everywhere.
    return (rows ?? []).filter(
      (t) => !data.propertyId || t.property_id === null || t.property_id === data.propertyId,
    );
  });

export const saveTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.nullable().default(null),
        hostId: uuid,
        propertyId: uuid.nullable().default(null),
        ...tradeShape,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, hostId, propertyId, ...fields } = data;
    if (id) {
      const { error } = await context.supabase.from("trades").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await context.supabase
      .from("trades")
      .insert({ ...fields, host_id: hostId, property_id: propertyId, source: "manual" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("trades").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const importTrades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        hostId: uuid,
        propertyId: uuid.nullable().default(null),
        rows: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(120),
              company_name: text(120),
              category: z.string().trim().max(40).default("other"),
              phone: text(40),
              whatsapp_phone: text(40),
              email: text(160),
              website: text(300),
              area: text(120),
              notes: text(800),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const allowed = new Set(categoryIds);
    const payload = data.rows.map((r) => ({
      ...r,
      category: allowed.has(r.category) ? r.category : "other",
      host_id: data.hostId,
      property_id: data.propertyId,
      source: "import",
    }));
    const { error, count } = await context.supabase.from("trades").insert(payload, { count: "exact" });
    if (error) throw new Error(error.message);
    return { added: count ?? payload.length };
  });

/** One AI shortlist per property, refreshable by hand when the host wants. */
export const suggestPropertyTrades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, force: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: property, error } = await context.supabase
      .from("properties")
      .select("id, host_id, name, address, postcode, country_code, trades_ai_at")
      .eq("id", data.propertyId)
      .single();
    if (error || !property) throw new Error("We could not find that property.");
    if (property.trades_ai_at && !data.force) return { suggestions: [], alreadyDone: true as const };

    const { count } = await context.supabase
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .eq("property_id", property.id)
      .eq("active", true);

    const { suggestTrades } = await import("./trades-ai.server");
    const suggestions = await suggestTrades({
      propertyName: property.name,
      area: [property.postcode, property.address].filter(Boolean).join(", "),
      countryCode: property.country_code ?? "GB",
      rooms: count ?? 1,
    });

    await context.supabase
      .from("properties")
      .update({ trades_ai_at: new Date().toISOString() })
      .eq("id", property.id);

    return { suggestions, alreadyDone: false as const };
  });

/** Turns an accepted AI suggestion into a real, editable contact row. */
export const addSuggestedTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        hostId: uuid,
        propertyId: uuid.nullable().default(null),
        category: z.string().trim().max(40),
        role: z.string().trim().min(1).max(120),
        why: z.string().trim().max(400).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const allowed = new Set(categoryIds);
    const { data: row, error } = await context.supabase
      .from("trades")
      .insert({
        host_id: data.hostId,
        property_id: data.propertyId,
        name: data.role,
        category: allowed.has(data.category) ? data.category : "other",
        notes: data.why || null,
        source: "ai",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
