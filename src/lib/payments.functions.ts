/**
 * Card payments for approved extras. Host side: check the Stripe connection
 * and push the price list up as Stripe products. Guest side: pay for an
 * approved request from the stay page.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const token = z.string().min(20).max(80);

export const getPaymentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { stripeReady, stripeLiveMode, stripeCall } = await import("./stripe.server");
    const { data: p } = await context.supabase
      .from("properties")
      .select("id, hosts(currency)")
      .eq("id", data.propertyId)
      .single();
    if (!p) throw new Error("Property not found.");
    const { count } = await context.supabase
      .from("extras_catalogue")
      .select("id", { count: "exact", head: true })
      .eq("property_id", data.propertyId)
      .is("deleted_at", null)
      .not("stripe_price_id", "is", null);

    if (!stripeReady()) {
      return { connected: false, live: false, account: null as string | null, webhookReady: false, syncedCount: count ?? 0, currency: (p as any).hosts?.currency ?? "GBP" };
    }
    let account: string | null = null;
    try {
      try {
        const acct = await stripeCall<{ id: string; business_profile?: { name?: string }; settings?: { dashboard?: { display_name?: string } } }>("/account");
        account = acct.settings?.dashboard?.display_name ?? acct.business_profile?.name ?? acct.id;
      } catch {
        // Restricted keys often can't read the account. A products call proves
        // the key works and has the permissions Latchkey actually needs.
        await stripeCall("/products?limit=1");
        account = "your Stripe account (restricted key)";
      }
    } catch (err) {
      return { connected: false, live: false, account: null, webhookReady: Boolean(process.env["STRIPE_WEBHOOK_SECRET"]), syncedCount: count ?? 0, currency: (p as any).hosts?.currency ?? "GBP", error: err instanceof Error ? err.message : "Stripe rejected the key." };
    }
    return {
      connected: true,
      live: stripeLiveMode(),
      account,
      webhookReady: Boolean(process.env["STRIPE_WEBHOOK_SECRET"]),
      syncedCount: count ?? 0,
      currency: (p as any).hosts?.currency ?? "GBP",
    };
  });

/** Create or update a Stripe product and price for every paid item. */
export const syncPriceListToStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { stripeCall } = await import("./stripe.server");
    const { data: p } = await context.supabase.from("properties").select("id, name, hosts(currency)").eq("id", data.propertyId).single();
    if (!p) throw new Error("Property not found.");
    const currency = (((p as any).hosts?.currency ?? "GBP") as string).toLowerCase();
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
      let productId: string = r.stripe_product_id;
      if (!productId) {
        const prod = await stripeCall<{ id: string }>("/products", {
          name: `${r.name} · ${(p as any).name}`,
          metadata: { latchkey_item: r.item_key ?? r.name, latchkey_property: data.propertyId },
        });
        productId = prod.id;
        created++;
      } else {
        await stripeCall(`/products/${productId}`, { name: `${r.name} · ${(p as any).name}`, active: true });
        updated++;
      }
      const price = await stripeCall<{ id: string }>("/prices", {
        product: productId,
        currency,
        unit_amount: r.price_pence,
        metadata: { latchkey_item: r.item_key ?? r.name, unit: r.unit },
      });
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
    const { admin, sha256 } = await import("./checkin.server");
    const db = await admin();
    const { data: st } = await db.from("stay_tokens").select("booking_id, expires_at").eq("token_hash", sha256(data.token)).maybeSingle();
    if (!st || Date.parse(st.expires_at) < Date.now()) throw new Error("This stay link has expired.");

    const { data: r } = await db
      .from("requests")
      .select("id, status, total_pence, items, booking_id, bookings(property_id, properties(name, hosts(currency)))")
      .eq("id", data.requestId)
      .eq("booking_id", st.booking_id)
      .maybeSingle();
    if (!r) throw new Error("We couldn't find that request.");
    if (r.status !== "awaiting_payment") throw new Error("That request isn't waiting for payment.");
    if (!r.total_pence) throw new Error("There's nothing to pay for.");

    const b: any = (r as any).bookings;
    const currency = ((b?.properties?.hosts?.currency ?? "GBP") as string).toLowerCase();
    const names = Array.isArray(r.items) ? (r.items as any[]).map((i) => `${i.qty ?? 1} × ${i.name ?? i.key}`).join(", ") : "Extras";

    const session = await stripeCall<{ id: string; url: string }>("/checkout/sessions", {
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
            unit_amount: r.total_pence,
            product_data: { name: `${b?.properties?.name ?? "Your stay"} — extras`, description: names.slice(0, 200) },
          },
        },
      ],
    });

    await db.from("requests").update({ stripe_session_id: session.id }).eq("id", r.id);
    return { url: session.url };
  });

/** On return from Stripe, check the session directly so payment confirms without waiting for the webhook. */
export const confirmExtrasPayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const { stripeCall } = await import("./stripe.server");
    const { admin, sha256 } = await import("./checkin.server");
    const db = await admin();
    const { data: st } = await db.from("stay_tokens").select("booking_id").eq("token_hash", sha256(data.token)).maybeSingle();
    if (!st) return { confirmed: false };
    const { data: pending } = await db
      .from("requests")
      .select("id, booking_id, stripe_session_id")
      .eq("booking_id", st.booking_id)
      .eq("status", "awaiting_payment")
      .not("stripe_session_id", "is", null);
    let confirmed = false;
    for (const r of pending ?? []) {
      const s = await stripeCall<{ payment_status: string; payment_intent: string | null; client_reference_id: string | null }>(
        `/checkout/sessions/${r.stripe_session_id}`,
      ).catch(() => null);
      if (!s || s.payment_status !== "paid" || s.client_reference_id !== r.id) continue;
      const now = new Date().toISOString();
      await db.from("requests").update({ status: "confirmed", paid_at: now, pay_by: null, payment_method: "card", stripe_payment_intent: s.payment_intent }).eq("id", r.id).eq("status", "awaiting_payment");
      await db.from("messages").insert({ booking_id: r.booking_id, direction: "outbound", channel: "stay_page", body: "Payment received, thank you. You're all booked.", sent_at: now });
      confirmed = true;
    }
    return { confirmed };
  });
