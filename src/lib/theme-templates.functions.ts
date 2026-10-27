/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * Looks saved as templates (theme_templates, migration 0040): a host's own,
 * and ones the super admin shares with every host. Any property's look can
 * become one, and any host can start from a shared one.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { requireWrite } from "@/lib/roles";
import { normaliseTheme, templateConfig } from "@/lib/theme";

const uuid = z.string().uuid();
type Loose = { from: (t: string) => any; rpc: (fn: string) => any };

async function admin(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

export type ThemeTemplate = {
  id: string;
  name: string;
  blurb: string;
  shared: boolean;
  theme: ReturnType<typeof normaliseTheme>;
};

export const listThemeTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as unknown as Loose)
      .from("theme_templates")
      .select("id, host_id, name, blurb, config")
      .or(`host_id.is.null,host_id.eq.${data.hostId}`)
      .order("created_at", { ascending: false });
    if (error) return { available: false as const, templates: [] as ThemeTemplate[] };
    const { data: isAdmin } = await (context.supabase as unknown as Loose).rpc("is_super_admin");
    return {
      available: true as const,
      superAdmin: isAdmin === true,
      templates: (
        (rows ?? []) as Array<{
          id: string;
          host_id: string | null;
          name: string;
          blurb: string;
          config: unknown;
        }>
      ).map((r) => ({
        id: r.id,
        name: r.name,
        blurb: r.blurb,
        shared: r.host_id === null,
        theme: normaliseTheme({ ...(r.config as object), presetId: `tpl_${r.id.slice(0, 8)}` }),
      })),
    };
  });

/** Saves a look as a template: the host's own, or (super admins) shared with every host. */
export const saveThemeTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        hostId: uuid,
        name: z.string().trim().min(1).max(60),
        blurb: z.string().trim().max(140),
        theme: z.record(z.string(), z.unknown()),
        share: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    if (data.share) {
      const { data: isAdmin } = await (context.supabase as unknown as Loose).rpc("is_super_admin");
      if (isAdmin !== true)
        throw new Error("Only Latchkey admins can share templates with every host.");
    } else {
      await requireWrite(context.supabase, data.hostId);
    }
    const config = templateConfig(normaliseTheme(data.theme), { shared: data.share });
    const { data: row, error } = await (
      await admin()
    )
      .from("theme_templates")
      .insert({
        host_id: data.share ? null : data.hostId,
        name: data.name,
        blurb: data.blurb,
        config,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error)
      throw new Error(
        error.code === "42P01"
          ? "Templates are being set up. Please try again shortly."
          : error.message,
      );
    return { id: row.id as string };
  });

export const deleteThemeTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const { data: row } = await sb
      .from("theme_templates")
      .select("host_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return { ok: true };
    if (row.host_id === null) {
      const { data: isAdmin } = await (context.supabase as unknown as Loose).rpc("is_super_admin");
      if (isAdmin !== true) throw new Error("Only Latchkey admins can remove shared templates.");
    } else {
      await requireWrite(context.supabase, row.host_id);
    }
    await sb.from("theme_templates").delete().eq("id", data.id);
    return { ok: true };
  });
