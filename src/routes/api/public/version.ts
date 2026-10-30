/* eslint-disable @typescript-eslint/no-explicit-any -- site_settings.app_updates is newer than the generated types */
import { createFileRoute } from "@tanstack/react-router";

import { normaliseUpdates } from "@/lib/app-update";
import { APP_VERSION } from "@/lib/app-version";

// Read at most every 30 seconds per server, so every open dashboard and tablet checking costs little.
let cached: { at: number; updates: ReturnType<typeof normaliseUpdates> } | null = null;

/**
 * The version this server runs (the newest published one) and Latchkey
 * admin's update requests, for dashboards and door tablets checking whether
 * to update (src/lib/app-update.ts). Public: nothing private in it.
 */
export const Route = createFileRoute("/api/public/version")({
  server: {
    handlers: {
      GET: async () => {
        if (!cached || Date.now() - cached.at > 30_000) {
          // The version always answers, even if the update requests can't be read.
          let raw: unknown = null;
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data, error } = await (supabaseAdmin as any)
              .from("site_settings")
              .select("app_updates")
              .eq("id", 1)
              .maybeSingle();
            raw = error ? null : data?.app_updates;
          } catch {
            raw = null;
          }
          cached = { at: Date.now(), updates: normaliseUpdates(raw) };
        }
        return new Response(JSON.stringify({ version: APP_VERSION, updates: cached.updates }), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
