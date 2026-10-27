/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/** A business's privacy and retention choices (hosts.privacy, migration 0041). */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOwner } from "@/lib/roles";
import { DETAIL_DAY_CHOICES, MESSAGE_DAY_CHOICES, normalisePrivacy } from "./privacy";

type Loose = { from: (t: string) => any };

export const getPrivacy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as unknown as Loose)
      .from("hosts")
      .select("privacy")
      .eq("id", data.hostId)
      .maybeSingle();
    // Before migration 0041: the defaults, and nothing to save yet.
    return { available: !error, privacy: normalisePrivacy(error ? null : row?.privacy) };
  });

export const savePrivacy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        hostId: z.string().uuid(),
        guestDetailsDays: z
          .number()
          .refine((n) => (DETAIL_DAY_CHOICES as readonly number[]).includes(n)),
        messagesDays: z
          .number()
          .refine((n) => (MESSAGE_DAY_CHOICES as readonly number[]).includes(n)),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // How long guests' details are kept is the owner's decision.
    await requireOwner(context.supabase, data.hostId);
    const privacy = normalisePrivacy(data);
    const { error } = await (context.supabase as unknown as Loose)
      .from("hosts")
      .update({ privacy })
      .eq("id", data.hostId);
    if (error) throw new Error(error.message);
    return { ok: true, privacy };
  });
