/**
 * Room lights (migration 0098) against the real migrations, RLS on: the
 * business's members see which lights are linked to which room; nobody
 * signed in can read SmartThings tokens or guests' taps, or change a device
 * (the server does, after checking the role).
 */
import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

let db: Db;
let hostId: string;
let deviceId: string;

const refused = async (p: Promise<unknown>) => {
  try {
    const rows = await p;
    return Array.isArray(rows) && rows.length === 0;
  } catch {
    return true;
  }
};

beforeAll(async () => {
  db = await bootDb();
  hostId = (
    await db.as<{ id: string }>("owner", "select create_host_workspace('Hill', $1) as id", [
      USERS.owner.email,
    ])
  )[0]!.id;
  const propertyId = (
    await db.as<{ id: string }>(
      "owner",
      "insert into properties (host_id, name, short_code) values ($1, 'Hill', 'hill-lights') returning id",
      [hostId],
    )
  )[0]!.id;
  const roomId = (
    await db.as<{ id: string }>(
      "owner",
      "insert into rooms (property_id, display_name) values ($1, 'Room 4') returning id",
      [propertyId],
    )
  )[0]!.id;
  deviceId = (
    await db.system<{ id: string }>(
      "insert into room_devices (host_id, property_id, room_id, device_id, label, capabilities) values ($1, $2, $3, 'st-123', 'Guest Room 4', '{switch,switchLevel}') returning id",
      [hostId, propertyId, roomId],
    )
  )[0]!.id;
  await db.system(
    "insert into smart_home_links (host_id, access_token, refresh_token, expires_at) values ($1, 'fake-access', 'fake-refresh', now() + interval '1 day')",
    [hostId],
  );
}, 60_000);

describe("room lights", () => {
  it("members see the business's linked lights; outsiders don't", async () => {
    expect(
      await db.as("owner", "select label from room_devices where id = $1", [deviceId]),
    ).toEqual([{ label: "Guest Room 4" }]);
    expect(await db.as("outsider", "select id from room_devices")).toEqual([]);
  });

  it("nobody signed in reads SmartThings tokens or guests' taps", async () => {
    expect(await refused(db.as("owner", "select access_token from smart_home_links"))).toBe(true);
    expect(await refused(db.as("owner", "select id from room_device_uses"))).toBe(true);
  });

  it("devices change only through the server", async () => {
    expect(
      await refused(
        db.as("owner", "update room_devices set guest_on = false where id = $1 returning id", [
          deviceId,
        ]),
      ),
    ).toBe(true);
    expect(await db.system("select guest_on from room_devices where id = $1", [deviceId])).toEqual([
      { guest_on: true },
    ]);
  });

  it("Tapo connections and devices fit (0099); the sealed password is server only", async () => {
    await db.system(
      "update smart_home_links set provider = 'tapo', refresh_token = null, account_email = 'lights@example.com', secret_sealed = 'sealed', terminal_id = 'term' where host_id = $1",
      [hostId],
    );
    await db.system(
      "update room_devices set provider = 'tapo', server_url = 'https://eu-wap.tplinkcloud.com', model = 'L530' where id = $1",
      [deviceId],
    );
    expect(await refused(db.as("owner", "select secret_sealed from smart_home_links"))).toBe(true);
    await expect(
      db.system("update room_devices set provider = 'hue' where id = $1", [deviceId]),
    ).rejects.toThrow();
  });

  it("removing the room removes its lights", async () => {
    await db.system(
      "delete from rooms where id = (select room_id from room_devices where id = $1)",
      [deviceId],
    );
    expect(await db.system("select id from room_devices where id = $1", [deviceId])).toEqual([]);
  });
});
