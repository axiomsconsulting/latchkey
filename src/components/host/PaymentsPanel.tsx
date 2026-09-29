import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CreditCard, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { payments as copy } from "@/content/copy";
import { getPaymentStatus, syncPriceListToStripe } from "@/lib/payments.functions";

export function PaymentsPanel({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getPaymentStatus);
  const syncFn = useServerFn(syncPriceListToStripe);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["payment-status", propertyId],
    queryFn: () => statusFn({ data: { propertyId } }),
  });

  async function sync() {
    setBusy(true);
    try {
      const r = await syncFn({ data: { propertyId } });
      toast.success(copy.synced(r.created, r.updated));
      await qc.invalidateQueries({ queryKey: ["payment-status", propertyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : copy.syncFailed);
    } finally {
      setBusy(false);
    }
  }

  const webhookUrl = typeof window === "undefined" ? "" : `${window.location.origin}/api/public/stripe-webhook`;
  const d = q.data;

  return (
    <section className="card-soft p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <CreditCard className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        {q.isLoading ? null : d?.connected ? (
          <Badge variant="outline">{d.live ? copy.liveBadge : copy.testBadge}</Badge>
        ) : (
          <Badge variant="secondary">{copy.notConnected}</Badge>
        )}
      </div>

      {q.isLoading ? (
        <Skeleton className="mt-4 h-24 rounded-2xl" />
      ) : d?.connected ? (
        <div className="mt-4 space-y-3">
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-primary" /> {copy.connectedTo(d.account ?? "your Stripe account")}
          </p>
          {!d.webhookReady ? <p className="text-sm text-accent">{copy.webhookMissing}</p> : null}
          <p className="text-sm text-muted-foreground">{copy.syncedCount(d.syncedCount)}</p>
          <Button onClick={sync} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} {copy.syncButton}
          </Button>
        </div>
      ) : (
        <ol className="mt-4 space-y-3 text-sm">
          {copy.steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary font-display text-primary">{i + 1}</span>
              <span>
                <span className="font-medium">{s.title}</span>
                <span className="block text-muted-foreground">{s.body}</span>
              </span>
            </li>
          ))}
          <li className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary font-display text-primary">{copy.steps.length + 1}</span>
            <span>
              <span className="font-medium">{copy.webhookTitle}</span>
              <span className="block text-muted-foreground">{copy.webhookBody}</span>
              <code className="mt-1 block break-all rounded-xl bg-secondary px-3 py-2 text-xs">{webhookUrl}</code>
            </span>
          </li>
        </ol>
      )}
      {d && !d.connected && (d as { error?: string }).error ? (
        <p role="alert" className="mt-3 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{(d as { error?: string }).error}</p>
      ) : null}
    </section>
  );
}
