/**
 * Card payments for approved extras. Each host takes payments in their own
 * Stripe account, linked through Stripe Connect: Latchkey creates a Stripe
 * account with the host's email already filled in and sends them to Stripe
 * to finish signing up. Guests then pay the host directly; Latchkey's own
 * Stripe account only collects subscriptions (and guest payments for
 * businesses the super admin runs, until they link their own).
 */
import { createServerFn } from "@tanstack/react-start";
import { stripeAmount } from "./extras";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { hostOfProperty, requireOwner } from "@/lib/roles";
import { rebrand } from "@/lib/brand";
import { appError } from "@/lib/app-error";
import { identityOf, stripeFailure, stripeSetupProblem, type StripeAccountRaw, type StripeIdentity } from "@/lib/stripe-identity";

const uuid = z.string().uuid();
const token = z.string().min(20).max(80);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Payee = { mode: "platform" | "connected" | "none"; account: string | null };

type StripeAccount = StripeAccountRaw;

let platformCache: { at: number; identity: StripeIdentity } | null = null;

/** Latchkey's own Stripe account (the key in Secrets), cached for 10 minutes. */
export async function platformIdentity(fresh = false): Promise<StripeIdentity | null> {
  const { stripeCall, stripeReady, stripeLiveMode } = await import("./stripe.server");
  if (!stripeReady()) return null;
  if (!fresh && platformCache && Date.now() - platformCache.at < 600_000) return platformCache.identity;
  const acct = await stripeCall<StripeAccount>("/account").catch(() => null);
  if (!acct) return null;
  platformCache = { at: Date.now(), identity: identityOf(acct, stripeLiveMode()) };
  return platformCache.identity;
}

/** Where a host's guest payments go. */
async function payeeFor(hostId: string): Promise<Payee & { ready: boolean; checkedAt: string | null }> {
  const db = await admin();
  const { data: h } = await db
    .from("hosts")
    .select("stripe_account_id, stripe_account_ready, stripe_account_checked_at, uses_platform_stripe")
    .eq("id", hostId)
    .maybeSingle();
  if (!h) return { mode: "none", account: null, ready: false, checkedAt: null };
  if (h.uses_platform_stripe) return { mode: "platform", account: null, ready: true, checkedAt: null };
  if (h.stripe_account_id) {
    return { mode: "connected", account: h.stripe_account_id, ready: h.stripe_account_ready, checkedAt: h.stripe_account_checked_at };
  }
  return { mode: "none", account: null, ready: false, checkedAt: null };
}

/** Asks Stripe whether the host's account can take payments yet, and remembers it. */
async function refreshAccount(hostId: string, account: string): Promise<StripeAccount | null> {
  const { stripeCall } = await import("./stripe.server");
  const acct = await stripeCall<StripeAccount>(`/accounts/${encodeURIComponent(account)}`).catch(() => null);
  if (!acct) return null;
  const db = await admin();
  await db
    .from("hosts")
    .update({ stripe_account_ready: !!acct.charges_enabled, stripe_account_checked_at: new Date().toISOString() })
    .eq("id", hostId);
  return acct;
}

/** A property's own currency (regional pricing, migration 0047) or its business's. */
async function propertyCurrency(db: any, propertyId: string | null | undefined, hostCurrency: string | null | undefined): Promise<string> {
  if (propertyId) {
    const { data, error } = await db.from("properties").select("currency").eq("id", propertyId).maybeSingle();
    if (!error && data?.currency) return data.currency as string;
  }
  return hostCurrency || "GBP";
}

export const getPaymentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { stripeReady, stripeLiveMode } = await import("./stripe.server");
    const { data: p } = await context.supabase.from("properties").select("id, host_id, hosts(currency)").eq("id", data.propertyId).single();
    if (!p) throw new Error("Property not found.");
    const { count } = await context.supabase
      .from("extras_catalogue")
      .select("id", { count: "exact", head: true })
      .eq("property_id", data.propertyId)
      .is("deleted_at", null)
      .not("stripe_price_id", "is", null);
    const { data: isSuper } = await (context.supabase as unknown as { rpc: (f: string) => Promise<{ data: unknown }> }).rpc("is_super_admin");
    const base = {
      platformReady: stripeReady(),
      live: stripeLiveMode(),
      webhookReady: Boolean(process.env["STRIPE_WEBHOOK_SECRET"]),
      syncedCount: count ?? 0,
      currency: await propertyCurrency(context.supabase, data.propertyId, (p as { hosts?: { currency?: string } | null }).hosts?.currency),
      isSuperAdmin: isSuper === true,
    };
    const payee = await payeeFor(p.host_id);
    if (payee.mode === "platform") return { ...base, ...payee, identity: await platformIdentity(), checkedAt: new Date().toISOString() };
    if (payee.mode !== "connected" || !stripeReady()) return { ...base, ...payee, identity: null as StripeIdentity | null };
    // Ask Stripe each time the card is shown, so the name and ID are always what Stripe says now.
    const acct = await refreshAccount(p.host_id, payee.account!);
    return {
      ...base,
      ...payee,
      ready: acct ? !!acct.charges_enabled : payee.ready,
      checkedAt: acct ? new Date().toISOString() : payee.checkedAt,
      identity: acct ? identityOf(acct, stripeLiveMode()) : null,
    };
  });

/** Super admin: Latchkey's own Stripe account, the key's mode and which webhook secrets are set. */
export const getPlatformStripe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isSuper } = await (context.supabase as unknown as { rpc: (f: string) => Promise<{ data: unknown }> }).rpc("is_super_admin");
    if (isSuper !== true) throw new Error("Super admin only.");
    const { stripeReady, stripeLiveMode, stripeKeyKind } = await import("./stripe.server");
    return {
      ready: stripeReady(),
      live: stripeLiveMode(),
      keyKind: stripeKeyKind(),
      identity: await platformIdentity(true),
      webhook: Boolean(process.env["STRIPE_WEBHOOK_SECRET"]),
      connectWebhook: Boolean(process.env["STRIPE_CONNECT_WEBHOOK_SECRET"]),
    };
  });

/**
 * Links the host's own Stripe account. The first time, Latchkey creates a
 * Stripe account with the host's email filled in; either way, the host is
 * sent to Stripe to finish (identity and bank details, a few minutes).
 */
export const connectStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, returnTo: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireOwner(context.supabase, data.hostId);
    const { stripeCall: call, stripeReady } = await import("./stripe.server");
    if (!stripeReady()) throw new Error(rebrand("Card payments aren't available yet. Please contact Latchkey support."));
    // Refusals caused by Latchkey's own Stripe set-up: tell the super admin what to change, the host who to ask.
    const stripeCall: typeof call = (...args) =>
      call(...(args as Parameters<typeof call>)).catch(async (e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        const problem = stripeSetupProblem(msg);
        if (!problem) throw stripeFailure(e, "Connecting Stripe");
        const { data: isSuper } = await (context.supabase as unknown as { rpc: (f: string) => Promise<{ data: unknown }> }).rpc("is_super_admin");
        const code = problem === "permission" ? "stripe_key_permission" : "stripe_connect_off";
        if (isSuper !== true) {
          throw appError({
            code,
            title: "Card payments can't be connected just yet",
            body: rebrand("This is on Latchkey's side, not yours: Latchkey's Stripe set-up needs finishing before businesses can connect. Nothing is wrong with your details and nothing has been charged."),
            steps: [{ text: rebrand("Press Send to Latchkey support below so we know.") }, { text: "We'll email you when it's fixed. Then come back here and press Connect Stripe again." }],
            detail: msg,
          });
        }
        throw appError({
          code,
          title: problem === "permission" ? "Latchkey's Stripe key can't create hosts' accounts" : "Stripe Connect isn't set up on Latchkey's Stripe account",
          body:
            problem === "permission"
              ? rebrand("Connecting a business uses Latchkey's own Stripe key (in Secrets). That key is restricted and isn't allowed to create accounts. Hosts see a plain message asking them to contact support.")
              : rebrand("Before Latchkey can create Stripe accounts for businesses, Stripe needs Latchkey's platform profile: a short questionnaire about how Latchkey uses Connect. Hosts see a plain message asking them to contact support."),
          steps:
            problem === "permission"
              ? [
                  { text: "In Stripe, open Developers → API keys and edit the restricted key Latchkey uses.", href: "https://dashboard.stripe.com/apikeys" },
                  { text: "Set Connect → Accounts to Write (Latchkey admin → Integrations lists everything the key needs), or put a full secret key in Secrets instead." },
                  { text: "Come back and press Connect Stripe again." },
                ]
              : [
                  { text: "In Stripe, open Connect and answer the platform profile questionnaire.", href: "https://dashboard.stripe.com/connect/accounts/overview" },
                  { text: "Choose Standard accounts and that hosts are paid directly (Latchkey takes no share of guest payments)." },
                  { text: "Come back and press Connect Stripe again." },
                ],
          detail: msg,
          support: false,
        });
      }) as never;
    const db = await admin();
    const { data: h } = await db.from("hosts").select("id, business_name, contact_email, stripe_account_id").eq("id", data.hostId).single();
    if (!h) throw new Error("Business not found.");
    let account = h.stripe_account_id;
    if (!account) {
      const email = (context.claims?.email as string | undefined) || h.contact_email || undefined;
      const made = await stripeCall<StripeAccount>("/accounts", {
        type: "standard",
        ...(email ? { email } : {}),
        business_profile: { name: h.business_name },
        metadata: { latchkey_host_id: h.id },
      });
      account = made.id;
      await db.from("hosts").update({ stripe_account_id: account, stripe_account_ready: false }).eq("id", h.id);
    }
    // Only back to this app's own pages, never a caller-chosen site.
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const origin = req ? new URL(req.url).origin : null;
    const back = new URL(data.returnTo);
    if (!origin || back.origin !== origin || !/^\/[\w\-/.]*$/.test(back.pathname)) throw new Error("Invalid return page.");
    const returnTo = `${origin}${back.pathname}`;
    const link = await stripeCall<{ url: string }>("/account_links", {
      account,
      type: "account_onboarding",
      refresh_url: `${returnTo}?stripe=retry`,
      return_url: `${returnTo}?stripe=done`,
    });
    return { url: link.url };
  });

/** Back from Stripe: check whether the account can take payments now. */
export const refreshStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, data.hostId);
    const payee = await payeeFor(data.hostId);
    if (payee.mode !== "connected") return { ready: payee.ready };
    const acct = await refreshAccount(data.hostId, payee.account!);
    return { ready: !!acct?.charges_enabled };
  });

/** Unlinks the host's Stripe account from Latchkey. The account itself stays theirs. */
export const disconnectStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireOwner(context.supabase, data.hostId);
    const db = await admin();
    await db.from("hosts").update({ stripe_account_id: null, stripe_account_ready: false, stripe_account_checked_at: null }).eq("id", data.hostId);
    return { ok: true };
  });

/** Super admin: take a business's guest payments in Latchkey's own Stripe account, or stop. */
export const setPlatformStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, on: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await (context.supabase as unknown as { rpc: (f: string) => Promise<{ data: unknown }> }).rpc("is_super_admin");
    if (isSuper !== true) throw new Error("Super admin only.");
    const db = await admin();
    await db.from("hosts").update({ uses_platform_stripe: data.on }).eq("id", data.hostId);
    return { ok: true };
  });

/** Create or update a Stripe product and price for every paid item, in the host's account. */
export const syncPriceListToStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    // Billing set-up is the owner's: this creates products in Stripe.
    await requireOwner(context.supabase, hostId);
    const payee = await payeeFor(hostId);
    if (payee.mode === "none" || !payee.ready) throw new Error("Link your Stripe account first.");
    const account = payee.mode === "connected" ? payee.account : null;
    const { stripeCall } = await import("./stripe.server");
    const { data: p } = await context.supabase.from("properties").select("id, name, hosts(currency)").eq("id", data.propertyId).single();
    if (!p) throw new Error("Property not found.");
    const currency = (await propertyCurrency(context.supabase, data.propertyId, (p as any).hosts?.currency)).toLowerCase();
    const { data: rows } = await context.supabase
      .from("extras_catalogue")
      .select("id, item_key, name, price_pence, unit, is_free, active, stripe_product_id, stripe_price_id")
      .eq("property_id", data.propertyId)
      .is("deleted_at", null)
      .order("sort_order");

    let created = 0;
    let updated = 0;
    for (const r of (rows ?? []) as any[]) {
      if (r.is_free || !r.price_pence) continue;
      let productId: string | null = r.stripe_product_id;
      if (productId) {
        // A product made in another Stripe account (before linking) isn't here.
        const ok = await stripeCall(`/products/${productId}`, { name: `${r.name} · ${(p as any).name}`, active: true }, "POST", account)
          .then(() => true)
          .catch(() => false);
        if (ok) updated++;
        else productId = null;
      }
      if (!productId) {
        const prod = await stripeCall<{ id: string }>(
          "/products",
          { name: `${r.name} · ${(p as any).name}`, metadata: { latchkey_item: r.item_key ?? r.name, latchkey_property: data.propertyId } },
          "POST",
          account,
        );
        productId = prod.id;
        created++;
      }
      const price = await stripeCall<{ id: string }>(
        "/prices",
        { product: productId, currency, unit_amount: stripeAmount(r.price_pence, currency), metadata: { latchkey_item: r.item_key ?? r.name, unit: r.unit } },
        "POST",
        account,
      );
      await context.supabase
        .from("extras_catalogue")
        .update({ stripe_product_id: productId, stripe_price_id: price.id, stripe_synced_at: new Date().toISOString() })
        .eq("id", r.id);
    }
    return { created, updated };
  });

/* --------------------------------- guest -------------------------------- */

export const startExtrasCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token, requestId: uuid, origin: z.string().url() }).parse(d))
  .handler(async ({ data }) => {
    const { stripeCall } = await import("./stripe.server");
    const { admin: adminDb, sha256 } = await import("./checkin.server");
    const db = await adminDb();
    const { data: st } = await db.from("stay_tokens").select("booking_id, expires_at").eq("token_hash", sha256(data.token)).maybeSingle();
    if (!st || Date.parse(st.expires_at) < Date.now()) throw new Error("This stay link has expired.");

    const { data: r } = await db
      .from("requests")
      .select("id, status, total_pence, items, booking_id, bookings(property_id, properties(name, host_id, hosts(currency)))")
      .eq("id", data.requestId)
      .eq("booking_id", st.booking_id)
      .maybeSingle();
    if (!r) throw new Error("We couldn't find that request.");
    if (r.status !== "awaiting_payment") throw new Error("That request isn't waiting for payment.");
    if (!r.total_pence) throw new Error("There's nothing to pay for.");

    const b: any = (r as any).bookings;
    const payee = await payeeFor(b?.properties?.host_id);
    if (payee.mode === "none" || !payee.ready) {
      throw new Error("Your host isn't taking card payments yet. Please pay them another way, or send them a message.");
    }
    const account = payee.mode === "connected" ? payee.account : null;
    const currency = (await propertyCurrency(db, b?.property_id, b?.properties?.hosts?.currency)).toLowerCase();
    const names = Array.isArray(r.items) ? (r.items as any[]).map((i) => `${i.qty ?? 1} × ${i.name ?? i.key}`).join(", ") : "Extras";

    // Charged directly in the host's account: the money, receipt and any refund are theirs.
    const session = await stripeCall<{ id: string; url: string }>(
      "/checkout/sessions",
      {
        mode: "payment",
        success_url: `${data.origin}/stay/${data.token}?paid=1`,
        cancel_url: `${data.origin}/stay/${data.token}?paid=0`,
        client_reference_id: r.id,
        metadata: { request_id: r.id, booking_id: r.booking_id },
        payment_intent_data: { metadata: { request_id: r.id } },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: stripeAmount(r.total_pence, currency),
              product_data: { name: `${b?.properties?.name ?? "Your stay"} — extras`, description: names.slice(0, 200) },
            },
          },
        ],
      },
      "POST",
      account,
    );

    const { error } = await db.from("requests").update({ stripe_session_id: session.id, stripe_account_id: account }).eq("id", r.id);
    // Before migration 0025 there's no account column; the platform account is the only one then.
    if (error) await db.from("requests").update({ stripe_session_id: session.id }).eq("id", r.id);
    return { url: session.url };
  });

/** On return from Stripe, check the session directly so payment confirms without waiting for the webhook. */
export const confirmExtrasPayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const { stripeCall } = await import("./stripe.server");
    const { admin: adminDb, sha256, withLegacy } = await import("./checkin.server");
    const db = await adminDb();
    const { data: st } = await db.from("stay_tokens").select("booking_id").eq("token_hash", sha256(data.token)).maybeSingle();
    if (!st) return { confirmed: false };
    const cols = "id, booking_id, stripe_session_id";
    const pendingQuery = (c: string) =>
      db.from("requests").select(c).eq("booking_id", st.booking_id).eq("status", "awaiting_payment").not("stripe_session_id", "is", null);
    const { data: pending } = await withLegacy(
      () => pendingQuery(`${cols}, stripe_account_id`),
      () => pendingQuery(cols),
    );
    let confirmed = false;
    for (const r of (pending ?? []) as unknown as Array<{ id: string; booking_id: string; stripe_session_id: string; stripe_account_id?: string | null }>) {
      const s = await stripeCall<{ payment_status: string; payment_intent: string | null; client_reference_id: string | null }>(
        `/checkout/sessions/${r.stripe_session_id}`,
        undefined,
        "GET",
        r.stripe_account_id ?? null,
      ).catch(() => null);
      if (!s || s.payment_status !== "paid" || s.client_reference_id !== r.id) continue;
      const now = new Date().toISOString();
      await db.from("requests").update({ status: "confirmed", paid_at: now, pay_by: null, payment_method: "card", stripe_payment_intent: s.payment_intent }).eq("id", r.id).eq("status", "awaiting_payment");
      // A paid early check-in or late check-out moves the stay's times.
      await (await import("./extras.functions")).applyStayTimes(db, r.id);
      await db.from("messages").insert({ booking_id: r.booking_id, direction: "outbound", channel: "stay_page", body: "Payment received, thank you. You're all booked.", sent_at: now });
      confirmed = true;
    }
    return { confirmed };
  });
