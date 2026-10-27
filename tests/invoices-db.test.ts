/**
 * Invoices: numbered in sequence per business, readable by staff only,
 * written only by Latchkey's server, and kept when the stay is deleted.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

let db: Db;
let hostId: string;
let propertyId: string;
let bookingId: string;

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
      "insert into properties (host_id, name, short_code) values ($1, 'Hill', 'hill-inv') returning id",
      [hostId],
    )
  )[0]!.id;
  bookingId = (
    await db.as<{ id: string }>(
      "owner",
      "insert into bookings (property_id, guest_full_name, check_in_date, check_out_date, channel, stay_amount_pence) values ($1, 'Jane Brown', '2026-10-12', '2026-10-15', 'direct', 36000) returning id",
      [propertyId],
    )
  )[0]!.id;
  await db.system("insert into host_members (host_id, user_id, role) values ($1, $2, 'viewer')", [
    hostId,
    USERS.viewer.id,
  ]);
}, 60_000);

const insert = (number: string, token: string) =>
  db.system(
    `insert into invoices (host_id, property_id, booking_id, number, issued_on, access_token, seller_name, buyer_name, description,
       currency, net_pence, tax_pence, total_pence, created_by)
     values ($1, $2, $3, $4, '2026-10-13', $5, 'Hill', 'Jane Brown', 'Suite 1, 3 nights', 'GBP', 30000, 6000, 36000, 'guest')`,
    [hostId, propertyId, bookingId, number, token],
  );

describe("invoices", () => {
  it("numbers in sequence, only from the server", async () => {
    const a = await db.system<{ n: number }>("select claim_invoice_number($1) as n", [hostId]);
    const b = await db.system<{ n: number }>("select claim_invoice_number($1) as n", [hostId]);
    expect([a[0]!.n, b[0]!.n]).toEqual([1, 2]);
    await expect(db.as("owner", "select claim_invoice_number($1)", [hostId])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("is visible to the owner, not to viewers or outsiders", async () => {
    await insert("HILL-0001", "a".repeat(32));
    expect(await db.as("owner", "select number from invoices")).toEqual([{ number: "HILL-0001" }]);
    expect(await db.as("viewer", "select id from invoices")).toEqual([]);
    expect(await db.as("outsider", "select id from invoices")).toEqual([]);
  });

  it("allows one invoice per stay and checks the totals add up", async () => {
    await expect(insert("HILL-0002", "b".repeat(32))).rejects.toThrow(/invoices_booking_idx/);
    await expect(
      db.system(
        `insert into invoices (host_id, number, issued_on, access_token, seller_name, buyer_name, description, currency, net_pence, tax_pence, total_pence, created_by)
         values ($1, 'HILL-0003', '2026-10-13', $2, 'Hill', 'Sam', 'x', 'GBP', 100, 20, 999, 'host')`,
        [hostId, "c".repeat(32)],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("is kept when the stay is deleted", async () => {
    await db.system("delete from bookings where id = $1", [bookingId]);
    expect(await db.system("select booking_id from invoices")).toEqual([{ booking_id: null }]);
  });
});
