/** The screensaver look: hosts read their own, only the server writes it, values stay in range. */
import { beforeAll, describe, expect, it } from "vitest";

import { bootDb, USERS, type Db } from "./pg-harness";

let db: Db;
let hostId: string;

beforeAll(async () => {
  db = await bootDb();
  hostId = (await db.as<{ id: string }>("owner", "select create_host_workspace('Hill', $1) as id", [USERS.owner.email]))[0]!.id;
}, 60_000);

describe("kiosk screensaver look", () => {
  it("is read by the host's team only and written by the server", async () => {
    await db.system("insert into kiosk_looks (host_id, brightness, size) values ($1, 1.8, 1.2)", [hostId]);
    expect(await db.as("owner", "select brightness::float as b, size::float as s from kiosk_looks")).toEqual([{ b: 1.8, s: 1.2 }]);
    expect(await db.as("outsider", "select host_id from kiosk_looks")).toEqual([]);
    // No write policy: a signed-in update changes nothing (or is refused outright).
    await db.as("owner", "update kiosk_looks set brightness = 2 where host_id = $1", [hostId]).catch(() => []);
    expect(await db.system("select brightness::float as b from kiosk_looks")).toEqual([{ b: 1.8 }]);
  });

  it("refuses values past the hard bounds", async () => {
    await expect(db.system("update kiosk_looks set brightness = 9 where host_id = $1", [hostId])).rejects.toThrow();
    await expect(db.system("update kiosk_looks set size = 0.1 where host_id = $1", [hostId])).rejects.toThrow();
  });

  it("gives the site settings a place for the admin's defaults", async () => {
    expect(await db.system("select kiosk_saver from site_settings where id = 1")).toEqual([{ kiosk_saver: {} }]);
  });
});
