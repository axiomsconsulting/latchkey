import { createFileRoute } from "@tanstack/react-router";

/**
 * Page views for the super admin's visitor analytics, sent by the browser
 * (sendBeacon, so it never slows a page down). Always answers 204; the
 * super admin can switch it off under Latchkey admin → Routines.
 */
export const Route = createFileRoute("/api/public/track")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const text = await request.text();
          if (text.length > 4000) return new Response(null, { status: 204 });
          const { jobAllowed } = await import("@/lib/usage.server");
          if (await jobAllowed("visitor_analytics")) {
            const { recordHit } = await import("@/lib/analytics.server");
            await recordHit(JSON.parse(text), request);
          }
        } catch {
          // Analytics never fails a visit.
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
