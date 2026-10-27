/**
 * A property's own team: a manager given one property sees and changes only
 * that property's rows (and its bookings' requests and messages); owners
 * and whole-business members see everything.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

let db: Db;
let hostId: string;
let paris: string;
let tokyo: string;
let tokyoStay: string;

beforeAll(async () => {
  db = await bootDb();
  hostId = (
    await db.as<{ id: string }>("owner", "select create_host_workspace('Hill Group', $1) as id", [
      USERS.owner.email,
    ])
  )[0]!.id;
  paris = (
    await db.as<{ id: string }>(
      "owner",
      "insert into properties (host_id, name, short_code) values ($1, 'Maison', 'pm-paris') returning id",
      [hostId],
    )
  )[0]!.id;
  tokyo = (
    await db.as<{ id: string }>(
      "owner",
      "insert into properties (host_id, name, short_code) values ($1, 'Aoba', 'pm-tokyo') returning id",
      [hostId],
    )
  )[0]!.id;
  await db.as(
    "owner",
    "insert into bookings (property_id, guest_full_name, check_in_date, check_out_date) values ($1, 'Léa', '2026-11-02', '2026-11-04')",
    [paris],
  );
  tokyoStay = (
    await db.as<{ id: string }>(
      "owner",
      "insert into bookings (property_id, guest_full_name, check_in_date, check_out_date) values ($1, 'Haruto', '2026-11-02', '2026-11-04') returning id",
      [tokyo],
    )
  )[0]!.id;
  await db.system(
    "insert into messages (booking_id, direction, channel, body) values ($1, 'inbound', 'stay_page', 'hello')",
    [tokyoStay],
  );
  // "manager" runs Paris only; "viewer" sees the whole business.
  await db.system(
    "insert into host_members (host_id, user_id, role, property_ids) values ($1, $2, 'manager', array[$3]::uuid[]), ($1, $4, 'viewer', null)",
    [hostId, USERS.manager.id, paris, USERS.viewer.id],
  );
}, 60_000);

describe("per-property managers", () => {
  it("shows a property's own manager only that property", async () => {
    expect(await db.as("manager", "select name from properties order by name")).toEqual([
      { name: "Maison" },
    ]);
    expect(await db.as("manager", "select guest_full_name from bookings")).toEqual([
      { guest_full_name: "Léa" },
    ]);
    expect(await db.as("manager", "select id from messages")).toEqual([]);
  });

  it("stops them changing another property", async () => {
    await db.as(
      "manager",
      "update bookings set guest_full_name = 'Changed' where property_id = $1",
      [tokyo],
    );
    expect(
      await db.system("select guest_full_name from bookings where property_id = $1", [tokyo]),
    ).toEqual([{ guest_full_name: "Haruto" }]);
    await expect(
      db.as(
        "manager",
        "insert into bookings (property_id, guest_full_name, check_in_date, check_out_date) values ($1, 'X', '2026-11-05', '2026-11-06')",
        [tokyo],
      ),
    ).rejects.toThrow();
  });

  it("lets owners and whole-business members see every property", async () => {
    expect((await db.as("owner", "select id from properties")).length).toBe(2);
    expect((await db.as("viewer", "select id from bookings")).length).toBe(2);
    expect((await db.as("owner", "select id from messages")).length).toBe(1);
  });

  it("never limits an owner", async () => {
    await db.system(
      "update host_members set property_ids = array[$2]::uuid[] where host_id = $1 and role = 'owner'",
      [hostId, paris],
    );
    expect(
      (
        await db.system<{ p: unknown }>(
          "select property_ids as p from host_members where host_id = $1 and role = 'owner'",
          [hostId],
        )
      )[0]!.p,
    ).toBeNull();
  });
});
