/* eslint-disable @typescript-eslint/no-explicit-any -- counts from tables the generated types cover loosely */
/** What the getting-started checklist on Today ticks off (src/lib/setup-checklist.ts), for one property. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SetupFacts } from "./setup-checklist";

export const getSetupFacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<SetupFacts | null> => {
    // Read as the signed-in host, so only what they may see counts.
    const sb = context.supabase as unknown as { from: (t: string) => any };
    const count = async (table: string, extra: (q: any) => any = (q) => q) => {
      const { count: n, error } = await extra(
        sb
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("property_id", data.propertyId),
      );
      return error ? 0 : (n ?? 0);
    };
    const { data: p } = await sb
      .from("properties")
      .select("host_id, check_in_pin")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (!p) return null;
    const [rooms, calendars, guideEdits, tablets, host] = await Promise.all([
      count("rooms"),
      count("channel_connections"),
      count("guides", (q) => q.eq("is_starter", false).not("summary", "is", null)),
      count("kiosk_devices", (q) => q.eq("status", "confirmed")),
      sb
        .from("hosts")
        .select("stripe_account_ready, uses_platform_stripe")
        .eq("id", p.host_id)
        .maybeSingle()
        .then(
          (r: any) => r.data ?? null,
          () => null,
        ),
    ]);
    return {
      rooms,
      calendars,
      pin: !!p.check_in_pin,
      guideEdits,
      tablets,
      payments: !!host?.stripe_account_ready || !!host?.uses_platform_stripe,
    };
  });
