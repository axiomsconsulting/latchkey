/** The screensaver look: hosts read their own, only the server writes it, values stay in range. */
import { beforeAll, describe, expect, it } from "vitest";

import { bootDb, USERS, type Db } from "./pg-harness";

let db: Db;
let hostId: string;

beforeAll(async () => {
  db = await bootDb();
  hostId = (
    await db.as<{ id: string }>("owner", "select create_host_workspace('Hill', $1) as id", [
      USERS.owner.email,
    ])
  )[0]!.id;
}, 60_000);

describe("kiosk screensaver look", () => {
  it("is read by the host's team only and written by the server", async () => {
    await db.system("insert into kiosk_looks (host_id, brightness, size) values ($1, 1.8, 1.2)", [
      hostId,
    ]);
    expect(
      await db.as("owner", "select brightness::float as b, size::float as s from kiosk_looks"),
    ).toEqual([{ b: 1.8, s: 1.2 }]);
    expect(await db.as("outsider", "select host_id from kiosk_looks")).toEqual([]);
    // No write policy: a signed-in update changes nothing (or is refused outright).
    await db
      .as("owner", "update kiosk_looks set brightness = 2 where host_id = $1", [hostId])
      .catch(() => []);
    expect(await db.system("select brightness::float as b from kiosk_looks")).toEqual([{ b: 1.8 }]);
  });

  it("refuses values past the hard bounds", async () => {
    await expect(
      db.system("update kiosk_looks set brightness = 9 where host_id = $1", [hostId]),
    ).rejects.toThrow();
    await expect(
      db.system("update kiosk_looks set size = 0.1 where host_id = $1", [hostId]),
    ).rejects.toThrow();
  });

  it("gives the site settings a place for the admin's defaults", async () => {
    expect(await db.system("select kiosk_saver from site_settings where id = 1")).toEqual([
      { kiosk_saver: {} },
    ]);
  });

  it("keeps the night light's look per host, in range, written by the server only", async () => {
    await db.system(
      "update kiosk_looks set night_brightness = 0.4, night_depth = 0.8 where host_id = $1",
      [hostId],
    );
    expect(
      await db.as(
        "owner",
        "select night_brightness::float as b, night_depth::float as d from kiosk_looks",
      ),
    ).toEqual([{ b: 0.4, d: 0.8 }]);
    await expect(
      db.system("update kiosk_looks set night_brightness = 0 where host_id = $1", [hostId]),
    ).rejects.toThrow();
    await expect(
      db.system("update kiosk_looks set night_depth = 1.5 where host_id = $1", [hostId]),
    ).rejects.toThrow();
  });

  it("gives every property a place for what its kiosk shows at rest", async () => {
    const [p] = await db.as<{ id: string }>(
      "owner",
      "insert into properties (host_id, name, short_code) values ($1, 'Hill House', 'hill-rest') returning id",
      [hostId],
    );
    expect(await db.system("select kiosk_rest from properties where id = $1", [p!.id])).toEqual([
      { kiosk_rest: {} },
    ]);
    await db.as(
      "owner",
      `update properties set kiosk_rest = '{"nightLight": true}' where id = $1`,
      [p!.id],
    );
    expect(await db.system("select kiosk_rest from properties where id = $1", [p!.id])).toEqual([
      { kiosk_rest: { nightLight: true } },
    ]);
  });
});
