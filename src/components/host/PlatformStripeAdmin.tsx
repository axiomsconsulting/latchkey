import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { StripeAccountCard } from "@/components/host/StripeAccountCard";
import { Skeleton } from "@/components/ui/skeleton";
import { stripeAccountCopy as copy } from "@/content/copy";
import { getPlatformStripe } from "@/lib/payments.functions";
import { RESTRICTED_KEY_NEEDS } from "@/lib/stripe-identity";

/**
 * Latchkey admin → Integrations: which Stripe account the key in Secrets
 * belongs to (subscriptions, and guest payments for businesses on
 * Latchkey's account), live or test, the key's kind and the webhook secrets.
 */
export function PlatformStripeAdmin() {
  const fn = useServerFn(getPlatformStripe);
  const q = useQuery({ queryKey: ["platform-stripe"], queryFn: () => fn() });
  if (q.isLoading || !q.data) return <Skeleton className="h-48 rounded-2xl" />;
  const d = q.data;
  return (
    <section className="card-soft space-y-3 p-5">
      <h3 className="text-lg">{copy.platformTitle}</h3>
      {!d.ready ? (
        <p className="text-sm text-muted-foreground">{copy.notSet}</p>
      ) : (
        <>
          <StripeAccountCard
            identity={d.identity}
            title={copy.platformTitle}
            checkedAt={q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toISOString() : null}
            onCheck={() => void q.refetch()}
            checking={q.isFetching}
            linkKind="own"
            admin
          />
          <dl className="grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">{copy.key}</dt>
            <dd>
              {d.keyKind ? copy.keyKind(d.keyKind) : "—"} · {d.live ? copy.live : copy.test}
            </dd>
            <dt className="text-muted-foreground">{copy.webhooks}</dt>
            <dd>{copy.webhookSet(d.webhook, d.connectWebhook)}</dd>
          </dl>
          {d.keyKind === "restricted" ? (
            <div className="rounded-xl bg-muted p-3 text-sm">
              <p className="font-medium">{copy.needsTitle}</p>
              <p className="text-muted-foreground">{copy.needsBody}</p>
              <ul className="mt-2 space-y-1">
                {RESTRICTED_KEY_NEEDS.map((n) => (
                  <li key={n.resource}>
                    <span className="font-medium">
                      {n.resource}: {n.access}
                    </span>{" "}
                    <span className="text-muted-foreground">({n.why})</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
