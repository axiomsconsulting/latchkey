import { createFileRoute } from "@tanstack/react-router";

/**
 * Forwarded booking-site emails arrive here from the inbound email service
 * (Postmark's inbound webhook, or a Cloudflare Email Worker posting the same
 * fields). The secret in the address keeps everyone else out.
 */
export const Route = createFileRoute("/api/public/inbound-email/$secret")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { inboundSecret } = await import("@/lib/integrations.server");
        const secret = inboundSecret();
        if (!secret || params.secret !== secret) return new Response(null, { status: 403 });
        const text = await request.text();
        if (text.length > 2_000_000) return new Response(null, { status: 413 });
        try {
          const { receiveInbound } = await import("@/lib/inbound.server");
          const r = await receiveInbound(JSON.parse(text));
          return Response.json(r);
        } catch (e) {
          // 200 so the provider doesn't retry an email we can't read anyway.
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "unreadable" });
        }
      },
    },
  },
});
