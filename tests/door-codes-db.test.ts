/** assign_door_code: refuses a code another stay still holds, and is for the server only. */
import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

let db: Db;
let propertyId: string;
let roomId: string;

const stay = async (checkOut: string, status = "upcoming") =>
  (
    await db.system<{ id: string }>(
      `insert into bookings (property_id, room_id, guest_full_name, check_in_date, check_out_date, status)
       values ($1, $2, 'A Guest', $3::date - 2, $3::date, $4) returning id`,
      [propertyId, roomId, checkOut, status],
    )
  )[0]!.id;
const assign = async (id: string, code: string, door = "front") =>
  (
    await db.system<{ ok: boolean }>("select assign_door_code($1, $2, $3) as ok", [id, code, door])
  )[0]!.ok;

beforeAll(async () => {
  db = await bootDb();
  const hostId = (
    await db.as<{ id: string }>("owner", "select create_host_workspace('Hill', $1) as id", [
      USERS.owner.email,
    ])
  )[0]!.id;
  propertyId = (
    await db.as<{ id: string }>(
      "owner",
      "insert into properties (host_id, name, short_code) values ($1, 'Hill', 'hill-dc') returning id",
      [hostId],
    )
  )[0]!.id;
  roomId = (
    await db.as<{ id: string }>(
      "owner",
      "insert into rooms (property_id, display_name) values ($1, 'Room 1') returning id",
      [propertyId],
    )
  )[0]!.id;
});

describe("assign_door_code", () => {
  it("won't give two current stays the same code", async () => {
    const future = "2099-01-10";
    const a = await stay(future);
    const b = await stay(future);
    expect(await assign(a, "483483")).toBe(true);
    expect(await assign(b, "483483")).toBe(false);
    expect(await assign(b, "271271")).toBe(true);
  });
  it("keeps each door's code in its own place, and never shares across doors", async () => {
    const a = await stay("2099-07-10");
    const b = await stay("2099-07-10");
    expect(await assign(a, "121212", "front")).toBe(true);
    expect(await assign(a, "343434", "room")).toBe(true);
    expect(await assign(b, "343434", "front")).toBe(false);
    expect(await assign(b, "121212", "room")).toBe(false);
    const r = await db.system<{ door_code: string; door_code_room: string }>(
      "select door_code, door_code_room from bookings where id = $1",
      [a],
    );
    expect(r[0]).toMatchObject({ door_code: "121212", door_code_room: "343434" });
  });
  it("refuses a door it doesn't know", async () => {
    expect(await assign(await stay("2099-08-10"), "565656", "back")).toBe(false);
  });
  it("frees a code when the stay was cancelled or is long over", async () => {
    const gone = await stay("2099-02-10", "cancelled");
    const old = await stay("2020-02-10", "checked_out");
    expect(await assign(gone, "111222")).toBe(true);
    expect(await assign(old, "333444")).toBe(true);
    const next = await stay("2099-03-10");
    expect(await assign(next, "111222")).toBe(true);
    const later = await stay("2099-04-10");
    expect(await assign(later, "333444")).toBe(true);
  });
  it("a new code clears the tick that it's on the lock", async () => {
    const a = await stay("2099-05-10");
    await assign(a, "555666");
    await db.system("update bookings set door_code_set_at = now() where id = $1", [a]);
    await assign(a, "777888");
    const r = await db.system<{ door_code_set_at: string | null }>(
      "select door_code_set_at from bookings where id = $1",
      [a],
    );
    expect(r[0]!.door_code_set_at).toBeNull();
  });
  it("is for the server only", async () => {
    const a = await stay("2099-06-10");
    await expect(
      db.as("owner", "select assign_door_code($1, 'x', 'front')", [a]),
    ).rejects.toThrow();
  });
});
