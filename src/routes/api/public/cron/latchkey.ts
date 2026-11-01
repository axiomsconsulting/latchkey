import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Scheduled maintenance for Latchkey, woken by Lovable's scheduler.
 *  - "sync": pulls every active calendar feed (woken every 30 minutes)
 *  - "retention": privacy clean-up (woken daily)
 * Each run first checks the super admin's switch and minimum interval
 * (Latchkey admin → Routines); a job that's off or not yet due is skipped
 * before it does any work.
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

        // Commission Partner month close: off until switched on; drafts payouts, never sends them.
        if (task === "commission_close") {
          const { jobAllowed, recordRun } = await import("@/lib/usage.server");
          if (!(await jobAllowed("commission_close")))
            return Response.json({ task, skipped: true });
          const started = Date.now();
          const { adminDb, loadPartnerConfig } = await import("@/lib/partner-data.server");
          const { closeAndPlan, runReversals } = await import("@/lib/partner-close.server");
          const db = await adminDb();
          const config = await loadPartnerConfig(db);
          const summary = await closeAndPlan(db, config);
          if (config.clawbackMethod === "offset_then_reversal") await runReversals(db);
          await recordRun(
            "commission_close",
            `${summary.drafted} payouts drafted, ${summary.bonusesEarned} bonuses earned`,
            started,
          );
          return Response.json({ task, ...summary });
        }

        const { syncAllConnections, runRetentionSweep } = await import("@/lib/ical-sync.server");
        const { jobAllowed, recordRun } = await import("@/lib/usage.server");
        const key = task === "retention" ? "retention" : "calendar_sync";
        if (!(await jobAllowed(key))) return Response.json({ task, skipped: true });
        const started = Date.now();

        if (task === "retention") {
          const anonymised = await runRetentionSweep();
          await recordRun(key, `Anonymised ${anonymised} stays`, started);
          return Response.json({ task, anonymised });
        }

        const result = await syncAllConnections();
        // Guests' check-in photos are saved to the queue first (quick at the door): moved to Drive here.
        try {
          const { queueWaiting, syncDriveQueue } = await import("@/lib/private-store.server");
          if (await queueWaiting()) await syncDriveQueue(50);
        } catch (e) {
          console.error("Drive queue move failed", e instanceof Error ? e.message : e);
        }
        // Hosts' welcome and goodbye messages to guests, when due (src/lib/guest-messages.ts).
        try {
          if (await jobAllowed("guest_messages")) {
            const { sendDueGuestMessages } = await import("@/lib/guest-messages.server");
            await sendDueGuestMessages();
          }
        } catch (e) {
          console.error("Guest messages failed", e instanceof Error ? e.message : e);
        }
        await recordRun(key, `${result.connections} calendars, ${result.errors} errors`, started);
        return Response.json({ task: "sync", ...result });
      },
    },
  },
});
