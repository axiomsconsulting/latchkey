/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/** The business's group brand (src/lib/group-brand.ts, migration 0048): read by the team, set by the owner. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { requireOwner } from "@/lib/roles";
import { LOGO_PRESETS } from "./theme";
import { normaliseGroupBrand } from "./group-brand";

type Loose = { from: (t: string) => any };

export const getGroupBrand = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: h, error } = await (context.supabase as unknown as Loose)
      .from("hosts")
      .select("business_name, group_brand")
      .eq("id", data.hostId)
      .maybeSingle();
    return {
      available: !error,
      name: (h?.business_name as string | null) ?? "",
      brand: normaliseGroupBrand(error ? null : h?.group_brand),
    };
  });

export const saveGroupBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        hostId: z.string().uuid(),
        brand: z.object({
          logoUrl: z.string().max(2000).nullable(),
          logoPreset: z.enum(LOGO_PRESETS as unknown as [string, ...string[]]).nullable(),
          propertyLogos: z.enum(["own", "group"]),
          showOnGuestPages: z.boolean(),
          showOnInvoices: z.boolean(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireOwner(context.supabase, data.hostId);
    const brand = normaliseGroupBrand(data.brand);
    const { error } = await (context.supabase as unknown as Loose)
      .from("hosts")
      .update({ group_brand: brand })
      .eq("id", data.hostId);
    if (error)
      throw new Error(
        error.message.includes("group_brand")
          ? "The group brand needs the latest update (migration 0048)."
          : error.message,
      );
    return { ok: true, brand };
  });

/** The group logo: PNG, JPG, WebP or SVG under 2 MB, kept with the business's other branding. */
export const uploadGroupLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        hostId: z.string().uuid(),
        filename: z.string().max(120),
        dataUrl: z.string().max(2_900_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireOwner(context.supabase, data.hostId);
    const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(data.dataUrl);
    if (!m) throw new Error("That file couldn't be read.");
    const ext = data.filename.split(".").pop()?.toLowerCase() ?? "";
    if (!["png", "jpg", "jpeg", "webp", "svg"].includes(ext))
      throw new Error("Please upload a PNG, JPG, WebP or SVG file.");
    const bytes = Buffer.from(m[2]!, "base64");
    if (bytes.length > 2 * 1024 * 1024) throw new Error("Logos must be under 2 MB.");
    const path = `groups/${data.hostId}/logo-${Date.now()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up = await supabaseAdmin.storage.from("branding").upload(path, bytes, {
      contentType: ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`,
      upsert: true,
    });
    if (up.error) throw new Error(up.error.message);
    const signed = await supabaseAdmin.storage
      .from("branding")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl };
  });
