import { createFileRoute } from "@tanstack/react-router";

/**
 * The same MCP server with the API key in the address, for AI apps that
 * can't send headers. Treat the address like a password; revoking the key
 * stops it working.
 */
export const Route = createFileRoute("/api/public/mcp/$key")({
  server: {
    handlers: {
      POST: async ({ request, params }) => (await import("@/lib/mcp.server")).handleMcp(request, params.key),
      GET: async ({ request, params }) => (await import("@/lib/mcp.server")).handleMcp(request, params.key),
    },
  },
});
