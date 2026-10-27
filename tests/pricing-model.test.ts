import { describe, expect, it } from "vitest";

import {
  DEFAULT_COSTS,
  DEFAULT_MODEL,
  DEFAULT_PROJECTION,
  apiAllowance,
  calibrate,
  creditPence,
  fixedCost,
  friendly,
  monthlyPrice,
  planFor,
  priceForCost,
  project,
  recommend,
  recommendApiAddon,
  variableCost,
} from "../src/lib/pricing-model";
import { DEFAULT_PRICING, monthlyPence } from "../src/lib/pricing";

const typical = {
  start: { rooms: 2, apiRequests: 0 },
  grow: { rooms: 6, apiRequests: 0 },
  pro: { rooms: 18, apiRequests: 3000 },
};

describe("costs", () => {
  it("prices a Lovable credit at about 24p", () => {
    expect(creditPence(DEFAULT_COSTS)).toBeCloseTo(23.7, 1);
  });
  it("covers cost, Stripe and a 10% margin", () => {
    const price = priceForCost(1000, DEFAULT_COSTS);
    const afterStripe = price * (1 - DEFAULT_COSTS.stripePct) - DEFAULT_COSTS.stripeFixedPence;
    expect(afterStripe).toBeGreaterThanOrEqual(1100);
    expect(afterStripe).toBeLessThan(1102);
  });
  it("rounds to friendly amounts", () => {
    expect(friendly(431)).toBe(450);
    expect(friendly(1234)).toBe(1300);
  });
});

describe("plans", () => {
  it("charges each plan's base plus extra rooms and the API add-on", () => {
    const grow = planFor(DEFAULT_MODEL, "grow");
    expect(monthlyPrice(DEFAULT_MODEL, grow, { rooms: 7, properties: 2, apiAddon: true })).toBe(
      450 + 2 * 50 + 200,
    );
    const pro = planFor(DEFAULT_MODEL, "pro");
    expect(monthlyPrice(DEFAULT_MODEL, pro, { rooms: 10, properties: 3, apiAddon: true })).toBe(
      750,
    );
    expect(apiAllowance(DEFAULT_MODEL, grow, false)).toBe(0);
    expect(apiAllowance(DEFAULT_MODEL, grow, true)).toBe(10_000);
    expect(apiAllowance(DEFAULT_MODEL, pro, false)).toBe(25_000);
  });
  it("falls back to the recommended plan for an unknown key", () => {
    expect(planFor(DEFAULT_MODEL, "nope").key).toBe("grow");
  });
});

describe("recommendations", () => {
  it("never recommends a price below break-even, and each tier costs more than the last", () => {
    const recs = recommend(DEFAULT_MODEL, DEFAULT_COSTS, 20, typical);
    for (const r of recs)
      expect(r.recommendedBasePence).toBeGreaterThanOrEqual(r.breakEvenBasePence);
    expect(recs[1]!.recommendedBasePence).toBeGreaterThan(recs[0]!.recommendedBasePence);
    expect(recs[2]!.recommendedBasePence).toBeGreaterThan(recs[1]!.recommendedBasePence);
  });
  it("prices the API add-on to cover its requests", () => {
    const price = recommendApiAddon(DEFAULT_MODEL, DEFAULT_COSTS);
    const cost = variableCost(DEFAULT_COSTS, { rooms: 0, apiRequests: 10_000, aiReads: 0 });
    expect(
      price * (1 - DEFAULT_COSTS.stripePct) - DEFAULT_COSTS.stripeFixedPence,
    ).toBeGreaterThanOrEqual(cost * 1.1);
  });
});

describe("the default plans", () => {
  it("earn at least 10% over cost from month 6 with the default uptake", () => {
    const rows = project(DEFAULT_MODEL, DEFAULT_COSTS, DEFAULT_PROJECTION);
    for (const r of rows.slice(5)) expect(r.marginPct).toBeGreaterThanOrEqual(10);
  });
});

describe("the old 'pennies' pricing", () => {
  it("doesn't cover costs at small scale (why the plans changed)", () => {
    const perHost = monthlyPence(DEFAULT_PRICING, [3]);
    const twenty = 20 * perHost;
    const cost =
      fixedCost(DEFAULT_COSTS) +
      20 * variableCost(DEFAULT_COSTS, { rooms: 3, apiRequests: 0, aiReads: 20 });
    expect(
      twenty * (1 - DEFAULT_COSTS.stripePct) - 20 * DEFAULT_COSTS.stripeFixedPence,
    ).toBeLessThan(cost);
  });
});

describe("calibrate", () => {
  it("learns credits per AI read and per room from a month of real use", () => {
    const c = calibrate(DEFAULT_COSTS, {
      totalCredits: 100,
      aiCredits: 6,
      roomMonths: 100,
      aiReads: 300,
      apiRequests: 0,
    });
    expect(c.creditsPerAiRead).toBe(0.02);
    expect(c.creditsPerRoom).toBe(0.54);
  });
});

describe("tracking the projection against what happened", () => {
  it("counts projection months from the day it started", async () => {
    const { monthIndex } = await import("../src/lib/pricing-model");
    expect(monthIndex(undefined, "2026-10-14")).toBe(1);
    expect(monthIndex("2026-10-14", "2026-10-31")).toBe(1);
    expect(monthIndex("2026-10-14", "2026-11-14")).toBe(2);
    expect(monthIndex("2026-10-14", "2026-11-13")).toBe(1);
    expect(monthIndex("2026-10-14", "2027-10-14")).toBe(13);
  });

  it("re-bases on today's hosts and rooms but keeps growth assumptions", async () => {
    const { rebase } = await import("../src/lib/pricing-model");
    const p = rebase(
      DEFAULT_PROJECTION,
      {
        byPlan: { start: { hosts: 4, rooms: 10 }, grow: { hosts: 0, rooms: 0 } },
        apiAttachPct: 12.4,
      },
      "2026-10-14",
    );
    expect(p.start.start).toBe(4);
    expect(p.start.grow).toBe(0);
    expect(p.rooms.start).toBe(2.5);
    expect(p.rooms.grow).toBe(DEFAULT_PROJECTION.rooms.grow);
    expect(p.newPerMonth).toEqual(DEFAULT_PROJECTION.newPerMonth);
    expect(p.apiAttachPct).toBe(12);
    expect(p.startedOn).toBe("2026-10-14");
  });

  it("keeps one history row per month, newest last", async () => {
    const { recordHistory } = await import("../src/lib/pricing-model");
    let p = recordHistory(DEFAULT_PROJECTION, {
      month: "2026-11",
      hosts: 9,
      revenuePence: 5000,
      costPence: 4000,
    });
    p = recordHistory(p, { month: "2026-10", hosts: 8, revenuePence: 4000, costPence: 3900 });
    p = recordHistory(p, { month: "2026-11", hosts: 10, revenuePence: 5500, costPence: 4100 });
    expect(p.history?.map((h) => [h.month, h.hosts])).toEqual([
      ["2026-10", 8],
      ["2026-11", 10],
    ]);
  });

  it("costs a real month from credits, fixed costs and Stripe", async () => {
    const { actualCost } = await import("../src/lib/pricing-model");
    const c = DEFAULT_COSTS;
    expect(actualCost(c, 100, 10_000, 10)).toBe(
      Math.round(
        c.fixedPence + 100 * creditPence(c) + 10_000 * c.stripePct + 10 * c.stripeFixedPence,
      ),
    );
  });

  it("cleans up a stored projection", async () => {
    const { normaliseProjection } = await import("../src/lib/pricing-model");
    const p = normaliseProjection({
      churnPct: 400,
      start: { start: -3, grow: "x" },
      startedOn: "nope",
    });
    expect(p.churnPct).toBe(100);
    expect(p.start).toEqual({ start: 0, grow: 0 });
    expect(p.startedOn).toBeUndefined();
    expect(p.history).toEqual([]);
  });
});

describe("today's numbers", () => {
  it("counts payers, trials and revenue by plan, skipping the demo", async () => {
    const { summariseHosts } = await import("../src/lib/pricing-model");
    const s = summariseHosts(DEFAULT_MODEL, [
      {
        planKey: "start",
        apiAddon: true,
        status: "active",
        rooms: 3,
        properties: 1,
        isDemo: false,
      },
      {
        planKey: "grow",
        apiAddon: false,
        status: "past_due",
        rooms: 6,
        properties: 2,
        isDemo: false,
      },
      {
        planKey: "grow",
        apiAddon: false,
        status: "trialing",
        rooms: 4,
        properties: 1,
        isDemo: false,
      },
      {
        planKey: "pro",
        apiAddon: false,
        status: "comped",
        rooms: 10,
        properties: 1,
        isDemo: false,
      },
      {
        planKey: "grow",
        apiAddon: false,
        status: "active",
        rooms: 50,
        properties: 1,
        isDemo: true,
      },
      {
        planKey: "grow",
        apiAddon: false,
        status: "canceled",
        rooms: 5,
        properties: 1,
        isDemo: false,
      },
    ]);
    expect(s.payers).toBe(2);
    expect(s.trials).toBe(1);
    expect(s.comped).toBe(1);
    expect(s.activeRooms).toBe(3 + 6 + 4 + 10);
    expect(s.byPlan.start!.revenuePence).toBe(300 + 50 + 200);
    expect(s.byPlan.grow!.revenuePence).toBe(450 + 50);
    expect(s.revenuePence).toBe(550 + 500);
    expect(s.state.byPlan.grow).toEqual({ hosts: 1, rooms: 6 });
    expect(s.state.apiAttachPct).toBe(50);
  });
});

describe("break-even host count", () => {
  it("finds where profit turns positive and where it reaches the margin", async () => {
    const { breakEvenHosts } = await import("../src/lib/pricing-model");
    const r = breakEvenHosts(DEFAULT_MODEL, DEFAULT_COSTS, DEFAULT_PROJECTION)!;
    expect(r.breakEven).toBeGreaterThan(0);
    expect(r.withMargin).toBeGreaterThanOrEqual(r.breakEven);
    // A steady state of exactly that many hosts makes at least the margin.
    const mix = DEFAULT_PROJECTION;
    const total = Object.keys(mix.start).reduce(
      (n, k) => n + mix.start[k]! + mix.newPerMonth[k]!,
      0,
    );
    const scale = r.withMargin / total;
    const steady = {
      ...mix,
      start: Object.fromEntries(
        Object.keys(mix.start).map((k) => [k, (mix.start[k]! + mix.newPerMonth[k]!) * scale]),
      ),
      newPerMonth: {},
      churnPct: 0,
    };
    const [m1] = project(DEFAULT_MODEL, DEFAULT_COSTS, steady, 1);
    expect(m1!.marginPct).toBeGreaterThanOrEqual(9.9);
  });

  it("says no when every host loses money", async () => {
    const { breakEvenHosts } = await import("../src/lib/pricing-model");
    const free = {
      ...DEFAULT_MODEL,
      plans: DEFAULT_MODEL.plans.map((p) => ({ ...p, basePence: 0, extraRoomPence: 0 })),
      apiAddon: { pricePence: 0, includedRequests: 0 },
    };
    expect(breakEvenHosts(free, DEFAULT_COSTS, DEFAULT_PROJECTION)).toBeNull();
  });
});
