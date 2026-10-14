import { createFileRoute } from "@tanstack/react-router";

/** Latchkey's MCP server; the API key goes in the Authorization header. */
export const Route = createFileRoute("/api/public/mcp")({
  server: {
    handlers: {
      POST: async ({ request }) => (await import("@/lib/mcp.server")).handleMcp(request, null),
      GET: async ({ request }) => (await import("@/lib/mcp.server")).handleMcp(request, null),
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
          },
        }),
    },
  },
});
