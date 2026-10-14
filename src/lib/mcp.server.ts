/**
 * Latchkey's MCP server (Streamable HTTP, JSON responses). Tools are the
 * same actions as the REST API, from api-spec.ts. Authenticated by an API
 * key in the Authorization header, or in the private connector URL for apps
 * that can't send headers.
 */
import { API_VERSION, OPERATIONS, inputSchema, parseInput } from "./api-spec";
import { ApiError, authenticate, runOperation } from "./api-handlers.server";

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any };

const INSTRUCTIONS =
  "Latchkey runs small hotels, B&Bs and short lets: bookings from every booking site, guest self check-in, guest requests and messages. " +
  "Use list_properties first to get property ids. Dates are YYYY-MM-DD in the property's time zone. Ask before changing bookings or messaging guests.";

function reply(id: RpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function fail(id: RpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export async function handleMcp(request: Request, keyFromPath: string | null): Promise<Response> {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (request.method === "GET") {
    return new Response(JSON.stringify({ error: "This MCP server answers POST requests (Streamable HTTP, JSON responses)." }), { status: 405, headers });
  }
  let body: RpcRequest | RpcRequest[];
  try {
    body = (await request.json()) as RpcRequest | RpcRequest[];
  } catch {
    return new Response(JSON.stringify(fail(null, -32700, "Parse error")), { status: 400, headers });
  }
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
  const key = bearer ?? keyFromPath;
  const calls = Array.isArray(body) ? body : [body];
  const out: unknown[] = [];
  for (const call of calls) {
    const res = await handleOne(call, key);
    if (res) out.push(res);
  }
  if (out.length === 0) return new Response(null, { status: 202, headers });
  return new Response(JSON.stringify(Array.isArray(body) ? out : out[0]), { status: 200, headers });
}

async function handleOne(call: RpcRequest, key: string | null): Promise<unknown | null> {
  // Notifications get no reply.
  if (call.id === undefined || call.method.startsWith("notifications/")) return null;
  switch (call.method) {
    case "initialize":
      return reply(call.id, {
        protocolVersion: typeof call.params?.protocolVersion === "string" ? call.params.protocolVersion : "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "latchkey", title: "Latchkey", version: API_VERSION },
        instructions: INSTRUCTIONS,
      });
    case "ping":
      return reply(call.id, {});
    case "tools/list":
      return reply(call.id, {
        tools: OPERATIONS.map((op) => ({
          name: op.id,
          title: op.title,
          description: `${op.summary} Example: "${op.askLike}"`,
          inputSchema: inputSchema(op),
          annotations: { readOnlyHint: op.scope === "read", destructiveHint: false, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const op = OPERATIONS.find((o) => o.id === call.params?.name);
      if (!op) return fail(call.id, -32602, `Unknown tool: ${String(call.params?.name)}`);
      try {
        const caller = await authenticate(key);
        const parsed = parseInput(op, (call.params?.arguments ?? {}) as Record<string, unknown>);
        if (!parsed.ok) return reply(call.id, { content: [{ type: "text", text: parsed.problem }], isError: true });
        const data = await runOperation(caller, op, parsed.input, "mcp");
        return reply(call.id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data });
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
        if (!(err instanceof ApiError)) console.error("MCP tool failed", op.id, err);
        return reply(call.id, { content: [{ type: "text", text: message }], isError: true });
      }
    }
    default:
      return fail(call.id, -32601, `Method not found: ${call.method}`);
  }
}
