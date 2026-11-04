/** Remembered ID checks (migration 0088): only the server can see or write them. */
import { beforeAll, describe, expect, it } from "vitest";

import { bootDb, USERS, type Db } from "./pg-harness";

let db: Db;
let hostId: string;
let bookingId: string;

beforeAll(async () => {
  db = await bootDb();
  hostId = (
    await db.as<{ id: string }>("owner", "select create_host_workspace('Hill', $1) as id", [
      USERS.owner.email,
    ])
  )[0]!.id;
  const propertyId = (
    await db.as<{ id: string; returning_trust: boolean }>(
      "owner",
      "insert into properties (host_id, name, short_code) values ($1, 'Hill House', 'hill-pass') returning id, returning_trust",
      [hostId],
    )
  )[0]!;
  expect(propertyId.returning_trust).toBe(false);
  bookingId = (
    await db.system<{ id: string }>(
      "insert into bookings (property_id, check_in_date, check_out_date, guest_full_name, channel, status) values ($1, '2026-11-01', '2026-11-03', 'Anna Nowak', 'direct', 'upcoming') returning id",
      [propertyId.id],
    )
  )[0]!.id;
  await db.system(
    "insert into guest_id_passes (host_id, booking_id, email_hash, full_name, document_expiry, keep_until) values ($1, $2, 'e', 'Anna Nowak', '2030-01-01', '2027-11-01')",
    [hostId, bookingId],
  );
}, 60_000);

describe("remembered ID checks", () => {
  it("can't be read or written by anyone signed in, even the owner", async () => {
    expect(await db.as("owner", "select * from guest_id_passes").catch(() => [])).toEqual([]);
    expect(await db.as("outsider", "select * from guest_id_passes").catch(() => [])).toEqual([]);
    await db.as("owner", "delete from guest_id_passes").catch(() => []);
    expect(await db.system("select count(*)::int as n from guest_id_passes")).toEqual([{ n: 1 }]);
  });

  it("need a contact to match on", async () => {
    await expect(
      db.system(
        "insert into guest_id_passes (host_id, booking_id, full_name, document_expiry, keep_until) values ($1, $2, 'A B', '2030-01-01', '2027-11-01')",
        [hostId, bookingId],
      ),
    ).rejects.toThrow();
  });

  it("go when the stay is deleted", async () => {
    await db.system("delete from bookings where id = $1", [bookingId]);
    expect(await db.system("select count(*)::int as n from guest_id_passes")).toEqual([{ n: 0 }]);
  });
});
