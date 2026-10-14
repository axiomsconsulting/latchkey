/**
 * Visitor analytics in the database: deterministic identity matching,
 * profile merging, time on page, and who can read it.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

let db: Db;
const h = (s: string) => s.padEnd(64, "0").slice(0, 64);
const V1 = "10000000-0000-0000-0000-000000000001";
const V2 = "10000000-0000-0000-0000-000000000002";
const V3 = "10000000-0000-0000-0000-000000000003";

async function visitor(id: string, firstSeen = "2026-10-01T10:00:00Z") {
  await db.system("insert into analytics_visitors (id, first_seen) values ($1, $2) on conflict do nothing", [id, firstSeen]);
}
const identify = (v: string, user: string, email: string | null) =>
  db.system<{ p: string }>("select analytics_identify($1, $2, $3, $4, $5, null) as p", [v, user, h("u" + user), email, email ? h("e" + email) : null]);
const profileOf = async (v: string) => (await db.system<{ profile_id: string | null }>("select profile_id from analytics_visitors where id = $1", [v]))[0]!.profile_id;

beforeAll(async () => {
  db = await bootDb();
});

describe("identity matching", () => {
  it("turns an anonymous browser into a known person, keeping its first visit", async () => {
    await visitor(V1, "2026-09-01T09:00:00Z");
    const [{ p }] = (await identify(V1, USERS.owner.id, "owner@example.com")) as [{ p: string }];
    expect(await profileOf(V1)).toBe(p);
    const [row] = await db.system<{ email: string; known_at: string | null; first_seen: Date }>("select email, known_at, first_seen from analytics_profiles where id = $1", [p]);
    expect(row!.email).toBe("owner@example.com");
    expect(row!.known_at).not.toBeNull();
    expect(new Date(row!.first_seen).toISOString()).toBe("2026-09-01T09:00:00.000Z");
  });

  it("joins a second browser to the same person by user id", async () => {
    await visitor(V2);
    const a = await profileOf(V1);
    await identify(V2, USERS.owner.id, "owner@example.com");
    expect(await profileOf(V2)).toBe(a);
    expect(await db.system("select count(*)::int as n from analytics_profiles")).toEqual([{ n: 1 }]);
  });

  it("merges a trial (no email yet) with the account it becomes", async () => {
    await visitor(V3, "2026-08-01T00:00:00Z");
    const [{ p: trial }] = (await identify(V3, USERS.manager.id, null)) as [{ p: string }];
    const [t] = await db.system<{ known_at: string | null }>("select known_at from analytics_profiles where id = $1", [trial]);
    expect(t!.known_at).toBeNull();
    // Same anonymous user adds an email: still one profile, now known.
    await identify(V3, USERS.manager.id, "manager@example.com");
    expect(await profileOf(V3)).toBe(trial);
    const [k] = await db.system<{ known_at: string | null }>("select known_at from analytics_profiles where id = $1", [trial]);
    expect(k!.known_at).not.toBeNull();
  });

  it("moves a shared browser to the new person instead of merging two people", async () => {
    const owner = await profileOf(V1);
    await identify(V1, USERS.viewer.id, "viewer@example.com");
    const viewer = await profileOf(V1);
    expect(viewer).not.toBe(owner);
    expect(await profileOf(V2)).toBe(owner);
    expect(await db.system("select count(*)::int as n from analytics_profiles where id = $1", [owner])).toEqual([{ n: 1 }]);
  });

  it("merges two profiles that share an email", async () => {
    const V4 = "10000000-0000-0000-0000-000000000004";
    await visitor(V4, "2026-07-01T00:00:00Z");
    // A new account id with the viewer's email (e.g. re-registered).
    await identify(V4, USERS.outsider.id, "viewer@example.com");
    expect(await profileOf(V4)).toBe(await profileOf(V1));
  });
});

describe("time on page", () => {
  it("adds only the new time to the visit", async () => {
    const [{ id: visit }] = (await db.system<{ id: string }>("insert into analytics_visits (visitor_id) values ($1) returning id", [V2])) as [{ id: string }];
    const view = "20000000-0000-0000-0000-000000000001";
    await db.system("insert into analytics_views (id, visit_id, visitor_id, path) values ($1, $2, $3, '/')", [view, visit, V2]);
    await db.system("select analytics_leave($1, $2, 4000)", [view, V2]);
    await db.system("select analytics_leave($1, $2, 9000)", [view, V2]);
    await db.system("select analytics_leave($1, $2, 3000)", [view, V2]);
    // Another browser can't change it.
    await db.system("select analytics_leave($1, $2, 99000)", [view, V1]);
    expect(await db.system("select duration_ms from analytics_views where id = $1", [view])).toEqual([{ duration_ms: 9000 }]);
    expect(await db.system("select duration_ms::int as d from analytics_visits where id = $1", [visit])).toEqual([{ d: 9000 }]);
  });
});

describe("who can see it", () => {
  it("is for super admins only", async () => {
    expect((await db.as("admin", "select count(*)::int as n from analytics_visitors"))[0]).toEqual({ n: 4 });
    expect((await db.as("owner", "select count(*)::int as n from analytics_visitors"))[0]).toEqual({ n: 0 });
    await expect(db.as("anon", "select count(*) from analytics_profiles")).rejects.toThrow();
    await expect(db.as("owner", "select analytics_identify(null, null, null, null, null, null)")).rejects.toThrow();
  });
});
