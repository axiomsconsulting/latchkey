/**
 * Latchkey's own subscription. Hosts add a card during their trial through
 * Stripe Checkout; Stripe takes the first monthly payment the moment the
 * trial ends and every month after. Cancelling ends the subscription and
 * access at once, with no paid-up period to run down.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { billingPhase, fromStripeStatus, hasAccess, stripeTrialEnd, trialDaysLeft } from "@/lib/billing";
import { DEFAULT_PRICING, monthlyPence, type PricingConfig } from "@/lib/pricing";
import { requireOwner } from "@/lib/roles";

const uuid = z.string().uuid();

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const BILLING_COLUMNS =
  "id, business_name, contact_email, subscription_status, trial_started_at, trial_ends_at, stripe_customer_id, stripe_subscription_id, current_period_end, canceled_at";

/**
 * The host's monthly price. Once the super admin publishes plans in the
 * pricing studio, it's their plan's base, extra rooms and any API add-on;
 * until then, the original per-property, per-room pricing.
 */
async function priceFor(hostId: string): Promise<{
  pence: number;
  currency: string;
  properties: number;
  rooms: number;
  planKey: string | null;
  planName: string | null;
  apiAddon: boolean;
  /** The launch-offer price for the first paid month, while still to come. */
  offerPence: number | null;
  offerLabel: string | null;
}> {
  const db = await admin();
  const offer = await offerOf(hostId);
  const [{ data: pricing }, { data: props }, { data: site }, { data: host }] = await Promise.all([
    (db as any).from("platform_pricing").select("base_pence, extra_room_pence, extra_property_pence, trial_days, currency").eq("id", 1).maybeSingle(),
    db.from("properties").select("id, is_demo, rooms(id, active)").eq("host_id", hostId),
    (db as any).from("site_settings").select("pricing_model").eq("id", 1).maybeSingle(),
    (db as any).from("hosts").select("plan_key, api_addon").eq("id", hostId).maybeSingle(),
  ]);
  const real = (props ?? []).filter((p) => !p.is_demo);
  const rooms = real.map((p) => Math.max(1, ((p.rooms as Array<{ active: boolean }> | null) ?? []).filter((r) => r.active).length));
  const totalRooms = rooms.reduce((n, r) => n + r, 0);
  const apiAddon = host?.api_addon === true;
  if (site?.pricing_model) {
    const { normaliseModel, planFor, monthlyPrice } = await import("./pricing-model");
    const model = normaliseModel(site.pricing_model);
    const plan = planFor(model, host?.plan_key);
    return {
      pence: monthlyPrice(model, plan, { rooms: Math.max(1, totalRooms), properties: real.length, apiAddon }),
      currency: model.currency,
      properties: real.length,
      rooms: totalRooms,
      planKey: plan.key,
      planName: plan.name,
      apiAddon,
      ...offer,
    };
  }
  const cfg = (pricing as PricingConfig | null) ?? DEFAULT_PRICING;
  return {
    pence: monthlyPence(cfg, rooms.length ? rooms : [1]),
    currency: cfg.currency,
    properties: real.length,
    rooms: totalRooms,
    planKey: null,
    planName: null,
    apiAddon,
    ...offer,
  };
}

/** A launch offer still to come (read separately so billing works before migration 0029). */
async function offerOf(hostId: string): Promise<{ offerPence: number | null; offerLabel: string | null }> {
  const db = await admin();
  const { data, error } = await (db as any).from("hosts").select("offer_pence, offer_label, offer_used_at").eq("id", hostId).maybeSingle();
  if (error || !data) return { offerPence: null, offerLabel: null };
  const { pendingOffer } = await import("./offer");
  const pending = pendingOffer(data);
  return { offerPence: pending, offerLabel: pending === null ? null : (data.offer_label ?? "Launch offer") };
}

/** Keeps a live Stripe subscription at the host's current price. */
/** Moves a subscriber to their current price: now (prorated) or from the next bill. */
export async function updateStripePrice(hostId: string, when: "now" | "next_bill" = "now") {
  const db = await admin();
  const { data: h } = await db.from("hosts").select("business_name, stripe_subscription_id, subscription_status").eq("id", hostId).single();
  if (!h?.stripe_subscription_id || !["active", "past_due"].includes(h.subscription_status)) return;
  const { stripeCall } = await import("./stripe.server");
  const sub = await stripeCall<{ items: { data: Array<{ id: string; price: { product: string; currency: string } }> } }>(
    `/subscriptions/${encodeURIComponent(h.stripe_subscription_id)}`,
  );
  const item = sub.items.data[0];
  if (!item) return;
  const price = await priceFor(hostId);
  const { nextMonthPence } = await import("./offer");
  await stripeCall(`/subscriptions/${encodeURIComponent(h.stripe_subscription_id)}`, {
    items: [
      {
        id: item.id,
        price_data: { currency: item.price.currency, product: item.price.product, unit_amount: nextMonthPence(price.pence, price.offerPence), recurring: { interval: "month" } },
      },
    ],
    proration_behavior: when === "now" ? "create_prorations" : "none",
  });
}

/** The host picks a plan and whether they want the API add-on. */
export const changePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, planKey: z.string().regex(/^[a-z0-9_]{2,30}$/), apiAddon: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireOwner(context.supabase, data.hostId);
    const db = await admin();
    const { data: site } = await (db as any).from("site_settings").select("pricing_model").eq("id", 1).maybeSingle();
    if (!site?.pricing_model) throw new Error("Plans aren't available yet.");
    const { normaliseModel } = await import("./pricing-model");
    const model = normaliseModel(site.pricing_model);
    if (!model.plans.some((p) => p.key === data.planKey)) throw new Error("That plan isn't available.");
    const { error } = await (db as any).from("hosts").update({ plan_key: data.planKey, api_addon: data.apiAddon }).eq("id", data.hostId);
    if (error) throw new Error(error.message);
    await updateStripePrice(data.hostId);
    return { ok: true };
  });

/** The plans hosts can choose from, once published. */
async function publishedPlans() {
  const db = await admin();
  const { data: site } = await (db as any).from("site_settings").select("pricing_model").eq("id", 1).maybeSingle();
  if (!site?.pricing_model) return null;
  const { normaliseModel, FEATURES } = await import("./pricing-model");
  const model = normaliseModel(site.pricing_model);
  return {
    currency: model.currency,
    apiAddon: model.apiAddon,
    plans: model.plans.map((p) => ({ ...p, featureLabels: p.features.map((f) => FEATURES[f]) })),
  };
}

export const getBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS: members (and the super admin) can read the business.
    const { data: h, error } = await context.supabase.from("hosts").select(BILLING_COLUMNS).eq("id", data.hostId).maybeSingle();
    if (error || !h) return { available: false as const };
    const { stripeReady } = await import("./stripe.server");
    const price = await priceFor(data.hostId);
    return {
      available: true as const,
      phase: billingPhase(h),
      access: hasAccess(h),
      daysLeft: trialDaysLeft(h),
      trialEndsAt: h.trial_ends_at,
      currentPeriodEnd: h.current_period_end,
      canceledAt: h.canceled_at,
      hasSubscription: !!h.stripe_subscription_id,
      price,
      stripeReady: stripeReady(),
      plans: await publishedPlans(),
    };
  });

/** Opens Stripe Checkout to add a card. Billing starts when the trial ends, or now if it already has. */
export const startSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, returnTo: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireOwner(context.supabase, data.hostId);
    const db = await admin();
    const { data: h } = await db.from("hosts").select(BILLING_COLUMNS).eq("id", data.hostId).single();
    if (!h) throw new Error("Business not found.");
    if (h.stripe_subscription_id && ["active", "past_due"].includes(h.subscription_status)) {
      throw new Error("You already have a subscription. Use Update card to change how you pay.");
    }
    const { stripeCall } = await import("./stripe.server");
    const price = await priceFor(data.hostId);
    // A launch offer makes the first paid month cheaper; the webhook moves it to the standard price after.
    const { nextMonthPence } = await import("./offer");
    // Only an unused trial carries over; after cancelling, billing starts now.
    const trialEnd = h.subscription_status === "trialing" ? stripeTrialEnd(h.trial_ends_at) : null;
    const email = (context.claims?.email as string | undefined) || h.contact_email || undefined;
    const origin = new URL(data.returnTo).origin;
    const session = await stripeCall<{ url: string }>("/checkout/sessions", {
      mode: "subscription",
      client_reference_id: h.id,
      ...(h.stripe_customer_id ? { customer: h.stripe_customer_id } : email ? { customer_email: email } : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: price.currency.toLowerCase(),
            unit_amount: nextMonthPence(price.pence, price.offerPence),
            recurring: { interval: "month" },
            product_data: { name: `Latchkey for ${h.business_name}` },
          },
        },
      ],
      subscription_data: {
        metadata: { host_id: h.id },
        ...(trialEnd ? { trial_end: trialEnd } : {}),
      },
      metadata: { host_id: h.id, kind: "latchkey_subscription" },
      success_url: `${origin}/app/billing?done=1`,
      cancel_url: `${origin}/app/billing`,
    });
    return { url: session.url };
  });

/** Stripe's own page for changing card details and seeing invoices. */
export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, returnTo: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireOwner(context.supabase, data.hostId);
    const db = await admin();
    const { data: h } = await db.from("hosts").select("stripe_customer_id").eq("id", data.hostId).single();
    if (!h?.stripe_customer_id) throw new Error("Add a card first.");
    const { stripeCall } = await import("./stripe.server");
    try {
      const portal = await stripeCall<{ url: string }>("/billing_portal/sessions", {
        customer: h.stripe_customer_id,
        return_url: data.returnTo,
      });
      return { url: portal.url };
    } catch {
      throw new Error("Card changes aren't set up yet. Please contact Latchkey support.");
    }
  });

/**
 * Cancels at once: Stripe stops the subscription now (no further charges)
 * and access to Latchkey ends immediately.
 */
export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireOwner(context.supabase, data.hostId);
    const db = await admin();
    const { data: h } = await db.from("hosts").select("stripe_subscription_id, subscription_status").eq("id", data.hostId).single();
    if (!h) throw new Error("Business not found.");
    if (h.stripe_subscription_id) {
      const { stripeCall } = await import("./stripe.server");
      try {
        await stripeCall(`/subscriptions/${encodeURIComponent(h.stripe_subscription_id)}`, undefined, "DELETE");
      } catch (err) {
        // Already gone at Stripe is fine; anything else must not leave them billed.
        if (!(err instanceof Error && /No such subscription/i.test(err.message))) throw err;
      }
    }
    const { error } = await db
      .from("hosts")
      .update({ subscription_status: "canceled", canceled_at: new Date().toISOString(), current_period_end: null })
      .eq("id", data.hostId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Called by the Stripe webhook: keeps the host's status in step with Stripe. */
export async function applyStripeSubscription(sub: {
  id: string;
  status: string;
  customer: string;
  current_period_end?: number;
  metadata?: Record<string, string>;
}) {
  const db = await admin();
  let hostId = sub.metadata?.["host_id"] ?? null;
  if (!hostId) {
    const { data } = await db.from("hosts").select("id").eq("stripe_subscription_id", sub.id).maybeSingle();
    hostId = data?.id ?? null;
  }
  if (!hostId) return;
  const status = fromStripeStatus(sub.status);
  await db
    .from("hosts")
    .update({
      subscription_status: status,
      stripe_subscription_id: sub.id,
      stripe_customer_id: sub.customer,
      current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      ...(status === "canceled" ? { canceled_at: new Date().toISOString() } : { canceled_at: null }),
    })
    .eq("id", hostId);

  // Free trial → offer price for the first paid month → standard. Once Stripe
  // starts that first paid month, the offer is used and the next bill is standard.
  const { offerPence } = await offerOf(hostId);
  const { offerNowUsed } = await import("./offer");
  if (offerNowUsed(offerPence, sub.status)) {
    await (db as any).from("hosts").update({ offer_used_at: new Date().toISOString() }).eq("id", hostId);
    await updateStripePrice(hostId, "next_bill");
  }
}
