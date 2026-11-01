/** Phone links for check-in photos (migration 0079): written and read by the server only. */
import { beforeAll, describe, expect, it } from "vitest";

import { bootDb, USERS, type Db } from "./pg-harness";

let db: Db;
let propertyId: string;

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
      "insert into properties (host_id, name, short_code) values ($1, 'Hill House', 'hill-photos') returning id",
      [hostId],
    )
  )[0]!.id;
}, 60_000);

describe("phone links for check-in photos", () => {
  it("are kept by the server, never shown to the host's team or anyone else", async () => {
    await db.system(
      "insert into photo_handoffs (property_id, kiosk_hash, phone_hash, channel, device_id, expires_at) values ($1, 'k1', 'p1', $2, 'dev-1', now() + interval '30 minutes')",
      [propertyId, "0".repeat(32)],
    );
    expect(await db.as("owner", "select kiosk_hash from photo_handoffs")).toEqual([]);
    expect(await db.as("outsider", "select kiosk_hash from photo_handoffs")).toEqual([]);
    await expect(
      db.as(
        "owner",
        "insert into photo_handoffs (property_id, kiosk_hash, phone_hash, channel, device_id, expires_at) values ($1, 'k2', 'p2', $2, 'd', now())",
        [propertyId, "1".repeat(32)],
      ),
    ).rejects.toThrow();
  });

  it("refuses a channel that isn't a random hex name", async () => {
    await expect(
      db.system(
        "insert into photo_handoffs (property_id, kiosk_hash, phone_hash, channel, device_id, expires_at) values ($1, 'k3', 'p3', 'kiosk-welcome', 'd', now())",
        [propertyId],
      ),
    ).rejects.toThrow();
  });
});
