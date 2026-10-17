/** The kiosk welcome message: who can set, read and change it. */
import { beforeAll, describe, expect, it } from "vitest";

import { bootDb, USERS, type Db } from "./pg-harness";

let db: Db;
let propertyId: string;

beforeAll(async () => {
  db = await bootDb();
  const hostId = (await db.as<{ id: string }>("owner", "select create_host_workspace('Hill', $1) as id", [USERS.owner.email]))[0]!.id;
  propertyId = (await db.as<{ id: string }>("owner", "insert into properties (host_id, name, short_code) values ($1, 'Hill Suites', 'hill-suites') returning id", [hostId]))[0]!.id;
}, 60_000);

describe("kiosk welcome messages", () => {
  it("lets the host's team set and read it, and no one else", async () => {
    await db.as("owner", "insert into kiosk_messages (property_id, headline, body, expires_at) values ($1, 'Welcome, Priya!', 'Tap to check in', now() + interval '2 hours')", [propertyId]);
    expect(await db.as("owner", "select headline from kiosk_messages where property_id = $1", [propertyId])).toEqual([{ headline: "Welcome, Priya!" }]);
    expect(await db.as("outsider", "select headline from kiosk_messages where property_id = $1", [propertyId])).toEqual([]);
    expect(await db.as("outsider", "update kiosk_messages set headline = 'Hacked' where property_id = $1 returning property_id", [propertyId])).toEqual([]);
    await expect(db.as("anon", "select headline from kiosk_messages")).rejects.toThrow();
  });

  it("keeps one message per property", async () => {
    await expect(
      db.as("owner", "insert into kiosk_messages (property_id, headline, expires_at) values ($1, 'Second', now() + interval '1 hour')", [propertyId]),
    ).rejects.toThrow();
  });
});
