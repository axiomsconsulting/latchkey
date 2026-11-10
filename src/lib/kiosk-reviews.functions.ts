/* eslint-disable @typescript-eslint/no-explicit-any -- kiosk_reviews is from migration 0102 */
/**
 * Reviews for the door tablet (kiosk-reviews.ts): the host fetches them from the property's
 * own listing links (property and rooms) through Firecrawl, behind the "review_import"
 * routine; the kiosk reads the shown ones by its code when the host has them on.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { hostOfProperty, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();
const KEEP = 60;

async function admin() {
  const { admin: get } = await import("./checkin.server");
  return (await get()) as any;
}

async function canFetch(): Promise<boolean> {
  const { canFetchReviews } = await import("./kiosk-reviews.server");
  return canFetchReviews();
}

/** The host's list: every review fetched, shown or hidden, and whether fetching is available. */
export const listKioskReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("kiosk_reviews")
      .select("id, site, first_name, rating, out_of, review_date, quote, hidden, fetched_at")
      .eq("property_id", data.propertyId)
      .order("fetched_at", { ascending: false })
      .limit(KEEP);
    return {
      available: !error,
      canFetch: await canFetch(),
      reviews: (error ? [] : rows) as Array<{
        id: string;
        site: string;
        first_name: string;
        rating: number;
        out_of: 5 | 10;
        review_date: string | null;
        quote: string;
        hidden: boolean;
        fetched_at: string;
      }>,
    };
  });

/** Reads the reviews on the property's and its rooms' listing pages and keeps the best ones. */
export const fetchKioskReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireWrite(context.supabase, hostId);
    if (!(await canFetch()))
      throw new Error("Fetching reviews isn't switched on yet. Ask Latchkey support.");
    const { fetchReviewsFor } = await import("./kiosk-reviews.server");
    return fetchReviewsFor(data.propertyId, hostId);
  });

/** Shows or hides one review on the door tablet. */
export const setKioskReviewHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, id: uuid, hidden: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const db = await admin();
    const { error } = await db
      .from("kiosk_reviews")
      .update({ hidden: data.hidden })
      .eq("id", data.id)
      .eq("property_id", data.propertyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** For the door tablet: the shown reviews, when the host has them on. Nothing otherwise. */
export const kioskReviews = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: p } = await db
      .from("properties")
      .select("id, theme_config")
      .eq("short_code", data.code.toLowerCase())
      .maybeSingle();
    if (!p || (p.theme_config as { kioskReviews?: unknown } | null)?.kioskReviews !== true)
      return { reviews: [] };
    const { data: rows, error } = await db
      .from("kiosk_reviews")
      .select("id, site, first_name, rating, out_of, review_date, quote")
      .eq("property_id", p.id)
      .eq("hidden", false)
      .limit(40);
    if (error) return { reviews: [] };
    return {
      reviews: ((rows ?? []) as any[]).map((r) => ({
        id: r.id as string,
        site: r.site as string,
        firstName: r.first_name as string,
        rating: Number(r.rating),
        outOf: (r.out_of === 10 ? 10 : 5) as 5 | 10,
        date: (r.review_date as string | null) ?? null,
        text: r.quote as string,
      })),
    };
  });

/** The host's switch: reviews on the door tablet, kept in the property's theme. */
export const setKioskReviewsOn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, on: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { normaliseTheme } = await import("./theme");
    const { data: p, error: readErr } = await context.supabase
      .from("properties")
      .select("theme_config, short_code")
      .eq("id", data.propertyId)
      .single();
    if (readErr || !p) throw new Error("Property not found.");
    const theme = normaliseTheme({
      ...((p.theme_config as Record<string, unknown> | null) ?? {}),
      kioskReviews: data.on,
    });
    const { error } = await context.supabase
      .from("properties")
      .update({ theme_config: theme as never })
      .eq("id", data.propertyId);
    if (error) throw new Error(error.message);
    return { code: p.short_code as string };
  });

/* ------------------------------ Latchkey admin ------------------------------ */

/** How often reviews are read again (days), and every property that could show them. */
export const getReviewRefresh = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireSuperAdmin } = await import("./roles");
    await requireSuperAdmin(context.supabase);
    const { reviewEveryDays, reviewProperties, canFetchReviews } =
      await import("./kiosk-reviews.server");
    return {
      days: await reviewEveryDays(),
      canFetch: await canFetchReviews(),
      properties: await reviewProperties(),
    };
  });

export const setReviewRefreshDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(1).max(30) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireSuperAdmin } = await import("./roles");
    await requireSuperAdmin(context.supabase);
    const { setReviewEveryDays } = await import("./kiosk-reviews.server");
    await setReviewEveryDays(data.days);
    return { ok: true };
  });

/** Reads reviews now for the chosen properties (or every one with listing links). */
export const refreshReviewsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyIds: z.array(uuid).max(200).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireSuperAdmin } = await import("./roles");
    await requireSuperAdmin(context.supabase);
    const { refreshReviews } = await import("./kiosk-reviews.server");
    return refreshReviews({ only: data.propertyIds, limit: 20 });
  });
