/* eslint-disable @typescript-eslint/no-explicit-any -- smart_pricing and rate_readings are from migration 0107 */
/**
 * Smart pricing on Direct stays → Set-up (rules in src/lib/smart-pricing.ts, page reads in
 * smart-pricing.server.ts). Hosts see what guests pay on the booking sites, what to charge direct
 * and on each site, and what Stripe keeps; a suggestion only changes a rate when they accept it.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { hostOfProperty, requireWrite } from "@/lib/roles";

type Loose = { from: (t: string) => any };
const uuid = z.string().uuid();

const todayIn = (tz: string | null) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? "Europe/London" }).format(new Date());

/** Everything the Smart pricing card shows for one property. */
export const getSmartPricing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const { normaliseSmartPricing, pricingPicture, DEFAULT_SMART_PRICING, priceSiteForUrl } =
      await import("./smart-pricing");
    const { normaliseOffers } = await import("./direct-rates");
    const { normaliseListingLinks } = await import("./listing-links");
    const [prop, rooms, readings] = await Promise.all([
      sb
        .from("properties")
        .select(
          "id, name, timezone, country_code, currency, direct_offers, smart_pricing, listing_links, hosts(currency)",
        )
        .eq("id", data.propertyId)
        .maybeSingle(),
      sb
        .from("rooms")
        .select("id, display_name, base_rate_pence, listing_links")
        .eq("property_id", data.propertyId)
        .neq("active", false)
        .order("sort_order"),
      sb
        .from("rate_readings")
        .select("room_id, kind, site, url, label, check_in, nights, nightly_pence, note, seen_at")
        .eq("property_id", data.propertyId)
        .gte("seen_at", new Date(Date.now() - 120 * 86_400_000).toISOString())
        .order("seen_at", { ascending: false })
        .limit(2000),
    ]);
    // Before migration 0107 the card says what's coming.
    const available = !prop.error && !readings.error;
    const p = prop.data ?? {};
    const settings = available ? normaliseSmartPricing(p.smart_pricing) : DEFAULT_SMART_PRICING;
    const roomList = ((rooms.data ?? []) as any[]).map((r) => ({
      id: r.id as string,
      name: r.display_name as string,
      rate: typeof r.base_rate_pence === "number" ? (r.base_rate_pence as number) : null,
      listed: normaliseListingLinks(r.listing_links)
        .map((l) => priceSiteForUrl(l.url))
        .filter(Boolean) as string[],
    }));
    const stored = ((readings.data ?? []) as any[]).map((r) => ({
      roomId: (r.room_id as string | null) ?? null,
      kind: r.kind as "own" | "market",
      site: r.site,
      url: r.url as string,
      checkIn: r.check_in as string,
      nights: r.nights as number,
      nightly: (r.nightly_pence as number | null) ?? null,
      seenAt: r.seen_at as string,
      label: (r.label as string | null) ?? null,
      note: (r.note as string | null) ?? null,
    }));
    const today = todayIn(p.timezone ?? null);
    const country = (p.country_code as string | null) ?? "GB";
    const { canReadPrices } = await import("./smart-pricing.server");
    const lastRead = stored[0]?.seenAt ?? null;
    return {
      available,
      canRead: await canReadPrices(),
      currency: (
        (p.currency as string | null) ||
        (p.hosts?.currency as string | null) ||
        "GBP"
      ).toUpperCase(),
      /** The Stripe account's country, for what Stripe keeps (prices known for the UK). */
      country,
      today,
      settings,
      rooms: roomList,
      ownLinks: normaliseListingLinks(p.listing_links).filter((l) => priceSiteForUrl(l.url)).length,
      picture: pricingPicture(
        roomList.map(({ id, name, rate }) => ({ id, name, rate })),
        stored,
        settings,
        normaliseOffers(p.direct_offers),
        { country, today },
      ),
      lastRead,
      /** The latest read's problems in a line each (a page that didn't read, another currency). */
      notes: [
        ...new Set(
          stored
            .filter(
              (r) => r.seenAt === lastRead || r.seenAt.slice(0, 10) === lastRead?.slice(0, 10),
            )
            .map((r) => r.note)
            .filter(Boolean) as string[],
        ),
      ].slice(0, 4),
    };
  });

/** Saves the host's smart pricing settings (the accepted history is kept as it was). */
export const saveSmartPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, settings: z.record(z.string(), z.unknown()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const sb = context.supabase as unknown as Loose;
    const { normaliseSmartPricing } = await import("./smart-pricing");
    const { pricingFor } = await import("./smart-pricing.server");
    const before = await pricingFor(sb, data.propertyId);
    const settings = { ...normaliseSmartPricing(data.settings), history: before.history };
    const { error } = await sb
      .from("properties")
      .update({ smart_pricing: settings })
      .eq("id", data.propertyId);
    if (error)
      throw new Error(
        /smart_pricing/.test(error.message)
          ? "Smart pricing needs the latest update (migration 0107)."
          : error.message,
      );
    return { ok: true, settings };
  });

/** Reads the sites' prices for this property now (the host's Check prices now). */
export const checkPricesNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireWrite(context.supabase, hostId);
    const { canReadPrices, readPricesFor } = await import("./smart-pricing.server");
    if (!(await canReadPrices()))
      throw new Error("Reading prices on the booking sites is switched off at the moment.");
    return readPricesFor(data.propertyId, { hostId });
  });

/**
 * Accepts suggested direct rates (one room or all): each rate becomes the room's nightly rate on
 * the booking page, never under the room's lowest price, and is noted in the history.
 */
export const acceptPriceSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        rates: z
          .array(z.object({ roomId: uuid, ratePence: z.number().int().min(100).max(100_000_000) }))
          .min(1)
          .max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const sb = context.supabase as unknown as Loose;
    const { pricingFor } = await import("./smart-pricing.server");
    const s = await pricingFor(sb, data.propertyId);
    const { data: rows } = await sb
      .from("rooms")
      .select("id, base_rate_pence")
      .eq("property_id", data.propertyId);
    const before = new Map(((rows ?? []) as any[]).map((r) => [r.id, r.base_rate_pence ?? null]));
    const at = new Date().toISOString();
    const history = [...s.history];
    for (const r of data.rates) {
      if (!before.has(r.roomId)) throw new Error("That room isn't in this property.");
      const floor = s.floors[r.roomId] ?? 0;
      const rate = Math.max(floor, r.ratePence);
      const { error } = await sb
        .from("rooms")
        .update({ base_rate_pence: rate })
        .eq("id", r.roomId)
        .eq("property_id", data.propertyId);
      if (error) throw new Error(error.message);
      history.unshift({ at, roomId: r.roomId, from: before.get(r.roomId) ?? null, to: rate });
    }
    await sb
      .from("properties")
      .update({ smart_pricing: { ...s, history: history.slice(0, 30) } })
      .eq("id", data.propertyId);
    return { ok: true };
  });
