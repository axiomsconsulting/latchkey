/** Other guests' phones joining a check-in: one phone per guest, server only. */
import { beforeAll, describe, expect, it } from "vitest";

import { bootDb, USERS, type Db } from "./pg-harness";

let db: Db;
let sessionId: string;

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
      "insert into properties (host_id, name, short_code) values ($1, 'Hill Suites', 'hill-suites') returning id",
      [hostId],
    )
  )[0]!.id;
  const bookingId = (
    await db.as<{ id: string }>(
      "owner",
      "insert into bookings (property_id, guest_full_name, check_in_date, check_out_date) values ($1, 'Priya Shah', '2026-10-12', '2026-10-14') returning id",
      [propertyId],
    )
  )[0]!.id;
  sessionId = (
    await db.system<{ id: string }>(
      "insert into checkin_sessions (property_id, booking_id, token_hash, expires_at, share_hash) values ($1, $2, 'lead-hash', now() + interval '1 hour', 'share-hash') returning id",
      [propertyId, bookingId],
    )
  )[0]!.id;
}, 60_000);

describe("checkin joins", () => {
  it("gives each guest to one phone only", async () => {
    await db.system(
      "insert into checkin_joins (session_id, position, kind, token_hash) values ($1, 1, 'adult', 'phone-a')",
      [sessionId],
    );
    await expect(
      db.system(
        "insert into checkin_joins (session_id, position, kind, token_hash) values ($1, 1, 'adult', 'phone-b')",
        [sessionId],
      ),
    ).rejects.toThrow();
    await db.system(
      "insert into checkin_joins (session_id, position, kind, token_hash) values ($1, 2, 'child', 'phone-b')",
      [sessionId],
    );
    expect(await db.system("select count(*)::int as n from checkin_joins")).toEqual([{ n: 2 }]);
  });

  it("never shows claims to signed-in users or the public", async () => {
    expect(await db.as("owner", "select id from checkin_joins").catch(() => [])).toEqual([]);
    await expect(db.as("anon", "select id from checkin_joins")).rejects.toThrow();
  });

  it("refuses the lead booker's slot and odd kinds", async () => {
    await expect(
      db.system(
        "insert into checkin_joins (session_id, position, kind, token_hash) values ($1, 0, 'adult', 'x1')",
        [sessionId],
      ),
    ).rejects.toThrow();
    await expect(
      db.system(
        "insert into checkin_joins (session_id, position, kind, token_hash) values ($1, 5, 'pet', 'x2')",
        [sessionId],
      ),
    ).rejects.toThrow();
  });
});
