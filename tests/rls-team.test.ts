/**
 * Team access and RLS, run against the real migrations in an in-memory
 * Postgres (PGlite) with a small stand-in for Supabase's auth schema.
 * Never touches a hosted database.
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const SUPABASE_STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema extensions; create schema storage;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select auth.jwt() ->> 'role' $$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
-- Created by Lovable outside drizzle/migrations.
create table public.platform_pricing (id int primary key);
`;

const USERS = {
  owner: { id: "00000000-0000-0000-0000-00000000000a", email: "owner@example.com" },
  manager: { id: "00000000-0000-0000-0000-00000000000b", email: "manager@example.com" },
  viewer: { id: "00000000-0000-0000-0000-00000000000c", email: "viewer@example.com" },
  outsider: { id: "00000000-0000-0000-0000-00000000000d", email: "outsider@example.com" },
  demo: { id: "00000000-0000-0000-0000-00000000000e", email: "demo@latchkey.omsestates.uk" },
} as const;
type Who = keyof typeof USERS;

let db: PGlite;
let hostId: string;
let propertyId: string;
let roomId: string;

/** Runs SQL as a signed-in user, the way PostgREST does. */
async function as<T = Record<string, unknown>>(who: Who | "anon", sql: string, params: unknown[] = []): Promise<T[]> {
  const claims =
    who === "anon" ? { role: "anon" } : { sub: USERS[who].id, email: USERS[who].email, role: "authenticated" };
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
  await db.exec(`set role ${who === "anon" ? "anon" : "authenticated"}`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}

/** Runs SQL as Latchkey's server (service role: no user, RLS bypassed). */
async function system<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

async function invite(email: string, role: string, token: string) {
  await as("owner", "insert into host_invitations (host_id, email, role, token_hash, invited_by) values ($1, $2, $3, invitation_hash($4), $5)", [
    hostId, email, role, token, USERS.owner.id,
  ]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = join(__dirname, "../drizzle/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
  await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
                 grant usage, select on all sequences in schema public to authenticated, service_role;`);
  for (const u of Object.values(USERS)) {
    await system("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [u.id, u.email]);
  }
  hostId = (await as<{ id: string }>("owner", "select create_host_workspace('Trinity', $1) as id", [USERS.owner.email]))[0]!.id;
  propertyId = (await as<{ id: string }>("owner", "insert into properties (host_id, name, short_code) values ($1, 'Trinity Suites', 'trinity-suites') returning id", [hostId]))[0]!.id;
  roomId = (await as<{ id: string }>("owner", "insert into rooms (property_id, room_number, display_name) values ($1, '1', 'Trinity 1') returning id", [propertyId]))[0]!.id;
}, 60_000);

describe("joining a host", () => {
  it("does not let an outsider add themselves, even as owner", async () => {
    for (const role of ["owner", "manager", "viewer"]) {
      await expect(
        as("outsider", "insert into host_members (host_id, user_id, role) values ($1, $2, $3)", [hostId, USERS.outsider.id, role]),
      ).rejects.toThrow(/row-level security/);
    }
  });

  it("rejects an invite accepted from the wrong email", async () => {
    await invite(USERS.manager.email, "manager", "token-manager");
    await expect(as("viewer", "select accept_host_invitation('token-manager')")).rejects.toThrow(/different email/);
  });

  it("rejects an unconfirmed email", async () => {
    await system("update auth.users set email_confirmed_at = null where id = $1", [USERS.manager.id]);
    await expect(as("manager", "select accept_host_invitation('token-manager')")).rejects.toThrow(/confirm your email/);
    await system("update auth.users set email_confirmed_at = now() where id = $1", [USERS.manager.id]);
  });

  it("accepts once, then the token is spent", async () => {
    const [row] = await as<{ h: string }>("manager", "select accept_host_invitation('token-manager') as h");
    expect(row!.h).toBe(hostId);
    expect(await as("manager", "select member_role($1) as r", [hostId])).toEqual([{ r: "manager" }]);
    await expect(as("manager", "select accept_host_invitation('token-manager')")).rejects.toThrow(/no longer valid/);
  });

  it("rejects expired and revoked invites", async () => {
    await invite(USERS.viewer.email, "viewer", "token-expired");
    await system("update host_invitations set expires_at = now() - interval '1 minute' where token_hash = invitation_hash('token-expired')");
    await expect(as("viewer", "select accept_host_invitation('token-expired')")).rejects.toThrow(/no longer valid/);
    await system("update host_invitations set revoked_at = now() where token_hash = invitation_hash('token-expired')");

    await invite(USERS.viewer.email, "viewer", "token-revoked");
    await as("owner", "update host_invitations set revoked_at = now() where token_hash = invitation_hash('token-revoked')");
    await expect(as("viewer", "select accept_host_invitation('token-revoked')")).rejects.toThrow(/no longer valid/);
  });

  it("shows only safe details before sign-in", async () => {
    await invite(USERS.viewer.email, "viewer", "token-viewer");
    const [peek] = await as("anon", "select * from peek_invitation('token-viewer')");
    expect(peek).toEqual({ business_name: "Trinity", role: "viewer", email_masked: "v***@example.com", status: "open" });
    await as("viewer", "select accept_host_invitation('token-viewer')");
  });
});

describe("manager", () => {
  it("runs the business: rooms, bookings, channel labels", async () => {
    const rows = await as("manager", "update rooms set display_name = 'Trinity One' where id = $1 returning id", [roomId]);
    expect(rows).toHaveLength(1);
    await as("manager", "insert into bookings (property_id, room_id, channel, check_in_date, check_out_date) values ($1, $2, 'direct', '2026-10-10', '2026-10-27')", [propertyId, roomId]);
    await as("manager", "select update_host_ops($1, '{\"direct\": \"Website\"}'::jsonb)", [hostId]);
  });

  it("cannot change account settings, delete the property, or manage the team", async () => {
    expect(await as("manager", "update hosts set business_name = 'Mine' where id = $1 returning id", [hostId])).toHaveLength(0);
    expect(await as("manager", "delete from properties where id = $1 returning id", [propertyId])).toHaveLength(0);
    expect(await as("manager", "update host_members set role = 'owner' where host_id = $1 returning id", [hostId])).toHaveLength(0);
    await expect(
      as("manager", "insert into host_members (host_id, user_id, role) values ($1, $2, 'viewer')", [hostId, USERS.outsider.id]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as("manager", "insert into host_invitations (host_id, email, role, token_hash, invited_by) values ($1, 'x@example.com', 'viewer', 'h', $2)", [hostId, USERS.manager.id]),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot mark a property as demo", async () => {
    await expect(as("manager", "update properties set is_demo = true where id = $1", [propertyId])).rejects.toThrow(/Sample data/);
  });
});

describe("viewer", () => {
  it("reads everything", async () => {
    expect(await as("viewer", "select id from bookings where property_id = $1", [propertyId])).toHaveLength(1);
    expect(await as("viewer", "select id from rooms where id = $1", [roomId])).toHaveLength(1);
    expect(await as("viewer", "select * from host_team($1)", [hostId])).toHaveLength(3);
  });

  it("writes nothing", async () => {
    expect(await as("viewer", "update rooms set display_name = 'X' where id = $1 returning id", [roomId])).toHaveLength(0);
    expect(await as("viewer", "update bookings set notes = 'x' where property_id = $1 returning id", [propertyId])).toHaveLength(0);
    await expect(
      as("viewer", "insert into bookings (property_id, channel, check_in_date, check_out_date) values ($1, 'direct', '2026-11-01', '2026-11-02')", [propertyId]),
    ).rejects.toThrow(/row-level security/);
    await expect(as("viewer", "select update_host_ops($1, '{}'::jsonb)", [hostId])).rejects.toThrow(/read-only/);
  });
});

describe("outsider", () => {
  it("sees nothing", async () => {
    expect(await as("outsider", "select id from properties where host_id = $1", [hostId])).toHaveLength(0);
    expect(await as("outsider", "select * from host_team($1)", [hostId])).toHaveLength(0);
  });
});

describe("audit log", () => {
  it("records who changed what, with secrets redacted", async () => {
    const roomRows = await as<{ actor_id: string; changed: Record<string, { old: unknown; new: unknown }> }>(
      "owner",
      "select actor_id, changed from audit_log where table_name = 'rooms' and action = 'update'",
    );
    expect(roomRows).toHaveLength(1);
    expect(roomRows[0]!.actor_id).toBe(USERS.manager.id);
    expect(roomRows[0]!.changed["display_name"]).toEqual({ old: "Trinity 1", new: "Trinity One" });

    await as("owner", "update properties set check_in_pin = '123456' where id = $1", [propertyId]);
    const [pin] = await as<{ changed: Record<string, unknown> }>(
      "owner",
      "select changed from audit_log where table_name = 'properties' and action = 'update' order by id desc limit 1",
    );
    expect(pin!.changed["check_in_pin"]).toEqual({ old: "[redacted]", new: "[redacted]" });
  });

  it("ignores sync bookkeeping and is owner-only", async () => {
    const before = (await system<{ n: number }>("select count(*)::int n from audit_log"))[0]!.n;
    await system("update bookings set last_synced_at = now() where property_id = $1", [propertyId]);
    expect((await system<{ n: number }>("select count(*)::int n from audit_log"))[0]!.n).toBe(before);
    expect(await as("manager", "select id from audit_log")).toHaveLength(0);
    await expect(as("owner", "insert into audit_log (table_name, action) values ('x', 'insert')")).rejects.toThrow(/row-level security/);
  });
});

describe("owners", () => {
  it("can't remove or demote the last owner", async () => {
    await expect(as("owner", "update host_members set role = 'manager' where user_id = $1", [USERS.owner.id])).rejects.toThrow(/at least one owner/);
    await expect(as("owner", "delete from host_members where user_id = $1", [USERS.owner.id])).rejects.toThrow(/at least one owner/);
  });

  it("revokes access instantly", async () => {
    await as("owner", "delete from host_members where host_id = $1 and user_id = $2", [hostId, USERS.viewer.id]);
    expect(await as("viewer", "select id from properties where host_id = $1", [hostId])).toHaveLength(0);
  });

  it("lets a member leave on their own", async () => {
    await invite(USERS.outsider.email, "viewer", "token-leave");
    await as("outsider", "select accept_host_invitation('token-leave')");
    expect(await as("outsider", "delete from host_members where user_id = $1 returning id", [USERS.outsider.id])).toHaveLength(1);
  });
});

describe("shared demo", () => {
  let demoHost: string;
  beforeAll(async () => {
    demoHost = (await system<{ id: string }>("insert into hosts (business_name, contact_email) values ('Demo', $1) returning id", [USERS.demo.email]))[0]!.id;
    await system("insert into host_members (host_id, user_id, role) values ($1, $2, 'owner')", [demoHost, USERS.demo.id]);
    await system("insert into properties (host_id, name, short_code, is_demo) values ($1, 'Demo', 'tour', true)", [demoHost]);
  });

  it("can't invite, accept, or edit settings", async () => {
    await expect(
      as("demo", "insert into host_invitations (host_id, email, role, token_hash, invited_by) values ($1, 'x@example.com', 'viewer', 'h2', $2)", [demoHost, USERS.demo.id]),
    ).rejects.toThrow(/locked in the shared demo/);
    await invite(USERS.demo.email, "viewer", "token-demo");
    await expect(as("demo", "select accept_host_invitation('token-demo')")).rejects.toThrow(/shared demo/);
    await expect(as("demo", "update properties set name = 'x' where host_id = $1", [demoHost])).rejects.toThrow(/locked in the shared demo/);
  });

  it("leaves no audit rows for blocked writes or demo rebuilds", async () => {
    expect(await system("select id from audit_log where actor_id = $1", [USERS.demo.id])).toHaveLength(0);
    expect(await system("select id from audit_log where host_id = $1 and table_name = 'properties'", [demoHost])).toHaveLength(0);
  });
});
