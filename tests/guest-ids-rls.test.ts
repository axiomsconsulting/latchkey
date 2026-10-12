/**
 * ID records from check-in: staff see them, read-only viewers and outsiders
 * don't, and only Latchkey's server writes them.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

let db: Db;
let hostId: string;
let bookingId: string;

beforeAll(async () => {
  db = await bootDb();
  hostId = (await db.as<{ id: string }>("owner", "select create_host_workspace('Trinity', $1) as id", [USERS.owner.email]))[0]!.id;
  const propertyId = (
    await db.as<{ id: string }>("owner", "insert into properties (host_id, name, short_code) values ($1, 'Trinity', 'trinity-ids') returning id", [hostId])
  )[0]!.id;
  bookingId = (
    await db.as<{ id: string }>(
      "owner",
      "insert into bookings (property_id, guest_full_name, check_in_date, check_out_date) values ($1, 'Priya Shah', '2026-10-12', '2026-10-14') returning id",
      [propertyId],
    )
  )[0]!.id;
  await db.system("insert into host_members (host_id, user_id, role) values ($1, $2, 'viewer')", [hostId, USERS.viewer.id]);
  await db.system(
    `insert into guest_ids (booking_id, property_id, position, kind, full_name, id_checked, name_match, delete_after)
     values ($1, $2, 0, 'adult', 'Priya Shah', true, 'matched', '2026-11-13'),
            ($1, $2, 1, 'child', null, false, null, '2026-11-13')`,
    [bookingId, propertyId],
  );
}, 60_000);

describe("guest ID records", () => {
  it("are visible to the owner", async () => {
    const rows = await db.as("owner", "select position from guest_ids where booking_id = $1 order by position", [bookingId]);
    expect(rows).toEqual([{ position: 0 }, { position: 1 }]);
  });

  it("are hidden from read-only viewers and outsiders", async () => {
    expect(await db.as("viewer", "select id from guest_ids")).toEqual([]);
    expect(await db.as("outsider", "select id from guest_ids")).toEqual([]);
  });

  it("can't be changed from the browser", async () => {
    // No update policy: the row is invisible to UPDATE, so nothing changes.
    await db.as("owner", "update guest_ids set full_name = 'Someone Else' where booking_id = $1", [bookingId]);
    const [row] = await db.system<{ full_name: string }>("select full_name from guest_ids where position = 0");
    expect(row!.full_name).toBe("Priya Shah");
  });

  it("can be deleted early by the owner but not by a viewer", async () => {
    await db.as("viewer", "delete from guest_ids where position = 1");
    expect(await db.system("select id from guest_ids where position = 1")).toHaveLength(1);
    await db.as("owner", "delete from guest_ids where position = 1");
    expect(await db.system("select id from guest_ids where position = 1")).toHaveLength(0);
  });

  it("rejects a child older than 17 and an unknown document type", async () => {
    await expect(db.system("update guest_ids set age = 18 where position = 0")).rejects.toThrow(/check constraint/);
    await expect(db.system("update guest_ids set document_type = 'library_card' where position = 0")).rejects.toThrow(/check constraint/);
  });
});
