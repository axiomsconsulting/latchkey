/** Test stays (migration 0092): they can't hold a room, and there's one per property. */
import { beforeAll, describe, expect, it } from "vitest";

import { bootDb, USERS, type Db } from "./pg-harness";

let db: Db;
let propertyId: string;
let roomId: string;

const add = (cols: string, vals: string) =>
  db.system(
    `insert into bookings (property_id, check_in_date, check_out_date, channel, status, guest_full_name, ${cols}) values ($1, '2026-11-05', '2026-11-06', 'direct', 'upcoming', 'Sam Lee', ${vals}) returning id`,
    [propertyId],
  );

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
      "insert into properties (host_id, name, short_code) values ($1, 'Hill House', 'hill-test') returning id",
      [hostId],
    )
  )[0]!.id;
  roomId = (
    await db.as<{ id: string }>(
      "owner",
      "insert into rooms (property_id, display_name) values ($1, 'Suite 1') returning id",
      [propertyId],
    )
  )[0]!.id;
}, 60_000);

describe("test stays", () => {
  it("can never hold a real room", async () => {
    await expect(add("is_test, room_id", `true, '${roomId}'`)).rejects.toThrow(
      /bookings_test_has_no_room/,
    );
  });
  it("keep the room to try apart", async () => {
    const [row] = await add("is_test, test_room_id", `true, '${roomId}'`);
    expect(row).toBeTruthy();
    const rows = await db.system<{ room_id: string | null; test_room_id: string }>(
      "select room_id, test_room_id from bookings where is_test",
    );
    expect(rows[0]).toEqual({ room_id: null, test_room_id: roomId });
  });
  it("are one per property", async () => {
    await expect(add("is_test", "true")).rejects.toThrow(/bookings_one_test/);
  });
  it("leave real stays as they were", async () => {
    await expect(add("room_id", `'${roomId}'`)).resolves.toBeTruthy();
  });
  it("lose the room to try if that room goes", async () => {
    await db.system("update bookings set room_id = null where not is_test");
    await db.system("delete from rooms where id = $1", [roomId]);
    const rows = await db.system<{ test_room_id: string | null }>(
      "select test_room_id from bookings where is_test",
    );
    expect(rows[0]!.test_room_id).toBeNull();
  });
});
