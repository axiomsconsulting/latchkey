/** What a Latchkey admin changes on the shared demo stays (migration 0094), and nobody else's changes do. */
import { beforeAll, describe, expect, it } from "vitest";

import { bootDb, USERS, type Db } from "./pg-harness";

let db: Db;
let demoHost: string;
let otherHost: string;
let tourId: string;
let sampleId: string;

const kept = async (code: string) =>
  (
    await db.system<{ settings: Record<string, unknown> }>(
      "select settings from demo_property_defaults where short_code = $1",
      [code],
    )
  )[0]?.settings ?? null;

beforeAll(async () => {
  db = await bootDb();
  demoHost = (
    await db
      .as<{ id: string }>("demo", "select create_host_workspace('Demo', $1) as id", [
        USERS.demo.email,
      ])
      .catch(async () =>
        db.system<{ id: string }>(
          "insert into hosts (business_name, contact_email) values ('Demo', $1) returning id",
          [USERS.demo.email],
        ),
      )
  )[0]!.id;
  otherHost = (
    await db.as<{ id: string }>("owner", "select create_host_workspace('Hill', $1) as id", [
      USERS.owner.email,
    ])
  )[0]!.id;
  const far = "now() + interval '20 days'";
  await db.system(`update hosts set support_access_until = ${far} where id = any($1)`, [
    [demoHost, otherHost],
  ]);
  tourId = (
    await db.system<{ id: string }>(
      "insert into properties (host_id, name, short_code, is_demo) values ($1, 'Hill Suites', 'tour', true) returning id",
      [demoHost],
    )
  )[0]!.id;
  // A real business's own sample data.
  sampleId = (
    await db.system<{ id: string }>(
      "insert into properties (host_id, name, short_code, is_demo) values ($1, 'Sample', 'sample-x', true) returning id",
      [otherHost],
    )
  )[0]!.id;
}, 60_000);

describe("demo settings", () => {
  it("keeps what a Latchkey admin changes, and only that", async () => {
    await db.as("admin", "update properties set theme_config = $1 where id = $2", [
      JSON.stringify({ kioskLook: "xl", kioskTouch: "expanded" }),
      tourId,
    ]);
    expect(await kept("tour")).toEqual({
      theme_config: { kioskLook: "xl", kioskTouch: "expanded" },
    });
  });
  it("adds later changes to what's kept", async () => {
    await db.as("admin", "update properties set wifi_name = 'Hill Wifi' where id = $1", [tourId]);
    expect(await kept("tour")).toMatchObject({
      theme_config: { kioskLook: "xl" },
      wifi_name: "Hill Wifi",
    });
  });
  it("ignores the row's own fields", async () => {
    await db.as("admin", "update properties set check_in_pin = '424242' where id = $1", [tourId]);
    expect(await kept("tour")).not.toHaveProperty("check_in_pin");
  });
  it("doesn't let a demo visitor change or keep anything", async () => {
    await db
      .as("demo", "update properties set wifi_name = 'Hacked' where id = $1", [tourId])
      .catch(() => []);
    expect(await kept("tour")).toMatchObject({ wifi_name: "Hill Wifi" });
  });
  it("doesn't count the server's own writes, like a rebuild", async () => {
    await db.system("update properties set wifi_name = 'Server' where id = $1", [tourId]);
    expect(await kept("tour")).toMatchObject({ wifi_name: "Hill Wifi" });
  });
  it("leaves a real business's sample data alone", async () => {
    await db.as("admin", "update properties set wifi_name = 'Sample' where id = $1", [sampleId]);
    expect(await kept("sample-x")).toBeNull();
  });
  it("can't be read by anyone signed in", async () => {
    expect(await db.as("owner", "select * from demo_property_defaults").catch(() => [])).toEqual(
      [],
    );
  });
});
