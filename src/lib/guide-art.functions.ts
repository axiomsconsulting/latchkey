/* eslint-disable @typescript-eslint/no-explicit-any -- theme_config is loose JSON */
/**
 * The pictures behind the guide's cards (guide-art.ts): on or off, and the host's own picture
 * (or none) per section, kept in the property's theme. Uploads go to the "branding" bucket with a
 * long-lived link, like the theme's cover.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { hostOfProperty, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();
const sectionKey = z.string().regex(/^[a-z0-9_]{2,40}$/);

async function readTheme(sb: any, propertyId: string) {
  const { data: p, error } = await sb
    .from("properties")
    .select("theme_config")
    .eq("id", propertyId)
    .single();
  if (error || !p) throw new Error("Property not found.");
  return (p.theme_config ?? {}) as Record<string, unknown>;
}

/** Turns the pictures on or off, and sets (url), removes ("none") or resets (null) one section's. */
export const saveGuideArt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        on: z.boolean().optional(),
        key: sectionKey.optional(),
        value: z
          .union([z.literal("none"), z.string().url().startsWith("https://"), z.null()])
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const raw = await readTheme(context.supabase, data.propertyId);
    const art = { ...((raw["guideArt"] as Record<string, string> | undefined) ?? {}) };
    if (data.key && data.value !== undefined) {
      if (data.value === null) delete art[data.key];
      else art[data.key] = data.value;
    }
    const { normaliseTheme } = await import("./theme");
    const theme = normaliseTheme({
      ...raw,
      guideArt: art,
      ...(data.on === undefined ? {} : { guideArtOn: data.on }),
    });
    const { error } = await (context.supabase as any)
      .from("properties")
      .update({ theme_config: theme })
      .eq("id", data.propertyId);
    if (error) throw new Error(error.message);
    return { on: theme.guideArtOn, art: theme.guideArt };
  });

/** Uploads a section's picture and sets it. */
export const uploadGuideArt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        key: sectionKey,
        dataUrl: z
          .string()
          .regex(/^data:image\/(jpeg|png|webp);base64,/)
          .max(8_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(data.dataUrl)!;
    const bytes = Buffer.from(m[2]!, "base64");
    if (bytes.length > 5 * 1024 * 1024) throw new Error("Pictures must be under 5 MB.");
    const path = `${data.propertyId}/guide-art-${data.key}-${Date.now()}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up = await supabaseAdmin.storage
      .from("branding")
      .upload(path, bytes, { contentType: `image/${m[1]}`, upsert: true });
    if (up.error) throw new Error(up.error.message);
    const signed = await supabaseAdmin.storage
      .from("branding")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    if (signed.error) throw new Error(signed.error.message);
    const url = signed.data.signedUrl;
    const raw = await readTheme(context.supabase, data.propertyId);
    const { normaliseTheme } = await import("./theme");
    const theme = normaliseTheme({
      ...raw,
      guideArt: {
        ...((raw["guideArt"] as Record<string, string> | undefined) ?? {}),
        [data.key]: url,
      },
    });
    const { error } = await (context.supabase as any)
      .from("properties")
      .update({ theme_config: theme })
      .eq("id", data.propertyId);
    if (error) throw new Error(error.message);
    return { url };
  });
