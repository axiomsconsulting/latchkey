/**
 * Deleting and archiving stays, against the real migrations (pg-harness.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

let db: Db;
let hostId: string;
let propertyId: string;

async function stay(name: string) {
  const [b] = await db.as<{ id: string }>(
    "owner",
    "insert into bookings (property_id, channel, guest_full_name, check_in_date, check_out_date) values ($1, 'direct', $2, '2026-10-10', '2026-10-12') returning id",
    [propertyId, name],
  );
  return b!.id;
}

async function count(table: string, bookingId: string) {
  const [r] = await db.system<{ n: number }>(
    `select count(*)::int n from ${table} where booking_id = $1`,
    [bookingId],
  );
  return r!.n;
}

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
      "insert into properties (host_id, name, short_code) values ($1, 'Hill Suites', 'hill-suites') returning id",
      [hostId],
    )
  )[0]!.id;
  // A viewer on the team.
  await db.system("insert into host_members (host_id, user_id, role) values ($1, $2, 'viewer')", [
    hostId,
    USERS.viewer.id,
  ]);
}, 60_000);

describe("delete_bookings", () => {
  it("removes the stay with its messages, requests, service jobs and alerts", async () => {
    const id = await stay("Old Demo Guest");
    await db.system(
      "insert into messages (booking_id, direction, channel, body) values ($1, 'inbound', 'stay_page', 'hi')",
      [id],
    );
    await db.system("insert into requests (booking_id, kind) values ($1, 'extras')", [id]);
    await db.system(
      "insert into service_jobs (host_id, property_id, booking_id, category, title) values ($1, $2, $3, 'cleaning', 'Towels')",
      [hostId, propertyId, id],
    );
    await db.system(
      "insert into host_alerts (host_id, property_id, booking_id, kind, message) values ($1, $2, $3, 'self_declared', 'x')",
      [hostId, propertyId, id],
    );

    const [res] = await db.as<{ n: number }>(
      "owner",
      "select delete_bookings(array[$1]::uuid[]) as n",
      [id],
    );
    expect(res!.n).toBe(1);
    for (const t of ["bookings", "messages", "requests", "service_jobs", "host_alerts"]) {
      const col = t === "bookings" ? "id" : "booking_id";
      const [r] = await db.system<{ n: number }>(
        `select count(*)::int n from ${t} where ${col} = $1`,
        [id],
      );
      expect(r!.n, t).toBe(0);
    }
  });

  it("refuses stays with payments, so money records are kept", async () => {
    const id = await stay("Paid Guest");
    await db.system("insert into payments (booking_id, amount_pence) values ($1, 500)", [id]);
    await expect(db.as("owner", "select delete_bookings(array[$1]::uuid[])", [id])).rejects.toThrow(
      /Archive them instead/,
    );
    expect(await count("payments", id)).toBe(1);
  });

  it("refuses read-only members and outsiders", async () => {
    const id = await stay("Kept Guest");
    await expect(
      db.as("viewer", "select delete_bookings(array[$1]::uuid[])", [id]),
    ).rejects.toThrow(/read-only/);
    await expect(
      db.as("outsider", "select delete_bookings(array[$1]::uuid[])", [id]),
    ).rejects.toThrow(/no longer exist/);
    const [r] = await db.system<{ n: number }>(
      "select count(*)::int n from bookings where id = $1",
      [id],
    );
    expect(r!.n).toBe(1);
  });

  it("is all or nothing", async () => {
    const ok = await stay("Fine Guest");
    const paid = await stay("Paying Guest");
    await db.system("insert into payments (booking_id, amount_pence) values ($1, 900)", [paid]);
    await expect(
      db.as("owner", "select delete_bookings(array[$1, $2]::uuid[])", [ok, paid]),
    ).rejects.toThrow();
    const [r] = await db.system<{ n: number }>(
      "select count(*)::int n from bookings where id = $1",
      [ok],
    );
    expect(r!.n).toBe(1);
  });
});

describe("archive", () => {
  it("hides a stay without losing anything, and is an ordinary write", async () => {
    const id = await stay("Archived Guest");
    await db.as("owner", "update bookings set archived_at = now() where id = $1", [id]);
    const [b] = await db.as<{ archived: boolean }>(
      "owner",
      "select archived_at is not null as archived from bookings where id = $1",
      [id],
    );
    expect(b!.archived).toBe(true);
    await expect(
      db.as("viewer", "update bookings set archived_at = null where id = $1", [id]),
    ).rejects.toThrow(/read-only/);
  });
});
