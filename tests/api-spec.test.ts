import { describe, expect, it } from "vitest";

import { OPERATIONS, inputSchema, matchRoute, openApi, parseInput } from "../src/lib/api-spec";

describe("API definition", () => {
  it("gives every action a unique id and path", () => {
    expect(new Set(OPERATIONS.map((o) => o.id)).size).toBe(OPERATIONS.length);
    expect(new Set(OPERATIONS.map((o) => `${o.method} ${o.path}`)).size).toBe(OPERATIONS.length);
  });

  it("matches REST paths with ids in them", () => {
    const m = matchRoute("GET", "/bookings/11111111-1111-1111-1111-111111111111");
    expect(m?.op.id).toBe("get_booking");
    expect(m?.params).toEqual({ booking_id: "11111111-1111-1111-1111-111111111111" });
    expect(matchRoute("POST", "/bookings")?.op.id).toBe("create_booking");
    expect(matchRoute("DELETE", "/bookings")).toBeNull();
  });

  it("checks and converts inputs", () => {
    const op = OPERATIONS.find((o) => o.id === "list_bookings")!;
    expect(parseInput(op, { limit: "20", from: "2026-10-14" })).toEqual({ ok: true, input: { limit: 20, from: "2026-10-14" } });
    expect(parseInput(op, { from: "14/10/2026" })).toEqual({ ok: false, problem: "from must be a date like 2026-10-14." });
    expect(parseInput(op, { status: "partying" }).ok).toBe(false);
    const create = OPERATIONS.find((o) => o.id === "create_booking")!;
    expect(parseInput(create, { guest_name: "Sam" })).toEqual({ ok: false, problem: "property_id is required." });
  });

  it("describes tools for MCP and the API for OpenAPI", () => {
    const send = OPERATIONS.find((o) => o.id === "send_guest_message")!;
    expect(inputSchema(send).required).toEqual(["booking_id", "message"]);
    const doc = openApi("https://example.com");
    expect(Object.keys(doc.paths)).toContain("/bookings/{booking_id}");
    expect((doc.paths["/bookings"] as Record<string, { operationId: string }>)["post"]!.operationId).toBe("create_booking");
  });
});
