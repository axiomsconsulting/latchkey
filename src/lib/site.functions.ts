/**
 * The site a page is shown on: the brand (the super admin's white label, or a
 * host's name on their own domain) and, on a host's domain, which property
 * "/" opens. The super admin's brand settings live here too.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normaliseBrand, type Brand } from "@/lib/brand";
import { normaliseUi, type UiConfig } from "@/lib/ui-config";
import { normaliseHomeArt, type HomeArtItem } from "@/lib/home-art";
import { missingLegal, normaliseLegal } from "@/lib/legal";

export type SiteContext = { brand: Brand; tenant: { name: string; shortCode: string | null } | null; ui: UiConfig; homeArt: HomeArtItem[] };

export const getSiteContext = createServerFn({ method: "GET" }).handler(async (): Promise<SiteContext> => {
  const { currentSite, platformBrand, platformUi, platformHomeArt } = await import("./brand.server");
  const site = currentSite();
  return {
    brand: site?.brand ?? (await platformBrand()),
    tenant: site?.tenant ? { name: site.tenant.name, shortCode: site.tenant.shortCode } : null,
    ui: normaliseUi(await platformUi()),
    // A host's own domain shows their property page, never Latchkey's home pictures.
    homeArt: site?.tenant ? [] : normaliseHomeArt(await platformHomeArt()),
  };
});

type Loose = { from: (t: string) => any; rpc: (fn: string) => any };

async function requireSuperAdmin(supabase: unknown) {
  const { data } = await (supabase as Loose).rpc("is_super_admin");
  if (data !== true) throw new Error("Super admin only.");
}

/** Super admin: the white label as stored. */
export const getBrandSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    // Straight from the database, never a cached copy: the form saves back exactly what it shows,
    // so a stale copy from another server instance would overwrite a logo just uploaded.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as Loose).from("site_settings").select("brand").eq("id", 1).maybeSingle();
    return { available: !error, brand: normaliseBrand(error ? null : data?.brand) };
  });

export const saveBrandSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().max(40),
        tagline: z.string().max(120),
        footer: z.string().max(300),
        logoMark: z.enum(["key", "arch", "monogram", "initial"]),
        logoUrl: z.string().max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const brand = normaliseBrand(data);
    const { error } = await (context.supabase as unknown as Loose).from("site_settings").update({ brand, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error(error.message);
    const { forgetBrand } = await import("./brand.server");
    forgetBrand();
    return { ok: true, brand };
  });

/** Super admin: upload the site's own logo (PNG, JPG, WebP or SVG, under 1 MB); returns a long-lived link to save with the brand. */
export const uploadSiteLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ filename: z.string().max(120), dataUrl: z.string().max(1_400_000) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(data.dataUrl);
    if (!m) throw new Error("That file couldn't be read.");
    const ext = data.filename.split(".").pop()?.toLowerCase() ?? "";
    if (!["png", "jpg", "jpeg", "webp", "svg"].includes(ext)) throw new Error("Please upload a PNG, JPG, WebP or SVG file.");
    const bytes = Buffer.from(m[2]!, "base64");
    if (bytes.length > 1024 * 1024) throw new Error("Logos must be under 1 MB.");
    const contentType = ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;
    const path = `site/logo-${Date.now()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up = await supabaseAdmin.storage.from("branding").upload(path, bytes, { contentType, upsert: true });
    if (up.error) throw new Error(up.error.message);
    const signed = await supabaseAdmin.storage.from("branding").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl };
  });

/* ------------------------ menu and page layouts ------------------------- */

const navEntry = z.object({
  id: z.string().max(60),
  hidden: z.boolean().optional(),
  label: z.string().max(30).optional(),
  href: z.string().max(500).optional(),
  icon: z.string().max(40).optional(),
  iconUrl: z.string().max(40_000).optional(),
  iconColour: z.boolean().optional(),
});

/** Super admin: the menu and every page's sections, for all hosts. */
export const saveUiConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ nav: z.array(navEntry).max(40), pages: z.record(z.string(), z.object({ order: z.array(z.string().max(40)).max(40), hidden: z.array(z.string().max(40)).max(40) })) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const ui = normaliseUi(data);
    const { error } = await (context.supabase as unknown as Loose).from("site_settings").update({ ui, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error(error.message);
    const { forgetBrand } = await import("./brand.server");
    forgetBrand();
    return { ok: true, ui };
  });

/* ---------------------------- starter sections ---------------------------- */

export const getStarterSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { starterSettings } = await import("./guide-starters.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as unknown as Loose).from("site_settings").select("guide_starters").eq("id", 1).maybeSingle();
    return { available: !error, ...(await starterSettings()) };
  });

/** Takes a starter section out for hosts who sign up from now on (or puts it back). Existing hosts keep theirs. */
export const setStarterSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.string().max(40), offered: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { normaliseStarters } = await import("./guide");
    const { starterSettings, forgetStarters } = await import("./guide-starters.server");
    const { removed } = await starterSettings();
    const next = { ...removed };
    if (data.offered) delete next[data.key];
    else next[data.key] = new Date().toISOString();
    const clean = normaliseStarters({ removed: next });
    if (!data.offered && !clean.removed[data.key]) throw new Error("Keep at least one starter section for new hosts.");
    const { error } = await (context.supabase as unknown as Loose).from("site_settings").update({ guide_starters: clean, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error(error.message);
    forgetStarters();
    return { ok: true, ...clean };
  });

/** Public: the operator's legal details for /terms and /privacy (defaults until migration 0054 or the super admin fills them in). */
export const getLegalDetails = createServerFn({ method: "GET" }).handler(async () => {
  // The pages must always open: any problem reading the settings falls back to the defaults.
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as Loose).from("site_settings").select("legal").eq("id", 1).maybeSingle();
    return normaliseLegal(error ? null : data?.legal);
  } catch {
    return normaliseLegal(null);
  }
});

/** Super admin: the legal details as stored, and what's still missing. */
export const getLegalSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as Loose).from("site_settings").select("legal").eq("id", 1).maybeSingle();
    const legal = normaliseLegal(error ? null : data?.legal);
    return { available: !error, legal, missing: missingLegal(legal) };
  });

export const saveLegalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyName: z.string().max(120),
        companyNumber: z.string().max(40),
        registeredAddress: z.string().max(400),
        contactEmail: z.string().max(200),
        privacyEmail: z.string().max(200),
        icoNumber: z.string().max(40),
        vatNumber: z.string().max(40),
        governingLaw: z.string().max(80),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    for (const k of ["contactEmail", "privacyEmail"] as const) {
      if (data[k].trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data[k].trim())) throw new Error("Please check the email addresses.");
    }
    const legal = normaliseLegal(data);
    const { error } = await (context.supabase as unknown as Loose).from("site_settings").update({ legal, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error(/legal/.test(error.message) ? "Legal details can be saved once the latest database update (0054) is applied." : error.message);
    return { ok: true, legal };
  });

/* ---------------------------- home page pictures ---------------------------- */

/** Super admin: the home page's pictures as stored (null = the defaults). */
export const getHomeArtSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as Loose).from("site_settings").select("home_art").eq("id", 1).maybeSingle();
    return { available: !error, items: normaliseHomeArt(error ? null : (data?.home_art ?? null)), custom: !error && Array.isArray(data?.home_art) };
  });

/** Super admin: save the list, or null to go back to the defaults. */
export const saveHomeArt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ items: z.array(z.record(z.string(), z.unknown())).max(20).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const home_art = data.items === null ? null : normaliseHomeArt(data.items);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as unknown as Loose).from("site_settings").update({ home_art, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error(/home_art/.test(error.message) ? "Home page pictures need the latest database update (migration 0058)." : error.message);
    const { forgetBrand } = await import("./brand.server");
    forgetBrand();
    return { ok: true };
  });

/** Super admin: upload a picture for the home page (PNG, WebP or SVG with a transparent background, under 2 MB). */
export const uploadHomeArt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ filename: z.string().max(120), dataUrl: z.string().max(2_800_000) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(data.dataUrl);
    if (!m) throw new Error("That file couldn't be read.");
    const ext = data.filename.split(".").pop()?.toLowerCase() ?? "";
    if (!["jpg", "jpeg", "png", "webp", "svg"].includes(ext)) throw new Error("Please upload a JPEG, PNG or WebP photo.");
    const bytes = Buffer.from(m[2]!, "base64");
    if (bytes.length > 2 * 1024 * 1024) throw new Error("Pictures must be under 2 MB.");
    const contentType = ext === "svg" ? "image/svg+xml" : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    const path = `site/home-${Date.now()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up = await supabaseAdmin.storage.from("branding").upload(path, bytes, { contentType, upsert: true });
    if (up.error) throw new Error(up.error.message);
    const signed = await supabaseAdmin.storage.from("branding").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl };
  });
