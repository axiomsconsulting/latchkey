/** Welcome and goodbye messages (migration 0080): owners set their property's messages, never their WhatsApp sender. */
import { beforeAll, describe, expect, it } from "vitest";

import { bootDb, USERS, type Db } from "./pg-harness";

let db: Db;
let hostId: string;
let propertyId: string;

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
      "insert into properties (host_id, name, short_code) values ($1, 'Hill House', 'hill-texts') returning id",
      [hostId],
    )
  )[0]!.id;
}, 60_000);

describe("welcome and goodbye messages", () => {
  it("are set by the host on their property", async () => {
    await db.as("owner", "update properties set guest_messages = $2 where id = $1", [
      propertyId,
      JSON.stringify({ welcome: { on: true } }),
    ]);
    expect(
      await db.system(
        "select guest_messages->'welcome'->>'on' as on from properties where id = $1",
        [propertyId],
      ),
    ).toEqual([{ on: "true" }]);
  });

  it("keep the WhatsApp sender for Latchkey to change", async () => {
    await db.as("owner", "update hosts set whatsapp = $2 where id = $1", [
      hostId,
      JSON.stringify({ status: "live", sender: "+447700900123" }),
    ]);
    expect(await db.system("select whatsapp from hosts where id = $1", [hostId])).toEqual([
      { whatsapp: null },
    ]);
    await db.system("update hosts set whatsapp = $2 where id = $1", [
      hostId,
      JSON.stringify({ status: "live", sender: "+447700900123" }),
    ]);
    expect(
      await db.system("select whatsapp->>'sender' as s from hosts where id = $1", [hostId]),
    ).toEqual([{ s: "+447700900123" }]);
  });
});
