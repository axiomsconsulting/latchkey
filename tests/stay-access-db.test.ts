/** Door tablets and room Wi-Fi (migration 0057): the host's team sees its tablets, owners remove them, only the server adds them. */
import { beforeAll, describe, expect, it } from "vitest";

import { bootDb, USERS, type Db } from "./pg-harness";

let db: Db;
let propertyId: string;

beforeAll(async () => {
  db = await bootDb();
  const hostId = (await db.as<{ id: string }>("owner", "select create_host_workspace('Hill', $1) as id", [USERS.owner.email]))[0]!.id;
  propertyId = (await db.as<{ id: string }>("owner", "insert into properties (host_id, name, short_code) values ($1, 'Hill House', 'hill-qr') returning id", [hostId]))[0]!.id;
}, 60_000);

describe("door tablets and room Wi-Fi", () => {
  it("are seen by the host's team only and added by the server", async () => {
    await db.system("insert into kiosk_devices (property_id, token_hash, net_hash, net_day) values ($1, 'h1', 'n', '2026-10-25')", [propertyId]);
    expect(await db.as("owner", "select token_hash from kiosk_devices")).toEqual([{ token_hash: "h1" }]);
    expect(await db.as("outsider", "select token_hash from kiosk_devices")).toEqual([]);
    await expect(db.as("owner", "insert into kiosk_devices (property_id, token_hash) values ($1, 'h2')", [propertyId])).rejects.toThrow();
  });

  it("can be removed by the owner, not by an outsider", async () => {
    await db.as("outsider", "delete from kiosk_devices").catch(() => []);
    expect(await db.system("select count(*)::int as n from kiosk_devices")).toEqual([{ n: 1 }]);
    await db.as("owner", "delete from kiosk_devices where property_id = $1", [propertyId]);
    expect(await db.system("select count(*)::int as n from kiosk_devices")).toEqual([{ n: 0 }]);
  });

  it("keeps settings on the property and a network on each room", async () => {
    expect(await db.system("select stay_access from properties where id = $1", [propertyId])).toEqual([{ stay_access: {} }]);
    const [room] = await db.as<{ id: string }>("owner", "insert into rooms (property_id, display_name, wifi_name, wifi_password) values ($1, 'Garden', 'Garden-5G', 'pw') returning id", [propertyId]);
    expect(await db.as("owner", "select wifi_name from rooms where id = $1", [room!.id])).toEqual([{ wifi_name: "Garden-5G" }]);
    await expect(db.as("owner", "update rooms set wifi_name = $2 where id = $1", [room!.id, "x".repeat(65)])).rejects.toThrow();
  });

  it("gives each room three words, unique across every property", async () => {
    const [a] = await db.as<{ id: string }>("owner", "insert into rooms (property_id, display_name, guide_words) values ($1, 'One', 'amber-otter-harbour') returning id", [propertyId]);
    expect(a?.id).toBeTruthy();
    await expect(db.as("owner", "insert into rooms (property_id, display_name, guide_words) values ($1, 'Two', 'amber-otter-harbour')", [propertyId])).rejects.toThrow();
    await expect(db.as("owner", "insert into rooms (property_id, display_name, guide_words) values ($1, 'Three', 'not three words')", [propertyId])).rejects.toThrow();
  });
});
