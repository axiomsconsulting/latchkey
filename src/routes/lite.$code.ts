import { createFileRoute } from "@tanstack/react-router";

/**
 * The compatible kiosk for older door tablets (src/lib/kiosk-compat.ts): a
 * plain page that old browsers can run, sent as it is (no app bundle).
 */
export const Route = createFileRoute("/lite/$code")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const code = params.code.toLowerCase();
        const notFound = () =>
          new Response("This kiosk link isn't working. Ask your host.", {
            status: 404,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        if (!/^[a-z0-9-]{2,60}$/.test(code)) return notFound();
        const { getCheckinProperty } = await import("@/lib/checkin.functions");
        const p = await getCheckinProperty({ data: { code } }).catch(() => null);
        if (!p || !p.found) return notFound();
        const { liteHtml } = await import("@/lib/kiosk-lite.server");
        const html = await liteHtml(
          { name: p.name, code: p.code, timezone: p.timezone, theme: p.theme },
          new URL(request.url).origin,
        );
        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "x-robots-tag": "noindex",
          },
        });
      },
    },
  },
});
