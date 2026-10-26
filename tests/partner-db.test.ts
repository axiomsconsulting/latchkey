/**
 * Commission Partner tables (migration 0061): who can read what, the
 * add-only ledger, one commission line per invoice and one bonus per
 * referral, annual lines, one payout per ledger line, terms that can't be
 * changed once in effect, and no cap on referrals.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

let db: Db;
let hostId: string;
let partnerId: string;
let otherPartnerId: string;
let referralId: string;
let termsId: string;

const SNAP = JSON.stringify({ rate_bps: 1000, paid_months_cap: 12 });

beforeAll(async () => {
  db = await bootDb();
  hostId = (
    await db.as<{ id: string }>("owner", "select create_host_workspace('Hill', $1) as id", [
      USERS.owner.email,
    ])
  )[0]!.id;
  partnerId = (
    await db.system<{ id: string }>(
      "insert into partners (user_id, legal_name, country, email, status, referral_code) values ($1, 'Pat Partner', 'GB', 'pat@example.com', 'active', 'OMS-PAT01') returning id",
      [USERS.viewer.id],
    )
  )[0]!.id;
  otherPartnerId = (
    await db.system<{ id: string }>(
      "insert into partners (user_id, legal_name, country, email, status) values ($1, 'Other', 'IE', 'o@example.com', 'active') returning id",
      [USERS.manager.id],
    )
  )[0]!.id;
  termsId = (
    await db.system<{ id: string }>("select id from commission_terms where label = 'v0.5-launch'")
  )[0]!.id;
  referralId = (
    await db.system<{ id: string }>(
      "insert into referrals (host_id, partner_id, source, sign_up_at, terms_id, terms_snapshot, host_label) values ($1, $2, 'link', now(), $3, $4, 'H. · Amersham') returning id",
      [hostId, partnerId, termsId, SNAP],
    )
  )[0]!.id;
}, 60_000);

const line = (extra: string, values: unknown[] = []) =>
  db.system<{ id: string }>(
    `insert into commission_ledger (partner_id, referral_id, host_id, kind, amount_pence, base_pence, ${extra.split("|")[0]}) values ($1, $2, $3, ${extra.split("|")[1]}) returning id`,
    [partnerId, referralId, hostId, ...values],
  );

describe("commission partner tables", () => {
  it("seed the launch terms with no Launch Bonus", async () => {
    expect(
      await db.system(
        "select rate_bps, paid_months_cap, bonus_amount_pence, bonus_end_date from commission_terms where label = 'v0.5-launch'",
      ),
    ).toEqual([
      { rate_bps: 1000, paid_months_cap: 12, bonus_amount_pence: null, bonus_end_date: null },
    ]);
  });

  it("show a partner only their own row, ledger and referrals (no host ids)", async () => {
    await line(
      "stripe_invoice_id, paid_month_from, paid_month_to, months_covered, rate_bps|'commission', 290, 2900, $4, 1, 1, 1, 1000",
      ["in_1"],
    );
    expect(await db.as("viewer", "select legal_name from partners")).toEqual([
      { legal_name: "Pat Partner" },
    ]);
    expect((await db.as("viewer", "select amount_pence from commission_ledger")).length).toBe(1);
    expect(await db.as("manager", "select id from commission_ledger")).toEqual([]);
    expect(await db.as("viewer", "select id from referrals")).toEqual([]);
    const mine = await db.as<{ host_label: string }>(
      "viewer",
      "select host_label from my_partner_referrals()",
    );
    expect(mine).toEqual([{ host_label: "H. · Amersham" }]);
    expect(await db.as("manager", "select id from my_partner_referrals()")).toEqual([]);
    const bal = await db.as<{ held_pence: number }>(
      "viewer",
      "select held_pence from partner_balance($1)",
      [partnerId],
    );
    expect(Number(bal[0]!.held_pence)).toBe(290);
    expect(
      await db.as("manager", "select * from partner_balance($1) where held_pence > 0", [partnerId]),
    ).toEqual([]);
  });

  it("keep hosts and partners out of identity keys and the bonus register", async () => {
    await db.system(
      "insert into host_identity_keys (host_id, kind, value_hash) values ($1, 'email', 'h1')",
      [hostId],
    );
    await db.system(
      "insert into partner_identity_keys (partner_id, kind, value_hash) values ($1, 'email', 'h1')",
      [partnerId],
    );
    for (const who of ["owner", "viewer", "outsider"] as const) {
      expect(await db.as(who, "select * from host_identity_keys")).toEqual([]);
      expect(await db.as(who, "select * from partner_identity_keys")).toEqual([]);
      expect(await db.as(who, "select * from launch_bonus_claims")).toEqual([]);
    }
    expect(await db.as("owner", "select * from referrals")).toEqual([]);
    expect((await db.as("admin", "select id from referrals")).length).toBe(1);
  });

  it("don't let a partner change their own row or the ledger", async () => {
    await db.as(
      "viewer",
      "update partners set status = 'active', payouts_enabled = true where id = $1",
      [partnerId],
    );
    expect(
      await db.system("select payouts_enabled from partners where id = $1", [partnerId]),
    ).toEqual([{ payouts_enabled: false }]);
    await expect(
      db.as(
        "viewer",
        "insert into commission_ledger (partner_id, kind, amount_pence) values ($1, 'adjustment', 5000)",
        [partnerId],
      ),
    ).rejects.toThrow();
  });

  it("keep the ledger add-only", async () => {
    const [l] = await db.system<{ id: string }>(
      "select id from commission_ledger where stripe_invoice_id = 'in_1'",
    );
    await expect(
      db.system("update commission_ledger set amount_pence = 9999 where id = $1", [l!.id]),
    ).rejects.toThrow(/can't be changed/);
    await expect(db.system("delete from commission_ledger where id = $1", [l!.id])).rejects.toThrow(
      /can't be deleted/,
    );
    await db.system(
      "update commission_ledger set state = 'payable', payable_after = now() where id = $1",
      [l!.id],
    );
    expect(await db.system("select state from commission_ledger where id = $1", [l!.id])).toEqual([
      { state: "payable" },
    ]);
  });

  it("allow one commission line per invoice and one bonus per referral", async () => {
    await expect(
      line(
        "stripe_invoice_id, paid_month_from, paid_month_to, months_covered|'commission', 290, 2900, $4, 2, 2, 1",
        ["in_1"],
      ),
    ).rejects.toThrow();
    await line("note|'launch_bonus', 500, 0, $4", ["bonus"]);
    await expect(line("note|'launch_bonus', 500, 0, $4", ["again"])).rejects.toThrow();
  });

  it("accept an annual line for 12 Paid Months and refuse month 13", async () => {
    await line(
      "stripe_invoice_id, paid_month_from, paid_month_to, months_covered|'commission', 660, 6600, $4, 1, 12, 12",
      ["in_year"],
    );
    await expect(
      line(
        "stripe_invoice_id, paid_month_from, paid_month_to, months_covered|'commission', 10, 100, $4, 2, 13, 12",
        ["in_13"],
      ),
    ).rejects.toThrow();
    await expect(
      line(
        "stripe_invoice_id, paid_month_from, paid_month_to, months_covered|'commission', 10, 100, $4, 3, 4, 1",
        ["in_bad"],
      ),
    ).rejects.toThrow();
  });

  it("put a ledger line in one payout only", async () => {
    const [l] = await db.system<{ id: string }>(
      "select id from commission_ledger where stripe_invoice_id = 'in_year'",
    );
    const p1 = (
      await db.system<{ id: string }>(
        "insert into payouts (partner_id, route, amount_pence, idempotency_key) values ($1, 'express', 660, 'k1') returning id",
        [partnerId],
      )
    )[0]!.id;
    const p2 = (
      await db.system<{ id: string }>(
        "insert into payouts (partner_id, route, amount_pence, idempotency_key) values ($1, 'express', 660, 'k2') returning id",
        [partnerId],
      )
    )[0]!.id;
    await db.system("insert into payout_items (payout_id, ledger_id) values ($1, $2)", [p1, l!.id]);
    await expect(
      db.system("insert into payout_items (payout_id, ledger_id) values ($1, $2)", [p2, l!.id]),
    ).rejects.toThrow();
    await expect(
      db.system(
        "insert into payouts (partner_id, route, amount_pence, idempotency_key) values ($1, 'express', 1, 'k1')",
        [partnerId],
      ),
    ).rejects.toThrow();
  });

  it("lock terms once they're in effect, but allow future ones to be edited", async () => {
    await expect(
      db.system("update commission_terms set rate_bps = 500 where id = $1", [termsId]),
    ).rejects.toThrow(/can't be changed/);
    await expect(
      db.system("delete from commission_terms where id = $1", [termsId]),
    ).rejects.toThrow();
    const [f] = await db.system<{ id: string }>(
      "insert into commission_terms (label, effective_from, rate_bps, paid_months_cap) values ('future', now() + interval '40 days', 800, 12) returning id",
    );
    await db.system("update commission_terms set rate_bps = 900 where id = $1", [f!.id]);
    expect(await db.system("select rate_bps from commission_terms where id = $1", [f!.id])).toEqual(
      [{ rate_bps: 900 }],
    );
    // Hosts and partners never write terms.
    await expect(
      db.as(
        "viewer",
        "insert into commission_terms (label, effective_from, rate_bps, paid_months_cap) values ('mine', now(), 9000, 12)",
      ),
    ).rejects.toThrow();
  });

  it("allow any number of referrals for one partner", async () => {
    await db.system(
      `insert into referrals (partner_id, source, sign_up_at, terms_snapshot) select $1, 'link', now(), $2::jsonb from generate_series(1, 500)`,
      [otherPartnerId, SNAP],
    );
    expect(
      await db.system("select count(*)::int as n from referrals where partner_id = $1", [
        otherPartnerId,
      ]),
    ).toEqual([{ n: 500 }]);
  });

  it("make the Stripe event store refuse a repeated event id", async () => {
    await db.system("insert into stripe_events (event_id, type) values ('evt_1', 'invoice.paid')");
    expect(
      await db.system(
        "insert into stripe_events (event_id, type) values ('evt_1', 'invoice.paid') on conflict do nothing returning event_id",
      ),
    ).toEqual([]);
  });
});
