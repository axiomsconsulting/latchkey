/**
 * Latchkey admin → System → Keys and secrets. Super admins only. Values are masked unless the
 * key isn't confidential; revealSecretValue gives one whole value on request (never Lovable's
 * own keys) and is logged by name, never by value.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSuperAdmin } from "./roles";

async function adminEmail(supabase: unknown): Promise<string | null> {
  const { data } = await (
    supabase as { auth: { getUser: () => Promise<{ data: { user: { email?: string } | null } }> } }
  ).auth.getUser();
  return data.user?.email ?? null;
}

export const getSecrets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { secretRows } = await import("./secrets.server");
    return { rows: await secretRows() };
  });

export const saveSecretValue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().regex(/^[A-Z0-9_]{3,64}$/),
        value: z.string().max(4000),
        force: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const by = await adminEmail(context.supabase);
    const { saveSecret } = await import("./secrets.server");
    const r = await saveSecret(data.name, data.value, by, data.force);
    console.info(
      `Keys and secrets: ${data.name} ${data.value.trim() ? "saved" : "cleared"} by ${by ?? "?"}`,
    );
    return r;
  });

export const revealSecretValue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().regex(/^[A-Z0-9_]{3,64}$/),
        which: z.enum(["current", "lovable", "previous"]).default("current"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { revealSecret } = await import("./secrets.server");
    const value = await revealSecret(data.name, data.which);
    console.info(
      `Keys and secrets: ${data.name} (${data.which}) shown to ${(await adminEmail(context.supabase)) ?? "?"}`,
    );
    return { value };
  });
