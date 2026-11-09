import { createFileRoute } from "@tanstack/react-router";

/** SmartThings sends the host back here after they allow Latchkey to see and control their devices. */
export const Route = createFileRoute("/api/public/smartthings/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (result: string) =>
          new Response(null, {
            status: 302,
            headers: { location: `/app/settings?focus=roomDevices&smartthings=${result}` },
          });
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state") ?? "";
        if (!code) return back("cancelled");
        const { finishConnect, readState, smartThingsCallback } =
          await import("@/lib/smartthings.server");
        const who = await readState(state);
        if (!who) return back("expired");
        const host =
          request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
        const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
        try {
          await finishConnect(
            who.hostId,
            who.userId,
            code,
            smartThingsCallback(`${proto}://${host}`),
          );
          return back("connected");
        } catch {
          return back("failed");
        }
      },
    },
  },
});
