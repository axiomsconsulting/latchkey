/**
 * The UK guest register: staff read and correct it, viewers can't see it,
 * nobody deletes it from the browser, and it outlives the stay it came from.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

let db: Db;
let hostId: string;
let propertyId: string;
let bookingId: string;

const insert = () =>
  db.system(
    `insert into guest_register (host_id, property_id, property_name, booking_id, position, arrival_date, full_name,
       nationality, is_alien, keep_until)
     values ($1, $2, 'Trinity', $3, 0, '2026-10-12', 'Priya Shah', 'GB', false, '2027-10-12')`,
    [hostId, propertyId, bookingId],
  );

beforeAll(async () => {
  db = await bootDb();
  hostId = (await db.as<{ id: string }>("owner", "select create_host_workspace('Trinity', $1) as id", [USERS.owner.email]))[0]!.id;
  propertyId = (
    await db.as<{ id: string }>("owner", "insert into properties (host_id, name, short_code) values ($1, 'Trinity', 'trinity-reg') returning id", [hostId])
  )[0]!.id;
  bookingId = (
    await db.as<{ id: string }>(
      "owner",
      "insert into bookings (property_id, guest_full_name, check_in_date, check_out_date) values ($1, 'Priya Shah', '2026-10-12', '2026-10-14') returning id",
      [propertyId],
    )
  )[0]!.id;
  await db.system("insert into host_members (host_id, user_id, role) values ($1, $2, 'viewer')", [hostId, USERS.viewer.id]);
  await insert();
}, 60_000);

describe("guest register", () => {
  it("is visible to the owner, not to viewers or outsiders", async () => {
    expect(await db.as("owner", "select full_name from guest_register")).toEqual([{ full_name: "Priya Shah" }]);
    expect(await db.as("viewer", "select id from guest_register")).toEqual([]);
    expect(await db.as("outsider", "select id from guest_register")).toEqual([]);
  });

  it("can't be deleted from the browser", async () => {
    await db.as("owner", "delete from guest_register");
    expect(await db.system("select id from guest_register")).toHaveLength(1);
  });

  it("lets the owner add someone, but not with a shorter keep date", async () => {
    await db.as(
      "owner",
      `insert into guest_register (host_id, property_id, property_name, arrival_date, full_name, nationality, is_alien, source, keep_until)
       values ($1, $2, 'Trinity', '2026-10-12', 'Sam Jones', 'IE', false, 'host', '2027-10-12')`,
      [hostId, propertyId],
    );
    await expect(
      db.as(
        "owner",
        `insert into guest_register (host_id, property_id, property_name, arrival_date, full_name, nationality, is_alien, source, keep_until)
         values ($1, $2, 'Trinity', '2026-10-12', 'Sam Jones', 'IE', false, 'host', '2026-11-12')`,
        [hostId, propertyId],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("needs document details and next destination for aliens, and none for others", async () => {
    await expect(
      db.system(
        `insert into guest_register (host_id, property_name, arrival_date, full_name, nationality, is_alien, keep_until)
         values ($1, 'Trinity', '2026-10-12', 'Jean Dupont', 'FR', true, '2027-10-12')`,
        [hostId],
      ),
    ).rejects.toThrow(/guest_register_alien_details/);
    await expect(
      db.system(
        `insert into guest_register (host_id, property_name, arrival_date, full_name, nationality, is_alien, document_number, keep_until)
         values ($1, 'Trinity', '2026-10-12', 'Priya Shah', 'GB', false, '123', '2027-10-12')`,
        [hostId],
      ),
    ).rejects.toThrow(/guest_register_alien_details/);
  });

  it("outlives the stay it came from", async () => {
    await db.system("delete from bookings where id = $1", [bookingId]);
    const rows = await db.system<{ booking_id: string | null }>("select booking_id from guest_register where full_name = 'Priya Shah'");
    expect(rows).toEqual([{ booking_id: null }]);
  });
});
