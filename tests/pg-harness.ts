/**
 * Runs the real migrations in an in-memory Postgres (PGlite) with a small
 * stand-in for Supabase's auth schema, and acts as different users the way
 * PostgREST does. Never touches a hosted database.
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import { PGlite } from "@electric-sql/pglite";

const SUPABASE_STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema extensions; create schema storage;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select auth.jwt() ->> 'role' $$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
-- Created by Lovable outside drizzle/migrations.
create table public.platform_pricing (id int primary key, base_pence int not null default 100, extra_room_pence int not null default 50, extra_property_pence int not null default 100, trial_days int not null default 30, currency text not null default 'GBP', updated_at timestamptz not null default now());
insert into public.platform_pricing (id) values (1);
`;

export const USERS = {
  owner: { id: "00000000-0000-0000-0000-00000000000a", email: "owner@example.com" },
  manager: { id: "00000000-0000-0000-0000-00000000000b", email: "manager@example.com" },
  viewer: { id: "00000000-0000-0000-0000-00000000000c", email: "viewer@example.com" },
  outsider: { id: "00000000-0000-0000-0000-00000000000d", email: "outsider@example.com" },
  demo: { id: "00000000-0000-0000-0000-00000000000e", email: "demo@latchkey.omsestates.uk" },
  admin: { id: "00000000-0000-0000-0000-00000000000f", email: "swapnil.kashyap@gmail.com" },
} as const;
export type Who = keyof typeof USERS;

export type Db = {
  /** Runs SQL as a signed-in user (or anon), with RLS. */
  as: <T = Record<string, unknown>>(who: Who | "anon", sql: string, params?: unknown[]) => Promise<T[]>;
  /** Runs SQL as Latchkey's server: no user, RLS bypassed. */
  system: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
};

export async function bootDb(): Promise<Db> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUB);
  const dir = join(__dirname, "../drizzle/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(join(dir, f), "utf8"));
  }
  await pg.exec(`grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
                 grant usage, select on all sequences in schema public to authenticated, service_role;`);
  for (const u of Object.values(USERS)) {
    await pg.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [u.id, u.email]);
  }

  async function as<T>(who: Who | "anon", sql: string, params: unknown[] = []): Promise<T[]> {
    const claims =
      who === "anon" ? { role: "anon" } : { sub: USERS[who].id, email: USERS[who].email, role: "authenticated" };
    await pg.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
    await pg.exec(`set role ${who === "anon" ? "anon" : "authenticated"}`);
    try {
      return (await pg.query<T>(sql, params)).rows;
    } finally {
      await pg.exec("reset role");
      await pg.query("select set_config('request.jwt.claims', '', false)");
    }
  }
  async function system<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await pg.query<T>(sql, params)).rows;
  }
  return { as, system };
}
