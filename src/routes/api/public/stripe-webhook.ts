/**
 * Stripe webhook. Marks an extras request paid once the guest completes
 * checkout, confirms (or, unpaid, releases) direct bookings from the "Stay
 * with us" page, and keeps each host's Latchkey subscription in step with Stripe
 * (started, renewed, payment failing, cancelled). Events from hosts' own
 * Stripe accounts arrive through the Connect webhook: guest payments, and
 * whether a newly linked account can take payments yet. The signature is
 * verified against STRIPE_WEBHOOK_SECRET or STRIPE_CONNECT_WEBHOOK_SECRET
 * before anything is read from the payload.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secrets = [process.env["STRIPE_WEBHOOK_SECRET"], process.env["STRIPE_CONNECT_WEBHOOK_SECRET"]].filter(
          (x): x is string => !!x,
        );
        if (secrets.length === 0) return new Response("Not configured", { status: 503 });

        const raw = await request.text();
        const { verifyStripeSignature } = await import("@/lib/stripe.server");
        const header = request.headers.get("stripe-signature");
        let ok = false;
        for (const secret of secrets) ok = ok || (await verifyStripeSignature(raw, header, secret));
        if (!ok) return new Response("Invalid signature", { status: 401 });

        let event: any;
        try {
          event = JSON.parse(raw);
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        // A host's linked account finished (or lost) the ability to take payments.
        if (event.type === "account.updated") {
          const acct = event.data?.object ?? {};
          if (typeof acct.id === "string") {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin
              .from("hosts")
              .update({ stripe_account_ready: !!acct.charges_enabled, stripe_account_checked_at: new Date().toISOString() })
              .eq("stripe_account_id", acct.id);
          }
          return new Response("ok");
        }

        // Latchkey subscriptions: created, renewed, failing, cancelled. Events
        // from a host's own account are their business, not Latchkey billing.
        if (typeof event.type === "string" && event.type.startsWith("customer.subscription.") && !event.account) {
          const { applyStripeSubscription } = await import("@/lib/billing.functions");
          await applyStripeSubscription(event.data?.object ?? {});
          return new Response("ok");
        }
        if (event.type === "checkout.session.completed" && !event.account && event.data?.object?.metadata?.kind === "latchkey_subscription") {
          const subId = event.data.object.subscription;
          if (typeof subId === "string") {
            const { stripeCall } = await import("@/lib/stripe.server");
            const { applyStripeSubscription } = await import("@/lib/billing.functions");
            await applyStripeSubscription(await stripeCall(`/subscriptions/${encodeURIComponent(subId)}`));
          }
          return new Response("ok");
        }

        // Direct bookings from the "Stay with us" page: paid confirms it; a checkout left to expire releases the room.
        if (event.data?.object?.metadata?.kind === "direct_reservation") {
          const session = event.data.object;
          const reservationId = session.metadata?.reservation_id;
          if (typeof reservationId === "string") {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { markReservationPaid, expireReservation } = await import("@/lib/direct-booking.functions");
            const db = supabaseAdmin as unknown as { from: (t: string) => any };
            if ((event.type === "checkout.session.completed" && session.payment_status === "paid") || event.type === "checkout.session.async_payment_succeeded") {
              await markReservationPaid(db, reservationId, typeof session.payment_intent === "string" ? session.payment_intent : null);
            } else if (event.type === "checkout.session.expired") {
              await expireReservation(db, reservationId);
            }
          }
          return new Response("ok");
        }

        if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
          return new Response("ok");
        }

        const session = event.data?.object ?? {};
        const requestId: string | undefined = session.metadata?.request_id ?? session.client_reference_id;
        if (!requestId) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();
        const { data: r } = await supabaseAdmin
          .from("requests")
          .select("id, booking_id, status")
          .eq("id", requestId)
          .maybeSingle();
        if (!r) return new Response("ok");

        await supabaseAdmin
          .from("requests")
          .update({
            status: "confirmed",
            paid_at: now,
            pay_by: null,
            stripe_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : null,
          })
          .eq("id", requestId);

        await supabaseAdmin.from("messages").insert({
          booking_id: r.booking_id,
          direction: "outbound",
          channel: "stay_page",
          body: "Payment received, thank you. You're all booked.",
          sent_at: now,
        });

        return new Response("ok");
      },
    },
  },
});
