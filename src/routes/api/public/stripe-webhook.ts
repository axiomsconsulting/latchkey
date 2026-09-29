/**
 * Stripe webhook. Marks an extras request paid once the guest completes
 * checkout. The signature is verified against STRIPE_WEBHOOK_SECRET before
 * anything is read from the payload.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });

        const raw = await request.text();
        const { verifyStripeSignature } = await import("@/lib/stripe.server");
        const ok = await verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret);
        if (!ok) return new Response("Invalid signature", { status: 401 });

        let event: any;
        try {
          event = JSON.parse(raw);
        } catch {
          return new Response("Bad payload", { status: 400 });
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
