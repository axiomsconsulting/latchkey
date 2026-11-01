/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * Listing import (experimental, src/lib/listing-import.ts): read a host's own
 * public listing pages through Firecrawl, one link per call so the host sees
 * each page's progress, then add what they chose to their property and rooms.
 * Switched on and off in Latchkey admin (routine "listing_import", off until
 * turned on); needs FIRECRAWL_API_KEY in Lovable Cloud → Secrets.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { hostOfProperty, requireWrite } from "@/lib/roles";

type Loose = { from: (t: string) => any };
const uuid = z.string().uuid();
const FIRECRAWL = "https://api.firecrawl.dev/v1/scrape";

const firecrawlKey = () => (process.env["FIRECRAWL_API_KEY"] ?? "").trim() || null;

async function allowed(): Promise<boolean> {
  const { jobAllowed } = await import("./usage.server");
  return !!firecrawlKey() && (await jobAllowed("listing_import"));
}

/** Whether hosts see the import: switched on in Latchkey admin and the key is set. */
export const listingImportStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ enabled: await allowed() }));

/** Reads one listing page and returns what it shows, tidied (normaliseListing). */
export const scrapeListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        url: z.string().trim().url().max(2000),
        dates: z
          .object({
            checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          })
          .nullable()
          .default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireWrite(context.supabase, hostId);
    if (!(await allowed())) throw new Error("Listing import is switched off at the moment.");
    const {
      detectPlatform,
      listingUrl,
      LISTING_SCHEMA,
      normaliseListing,
      promptFor,
      PLATFORM_PROFILES,
    } = await import("./listing-import");
    const platform = detectPlatform(data.url);
    if (!platform)
      throw new Error(
        `Use a link to your own listing on ${Object.values(PLATFORM_PROFILES)
          .map((p) => p.label)
          .join(", ")}.`,
      );
    const target = listingUrl(data.url, data.dates);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 100_000);
    let body: {
      success?: boolean;
      error?: string;
      data?: { json?: unknown; metadata?: { title?: string; statusCode?: number } };
    };
    try {
      const res = await fetch(FIRECRAWL, {
        method: "POST",
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${firecrawlKey()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: target,
          formats: ["json"],
          jsonOptions: { schema: LISTING_SCHEMA, prompt: promptFor(platform) },
          onlyMainContent: false,
          // Listing pages draw their photos and room tables after loading.
          waitFor: 3000,
          timeout: 90_000,
          blockAds: true,
        }),
      });
      body = (await res.json().catch(() => ({}))) as typeof body;
      if (!res.ok || body.success === false) {
        const why = body.error ?? `status ${res.status}`;
        // Latchkey's own set-up (the reading service's key or credits): say so, not "your link".
        if (res.status === 401 || res.status === 402 || res.status === 403) {
          const { appError } = await import("./app-error");
          throw appError({
            code: "listing_import_setup",
            title: "Listing import isn't available right now",
            body: "This is on Latchkey's side (the service that reads listing pages needs attention), not your link. Your listing is fine.",
            steps: [
              { text: "Add your rooms and photos by hand for now, or try the import again later." },
              { text: "Send this to Latchkey support so it's fixed." },
            ],
            detail: `Firecrawl ${res.status}: ${why}`,
          });
        }
        throw new Error(
          res.status === 429
            ? "Too many pages at once. Wait a minute and try again."
            : `The page couldn't be read (${why}).`,
        );
      }
    } catch (e) {
      if ((e as Error).name === "AbortError")
        throw new Error("The page took too long to read. Try again, or try another link.");
      throw e;
    } finally {
      clearTimeout(timer);
    }
    const { bumpUsage } = await import("./usage.server");
    await bumpUsage(hostId, "firecrawl:scrape");
    const status = body.data?.metadata?.statusCode;
    if (status && status >= 400)
      throw new Error(
        status === 404
          ? "That listing wasn't found. Check the link is public."
          : `The site answered with an error (${status}).`,
      );
    return {
      listing: normaliseListing(body.data?.json, platform, target),
      pageTitle: body.data?.metadata?.title ?? null,
    };
  });

/** Copies one photo from a booking site's image server into the branding bucket; a long-lived link back. */
async function copyPhoto(url: string, path: string): Promise<string | null> {
  const { photoHostAllowed } = await import("./listing-import");
  if (!photoHostAllowed(url)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    // Image servers sometimes redirect; wherever it ended up must be one of them too.
    if (res.url && !photoHostAllowed(res.url)) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > 8 * 1024 * 1024) return null;
    const ext = type === "image/jpeg" ? "jpg" : type.slice(6);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up = await supabaseAdmin.storage
      .from("branding")
      .upload(`${path}.${ext}`, bytes, { contentType: type, upsert: true });
    if (up.error) return null;
    const signed = await supabaseAdmin.storage
      .from("branding")
      .createSignedUrl(`${path}.${ext}`, 60 * 60 * 24 * 365 * 5);
    return signed.error ? null : signed.data.signedUrl;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const time = z.string().regex(/^\d{2}:\d{2}$/);

/** Adds what the host chose from their listings: property details, rooms (new or updated), photos and house rules. */
export const applyListingImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        property: z
          .object({
            name: z.string().trim().min(1).max(120).optional(),
            address: z.string().trim().max(200).optional(),
            postcode: z.string().trim().max(20).optional(),
            country_code: z
              .string()
              .regex(/^[A-Z]{2}$/)
              .optional(),
            default_check_in_time: time.optional(),
            default_check_out_time: time.optional(),
            parking_notes: z.string().trim().max(500).optional(),
          })
          .default({}),
        houseRules: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
        /** The pages read for the whole property, kept as its listing links. */
        propertyLinks: z.array(z.string().url().max(2000)).max(10).default([]),
        coverPhotoUrl: z.string().url().max(2000).nullable().default(null),
        rooms: z
          .array(
            z.object({
              existingId: uuid.nullable(),
              name: z.string().trim().min(1).max(80),
              description: z.string().trim().max(2000).nullable(),
              maxGuests: z.number().int().min(1).max(30),
              ensuite: z.boolean(),
              amenities: z.array(z.string().trim().min(1).max(80)).max(30),
              photoUrl: z.string().url().max(2000).nullable(),
              /** The room's own listing page, kept as its link. */
              listingUrl: z.string().url().max(2000).nullable().default(null),
            }),
          )
          .max(40),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireWrite(context.supabase, hostId);
    if (!(await allowed())) throw new Error("Listing import is switched off at the moment.");
    const sb = context.supabase as unknown as Loose;
    const result = {
      propertyUpdated: false,
      roomsAdded: 0,
      roomsUpdated: 0,
      photos: 0,
      photosSkipped: 0,
      rulesAdded: false,
    };

    if (Object.keys(data.property).length) {
      const { error } = await sb.from("properties").update(data.property).eq("id", data.propertyId);
      if (error) throw new Error(error.message);
      result.propertyUpdated = true;
    }

    const { data: existing } = await sb
      .from("rooms")
      .select("id, sort_order")
      .eq("property_id", data.propertyId);
    let order =
      Math.max(
        -1,
        ...((existing ?? []) as Array<{ sort_order: number | null }>).map((r) => r.sort_order ?? 0),
      ) + 1;
    const ours = new Set(((existing ?? []) as Array<{ id: string }>).map((r) => r.id));
    for (const r of data.rooms) {
      const fields = {
        display_name: r.name,
        public_title: r.name,
        description: r.description,
        max_guests: r.maxGuests,
        has_ensuite: r.ensuite,
        amenities: r.amenities,
      };
      let roomId: string;
      if (r.existingId && ours.has(r.existingId)) {
        const { error } = await sb.from("rooms").update(fields).eq("id", r.existingId);
        if (error) throw new Error(error.message);
        roomId = r.existingId;
        result.roomsUpdated++;
      } else {
        const { data: row, error } = await sb
          .from("rooms")
          .insert({
            ...fields,
            property_id: data.propertyId,
            children_allowed: true,
            sort_order: order++,
            active: true,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        roomId = row.id as string;
        result.roomsAdded++;
      }
      if (r.listingUrl) {
        // Kept beside any links already there; before migration 0051 this is skipped.
        const { mergeListingLinks } = await import("./listing-links");
        const { data: had } = await sb
          .from("rooms")
          .select("listing_links")
          .eq("id", roomId)
          .maybeSingle();
        await sb
          .from("rooms")
          .update({ listing_links: mergeListingLinks(had?.listing_links, [r.listingUrl]) })
          .eq("id", roomId);
      }
      if (r.photoUrl) {
        const url = await copyPhoto(r.photoUrl, `${data.propertyId}/room-${roomId}-${Date.now()}`);
        if (url) {
          await sb.from("rooms").update({ cover_image_url: url }).eq("id", roomId);
          result.photos++;
        } else result.photosSkipped++;
      }
    }

    if (data.propertyLinks.length) {
      const { mergeListingLinks } = await import("./listing-links");
      const { data: had } = await sb
        .from("properties")
        .select("listing_links")
        .eq("id", data.propertyId)
        .maybeSingle();
      await sb
        .from("properties")
        .update({ listing_links: mergeListingLinks(had?.listing_links, data.propertyLinks) })
        .eq("id", data.propertyId);
    }

    if (data.coverPhotoUrl) {
      const url = await copyPhoto(data.coverPhotoUrl, `${data.propertyId}/cover-${Date.now()}`);
      if (url) {
        const { data: p } = await sb
          .from("properties")
          .select("theme_config")
          .eq("id", data.propertyId)
          .maybeSingle();
        const theme = (
          p?.theme_config && typeof p.theme_config === "object" ? p.theme_config : {}
        ) as Record<string, unknown>;
        await sb
          .from("properties")
          .update({ theme_config: { ...theme, coverImageUrl: url } })
          .eq("id", data.propertyId);
        result.photos++;
      } else result.photosSkipped++;
    }

    // House rules go into the stay guide's "House rules", only where the host hasn't written it yet.
    if (data.houseRules.length) {
      const { data: g } = await sb
        .from("guides")
        .select("id, is_starter, summary")
        .eq("property_id", data.propertyId)
        .eq("section_key", "rules")
        .is("room_id", null)
        .maybeSingle();
      const untouched = !g || g.is_starter === true || !g.summary;
      if (untouched) {
        const summary = data.houseRules.join(" · ").slice(0, 500);
        let guideId = g?.id as string | undefined;
        if (guideId)
          await sb
            .from("guides")
            .update({
              summary,
              is_starter: false,
              published: true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", guideId);
        else {
          const { data: row } = await sb
            .from("guides")
            .insert({
              property_id: data.propertyId,
              room_id: null,
              section_key: "rules",
              title: "House rules",
              summary,
              published: true,
            })
            .select("id")
            .single();
          guideId = row?.id as string | undefined;
        }
        if (guideId) {
          await sb.from("guide_steps").delete().eq("guide_id", guideId);
          await sb.from("guide_steps").insert(
            data.houseRules.map((rule, i) => ({
              guide_id: guideId,
              heading: rule.slice(0, 120),
              body: null,
              image_url: null,
              sort_order: i,
            })),
          );
          result.rulesAdded = true;
        }
      }
    }
    return result;
  });
