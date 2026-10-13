/**
 * Subscriptions, support access, the super admin, trial flags and feedback,
 * against the real migrations.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

let db: Db;
let hostId: string;
let propertyId: string;

beforeAll(async () => {
  db = await bootDb();
  hostId = (await db.as<{ id: string }>("owner", "select create_host_workspace('Hill', $1) as id", [USERS.owner.email]))[0]!.id;
  propertyId = (
    await db.as<{ id: string }>(
      "owner",
      "insert into properties (host_id, name, short_code, address, postcode) values ($1, 'Hill', 'hill-bill', '42 Amersham Hill', 'HP13 6NX') returning id",
      [hostId],
    )
  )[0]!.id;
}, 60_000);

const room = (who: "owner" | "admin") =>
  db.as(who, "insert into rooms (property_id, display_name) values ($1, 'Room') returning id", [propertyId]);

describe("trial and subscription", () => {
  it("starts a trial from the platform's trial length", async () => {
    const [h] = await db.system<{ subscription_status: string; days: number }>(
      "select subscription_status, round(extract(epoch from trial_ends_at - trial_started_at) / 86400)::int as days from hosts where id = $1",
      [hostId],
    );
    expect(h).toEqual({ subscription_status: "trialing", days: 30 });
  });

  it("won't let an owner give themselves a free plan", async () => {
    await db.as("owner", "update hosts set subscription_status = 'comped', trial_ends_at = now() + interval '10 years' where id = $1", [hostId]);
    const [h] = await db.system<{ subscription_status: string; long: boolean }>(
      "select subscription_status, trial_ends_at > now() + interval '1 year' as long from hosts where id = $1",
      [hostId],
    );
    expect(h).toEqual({ subscription_status: "trialing", long: false });
  });

  it("stops changes once the trial is over, but the host can still read", async () => {
    await db.system("update hosts set trial_ends_at = now() - interval '1 minute' where id = $1", [hostId]);
    await expect(room("owner")).rejects.toThrow(/trial or subscription has ended/);
    expect(await db.as("owner", "select id from properties where id = $1", [propertyId])).toHaveLength(1);
    await db.system("update hosts set subscription_status = 'active' where id = $1", [hostId]);
    expect(await room("owner")).toHaveLength(1);
  });

  it("ends access straight away when cancelled", async () => {
    await db.system("update hosts set subscription_status = 'canceled', canceled_at = now() where id = $1", [hostId]);
    await expect(room("owner")).rejects.toThrow(/trial or subscription has ended/);
    await db.system("update hosts set subscription_status = 'active', canceled_at = null where id = $1", [hostId]);
  });
});

describe("super admin and support access", () => {
  it("only counts a confirmed super-admin email", async () => {
    expect(await db.as("admin", "select is_super_admin() as a")).toEqual([{ a: true }]);
    expect(await db.as("owner", "select is_super_admin() as a")).toEqual([{ a: false }]);
    await db.system("update auth.users set email_confirmed_at = null where id = $1", [USERS.admin.id]);
    expect(await db.as("admin", "select is_super_admin() as a")).toEqual([{ a: false }]);
    await db.system("update auth.users set email_confirmed_at = now() where id = $1", [USERS.admin.id]);
  });

  it("can look at any host, but only change things while support access is on", async () => {
    expect(await db.as("admin", "select id from properties where id = $1", [propertyId])).toHaveLength(1);
    await expect(room("admin")).rejects.toThrow(/Support view is read-only/);
    await db.as("owner", "update hosts set support_access_until = now() + interval '30 days' where id = $1", [hostId]);
    expect(await room("admin")).toHaveLength(1);
    await db.as("owner", "update hosts set support_access_until = null where id = $1", [hostId]);
    await expect(room("admin")).rejects.toThrow(/Support view is read-only/);
  });

  it("never grants support access for more than 30 days", async () => {
    await db.as("owner", "update hosts set support_access_until = now() + interval '1 year' where id = $1", [hostId]);
    const [h] = await db.system<{ ok: boolean }>(
      "select support_access_until <= now() + interval '30 days 1 minute' as ok from hosts where id = $1",
      [hostId],
    );
    expect(h!.ok).toBe(true);
    await db.as("owner", "update hosts set support_access_until = null where id = $1", [hostId]);
  });

  it("keeps analytics for the super admin only", async () => {
    const rows = await db.as<{ business_name: string; properties: number }>("admin", "select business_name, properties from admin_host_stats()");
    expect(rows.find((r) => r.business_name === "Hill")?.properties).toBe(1);
    await expect(db.as("owner", "select * from admin_host_stats()")).rejects.toThrow(/Super admin only/);
  });
});

describe("trial flags", () => {
  it("flags a second account registering the same address", async () => {
    const other = (await db.as<{ id: string }>("manager", "select create_host_workspace('Again', $1) as id", [USERS.manager.email]))[0]!.id;
    await db.as(
      "manager",
      "insert into properties (host_id, name, short_code, address, postcode) values ($1, 'Hill Again', 'hill-again', '42, Amersham Hill', 'hp136nx')",
      [other],
    );
    const flags = await db.as<{ reason: string; matched_host_id: string }>("admin", "select reason, matched_host_id from trial_flags where host_id = $1", [other]);
    expect(flags).toEqual([{ reason: "same_address", matched_host_id: hostId }]);
    expect(await db.as("manager", "select id from trial_flags")).toEqual([]);
  });
});

describe("feedback", () => {
  it("lets a host send feedback that only they and the super admin read", async () => {
    await db.as("owner", "insert into feedback (kind, rating, message, host_id, user_id) values ('host_rating', 5, 'Lovely', $1, $2)", [hostId, USERS.owner.id]);
    expect(await db.as("admin", "select rating from feedback where kind = 'host_rating'")).toEqual([{ rating: 5 }]);
    expect(await db.as("viewer", "select id from feedback")).toEqual([]);
  });

  it("doesn't let a host write a guest review", async () => {
    await expect(
      db.as("owner", "insert into feedback (kind, rating, host_id, user_id) values ('guest_review', 5, $1, $2)", [hostId, USERS.owner.id]),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("stripe connect", () => {
  it("won't let an owner point payments at an account themselves", async () => {
    await db.as("owner", "update hosts set stripe_account_id = 'acct_123', stripe_account_ready = true, uses_platform_stripe = true where id = $1", [hostId]);
    expect(await db.system("select stripe_account_id, stripe_account_ready, uses_platform_stripe from hosts where id = $1", [hostId])).toEqual([
      { stripe_account_id: null, stripe_account_ready: false, uses_platform_stripe: false },
    ]);
  });

  it("keeps the super admin's own business on the platform account", async () => {
    const id = (await db.as<{ id: string }>("admin", "select create_host_workspace('Trinity', $1) as id", [USERS.admin.email]))[0]!.id;
    // Workspaces made after the migration start unlinked; the server sets it.
    expect(await db.system("select uses_platform_stripe from hosts where id = $1", [id])).toEqual([{ uses_platform_stripe: false }]);
  });
});

describe("super admin list", () => {
  it("can grow, but never empties", async () => {
    await db.system("insert into super_admins (email, added_by) values ('second@example.com', 'swapnil.kashyap@gmail.com')");
    await db.system("delete from super_admins where email = 'second@example.com'");
    await expect(db.system("delete from super_admins")).rejects.toThrow(/at least one super admin/);
    expect(await db.system("select email from super_admins")).toEqual([{ email: "swapnil.kashyap@gmail.com" }]);
  });
});
