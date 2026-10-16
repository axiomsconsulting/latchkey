import { createFileRoute } from "@tanstack/react-router";

/** The service worker asks for the newest alert for its device token (pushes carry no content). */
export const Route = createFileRoute("/api/public/push/latest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("t") ?? "";
        const { latestForDevice } = await import("@/lib/notify.server");
        const alert = await latestForDevice(token).catch(() => null);
        if (!alert) return new Response(null, { status: 404 });
        return Response.json(alert, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
