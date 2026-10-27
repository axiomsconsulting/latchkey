/**
 * Returning-guest contacts and direct enquiries: owners read and remove them,
 * viewers and other businesses never see them, and the browser can't add or
 * rewrite consent.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

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
      "insert into properties (host_id, name, short_code) values ($1, 'Hill', 'hill-direct') returning id",
      [hostId],
    )
  )[0]!.id;
  await db.system("insert into host_members (host_id, user_id, role) values ($1, $2, 'viewer')", [
    hostId,
    USERS.viewer.id,
  ]);
  await db.system(
    "insert into guest_contacts (host_id, property_id, name, email, consent_text) values ($1, $2, 'Priya', 'priya@example.com', 'I agree')",
    [hostId, propertyId],
  );
  await db.system(
    "insert into direct_enquiries (host_id, property_id, name, email, check_in, check_out, guests) values ($1, $2, 'Priya', 'priya@example.com', '2026-11-02', '2026-11-05', 2)",
    [hostId, propertyId],
  );
}, 60_000);

describe("direct stays records", () => {
  it("are read by the owner only, never by viewers or other businesses", async () => {
    expect(await db.as("owner", "select email from guest_contacts")).toEqual([
      { email: "priya@example.com" },
    ]);
    expect(await db.as("owner", "select status from direct_enquiries")).toEqual([
      { status: "new" },
    ]);
    expect(await db.as("viewer", "select id from guest_contacts")).toEqual([]);
    expect(await db.as("outsider", "select id from direct_enquiries")).toEqual([]);
  });

  it("can't have consent added or changed from the browser", async () => {
    await expect(
      db.as(
        "owner",
        "insert into guest_contacts (host_id, email, consent_text) values ($1, 'x@example.com', 'fake')",
        [hostId],
      ),
    ).rejects.toThrow();
    await db.as("owner", "update guest_contacts set consent_text = 'changed'");
    expect(await db.system("select consent_text from guest_contacts")).toEqual([
      { consent_text: "I agree" },
    ]);
  });

  it("let the owner move an enquiry along and remove a contact", async () => {
    await db.as("owner", "update direct_enquiries set status = 'offered'");
    expect(await db.system("select status from direct_enquiries")).toEqual([{ status: "offered" }]);
    await db.as("outsider", "update direct_enquiries set status = 'declined'");
    expect(await db.system("select status from direct_enquiries")).toEqual([{ status: "offered" }]);
    await db.as("owner", "delete from guest_contacts");
    expect(await db.system("select id from guest_contacts")).toEqual([]);
  });

  it("keeps one contact per email for a business", async () => {
    await db.system(
      "insert into guest_contacts (host_id, email, consent_text) values ($1, 'sam@example.com', 'ok')",
      [hostId],
    );
    await expect(
      db.system(
        "insert into guest_contacts (host_id, email, consent_text) values ($1, 'sam@example.com', 'ok')",
        [hostId],
      ),
    ).rejects.toThrow();
    // Stored lower-case, so the same address can't sneak in twice.
    await expect(
      db.system(
        "insert into guest_contacts (host_id, email, consent_text) values ($1, 'Sam@Example.com', 'ok')",
        [hostId],
      ),
    ).rejects.toThrow();
  });
});
