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
        const { finishConnect, readState } = await import("@/lib/smartthings.server");
        const who = await readState(state);
        if (!who) return back("expired");
        try {
          await finishConnect(who.hostId, who.userId, code);
          return back("connected");
        } catch {
          return back("failed");
        }
      },
    },
  },
});
