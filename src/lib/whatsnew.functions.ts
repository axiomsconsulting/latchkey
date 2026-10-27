/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * Which Latchkey release someone last saw, kept on their account (so the
 * "What's new" note shows once per update, on any device).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Loose = { from: (t: string) => any };

export const getSeenRelease = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as unknown as Loose)
      .from("user_prefs")
      .select("seen_release")
      .eq("user_id", context.userId)
      .maybeSingle();
    // Before migration 0035: the browser remembers instead.
    if (error) return { available: false as const, seen: null };
    return { available: true as const, seen: (data?.seen_release as string | null) ?? null };
  });

export const markReleaseSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ version: z.string().regex(/^\d+\.\d+\.\d+$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as unknown as Loose)
      .from("user_prefs")
      .upsert({ user_id: context.userId, seen_release: data.version }, { onConflict: "user_id" });
    return { ok: !error };
  });
