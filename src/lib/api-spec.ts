/**
 * The one definition of Latchkey's API. The REST endpoints, the MCP tools,
 * the OpenAPI document and the /developers page are all generated from this
 * list, so adding or changing an action here updates every one of them.
 * Client-safe: no handlers here (see api-handlers.server.ts).
 */

export type ParamType = "string" | "integer" | "number" | "boolean" | "date" | "uuid";

export type Param = {
  name: string;
  type: ParamType;
  required?: boolean;
  description: string;
  enum?: string[];
  example?: string | number | boolean;
  /** Where it goes in a REST call. */
  in: "path" | "query" | "body";
};

export type Operation = {
  /** Also the MCP tool name. */
  id: string;
  method: "GET" | "POST" | "PATCH";
  /** REST path under /api/public/v1, with {params}. */
  path: string;
  scope: "read" | "write";
  title: string;
  /** For developers. */
  summary: string;
  /** For hosts: what you could ask an AI assistant to do with it. */
  askLike: string;
  params: Param[];
  example: unknown;
};

export const API_VERSION = "2026-10-14";
export const REST_BASE = "/api/public/v1";
export const MCP_PATH = "/api/public/mcp";

export const OPERATIONS: Operation[] = [
  {
    id: "list_properties",
    method: "GET",
    path: "/properties",
    scope: "read",
    title: "List properties",
    summary: "Every property in your business, with its short link and check-in times.",
    askLike: "Which of my properties are set up in Latchkey?",
    params: [],
    example: { data: [{ id: "6f1c…", name: "The Hill Suites", short_code: "hill", check_in_from: "15:00", check_out_by: "11:00" }] },
  },
  {
    id: "list_rooms",
    method: "GET",
    path: "/properties/{property_id}/rooms",
    scope: "read",
    title: "List rooms",
    summary: "The rooms in a property, with how many people each sleeps.",
    askLike: "How many rooms do I have at The Hill Suites, and how many people do they sleep?",
    params: [{ name: "property_id", type: "uuid", required: true, in: "path", description: "The property's id from List properties." }],
    example: { data: [{ id: "2a9b…", name: "Suite 1", sleeps: 2, children_allowed: true }] },
  },
  {
    id: "list_bookings",
    method: "GET",
    path: "/bookings",
    scope: "read",
    title: "List bookings",
    summary: "Stays overlapping a date range, newest arrival first. Defaults to the next 30 days.",
    askLike: "Who is staying with me next week?",
    params: [
      { name: "property_id", type: "uuid", in: "query", description: "Only this property." },
      { name: "from", type: "date", in: "query", description: "First night to include (YYYY-MM-DD). Default: today.", example: "2026-10-14" },
      { name: "to", type: "date", in: "query", description: "Last night to include (YYYY-MM-DD). Default: 30 days on.", example: "2026-11-13" },
      {
        name: "status",
        type: "string",
        in: "query",
        description: "Only stays with this status.",
        enum: ["needs_details", "upcoming", "checked_in", "checked_out", "cancelled", "flagged", "blocked"],
      },
      { name: "limit", type: "integer", in: "query", description: "Up to 200. Default 50.", example: 50 },
    ],
    example: {
      data: [
        {
          id: "b81e…",
          property_id: "6f1c…",
          room: "Suite 1",
          guest_name: "Priya Shah",
          check_in: "2026-10-16",
          check_out: "2026-10-18",
          nights: 2,
          guests: 2,
          status: "upcoming",
          booked_on: "airbnb",
          reference: "HM4K2P",
        },
      ],
    },
  },
  {
    id: "get_booking",
    method: "GET",
    path: "/bookings/{booking_id}",
    scope: "read",
    title: "Get a booking",
    summary: "One stay in full, including who's staying and whether they've checked in.",
    askLike: "Has Priya Shah checked in yet?",
    params: [{ name: "booking_id", type: "uuid", required: true, in: "path", description: "The booking's id." }],
    example: { data: { id: "b81e…", guest_name: "Priya Shah", status: "checked_in", checked_in_at: "2026-10-16T15:42:00Z", adults: 2, children: 0 } },
  },
  {
    id: "todays_arrivals",
    method: "GET",
    path: "/arrivals",
    scope: "read",
    title: "Today at a glance",
    summary: "Who arrives, who leaves and who's staying on a given day (default today, in each property's time zone).",
    askLike: "Who's arriving today and who still needs to check out?",
    params: [
      { name: "date", type: "date", in: "query", description: "The day (YYYY-MM-DD). Default: today." },
      { name: "property_id", type: "uuid", in: "query", description: "Only this property." },
    ],
    example: { data: { date: "2026-10-14", arriving: [{ guest_name: "Jean Dupont", room: "Garden Room" }], leaving: [], staying: [] } },
  },
  {
    id: "create_booking",
    method: "POST",
    path: "/bookings",
    scope: "write",
    title: "Add a direct booking",
    summary: "Adds a stay booked directly with you (not through a booking site).",
    askLike: "Book Sam Lee into the Garden Room from Friday for two nights, £180 paid.",
    params: [
      { name: "property_id", type: "uuid", required: true, in: "body", description: "Which property." },
      { name: "room_id", type: "uuid", in: "body", description: "Which room (from List rooms)." },
      { name: "guest_name", type: "string", required: true, in: "body", description: "The guest's full name.", example: "Sam Lee" },
      { name: "check_in", type: "date", required: true, in: "body", description: "Arrival date (YYYY-MM-DD)." },
      { name: "check_out", type: "date", required: true, in: "body", description: "Departure date (YYYY-MM-DD)." },
      { name: "guests", type: "integer", in: "body", description: "How many people. Default 1.", example: 2 },
      { name: "email", type: "string", in: "body", description: "The guest's email, used to confirm who they are at check-in." },
      { name: "amount", type: "number", in: "body", description: "What the guest paid, in your currency (e.g. 180.00). Used for invoices." },
      { name: "notes", type: "string", in: "body", description: "Anything to remember about the stay." },
    ],
    example: { data: { id: "c2d4…", status: "upcoming" } },
  },
  {
    id: "update_booking",
    method: "PATCH",
    path: "/bookings/{booking_id}",
    scope: "write",
    title: "Change a booking",
    summary: "Changes a stay's guest details, room, status or notes. Only what you send is changed.",
    askLike: "Move Sam Lee to Suite 1 and add a note that they're arriving late.",
    params: [
      { name: "booking_id", type: "uuid", required: true, in: "path", description: "The booking's id." },
      { name: "guest_name", type: "string", in: "body", description: "The guest's full name." },
      { name: "email", type: "string", in: "body", description: "The guest's email." },
      { name: "room_id", type: "uuid", in: "body", description: "Move to this room." },
      { name: "status", type: "string", in: "body", description: "New status.", enum: ["upcoming", "checked_in", "checked_out", "cancelled"] },
      { name: "notes", type: "string", in: "body", description: "Replaces the stay's notes." },
    ],
    example: { data: { id: "c2d4…", status: "upcoming" } },
  },
  {
    id: "list_requests",
    method: "GET",
    path: "/requests",
    scope: "read",
    title: "Guest requests",
    summary: "Extras and problems guests have asked about, newest first.",
    askLike: "Has anyone asked for anything I haven't dealt with?",
    params: [
      { name: "open_only", type: "boolean", in: "query", description: "Only ones still waiting on you. Default true.", example: true },
      { name: "limit", type: "integer", in: "query", description: "Up to 100. Default 30." },
    ],
    example: { data: [{ id: "9e…", kind: "extras", guest_name: "Priya Shah", what: "2 × Fresh towels", status: "new", created_at: "2026-10-14T09:12:00Z" }] },
  },
  {
    id: "send_guest_message",
    method: "POST",
    path: "/bookings/{booking_id}/messages",
    scope: "write",
    title: "Message a guest",
    summary: "Sends a message to the guest's stay page, as you.",
    askLike: "Tell Priya the towels will be outside her door by 6pm.",
    params: [
      { name: "booking_id", type: "uuid", required: true, in: "path", description: "The booking's id." },
      { name: "message", type: "string", required: true, in: "body", description: "What to say (up to 2,000 characters)." },
    ],
    example: { data: { id: "m1…", sent_at: "2026-10-14T10:03:00Z" } },
  },
  {
    id: "get_usage",
    method: "GET",
    path: "/usage",
    scope: "read",
    title: "Your API usage",
    summary: "Requests made this month and how many your plan includes.",
    askLike: "How much of my Latchkey API allowance have I used?",
    params: [],
    example: { data: { month: "2026-10", requests: 1240, included: 10000 } },
  },
];

/** JSON Schema for an operation's inputs (MCP tools and OpenAPI bodies). */
export function inputSchema(op: Operation, where?: Array<Param["in"]>) {
  const ps = op.params.filter((p) => !where || where.includes(p.in));
  const type = (p: Param) =>
    p.type === "integer"
      ? { type: "integer" }
      : p.type === "number"
        ? { type: "number" }
        : p.type === "boolean"
          ? { type: "boolean" }
          : p.type === "date"
            ? { type: "string", format: "date" }
            : p.type === "uuid"
              ? { type: "string", format: "uuid" }
              : { type: "string" };
  return {
    type: "object",
    properties: Object.fromEntries(
      ps.map((p) => [p.name, { ...type(p), description: p.description, ...(p.enum ? { enum: p.enum } : {}) }]),
    ),
    required: ps.filter((p) => p.required).map((p) => p.name),
    additionalProperties: false,
  };
}

export type ParsedInput = Record<string, string | number | boolean | undefined>;

/** Checks and converts inputs against an operation. Returns the problem, if any. */
export function parseInput(op: Operation, raw: Record<string, unknown>): { ok: true; input: ParsedInput } | { ok: false; problem: string } {
  const out: ParsedInput = {};
  for (const p of op.params) {
    const v = raw[p.name];
    if (v === undefined || v === null || v === "") {
      if (p.required) return { ok: false, problem: `${p.name} is required.` };
      continue;
    }
    const s = String(v);
    switch (p.type) {
      case "integer":
        if (!/^-?\d+$/.test(s)) return { ok: false, problem: `${p.name} must be a whole number.` };
        out[p.name] = Number(s);
        break;
      case "number":
        if (Number.isNaN(Number(s))) return { ok: false, problem: `${p.name} must be a number.` };
        out[p.name] = Number(s);
        break;
      case "boolean":
        if (!["true", "false"].includes(s)) return { ok: false, problem: `${p.name} must be true or false.` };
        out[p.name] = s === "true";
        break;
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) return { ok: false, problem: `${p.name} must be a date like 2026-10-14.` };
        out[p.name] = s;
        break;
      case "uuid":
        if (!/^[0-9a-f-]{36}$/i.test(s)) return { ok: false, problem: `${p.name} must be an id from Latchkey.` };
        out[p.name] = s;
        break;
      default:
        if (s.length > 2000) return { ok: false, problem: `${p.name} is too long.` };
        out[p.name] = s;
    }
    if (p.enum && !p.enum.includes(String(out[p.name]))) return { ok: false, problem: `${p.name} must be one of ${p.enum.join(", ")}.` };
  }
  return { ok: true, input: out };
}

/** Matches a REST path like /bookings/abc to its operation and path params. */
export function matchRoute(method: string, path: string): { op: Operation; params: Record<string, string> } | null {
  const parts = path.split("/").filter(Boolean);
  for (const op of OPERATIONS) {
    if (op.method !== method) continue;
    const want = op.path.split("/").filter(Boolean);
    if (want.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < want.length; i++) {
      const w = want[i]!;
      if (w.startsWith("{")) params[w.slice(1, -1)] = decodeURIComponent(parts[i]!);
      else if (w !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { op, params };
  }
  return null;
}

/** OpenAPI 3.1 for the REST API. */
export function openApi(origin: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of OPERATIONS) {
    const route = op.path;
    paths[route] ??= {};
    const body = op.params.filter((p) => p.in === "body");
    paths[route][op.method.toLowerCase()] = {
      operationId: op.id,
      summary: op.title,
      description: op.summary,
      security: [{ bearer: [] }],
      "x-latchkey-scope": op.scope,
      parameters: op.params
        .filter((p) => p.in !== "body")
        .map((p) => ({ name: p.name, in: p.in, required: p.in === "path" || !!p.required, description: p.description, schema: inputSchema({ ...op, params: [p] }).properties[p.name] })),
      ...(body.length ? { requestBody: { required: true, content: { "application/json": { schema: inputSchema(op, ["body"]) } } } } : {}),
      responses: {
        "200": { description: "OK", content: { "application/json": { example: op.example } } },
        "401": { description: "Missing or wrong API key" },
        "403": { description: "Key can't do this, or the API isn't on your plan" },
        "429": { description: "Monthly request allowance used up" },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "Latchkey API", version: API_VERSION, description: "Bookings, arrivals, guest requests and messages for your Latchkey properties." },
    servers: [{ url: `${origin}${REST_BASE}` }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "A Latchkey API key (lk_…), from Settings → API & MCP." } } },
    paths,
  };
}
