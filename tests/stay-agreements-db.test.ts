/** Stay agreements (migration 0081): written by the server, read by the host's team, never changed. */
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

import { bootDb, USERS, type Db } from "./pg-harness";

let db: Db;
let hostId: string;
let propertyId: string;
const text = "# Booking terms\n\nHello.";
const sha = createHash("sha256").update(text, "utf8").digest("hex");

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
      "insert into properties (host_id, name, short_code) values ($1, 'Hill House', 'hill-terms') returning id",
      [hostId],
    )
  )[0]!.id;
}, 60_000);

const insert = (hash = sha) =>
  db.system<{ id: string }>(
    `insert into stay_agreements (host_id, property_id, kind, version, rendered_text, rendered_sha256, property_name, guest_name, check_in, check_out, nights, keep_until)
     values ($1, $2, 'terms', '1.0', $3, $4, 'Hill House', 'Alex Doe', '2026-12-01', '2026-12-03', 2, '2032-12-03') returning id`,
    [hostId, propertyId, text, hash],
  );

describe("stay agreements", () => {
  it("keep the exact text, checked against its fingerprint", async () => {
    await expect(insert("0".repeat(64))).rejects.toThrow();
    const [row] = await insert();
    expect(await db.as("owner", "select guest_name from stay_agreements")).toEqual([
      { guest_name: "Alex Doe" },
    ]);
    expect(await db.as("outsider", "select guest_name from stay_agreements")).toEqual([]);
    // Nothing about the signing can change; the PDF can be added once.
    await expect(
      db.system("update stay_agreements set guest_name = 'Someone' where id = $1", [row!.id]),
    ).rejects.toThrow();
    await db.system(
      "update stay_agreements set pdf_path = 'queue:x', pdf_sha256 = 'abc' where id = $1",
      [row!.id],
    );
    await expect(
      db.system("update stay_agreements set pdf_sha256 = 'def' where id = $1", [row!.id]),
    ).rejects.toThrow();
    // Hosts can't write them.
    await db
      .as("owner", "update stay_agreements set typed_name = 'x' where id = $1", [row!.id])
      .catch(() => []);
    expect(
      await db.system("select typed_name from stay_agreements where id = $1", [row!.id]),
    ).toEqual([{ typed_name: null }]);
  });
});
