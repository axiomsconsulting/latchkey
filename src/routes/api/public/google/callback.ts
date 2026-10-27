import { createFileRoute } from "@tanstack/react-router";

/** Google sends the super admin back here after they allow the attachments store. */
export const Route = createFileRoute("/api/public/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (result: string) =>
          new Response(null, { status: 302, headers: { location: `/app/admin?drive=${result}` } });
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state") ?? "";
        if (!code) return back("cancelled");
        const { finishConnect, takeOAuthState } = await import("@/lib/drive.server");
        if (!(await takeOAuthState(state))) return back("expired");
        const host =
          request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
        const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
        try {
          await finishConnect(code, `${proto}://${host}/api/public/google/callback`);
          return back("connected");
        } catch {
          return back("failed");
        }
      },
    },
  },
});
