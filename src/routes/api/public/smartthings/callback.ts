import { createFileRoute } from "@tanstack/react-router";

/** SmartThings sends the host back here after they allow Latchkey to see and control their devices. */
export const Route = createFileRoute("/api/public/smartthings/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        // Opened in a popup from Settings: tell the page and close; opened directly: go back to Settings.
        const back = (result: string) => {
          const to = `/app/settings?focus=roomDevices&smartthings=${result}`;
          const html = `<!doctype html><meta charset="utf-8"><title>SmartThings</title><script>
try { if (window.opener && window.opener.location.origin === location.origin) {
  window.opener.postMessage({ latchkeySmartThings: ${JSON.stringify(result)} }, location.origin);
  window.close();
} } catch (e) {}
setTimeout(function () { location.replace(${JSON.stringify(to)}); }, 300);
</script>`;
          return new Response(html, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
          });
        };
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
