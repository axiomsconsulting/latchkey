/**
 * The Commission Partner month close and payouts: Launch Bonus checks (and
 * the once-ever race in one run), sending only with an admin's approval,
 * idempotent transfers, balance and live-mode checks, the manual route,
 * statements, and the Global Payouts switch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PartnerStripeError,
  PartnerStripeLiveBlocked,
  partnerStripeKey,
} from "../src/lib/partner-stripe.server";
import {
  bonusRun,
  hashPurgeBefore,
  sendPayout,
  statementCsv,
  statementNumber,
  vatTreatment,
  type BonusCandidate,
  type PayoutToSend,
} from "../src/lib/partner-close";
import { PARTNER_DEFAULTS } from "../src/lib/partner-config";
import {
  assertGlobalPayoutsEnabled,
  GlobalPayoutsDisabled,
  sendGlobalPayout,
} from "../src/lib/global-payouts.server";

const T = (s: string) => Date.parse(s);
const SNAP = {
  terms_id: "t",
  label: "v0.5",
  rate_bps: 1000,
  paid_months_cap: 12,
  bonus_amount_pence: 5000,
  bonus_tiers: null,
  bonus_end_date: "2026-12-31",
  bonus_first_payment_deadline_days: 60,
};

const cand = (
  id: string,
  over: Partial<BonusCandidate> & { email?: string; fpme?: string } = {},
): BonusCandidate => ({
  referral: {
    id,
    partner_id: "p",
    status: "approved",
    sign_up_at: "2026-10-02T00:00:00Z",
    paid_months_used: 1,
    qualifying_payment_at: "2026-11-01T00:00:00Z",
    first_paid_month_end: over.fpme ?? "2026-12-01T00:00:00Z",
    qualifying_charge_id: `ch_${id}`,
    terms_snapshot: SNAP,
  },
  keys: [{ kind: "email", value_hash: over.email ?? `e_${id}` }],
  qpPaidPence: 2900,
  partner: { terminated_at: null, termination_for_breach: false },
  flagOpen: false,
  ...over,
});

describe("month close: Launch Bonus", () => {
  it("earns the bonus only once the first Paid Month has ended", () => {
    const out = bonusRun(
      [cand("a"), cand("b", { fpme: "2027-01-01T00:00:00Z" })],
      [],
      {},
      PARTNER_DEFAULTS,
      T("2026-12-02T00:00:00Z"),
    );
    expect(out.find((r) => r.referral_id === "a")!.decision).toEqual({
      status: "earned",
      amount_pence: 5000,
      reason: null,
    });
    expect(out.find((r) => r.referral_id === "b")!.decision).toMatchObject({
      status: "pending",
      reason: "first_month_not_complete",
    });
  });

  it("pays one bonus when two referrals for the same identity land in the same run", () => {
    const out = bonusRun(
      [cand("a", { email: "same" }), cand("b", { email: "same" })],
      [],
      {},
      PARTNER_DEFAULTS,
      T("2026-12-02T00:00:00Z"),
    );
    expect(out.map((r) => r.decision.status).sort()).toEqual(["earned", "not_eligible"]);
    expect(out.find((r) => r.decision.status === "not_eligible")!.decision.reason).toBe(
      "prior_claim",
    );
  });

  it("refuses a host whose identity had a bonus before, with any partner", () => {
    const out = bonusRun(
      [cand("a", { email: "old" })],
      [{ identity_hashes: ["email:old"] }],
      {},
      PARTNER_DEFAULTS,
      T("2026-12-02T00:00:00Z"),
    );
    expect(out[0]!.decision.reason).toBe("prior_claim");
  });

  it("counts tier positions as bonuses are earned", () => {
    const tiers = {
      ...SNAP,
      bonus_amount_pence: null,
      bonus_tiers: [
        { from_nth: 1, pence: 2000 },
        { from_nth: 2, pence: 3000 },
      ],
    };
    const c = (id: string, fpme: string) => ({
      ...cand(id, { fpme }),
      referral: { ...cand(id, { fpme }).referral, terms_snapshot: tiers },
    });
    const out = bonusRun(
      [c("b", "2026-12-02T00:00:00Z"), c("a", "2026-12-01T00:00:00Z")],
      [],
      {},
      PARTNER_DEFAULTS,
      T("2026-12-05T00:00:00Z"),
    );
    expect(out.map((r) => [r.referral_id, r.decision.amount_pence])).toEqual([
      ["a", 2000],
      ["b", 3000],
    ]);
  });
});

describe("sending payouts", () => {
  const payout: PayoutToSend = {
    id: "po1",
    partner_id: "p",
    route: "express",
    amount_pence: 1500,
    currency: "gbp",
    status: "approved",
    idempotency_key: "payout_po1",
  };
  const partner = {
    id: "p",
    status: "active",
    stripe_account_id: "acct_1",
    payouts_enabled: true,
    termination_for_breach: false,
    flagged: false,
  };
  const deps = (over: Partial<Parameters<typeof sendPayout>[2]> = {}) => ({
    assertKey: () => {},
    availableGbpPence: async () => 100_000,
    transfer: vi.fn(async () => ({ id: "tr_1" })),
    ...over,
  });

  it("sends a GBP transfer keyed to the payout, so a second click can't pay twice", async () => {
    const d = deps();
    expect(await sendPayout(payout, partner, d)).toEqual({ status: "sent", transferId: "tr_1" });
    await sendPayout(payout, partner, d);
    expect(d.transfer).toHaveBeenCalledTimes(2);
    for (const call of d.transfer.mock.calls as unknown as Array<
      [Record<string, unknown>, string]
    >) {
      expect(call[1]).toBe("payout_po1");
      expect(call[0]).toMatchObject({
        amount: 1500,
        currency: "gbp",
        destination: "acct_1",
        transfer_group: "payout_po1",
      });
    }
  });

  it("refuses when the balance is too low, the account isn't ready, or the partner is under review", async () => {
    expect(
      await sendPayout(payout, partner, deps({ availableGbpPence: async () => 1000 })),
    ).toMatchObject({ status: "refused" });
    expect(await sendPayout(payout, { ...partner, payouts_enabled: false }, deps())).toMatchObject({
      status: "refused",
      reason: expect.stringContaining("9.3(b)"),
    });
    expect(await sendPayout(payout, { ...partner, flagged: true }, deps())).toMatchObject({
      status: "refused",
    });
    expect(await sendPayout(payout, { ...partner, status: "suspended" }, deps())).toMatchObject({
      status: "refused",
    });
    expect(await sendPayout({ ...payout, status: "sent" }, partner, deps())).toMatchObject({
      status: "refused",
    });
  });

  it("refuses in live mode without permission, before touching Stripe", async () => {
    const d = deps({
      assertKey: () => {
        throw new PartnerStripeLiveBlocked();
      },
    });
    expect(await sendPayout(payout, partner, d)).toMatchObject({ status: "refused" });
    expect(d.transfer).not.toHaveBeenCalled();
  });

  it("tells a Stripe refusal (new key next time) from a timeout (same key)", async () => {
    const refused = await sendPayout(
      payout,
      partner,
      deps({
        transfer: vi.fn(async () => {
          throw new PartnerStripeError("Insufficient funds", 400, "balance_insufficient");
        }),
      }),
    );
    expect(refused).toMatchObject({ status: "failed", rejected: true });
    const timeout = await sendPayout(
      payout,
      partner,
      deps({
        transfer: vi.fn(async () => {
          throw new Error("The operation was aborted due to timeout");
        }),
      }),
    );
    expect(timeout).toMatchObject({ status: "failed", rejected: false });
  });

  it("queues manual payouts for the admin and refuses Global Payouts while it's off", async () => {
    expect(
      await sendPayout(
        { ...payout, route: "manual" },
        { ...partner, stripe_account_id: null },
        deps(),
      ),
    ).toEqual({ status: "manual_pending" });
    expect(await sendPayout({ ...payout, route: "global_payouts" }, partner, deps())).toMatchObject(
      { status: "refused", reason: expect.stringContaining("by hand") },
    );
    expect(await sendPayout({ ...payout, currency: "eur" }, partner, deps())).toMatchObject({
      status: "refused",
    });
  });
});

describe("statements and retention", () => {
  it("writes a monthly CSV statement with hosts anonymised", () => {
    const csv = statementCsv([
      {
        host: "H.S. · Amersham",
        status: "paying",
        paidMonths: 2,
        netReceiptsPence: 2900,
        commissionPence: 290,
        bonusPence: 5000,
        heldPence: 5290,
        clawbackPence: 0,
      },
      {
        host: 'A "B", C',
        status: "paused",
        paidMonths: 1,
        netReceiptsPence: 0,
        commissionPence: 0,
        bonusPence: 0,
        heldPence: 0,
        clawbackPence: 145,
      },
    ]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "Referred Host,Status,Paid Months used,Net Receipts (£),Commission (£),Launch Bonus (£),Held (£),Held because,Clawback (£)",
    );
    expect(lines[1]).toBe(
      "H.S. · Amersham,paying,2,29.00,2.90,50.00,52.90,Hold Period (45 days),0.00",
    );
    expect(lines[2]).toBe('"A ""B"", C",paused,1,0.00,0.00,0.00,0.00,,1.45');
    expect(lines[3]).toBe("Total,,,29.00,2.90,50.00,52.90,,1.45");
  });

  it("is a self-billed invoice with set-off and the payable balance, and never a Stripe fee (12.7, 10.6, 13.1)", () => {
    const row = {
      host: "H.S. · Amersham",
      status: "paying",
      paidMonths: 2,
      netReceiptsPence: 2900,
      commissionPence: 290,
      bonusPence: 0,
      heldPence: 290,
      clawbackPence: 0,
      heldReason: "Payment dispute open",
    };
    const meta = {
      number: statementNumber("OMS-AB12C", "p", "2026-11"),
      issuedOn: "2026-12-01",
      oms: {
        name: "Omnispace Estates Ltd",
        companyNumber: "16889713",
        address: "49 Trinity Circle, High Wycombe, HP11 1FB",
        vatNumber: "",
      },
      partner: {
        name: "Pat Partner",
        address: "1 High Street",
        vatNumber: "GB123",
        country: "GB",
        kind: "business" as const,
      },
      selfBilled: true,
      setOffPence: 500,
      payablePence: 1200,
      paidPence: 0,
    };
    const csv = statementCsv([row], meta);
    expect(csv.split("\n")[0]).toBe("Self-billed invoice,SB-OMS-AB12C-202611");
    expect(csv).toContain("Partner VAT number,GB123");
    expect(csv).toContain("under the self-billing agreement in clause 12.7");
    // £2.90 commission including VAT: 1/6 is VAT.
    expect(csv).toContain("Of which VAT at 20% (£),0.48");
    expect(csv).toContain("The VAT shown is your output tax due to HMRC.");
    expect(vatTreatment({ vatNumber: null, country: "IE", kind: "business" }, 600).note).toMatch(
      /Reverse charge/,
    );
    expect(vatTreatment({ vatNumber: null, country: "GB", kind: "individual" }, 600)).toEqual({
      vatPence: null,
      note: "No VAT: the partner has told OMS they are not VAT-registered.",
    });
    expect(csv).toContain("Payment dispute open");
    expect(csv).toContain("Set-off this month (£),5.00");
    expect(csv).toContain("Payable balance after clawbacks and set-off (£),12.00");
    expect(csv).toContain("None deducted by OMS (13.1).");
    expect(statementCsv([row], { ...meta, selfBilled: false }).split("\n")[0]).toBe(
      "Statement,SB-OMS-AB12C-202611",
    );
  });

  it("clears IP hashes after 180 days", () => {
    expect(hashPurgeBefore(T("2027-06-30T00:00:00Z"), 180)).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("Global Payouts (off)", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env["STRIPE_TEST_API_KEY"] = "sk_test_x";
    delete process.env["PARTNER_GLOBAL_PAYOUTS_ENABLED"];
    delete process.env["GLOBAL_PAYOUTS_FINANCIAL_ACCOUNT_ID"];
  });
  afterEach(() => {
    process.env = { ...saved };
    vi.unstubAllGlobals();
  });

  it("needs the setting, the env flag and the financial account", () => {
    expect(() => assertGlobalPayoutsEnabled(PARTNER_DEFAULTS)).toThrow(GlobalPayoutsDisabled);
    const on = { ...PARTNER_DEFAULTS, globalPayoutsEnabled: true };
    expect(() => assertGlobalPayoutsEnabled(on)).toThrow(/PARTNER_GLOBAL_PAYOUTS_ENABLED/);
    process.env["PARTNER_GLOBAL_PAYOUTS_ENABLED"] = "true";
    expect(() => assertGlobalPayoutsEnabled(on)).toThrow(/FINANCIAL_ACCOUNT/);
    process.env["GLOBAL_PAYOUTS_FINANCIAL_ACCOUNT_ID"] = "fa_1";
    expect(assertGlobalPayoutsEnabled(on)).toBe("fa_1");
    delete process.env["STRIPE_TEST_API_KEY"];
    process.env["STRIPE_LIVE_API_KEY"] = "sk_live_x";
    expect(() => partnerStripeKey()).toThrow(PartnerStripeLiveBlocked);
    expect(() => assertGlobalPayoutsEnabled(on)).toThrow(PartnerStripeLiveBlocked);
  });

  it("sends an outbound payment in pounds with the payout's idempotency key (mocked)", async () => {
    process.env["PARTNER_GLOBAL_PAYOUTS_ENABLED"] = "true";
    process.env["GLOBAL_PAYOUTS_FINANCIAL_ACCOUNT_ID"] = "fa_1";
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: "obp_1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { gp_recipient_id: "rcp_1", gp_payout_method_id: "pm_1" },
            }),
          }),
        }),
      }),
    } as never;
    const out = await sendGlobalPayout(
      db,
      {
        id: "po1",
        partner_id: "p",
        route: "global_payouts",
        amount_pence: 2500,
        currency: "gbp",
        status: "approved",
        idempotency_key: "payout_po1",
      },
      { ...PARTNER_DEFAULTS, globalPayoutsEnabled: true },
    );
    expect(out.id).toBe("obp_1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v2/money_management/outbound_payments");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("payout_po1");
    expect(JSON.parse(String(init.body))).toMatchObject({
      from: { financial_account: "fa_1", currency: "gbp" },
      to: { recipient: "rcp_1", payout_method: "pm_1" },
      amount: { value: 2500, currency: "gbp" },
    });
  });
});
