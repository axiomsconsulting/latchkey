/**
 * Loyalty vouchers and room photos (migration 0082): the business's owner
 * reads its vouchers (names and contacts), viewers and other businesses
 * don't; nobody writes either from the browser (the server does); team
 * members see room photos; the AI trial table is server only.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

let db: Db;
let hostId: string;
let propertyId: string;
let roomId: string;

beforeAll(async () => {
  db = await bootDb();
  hostId = (
    await db.as<{ id: string }>("owner", "select create_host_workspace('Hill', $1) as id", [
      USERS.owner.email,
    ])
  )[0]!.id;
  propertyId = (
    await db.as<{ id: string }>(
      "owner",
      "insert into properties (host_id, name, short_code) values ($1, 'Hill', 'hill-vouch') returning id",
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
  await db.system("insert into host_members (host_id, user_id, role) values ($1, $2, 'viewer')", [
    hostId,
    USERS.viewer.id,
  ]);
  await db.system(
    `insert into direct_vouchers (host_id, property_id, code, guest_name, guest_email, room_ids, periods, kind, value)
     values ($1, $2, 'STAY-ABC234', 'Alex Doe', 'alex@example.com', array[$3]::uuid[], '[{"from":"2027-03-01","to":"2027-03-31"}]', 'percent', 20)`,
    [hostId, propertyId, roomId],
  );
  await db.system(
    "insert into room_photos (host_id, property_id, room_id, space, path, url) values ($1, $2, $3, 'bedroom', 'p/x.jpg', 'https://x.test/x.jpg')",
    [hostId, propertyId, roomId],
  );
}, 60_000);

describe("loyalty vouchers and room photos", () => {
  it("vouchers are read by the owner only", async () => {
    expect(await db.as("owner", "select code from direct_vouchers")).toEqual([
      { code: "STAY-ABC234" },
    ]);
    expect(await db.as("viewer", "select id from direct_vouchers")).toEqual([]);
    expect(await db.as("outsider", "select id from direct_vouchers")).toEqual([]);
  });

  it("vouchers can't be made or changed from the browser, and codes are one per property", async () => {
    await expect(
      db.as(
        "owner",
        "insert into direct_vouchers (host_id, property_id, code, guest_name, room_ids, kind, value) values ($1, $2, 'STAY-XYZ234', 'Sam', '{}', 'price', 100)",
        [hostId, propertyId],
      ),
    ).rejects.toThrow();
    await db.as("owner", "update direct_vouchers set status = 'used'");
    expect(await db.system("select status from direct_vouchers")).toEqual([{ status: "active" }]);
    await expect(
      db.system(
        "insert into direct_vouchers (host_id, property_id, code, guest_name, room_ids, kind, value) values ($1, $2, 'STAY-ABC234', 'Sam', '{}', 'price', 100)",
        [hostId, propertyId],
      ),
    ).rejects.toThrow();
  });

  it("room photos are seen by the team, not other businesses, and written by the server only", async () => {
    expect(await db.as("viewer", "select space from room_photos")).toEqual([{ space: "bedroom" }]);
    expect(await db.as("outsider", "select id from room_photos")).toEqual([]);
    await db.as("owner", "update room_photos set space = 'kitchen'");
    expect(await db.system("select space from room_photos")).toEqual([{ space: "bedroom" }]);
    await db.system(
      "insert into ai_feature_trials (host_id, feature, subject_id) values ($1, 'ai_photos', $2)",
      [hostId, roomId],
    );
    expect(await db.as("owner", "select * from ai_feature_trials").catch(() => [])).toEqual([]);
  });
});
