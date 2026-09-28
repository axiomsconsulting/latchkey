import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Scheduled maintenance for Latchkey.
 *  - "sync": pulls every active calendar feed (every 30 minutes)
 *  - "retention": clears guest names, phone digits and notes 90 days after
 *    check-out, keeping the anonymised stay for statistics (daily)
 */
export const Route = createFileRoute("/api/public/cron/latchkey")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        let task = "sync";
        try {
          const body = (await request.json()) as { task?: string };
          if (body?.task) task = body.task;
        } catch {
          // no body: default to sync
        }

        const { syncAllConnections, runRetentionSweep } = await import("@/lib/ical-sync.server");

        if (task === "retention") {
          const anonymised = await runRetentionSweep();
          return Response.json({ task, anonymised });
        }

        const result = await syncAllConnections();
        return Response.json({ task: "sync", ...result });
      },
    },
  },
});
