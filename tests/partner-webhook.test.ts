/* eslint-disable @typescript-eslint/no-explicit-any -- the 0061 tables aren't in the generated types yet, and Stripe payloads are read field by field */
/**
 * The Commission Partner webhook, against an in-memory store with the same
 * unique rules as the database: replays and concurrent deliveries count
 * once, host events pass straight through, live events are ignored in test
 * mode, and invoices, refunds and disputes move the ledger as the agreement
 * says.
 */
import { describe, expect, it } from "vitest";

import type { LedgerLine } from "../src/lib/commission";
import { PARTNER_DEFAULTS, type PartnerConfig } from "../src/lib/partner-config";
import {
  processPartnerEvent,
  type ChargeRecord,
  type NewLedgerLine,
  type Partner,
  type PartnerStore,
  type Referral,
} from "../src/lib/partner-webhook";

const sec = (s: string) => Math.floor(Date.parse(s) / 1000);
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

class Mem implements PartnerStore {
  events = new Map<
    string,
    { processed: boolean; result: string | null; error: string | null; started: number }
  >();
  referrals: Referral[] = [];
  partners: Partner[] = [];
  charges: Record<string, any> = {};
  invoices: Record<string, any> = {};
  records: ChargeRecord[] = [];
  lines: Array<LedgerLine & Record<string, any>> = [];
  clawbacks: any[] = [];
  flags: any[] = [];
  logs: any[] = [];
  open = new Set<string>();
  claims: Record<string, string> = {};
  cards: string[] = [];
  modeValue: "test" | "live" = "test";
  cfg: PartnerConfig = PARTNER_DEFAULTS;
  n = 0;
  async claimEvent(id: string) {
    const e = this.events.get(id);
    if (!e) {
      this.events.set(id, { processed: false, result: null, error: null, started: Date.now() });
      return { state: "new" as const };
    }
    if (e.processed) return { state: "done" as const, result: e.result };
    if (e.error) {
      e.error = null;
      return { state: "new" as const };
    }
    return { state: "busy" as const };
  }
  async finishEvent(id: string, result: string | null, error?: string | null) {
    const e = this.events.get(id)!;
    if (error) e.error = error;
    else Object.assign(e, { processed: true, result });
  }
  async config() {
    return this.cfg;
  }
  mode() {
    return this.modeValue;
  }
  async hostIdForInvoice(inv: any) {
    return inv?.subscription_details?.metadata?.host_id ?? null;
  }
  async referralForHost(hostId: string) {
    return this.referrals.find((r) => r.host_id === hostId) ?? null;
  }
  async referral(id: string) {
    return this.referrals.find((r) => r.id === id) ?? null;
  }
  async partner(id: string) {
    return this.partners.find((p) => p.id === id) ?? null;
  }
  async partnerByAccount(a: string) {
    return this.partners.find((p) => p.stripe_account_id === a) ?? null;
  }
  async hostBilling() {
    return { trialEndsAt: "2026-11-01T00:00:00Z", comped: false };
  }
  async hasOpenFlag(id: string) {
    return this.open.has(id);
  }
  async fetchCharge(id: string) {
    return this.charges[id] ?? null;
  }
  async fetchInvoice(id: string) {
    return this.invoices[id] ?? null;
  }
  async chargeRecord(id: string) {
    return this.records.find((c) => c.charge_id === id) ?? null;
  }
  async saveCharge(c: ChargeRecord) {
    if (!this.records.some((x) => x.charge_id === c.charge_id)) this.records.push({ ...c });
  }
  pending: Record<string, { status: "open" | "won" | "lost"; amount_pence: number | null; applied: boolean }> = {};
  async savePendingDispute(id: string, status: "open" | "won" | "lost", amount: number | null) {
    this.pending[id] = { status, amount_pence: amount, applied: false };
  }
  async takePendingDispute(id: string) {
    const p = this.pending[id];
    if (!p || p.applied) return null;
    p.applied = true;
    return { status: p.status, amount_pence: p.amount_pence };
  }
  async updateCharge(id: string, patch: Partial<ChargeRecord>) {
    Object.assign(
      this.records.find((c) => c.charge_id === id)!,
      patch,
    );
  }
  async updateReferral(id: string, patch: Record<string, unknown>) {
    Object.assign(
      this.referrals.find((r) => r.id === id)!,
      patch,
    );
  }
  async insertLines(lines: NewLedgerLine[]) {
    let added = 0;
    for (const l of lines) {
      if (
        l.kind === "clawback" &&
        this.lines.some(
          (x) =>
            x.kind === "clawback" &&
            x.reverses_ledger_id === l.reverses_ledger_id &&
            x.source_event_id === l.source_event_id,
        )
      )
        continue;
      if (
        l.kind === "commission" &&
        this.lines.some(
          (x) => x.kind === "commission" && x.stripe_invoice_id === l.stripe_invoice_id,
        )
      )
        continue;
      if (
        l.kind === "launch_bonus" &&
        this.lines.some((x) => x.kind === "launch_bonus" && x.referral_id === l.referral_id)
      )
        continue;
      this.lines.push({ ...(l as any), id: `L${++this.n}` });
      added++;
    }
    return added;
  }
  async linesForCharge(id: string) {
    return this.lines.filter((l) => l.stripe_charge_id === id);
  }
  async linesForReferral(id: string) {
    return this.lines.filter((l) => l.referral_id === id);
  }
  async setLineState(ids: string[], state: LedgerLine["state"]) {
    for (const l of this.lines) if (ids.includes(l.id)) l.state = state;
  }
  async insertClawbacks(partnerId: string, rows: any[], eventId: string) {
    for (const r of rows)
      if (!this.clawbacks.some((c) => c.ledger_id === r.ledger_id && c.source_event_id === eventId))
        this.clawbacks.push({ partner_id: partnerId, source_event_id: eventId, ...r });
  }
  async setBonusClaim(referralId: string, status: string) {
    this.claims[referralId] = status;
  }
  async addHostCard(_h: string, fp: string) {
    this.cards.push(fp);
  }
  async recheck() {}
  async checkDisputeRate() {}
  async flag(
    referralId: string | null,
    partnerId: string,
    kind: string,
    details: Record<string, unknown>,
  ) {
    this.flags.push({ referralId, partnerId, kind, details });
  }
  async updatePartner(id: string, patch: Record<string, unknown>) {
    Object.assign(
      this.partners.find((p) => p.id === id)!,
      patch,
    );
  }
  async payoutTransferReversed() {
    return false;
  }
  async log(e: any) {
    this.logs.push(e);
  }
}

function setup() {
  const s = new Mem();
  s.partners.push({
    id: "p",
    terminated_at: null,
    termination_for_breach: false,
    stripe_account_id: "acct_partner",
  });
  s.referrals.push({
    id: "r",
    host_id: "h",
    partner_id: "p",
    status: "approved",
    sign_up_at: "2026-10-02T10:00:00Z",
    paid_months_used: 0,
    terms_snapshot: SNAP,
    bonus_status: "pending",
    qp_refunded_pence: 0,
  } as Referral);
  return s;
}

let evN = 0;
function invoicePaid(
  month: string,
  over: { id?: string; interval?: string; amount?: number; charge?: string; host?: string } = {},
) {
  const start = `${month}-01T00:00:00Z`;
  const d = new Date(start);
  const end = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + (over.interval === "year" ? 12 : 1), 1),
  ).toISOString();
  const amount = over.amount ?? 2900;
  return {
    id: `evt_${++evN}`,
    type: "invoice.paid",
    livemode: false,
    data: {
      object: {
        id: over.id ?? `in_${month}`,
        status: "paid",
        amount_paid: amount,
        total: amount,
        total_excluding_tax: amount,
        billing_reason: "subscription_cycle",
        charge: over.charge ?? `ch_${month}`,
        subscription_details: { metadata: { host_id: over.host ?? "h" } },
        status_transitions: { paid_at: sec(start) },
        lines: {
          data: [
            {
              period: { start: sec(start), end: sec(end) },
              price: { recurring: { interval: over.interval ?? "month", interval_count: 1 } },
            },
          ],
        },
      },
    },
  };
}
const charge = (s: Mem, id: string, over: Record<string, unknown> = {}) => {
  s.charges[id] = {
    id,
    status: "succeeded",
    amount: 2900,
    amount_refunded: 0,
    created: sec("2026-11-01T00:00:00Z"),
    payment_method_details: { card: { fingerprint: "fp1" } },
    ...over,
  };
};
const ev = (
  type: string,
  object: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) => ({ id: `evt_${++evN}`, type, livemode: false, data: { object }, ...extra });

describe("partner webhook", () => {
  it("processes the same event once, even delivered twice at the same time", async () => {
    const s = setup();
    charge(s, "ch_2026-11");
    const e = invoicePaid("2026-11");
    const [a, b] = await Promise.all([processPartnerEvent(e, s), processPartnerEvent(e, s)]);
    expect([a, b].sort()).toEqual(["busy", "handled"]);
    expect(await processPartnerEvent(e, s)).toBe("handled");
    expect(s.lines.filter((l) => l.kind === "commission")).toHaveLength(1);
    expect(s.referrals[0]!.paid_months_used).toBe(1);
  });

  it("can't double count even with a new event id for the same invoice", async () => {
    const s = setup();
    charge(s, "ch_2026-11");
    await processPartnerEvent(invoicePaid("2026-11"), s);
    await processPartnerEvent(invoicePaid("2026-11"), s);
    expect(s.lines.filter((l) => l.kind === "commission")).toHaveLength(1);
    expect(s.referrals[0]!.paid_months_used).toBe(1);
  });

  it("records the Qualifying Payment, 10% held for 45 days, and the card for checks", async () => {
    const s = setup();
    charge(s, "ch_2026-11");
    expect(await processPartnerEvent(invoicePaid("2026-11"), s)).toBe("handled");
    const r = s.referrals[0]!;
    expect(r).toMatchObject({
      qualifying_invoice_id: "in_2026-11",
      qualifying_charge_id: "ch_2026-11",
      qualifying_payment_at: "2026-11-01T00:00:00.000Z",
      first_paid_month_end: "2026-12-01T00:00:00.000Z",
      status_detail: "paying",
    });
    expect(s.lines[0]).toMatchObject({
      kind: "commission",
      amount_pence: 290,
      state: "held",
      payable_after: "2026-12-16T00:00:00.000Z",
      paid_month_from: 1,
    });
    expect(s.cards).toEqual(["fp1"]);
  });

  it("leaves businesses without a Commission Partner to the rest of the webhook", async () => {
    const s = setup();
    expect(await processPartnerEvent(invoicePaid("2026-11", { host: "someone-else" }), s)).toBe(
      "not_ours",
    );
    // Host Connect events and host account updates pass through untouched.
    expect(
      await processPartnerEvent(ev("charge.refunded", { id: "ch_x" }, { account: "acct_host" }), s),
    ).toBe("not_ours");
    expect(
      await processPartnerEvent(
        ev("account.updated", { id: "acct_host", charges_enabled: true }, { account: "acct_host" }),
        s,
      ),
    ).toBe("not_ours");
    expect(await processPartnerEvent(ev("checkout.session.completed", { id: "cs_1" }), s)).toBe(
      "not_ours",
    );
    expect(s.lines).toHaveLength(0);
  });

  it("ignores live events in test mode", async () => {
    const s = setup();
    charge(s, "ch_2026-11");
    expect(await processPartnerEvent({ ...invoicePaid("2026-11"), livemode: true }, s)).toBe(
      "not_ours",
    );
    expect(s.lines).toHaveLength(0);
  });

  it("updates a partner's Stripe Account", async () => {
    const s = setup();
    expect(
      await processPartnerEvent(
        ev(
          "account.updated",
          {
            id: "acct_partner",
            payouts_enabled: true,
            capabilities: { transfers: "active" },
            requirements: { currently_due: [] },
          },
          { account: "acct_partner" },
        ),
        s,
      ),
    ).toBe("handled");
    expect(s.partners[0]).toMatchObject({ payouts_enabled: true });
  });

  it("pauses on a failed payment and carries on numbering when paying again", async () => {
    const s = setup();
    for (const m of ["2026-11", "2026-12"]) charge(s, `ch_${m}`);
    await processPartnerEvent(invoicePaid("2026-11"), s);
    await processPartnerEvent(invoicePaid("2026-12"), s);
    await processPartnerEvent(
      ev("invoice.payment_failed", {
        id: "in_fail",
        subscription_details: { metadata: { host_id: "h" } },
      }),
      s,
    );
    expect(s.referrals[0]!.status_detail).toBe("paused");
    charge(s, "ch_2027-03");
    await processPartnerEvent(invoicePaid("2027-03"), s);
    expect(s.lines.filter((l) => l.kind === "commission").map((l) => l.paid_month_to)).toEqual([
      1, 2, 3,
    ]);
    expect(s.referrals[0]!.status_detail).toBe("paying");
  });

  it("claws back a refund: partial in proportion, full uncounts the month, and the bonus only for the Qualifying Payment", async () => {
    const s = setup();
    charge(s, "ch_2026-11");
    charge(s, "ch_2026-12");
    await processPartnerEvent(invoicePaid("2026-11"), s);
    await processPartnerEvent(invoicePaid("2026-12"), s);
    s.lines.push({
      id: "B",
      partner_id: "p",
      referral_id: "r",
      kind: "launch_bonus",
      state: "held",
      amount_pence: 5000,
      payable_after: null,
    } as any);
    // Half of month 2 refunded: 14.5p... 145p of commission back, month still counts, bonus untouched.
    await processPartnerEvent(
      ev("charge.refunded", {
        id: "ch_2026-12",
        amount: 2900,
        amount_refunded: 1450,
        refunded: false,
      }),
      s,
    );
    expect(s.lines.find((l) => l.kind === "clawback")).toMatchObject({ amount_pence: -145 });
    expect(s.referrals[0]!.paid_months_used).toBe(2);
    expect(s.lines.find((l) => l.id === "B")!.state).toBe("held");
    // The same refund again (Stripe's running total) changes nothing.
    await processPartnerEvent(
      ev("charge.refunded", {
        id: "ch_2026-12",
        amount: 2900,
        amount_refunded: 1450,
        refunded: false,
      }),
      s,
    );
    expect(s.lines.filter((l) => l.kind === "clawback")).toHaveLength(1);
    // The Qualifying Payment fully refunded: its commission and the bonus go, and the month stops counting.
    await processPartnerEvent(
      ev("charge.refunded", {
        id: "ch_2026-11",
        amount: 2900,
        amount_refunded: 2900,
        refunded: true,
      }),
      s,
    );
    expect(s.lines.find((l) => l.stripe_invoice_id === "in_2026-11")!.state).toBe("void");
    expect(s.lines.find((l) => l.id === "B")!.state).toBe("void");
    expect(s.referrals[0]).toMatchObject({
      paid_months_used: 1,
      bonus_status: "reversed",
      qp_refunded_pence: 2900,
    });
    expect(s.claims["r"]).toBe("reversed");
  });

  it("handles a refund that arrives before the invoice.paid event", async () => {
    const s = setup();
    charge(s, "ch_2026-11", { amount_refunded: 1450 });
    expect(
      await processPartnerEvent(
        ev("charge.refunded", { id: "ch_2026-11", amount: 2900, amount_refunded: 1450 }),
        s,
      ),
    ).toBe("not_ours");
    await processPartnerEvent(invoicePaid("2026-11"), s);
    const total = s.lines.filter((l) => l.state !== "void").reduce((n, l) => n + l.amount_pence, 0);
    expect(total).toBe(145);
  });

  it("holds a disputed payment's commission and the bonus; won releases, lost claws back", async () => {
    const s = setup();
    charge(s, "ch_2026-11");
    charge(s, "ch_2026-12");
    await processPartnerEvent(invoicePaid("2026-11"), s);
    await processPartnerEvent(invoicePaid("2026-12"), s);
    await processPartnerEvent(
      ev("charge.dispute.created", {
        id: "dp_1",
        charge: "ch_2026-12",
        amount: 2900,
        status: "needs_response",
      }),
      s,
    );
    expect(s.lines.find((l) => l.stripe_invoice_id === "in_2026-12")!.state).toBe("on_hold");
    await processPartnerEvent(
      ev("charge.dispute.closed", {
        id: "dp_1",
        charge: "ch_2026-12",
        amount: 2900,
        status: "won",
      }),
      s,
    );
    expect(s.lines.find((l) => l.stripe_invoice_id === "in_2026-12")!.state).toBe("held");
    expect(s.lines.some((l) => l.kind === "dispute_release")).toBe(true);
    await processPartnerEvent(
      ev("charge.dispute.created", {
        id: "dp_2",
        charge: "ch_2026-11",
        amount: 2900,
        status: "needs_response",
      }),
      s,
    );
    expect(s.referrals[0]!.qp_dispute).toBe("open");
    await processPartnerEvent(
      ev("charge.dispute.closed", {
        id: "dp_2",
        charge: "ch_2026-11",
        amount: 2900,
        status: "lost",
      }),
      s,
    );
    expect(s.lines.find((l) => l.stripe_invoice_id === "in_2026-11")!.state).toBe("void");
    expect(s.referrals[0]).toMatchObject({ qp_dispute: "lost", paid_months_used: 1 });
  });

  it("holds a payment whose dispute arrived before the payment was recorded (10.4)", async () => {
    const s = setup();
    charge(s, "ch_2026-11");
    const early = await processPartnerEvent(
      ev("charge.dispute.created", { id: "dp_e", charge: "ch_2026-11", amount: 2900, status: "needs_response" }),
      s,
    );
    expect(early).toBe("not_ours");
    expect(s.pending["ch_2026-11"]).toMatchObject({ status: "open" });
    await processPartnerEvent(invoicePaid("2026-11"), s);
    expect(s.lines.find((l) => l.stripe_invoice_id === "in_2026-11")!.state).toBe("on_hold");
    expect(s.referrals[0]!.qp_dispute).toBe("open");
  });

  it("claws back a payment whose dispute was lost before the payment was recorded", async () => {
    const s = setup();
    charge(s, "ch_2026-11");
    await processPartnerEvent(ev("charge.dispute.created", { id: "dp_l", charge: "ch_2026-11", amount: 2900, status: "needs_response" }), s);
    await processPartnerEvent(ev("charge.dispute.closed", { id: "dp_l", charge: "ch_2026-11", amount: 2900, status: "lost" }), s);
    await processPartnerEvent(invoicePaid("2026-11"), s);
    expect(s.lines.find((l) => l.stripe_invoice_id === "in_2026-11")!.state).toBe("void");
    expect(s.referrals[0]!.qp_dispute).toBe("lost");
  });

  it("ignores a dispute won before the payment was recorded", async () => {
    const s = setup();
    charge(s, "ch_2026-11");
    await processPartnerEvent(ev("charge.dispute.closed", { id: "dp_w", charge: "ch_2026-11", amount: 2900, status: "won" }), s);
    await processPartnerEvent(invoicePaid("2026-11"), s);
    expect(s.lines.find((l) => l.stripe_invoice_id === "in_2026-11")!.state).not.toBe("on_hold");
  });

  it("counts an annual payment as 12 Paid Months in one line", async () => {
    const s = setup();
    charge(s, "ch_y", { amount: 6600 });
    await processPartnerEvent(
      invoicePaid("2026-11", { id: "in_y", interval: "year", amount: 6600, charge: "ch_y" }),
      s,
    );
    expect(s.lines[0]).toMatchObject({
      months_covered: 12,
      paid_month_from: 1,
      paid_month_to: 12,
      amount_pence: 660,
    });
    expect(s.referrals[0]).toMatchObject({
      paid_months_used: 12,
      status_detail: "cap_reached",
      billing_interval: "year",
      first_paid_month_end: "2026-12-01T00:00:00.000Z",
    });
    charge(s, "ch_2027-11");
    await processPartnerEvent(invoicePaid("2027-11"), s);
    expect(s.lines.filter((l) => l.kind === "commission")).toHaveLength(1);
  });

  it("waits for a processing payment before it becomes the Qualifying Payment", async () => {
    const s = setup();
    charge(s, "ch_2026-11", { status: "pending" });
    const e = invoicePaid("2026-11");
    s.invoices["in_2026-11"] = e.data.object;
    await processPartnerEvent(e, s);
    expect(s.referrals[0]!.qualifying_invoice_id).toBeUndefined();
    expect(s.lines[0]).toMatchObject({ state: "on_hold", note: "payment_processing" });
    await processPartnerEvent(
      ev("charge.succeeded", { ...s.charges["ch_2026-11"], status: "succeeded" }),
      s,
    );
    expect(s.lines[0]!.state).toBe("held");
    expect(s.referrals[0]!.qualifying_invoice_id).toBe("in_2026-11");
  });

  it("retries an event whose first attempt failed", async () => {
    const s = setup();
    charge(s, "ch_2026-11");
    const e = invoicePaid("2026-11");
    const broken = s.updateReferral.bind(s);
    s.updateReferral = async () => {
      throw new Error("database down");
    };
    await expect(processPartnerEvent(e, s)).rejects.toThrow("database down");
    s.updateReferral = broken;
    expect(await processPartnerEvent(e, s)).toBe("handled");
    expect(s.lines.filter((l) => l.kind === "commission")).toHaveLength(1);
    expect(s.referrals[0]!.paid_months_used).toBe(1);
    // And once counted, a further replay doesn't count it again.
    await processPartnerEvent(invoicePaid("2026-11"), s);
    expect(s.referrals[0]!.paid_months_used).toBe(1);
  });

  it("takes a refund off again when the first attempt failed half way", async () => {
    const s = setup();
    charge(s, "ch_2026-11");
    await processPartnerEvent(invoicePaid("2026-11"), s);
    const e = ev("charge.refunded", {
      id: "ch_2026-11",
      amount: 2900,
      amount_refunded: 1450,
      refunded: false,
    });
    const ok = s.insertClawbacks.bind(s);
    s.insertClawbacks = async () => {
      throw new Error("timeout");
    };
    await expect(processPartnerEvent(e, s)).rejects.toThrow("timeout");
    s.insertClawbacks = ok;
    await processPartnerEvent(e, s);
    expect(s.lines.filter((l) => l.kind === "clawback").map((l) => l.amount_pence)).toEqual([-145]);
  });
});
