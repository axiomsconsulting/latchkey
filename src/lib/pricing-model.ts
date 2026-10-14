/**
 * Latchkey's pricing studio: plans and features, what each host costs to
 * run (in Lovable Run credits, Stripe fees and fixed costs), break-even
 * prices with a target margin, projections and calibration against actual
 * use. Pure, so it can be unit tested; the super admin edits the inputs.
 */

/* --------------------------------- plans --------------------------------- */

export const FEATURES = {
  check_in: "Guest self check-in (kiosk, QR, PIN)",
  guest_guide: "Guest guides and messages",
  calendar_sync: "Calendar sync with every booking site",
  extras: "Extras and card payments to your own Stripe",
  id_check: "AI photo ID reading",
  guest_register: "UK guest register",
  invoices: "Invoices for direct stays",
  team: "Team members and roles",
  branding: "Your own look and short link",
  api: "API and MCP server (connect AI assistants and other apps)",
  priority_support: "Priority support",
} as const;
export type FeatureKey = keyof typeof FEATURES;

export type Plan = {
  key: string;
  name: string;
  tagline: string;
  /** Monthly price including the rooms below, in pence. */
  basePence: number;
  includedRooms: number;
  extraRoomPence: number;
  /** null = no limit. */
  maxProperties: number | null;
  features: FeatureKey[];
  /** Monthly API + MCP requests included (0 = only with the add-on). */
  apiRequests: number;
  /** Fair-use AI ID reads a month, used for costing. */
  aiReads: number;
  /** The plan most people should pick; shown as recommended. */
  highlight: boolean;
};

export type PricingModel = {
  currency: string;
  trialDays: number;
  plans: Plan[];
  /** For plans without API included. */
  apiAddon: { pricePence: number; includedRequests: number };
};

/**
 * Three tiers, Economist style: the middle one is the obvious choice and the
 * top one makes it look good value. Pay as you grow: every plan includes a
 * couple of rooms, then each extra room adds a little. Prices are set from
 * the cost model's break-even plus margin, rounded to friendly amounts:
 * these break even at about 9 paying hosts and make 10% from about 12.
 */
export const DEFAULT_MODEL: PricingModel = {
  currency: "GBP",
  trialDays: 30,
  plans: [
    {
      key: "start",
      name: "Start",
      tagline: "One property, getting going",
      basePence: 300,
      includedRooms: 2,
      extraRoomPence: 50,
      maxProperties: 1,
      features: ["check_in", "guest_guide", "calendar_sync", "extras", "guest_register", "invoices"],
      apiRequests: 0,
      aiReads: 20,
      highlight: false,
    },
    {
      key: "grow",
      name: "Grow",
      tagline: "Most hosts: a few properties and a team",
      basePence: 450,
      includedRooms: 5,
      extraRoomPence: 50,
      maxProperties: 5,
      features: ["check_in", "guest_guide", "calendar_sync", "extras", "id_check", "guest_register", "invoices", "team", "branding"],
      apiRequests: 0,
      aiReads: 80,
      highlight: true,
    },
    {
      key: "pro",
      name: "Pro",
      tagline: "Larger portfolios and integrations",
      basePence: 750,
      includedRooms: 15,
      extraRoomPence: 50,
      maxProperties: null,
      features: Object.keys(FEATURES) as FeatureKey[],
      apiRequests: 25_000,
      aiReads: 300,
      highlight: false,
    },
  ],
  apiAddon: { pricePence: 200, includedRequests: 10_000 },
};

/* ------------------------------ cost model ------------------------------- */

export type CostModel = {
  /** What one Lovable Run credit costs (Pro top-up rate). */
  usdPerCredit: number;
  gbpPerUsd: number;
  /** Lovable plan, domain, email and other fixed monthly costs, in pence. */
  fixedPence: number;
  /** Baseline Run credits a month regardless of hosts (database server, jobs, demo). */
  fixedCredits: number;
  /** Run credits a month per active room (calendar syncs, storage, guest pages). */
  creditsPerRoom: number;
  creditsPer1kApi: number;
  creditsPerAiRead: number;
  /** Stripe card + Billing fee, as a fraction, and the fixed fee per payment in pence. */
  stripePct: number;
  stripeFixedPence: number;
  /** Profit on top of cost, as a fraction. */
  margin: number;
};

/**
 * Starting estimates, to be replaced by calibrate() once a month of real
 * use is in. Lovable publishes no per-unit rates, so these come from the
 * credit price ($0.30 on Pro top-ups) and typical model costs.
 */
export const DEFAULT_COSTS: CostModel = {
  usdPerCredit: 0.3,
  gbpPerUsd: 0.79,
  fixedPence: 2000,
  fixedCredits: 40,
  creditsPerRoom: 0.5,
  creditsPer1kApi: 0.5,
  creditsPerAiRead: 0.03,
  stripePct: 0.022,
  stripeFixedPence: 20,
  margin: 0.1,
};

export function creditPence(c: CostModel): number {
  return c.usdPerCredit * c.gbpPerUsd * 100;
}

/* -------------------------------- prices --------------------------------- */

export type HostSize = { rooms: number; properties: number; apiAddon: boolean };

export function planFor(model: PricingModel, key: string | null | undefined): Plan {
  return model.plans.find((p) => p.key === key) ?? model.plans.find((p) => p.highlight) ?? model.plans[0]!;
}

/** Whether a host on this plan can use the API and MCP server. */
export function apiAllowed(plan: Plan, apiAddon: boolean): boolean {
  return plan.apiRequests > 0 || apiAddon;
}

/** Monthly API + MCP requests a host may make. */
export function apiAllowance(model: PricingModel, plan: Plan, apiAddon: boolean): number {
  return plan.apiRequests > 0 ? plan.apiRequests : apiAddon ? model.apiAddon.includedRequests : 0;
}

export function monthlyPrice(model: PricingModel, plan: Plan, size: HostSize): number {
  const extraRooms = Math.max(0, Math.round(size.rooms) - plan.includedRooms);
  const addon = size.apiAddon && plan.apiRequests === 0 ? model.apiAddon.pricePence : 0;
  return plan.basePence + extraRooms * plan.extraRoomPence + addon;
}

/** What one host costs a month to run, in pence, before fixed costs. */
export function variableCost(c: CostModel, use: { rooms: number; apiRequests: number; aiReads: number }): number {
  const credits = use.rooms * c.creditsPerRoom + (use.apiRequests / 1000) * c.creditsPer1kApi + use.aiReads * c.creditsPerAiRead;
  return credits * creditPence(c);
}

export function fixedCost(c: CostModel): number {
  return c.fixedPence + c.fixedCredits * creditPence(c);
}

/** The price that covers a cost, Stripe's cut and the margin. */
export function priceForCost(costPence: number, c: CostModel): number {
  return Math.ceil((costPence * (1 + c.margin) + c.stripeFixedPence) / (1 - c.stripePct));
}

/** Friendly amounts: whole pounds above £10, 50p steps below. */
export function friendly(pence: number): number {
  if (pence <= 0) return 0;
  return pence >= 1000 ? Math.ceil(pence / 100) * 100 : Math.ceil(pence / 50) * 50;
}

export type Recommendation = {
  key: string;
  breakEvenBasePence: number;
  recommendedBasePence: number;
  recommendedExtraRoomPence: number;
  typicalRooms: number;
};

/**
 * Break-even plus margin for a typical host on each plan, sharing fixed
 * costs across the paying hosts expected. Higher tiers are then nudged so
 * each step up is clearly worth it, with the highlighted plan as best value.
 */
export function recommend(
  model: PricingModel,
  c: CostModel,
  expectedHosts: number,
  typical: Record<string, { rooms: number; apiRequests: number }>,
): Recommendation[] {
  const fixedShare = fixedCost(c) / Math.max(1, expectedHosts);
  const roomPrice = friendly(priceForCost(c.creditsPerRoom * creditPence(c), c) - c.stripeFixedPence / (1 - c.stripePct));
  let floor = 0;
  return model.plans.map((plan) => {
    const t = typical[plan.key] ?? { rooms: plan.includedRooms, apiRequests: plan.apiRequests };
    const cost = fixedShare + variableCost(c, { rooms: plan.includedRooms, apiRequests: plan.apiRequests ? t.apiRequests : 0, aiReads: plan.aiReads });
    const breakEven = priceForCost(cost, c);
    const recommended = Math.max(friendly(breakEven), floor);
    // The next tier always costs at least a little more than this one.
    floor = friendly(recommended * 1.5);
    return {
      key: plan.key,
      breakEvenBasePence: breakEven,
      recommendedBasePence: recommended,
      recommendedExtraRoomPence: Math.max(roomPrice, 50),
      typicalRooms: t.rooms,
    };
  });
}

/** API add-on price: break-even plus margin for its included requests. */
export function recommendApiAddon(model: PricingModel, c: CostModel): number {
  return friendly(priceForCost(variableCost(c, { rooms: 0, apiRequests: model.apiAddon.includedRequests, aiReads: 0 }), c));
}

/**
 * Paying hosts needed to cover fixed costs, and to make the target margin,
 * with the plan mix, rooms and add-on take-up from the projection. null
 * when each host costs more than it pays (no number of hosts helps).
 */
export function breakEvenHosts(model: PricingModel, c: CostModel, p: Projection): { breakEven: number; withMargin: number; perHostPence: number } | null {
  const total = model.plans.reduce((n, plan) => n + Math.max(0, p.start[plan.key] ?? 0) + Math.max(0, p.newPerMonth[plan.key] ?? 0), 0);
  let revenue = 0;
  let net = 0;
  for (const plan of model.plans) {
    const share = total > 0 ? (Math.max(0, p.start[plan.key] ?? 0) + Math.max(0, p.newPerMonth[plan.key] ?? 0)) / total : plan.highlight ? 1 : 0;
    if (!share) continue;
    const rooms = p.rooms[plan.key] ?? plan.includedRooms;
    const api = plan.apiRequests > 0 ? 1 : p.apiAttachPct / 100;
    const gross = monthlyPrice(model, plan, { rooms, properties: 1, apiAddon: false }) + (plan.apiRequests > 0 ? 0 : api * model.apiAddon.pricePence);
    const cost = variableCost(c, { rooms, apiRequests: api * p.apiRequests, aiReads: plan.aiReads }) + gross * c.stripePct + c.stripeFixedPence;
    revenue += share * gross;
    net += share * (gross - cost);
  }
  const fixed = fixedCost(c);
  if (net <= 0) return null;
  const withMarginNet = net - c.margin * revenue;
  return {
    breakEven: Math.ceil(fixed / net),
    withMargin: withMarginNet > 0 ? Math.ceil(fixed / withMarginNet) : Infinity,
    perHostPence: Math.round(revenue),
  };
}

/* ------------------------------ projections ------------------------------ */

export type Projection = {
  /** Paying hosts at the start, by plan. */
  start: Record<string, number>;
  /** New paying hosts a month, by plan. */
  newPerMonth: Record<string, number>;
  churnPct: number;
  apiAttachPct: number;
  /** Typical rooms per host, by plan. */
  rooms: Record<string, number>;
  /** Typical monthly API requests for hosts using it. */
  apiRequests: number;
  /** The day month 1 starts (YYYY-MM-DD); set when the projection is re-based. */
  startedOn?: string | undefined;
  /** What actually happened, one entry per month, recorded on calibration. */
  history?: HistoryRow[];
};

export type HistoryRow = { month: string; hosts: number; revenuePence: number; costPence: number };

export const DEFAULT_PROJECTION: Projection = {
  start: { start: 3, grow: 5, pro: 1 },
  newPerMonth: { start: 2, grow: 3, pro: 0.5 },
  churnPct: 3,
  apiAttachPct: 10,
  rooms: { start: 2, grow: 6, pro: 18 },
  apiRequests: 3000,
};

export type MonthRow = { month: number; hosts: number; revenuePence: number; costPence: number; profitPence: number; marginPct: number };

export function project(model: PricingModel, c: CostModel, p: Projection, months = 12): MonthRow[] {
  const hosts: Record<string, number> = { ...p.start };
  const rows: MonthRow[] = [];
  for (let m = 1; m <= months; m++) {
    let revenue = 0;
    let cost = fixedCost(c);
    let count = 0;
    for (const plan of model.plans) {
      const n = Math.max(0, hosts[plan.key] ?? 0);
      const rooms = p.rooms[plan.key] ?? plan.includedRooms;
      const withApi = plan.apiRequests > 0 ? n : (n * p.apiAttachPct) / 100;
      const price = monthlyPrice(model, plan, { rooms, properties: 1, apiAddon: false });
      const addonRevenue = plan.apiRequests > 0 ? 0 : withApi * model.apiAddon.pricePence;
      const gross = n * price + addonRevenue;
      revenue += gross;
      cost += n * variableCost(c, { rooms, apiRequests: 0, aiReads: plan.aiReads }) + withApi * variableCost(c, { rooms: 0, apiRequests: p.apiRequests, aiReads: 0 });
      cost += gross * c.stripePct + n * c.stripeFixedPence;
      count += n;
      hosts[plan.key] = n * (1 - p.churnPct / 100) + (p.newPerMonth[plan.key] ?? 0);
    }
    const profit = revenue - cost;
    rows.push({
      month: m,
      hosts: Math.round(count),
      revenuePence: Math.round(revenue),
      costPence: Math.round(cost),
      profitPence: Math.round(profit),
      marginPct: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0,
    });
  }
  return rows;
}

/** Which projection month a day falls in (1 = the month it started). */
export function monthIndex(startedOn: string | undefined, day: string): number {
  if (!startedOn) return 1;
  const [y1, m1, d1] = startedOn.split("-").map(Number) as [number, number, number];
  const [y2, m2, d2] = day.split("-").map(Number) as [number, number, number];
  const months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return Math.max(1, months + 1);
}

/** Today's real numbers, by plan. */
export type CurrentState = {
  byPlan: Record<string, { hosts: number; rooms: number }>;
  /** Of hosts on plans without API, the share with the add-on, in %. */
  apiAttachPct: number;
};

/**
 * Starts the projection again from today's real numbers: paying hosts and
 * typical rooms per plan, and the add-on take-up. Growth and churn are kept
 * (they're the super admin's assumptions); past history is kept too.
 */
export function rebase(p: Projection, now: CurrentState, today: string): Projection {
  const start: Record<string, number> = { ...p.start };
  const rooms: Record<string, number> = { ...p.rooms };
  for (const [key, v] of Object.entries(now.byPlan)) {
    start[key] = v.hosts;
    if (v.hosts > 0) rooms[key] = Math.round((v.rooms / v.hosts) * 10) / 10;
  }
  return { ...p, start, rooms, apiAttachPct: Math.round(now.apiAttachPct), startedOn: today };
}

export type HostRow = { planKey: string | null; apiAddon: boolean; status: string; rooms: number; properties: number; isDemo: boolean };

export type HostSummary = {
  state: CurrentState;
  payers: number;
  trials: number;
  comped: number;
  /** Monthly revenue from paying hosts at this model's prices. */
  revenuePence: number;
  /** Rooms on every account with access (paying, trial, comped), for calibration. */
  activeRooms: number;
  byPlan: Record<string, { payers: number; trials: number; revenuePence: number }>;
};

/** Where things stand today, from every business's plan, status and rooms. */
export function summariseHosts(model: PricingModel, hosts: HostRow[]): HostSummary {
  const byPlanState: Record<string, { hosts: number; rooms: number }> = {};
  const byPlan: HostSummary["byPlan"] = {};
  for (const p of model.plans) {
    byPlanState[p.key] = { hosts: 0, rooms: 0 };
    byPlan[p.key] = { payers: 0, trials: 0, revenuePence: 0 };
  }
  let payers = 0, trials = 0, comped = 0, revenue = 0, activeRooms = 0, addonEligible = 0, addonOn = 0;
  for (const h of hosts) {
    if (h.isDemo) continue;
    const plan = planFor(model, h.planKey);
    const paying = h.status === "active" || h.status === "past_due";
    if (paying || h.status === "trialing" || h.status === "comped") activeRooms += h.rooms;
    if (h.status === "trialing") {
      trials++;
      byPlan[plan.key]!.trials++;
    }
    if (h.status === "comped") comped++;
    if (!paying) continue;
    payers++;
    const price = monthlyPrice(model, plan, { rooms: h.rooms, properties: h.properties, apiAddon: h.apiAddon });
    revenue += price;
    byPlan[plan.key]!.payers++;
    byPlan[plan.key]!.revenuePence += price;
    byPlanState[plan.key]!.hosts++;
    byPlanState[plan.key]!.rooms += h.rooms;
    if (plan.apiRequests === 0) {
      addonEligible++;
      if (h.apiAddon) addonOn++;
    }
  }
  return {
    state: { byPlan: byPlanState, apiAttachPct: addonEligible ? (addonOn / addonEligible) * 100 : 0 },
    payers,
    trials,
    comped,
    revenuePence: revenue,
    activeRooms,
    byPlan,
  };
}

/** What last month actually cost: Run credits, fixed costs and Stripe's cut. */
export function actualCost(c: CostModel, totalCredits: number, revenuePence: number, payers: number): number {
  return Math.round(c.fixedPence + totalCredits * creditPence(c) + revenuePence * c.stripePct + payers * c.stripeFixedPence);
}

/** Adds or replaces the history row for a month (YYYY-MM), newest last, 24 kept. */
export function recordHistory(p: Projection, row: HistoryRow): Projection {
  const rest = (p.history ?? []).filter((h) => h.month !== row.month);
  const history = [...rest, row].sort((a, b) => a.month.localeCompare(b.month)).slice(-24);
  return { ...p, history };
}

/* ------------------------------ calibration ------------------------------ */

export type Actuals = {
  /** From Lovable's Usage page for the last 30 days. */
  totalCredits: number;
  aiCredits: number;
  /** Counted by Latchkey over the same 30 days. */
  roomMonths: number;
  aiReads: number;
  apiRequests: number;
};

/**
 * Replaces estimates with what actually happened: AI credits per read come
 * straight from Lovable's AI line; everything else not explained by the
 * fixed baseline or API estimate is shared across active rooms.
 */
export function calibrate(c: CostModel, a: Actuals): CostModel {
  const perAi = a.aiReads > 0 ? a.aiCredits / a.aiReads : c.creditsPerAiRead;
  const apiCredits = (a.apiRequests / 1000) * c.creditsPer1kApi;
  const rest = Math.max(0, a.totalCredits - a.aiCredits - c.fixedCredits - apiCredits);
  const perRoom = a.roomMonths > 0 ? rest / a.roomMonths : c.creditsPerRoom;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return { ...c, creditsPerAiRead: round(perAi), creditsPerRoom: round(perRoom) };
}

/* ------------------------------- reading --------------------------------- */

export function normaliseModel(raw: unknown): PricingModel {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PricingModel>;
  const plans = Array.isArray(r.plans) && r.plans.length ? (r.plans as Plan[]) : DEFAULT_MODEL.plans;
  return {
    currency: typeof r.currency === "string" ? r.currency : DEFAULT_MODEL.currency,
    trialDays: typeof r.trialDays === "number" ? r.trialDays : DEFAULT_MODEL.trialDays,
    plans: plans.map((p) => ({ ...DEFAULT_MODEL.plans[1]!, ...p, features: (p.features ?? []).filter((f) => f in FEATURES) })),
    apiAddon: { ...DEFAULT_MODEL.apiAddon, ...(r.apiAddon ?? {}) },
  };
}

export function normaliseCosts(raw: unknown): CostModel {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<CostModel>;
  const out = { ...DEFAULT_COSTS };
  for (const k of Object.keys(DEFAULT_COSTS) as Array<keyof CostModel>) {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

export function normaliseProjection(raw: unknown): Projection {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Projection>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
  const map = (v: unknown, d: Record<string, number>) => {
    if (!v || typeof v !== "object") return { ...d };
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(v)) out[k] = num(n, 0);
    return out;
  };
  return {
    start: map(r.start, DEFAULT_PROJECTION.start),
    newPerMonth: map(r.newPerMonth, DEFAULT_PROJECTION.newPerMonth),
    churnPct: Math.min(100, num(r.churnPct, DEFAULT_PROJECTION.churnPct)),
    apiAttachPct: Math.min(100, num(r.apiAttachPct, DEFAULT_PROJECTION.apiAttachPct)),
    rooms: map(r.rooms, DEFAULT_PROJECTION.rooms),
    apiRequests: num(r.apiRequests, DEFAULT_PROJECTION.apiRequests),
    startedOn: typeof r.startedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.startedOn) ? r.startedOn : undefined,
    history: Array.isArray(r.history) ? (r.history as HistoryRow[]).filter((h) => h && typeof h.month === "string") : [],
  };
}
