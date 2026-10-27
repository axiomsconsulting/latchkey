import { createFileRoute } from "@tanstack/react-router";

/**
 * The Latchkey REST API (/api/public/v1/…), generated from api-spec.ts.
 * GET /api/public/v1/openapi.json describes it for any tool that reads OpenAPI.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function handle(request: Request, splat: string): Promise<Response> {
  const { OPERATIONS, matchRoute, openApi, parseInput } = await import("@/lib/api-spec");
  const path = `/${splat}`.replace(/\/+$/, "") || "/";
  if (request.method === "GET" && path === "/openapi.json")
    return json(openApi(new URL(request.url).origin));
  const match = matchRoute(request.method, path);
  if (!match) {
    return json(
      {
        error: {
          code: "not_found",
          message: `No ${request.method} ${path}. See /developers for the ${OPERATIONS.length} actions.`,
        },
      },
      404,
    );
  }
  const { ApiError, authenticate, runOperation } = await import("@/lib/api-handlers.server");
  try {
    const key = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
    const caller = await authenticate(key);
    let body: Record<string, unknown> = {};
    if (request.method !== "GET") {
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: { code: "bad_json", message: "Send a JSON body." } }, 400);
      }
    }
    const query = Object.fromEntries(new URL(request.url).searchParams.entries());
    const parsed = parseInput(match.op, { ...query, ...body, ...match.params });
    if (!parsed.ok) return json({ error: { code: "bad_input", message: parsed.problem } }, 400);
    return json(await runOperation(caller, match.op, parsed.input, "rest"));
  } catch (err) {
    if (err instanceof ApiError)
      return json({ error: { code: err.code, message: err.message } }, err.status);
    console.error("API failed", match.op.id, err);
    return json(
      { error: { code: "server_error", message: "Something went wrong. Please try again." } },
      500,
    );
  }
}

export const Route = createFileRoute("/api/public/v1/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params._splat ?? ""),
      POST: ({ request, params }) => handle(request, params._splat ?? ""),
      PATCH: ({ request, params }) => handle(request, params._splat ?? ""),
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
