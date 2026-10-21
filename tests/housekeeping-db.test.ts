/**
 * The housekeeping board's records (room_readiness): owners and cleaners
 * update it, viewers only read it, other businesses never see it. Also the
 * demo/live switches, which only Latchkey's admins may change (0041).
 */
import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

let db: Db;
let hostId: string;
let propertyId: string;
let roomId: string;

beforeAll(async () => {
  db = await bootDb();
  hostId = (await db.as<{ id: string }>("owner", "select create_host_workspace('Hill', $1) as id", [USERS.owner.email]))[0]!.id;
  propertyId = (await db.as<{ id: string }>("owner", "insert into properties (host_id, name, short_code) values ($1, 'Hill', 'hill-hk') returning id", [hostId]))[0]!.id;
  roomId = (await db.as<{ id: string }>("owner", "insert into rooms (property_id, display_name) values ($1, 'Room 1') returning id", [propertyId]))[0]!.id;
  // "manager" plays a cleaner here.
  await db.system("insert into host_members (host_id, user_id, role) values ($1, $2, 'cleaner'), ($1, $3, 'viewer')", [hostId, USERS.manager.id, USERS.viewer.id]);
}, 60_000);

const upsert = (who: "owner" | "manager" | "viewer" | "outsider", status: string) =>
  db.as(
    who,
    `insert into room_readiness (property_id, room_id, day, status) values ($1, $2, '2026-10-21', $3)
     on conflict (room_id, day) do update set status = excluded.status`,
    [propertyId, roomId, status],
  );

describe("housekeeping board records", () => {
  it("lets the owner and a cleaner move a room along", async () => {
    await upsert("owner", "to_clean");
    await upsert("manager", "ready");
    expect(await db.system("select status from room_readiness")).toEqual([{ status: "ready" }]);
  });

  it("lets a viewer read but not change it, and hides it from other businesses", async () => {
    expect(await db.as("viewer", "select status from room_readiness")).toEqual([{ status: "ready" }]);
    await expect(upsert("viewer", "to_clean")).rejects.toThrow();
    expect(await db.as("outsider", "select id from room_readiness")).toEqual([]);
    await expect(upsert("outsider", "to_clean")).rejects.toThrow();
    expect(await db.system("select status from room_readiness")).toEqual([{ status: "ready" }]);
  });

  it("refuses unknown statuses", async () => {
    await expect(db.system("insert into room_readiness (property_id, room_id, day, status) values ($1, $2, '2026-10-22', 'sparkly')", [propertyId, roomId])).rejects.toThrow();
  });
});

describe("demo / live switches", () => {
  it("can't be changed by the owner from the browser", async () => {
    const before = (await db.system<{ m: unknown }>("select integration_modes as m from hosts where id = $1", [hostId]))[0]!.m;
    await db.as("owner", `update hosts set integration_modes = '{"id_check":"demo","host_email":"live","guest_messages":"live"}'::jsonb where id = $1`, [hostId]);
    expect((await db.system<{ m: unknown }>("select integration_modes as m from hosts where id = $1", [hostId]))[0]!.m).toEqual(before);
  });
});

describe("funnel events table", () => {
  it("is readable by super admins only and refuses unknown events", async () => {
    await db.system("insert into analytics_events (name, utm_source) values ('tour_view', 'linkedin')");
    expect(await db.as("owner", "select id from analytics_events")).toEqual([]);
    await expect(db.system("insert into analytics_events (name) values ('purchase')")).rejects.toThrow();
  });
});
