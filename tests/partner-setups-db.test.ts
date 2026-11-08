/**
 * Migration 0097: businesses a Commission Partner sets up for hosts
 * (partner_setups, server only) and referrals recorded on hand-over
 * (source "setup").
 */
import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

let db: Db;
let hostId: string;
let partnerId: string;

beforeAll(async () => {
  db = await bootDb();
  partnerId = (
    await db.system<{ id: string }>(
      "insert into partners (user_id, legal_name, country, email, status) values ($1, 'Pat Partner', 'GB', 'pat@example.com', 'active') returning id",
      [USERS.viewer.id],
    )
  )[0]!.id;
  hostId = (
    await db.system<{ id: string }>(
      "insert into hosts (business_name, contact_email) values ('Set up for Sam', 'sam@example.com') returning id",
    )
  )[0]!.id;
  await db.system("insert into host_members (host_id, user_id, role) values ($1, $2, 'owner')", [
    hostId,
    USERS.viewer.id,
  ]);
  await db.system(
    "insert into partner_setups (partner_id, host_id, owner_name, owner_email) values ($1, $2, 'Sam Host', 'sam@example.com')",
    [partnerId, hostId],
  );
}, 60_000);

describe("partner set-ups", () => {
  it("are kept from everyone but the server, even the partner who owns the business", async () => {
    // Refused outright, or no rows: either way nothing reaches the browser.
    const hidden = (q: Promise<unknown[]>) =>
      q.then(
        (rows) => expect(rows).toEqual([]),
        (e) => expect(String(e)).toMatch(/permission denied/),
      );
    await hidden(db.as("viewer", "select * from partner_setups"));
    await hidden(db.as("anon", "select * from partner_setups"));
    await expect(
      db.as(
        "viewer",
        "insert into partner_setups (partner_id, host_id, owner_name, owner_email) values ($1, $2, 'X', 'x@example.com')",
        [partnerId, hostId],
      ),
    ).rejects.toThrow();
  });

  it("allow one set-up per business and only the known statuses", async () => {
    await expect(
      db.system(
        "insert into partner_setups (partner_id, host_id, owner_name, owner_email) values ($1, $2, 'Again', 'a@example.com')",
        [partnerId, hostId],
      ),
    ).rejects.toThrow();
    await expect(
      db.system("update partner_setups set status = 'sold' where host_id = $1", [hostId]),
    ).rejects.toThrow();
  });

  it("record a hand-over referral with source 'setup'", async () => {
    const [r] = await db.system<{ source: string }>(
      "insert into referrals (host_id, partner_id, source, sign_up_at, terms_snapshot) values ($1, $2, 'setup', now(), '{}'::jsonb) returning source",
      [hostId, partnerId],
    );
    expect(r).toEqual({ source: "setup" });
    await expect(
      db.system(
        "insert into referrals (partner_id, source, sign_up_at, terms_snapshot) values ($1, 'gift', now(), '{}'::jsonb)",
        [partnerId],
      ),
    ).rejects.toThrow();
  });
});
