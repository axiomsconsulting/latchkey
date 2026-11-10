/**
 * Tablet and phone hand-off (migration 0100): the saved place can hold register
 * details read from an ID, so nobody signed in reads it, not even the host's team.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

let db: Db;

beforeAll(async () => {
  db = await bootDb();
  const hostId = (
    await db.as<{ id: string }>("owner", "select create_host_workspace('Hill', $1) as id", [
      USERS.owner.email,
    ])
  )[0]!.id;
  const propertyId = (
    await db.as<{ id: string }>(
      "owner",
      "insert into properties (host_id, name, short_code) values ($1, 'Hill', 'hill-handoff') returning id",
      [hostId],
    )
  )[0]!.id;
  const bookingId = (
    await db.system<{ id: string }>(
      "insert into bookings (property_id, check_in_date, check_out_date, guest_full_name) values ($1, current_date, current_date + 2, 'Ana Silva') returning id",
      [propertyId],
    )
  )[0]!.id;
  const sessionId = (
    await db.system<{ id: string }>(
      "insert into checkin_sessions (token_hash, property_id, booking_id, expires_at) values ('h', $1, $2, now() + interval '1 hour') returning id",
      [propertyId, bookingId],
    )
  )[0]!.id;
  await db.system(
    `insert into checkin_handoffs (session_id, at, rev, state) values ($1, 'phone', 1, '{"steps":[]}')`,
    [sessionId],
  );
}, 120_000);

describe("checkin hand-offs", () => {
  it("are server only", async () => {
    let rows: unknown = null;
    try {
      rows = await db.as("owner", "select state from checkin_handoffs");
    } catch {
      rows = [];
    }
    expect(rows).toEqual([]);
  });

  it("only name the tablet or a phone, and go with their session", async () => {
    await expect(db.system("update checkin_handoffs set at = 'laptop'")).rejects.toThrow();
    await db.system("delete from checkin_sessions where token_hash = 'h'");
    expect(await db.system("select * from checkin_handoffs")).toEqual([]);
  });
});
