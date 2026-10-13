import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/host/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { billingCopy as copy, common } from "@/content/copy";
import { useRole, useWorkspace } from "@/hooks/use-host-data";
import { cancelSubscription, getBilling, openBillingPortal, startSubscription } from "@/lib/billing.functions";
import { formatUkDate } from "@/lib/dates";
import { money } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/app/billing")({
  validateSearch: (s: Record<string, unknown>): { done?: boolean } => (s["done"] ? { done: true } : {}),
  head: () => ({ meta: [{ title: "Subscription · Latchkey host dashboard" }] }),
  component: BillingPage,
});

const day = (iso: string | null) => (iso ? formatUkDate(iso.slice(0, 10), { withYear: true }) : "");

/** The host's Latchkey plan: trial, card, renewal and cancelling. */
function BillingPage() {
  const ws = useWorkspace();
  const { isOwner } = useRole();
  const { done } = Route.useSearch();
  const hostId = ws.data?.hostId ?? "";
  const fetchBilling = useServerFn(getBilling);
  const start = useServerFn(startSubscription);
  const portal = useServerFn(openBillingPortal);
  const cancel = useServerFn(cancelSubscription);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["billing", hostId], enabled: !!hostId, queryFn: () => fetchBilling({ data: { hostId } }) });
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function go(key: string, fn: () => Promise<{ url: string }>) {
    setBusy(key);
    try {
      const { url } = await fn();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
      setBusy(null);
    }
  }

  async function doCancel() {
    setBusy("cancel");
    try {
      await cancel({ data: { hostId } });
      await qc.invalidateQueries();
      toast.success(copy.canceledToast);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  const b = q.data;
  if (q.isLoading || !b) return <Skeleton className="mx-auto h-64 max-w-3xl rounded-2xl" />;
  if (!b.available) return null;
  const label = copy.phase[b.phase];
  const heading = typeof label === "function" ? label(b.daysLeft) : label;
  const returnTo = typeof window === "undefined" ? "" : `${window.location.origin}/app/billing`;
  const subscribed = b.hasSubscription && (b.phase === "active" || b.phase === "past_due");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      {done ? <p className="rounded-2xl bg-success/10 p-4">{copy.done}</p> : null}

      <section className="card-soft space-y-4 p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
            <CreditCard className="size-5" />
          </span>
          <div>
            <h2 className="text-xl">{heading}</h2>
            <p className="text-muted-foreground">{copy.price(money(b.price.pence, b.price.currency), b.price.properties, b.price.rooms)}</p>
          </div>
        </div>

        {b.phase === "trial" && !subscribed ? (
          <p>
            {copy.trialEnds(day(b.trialEndsAt))} {copy.chargeNote(day(b.trialEndsAt))}
          </p>
        ) : null}
        {(b.phase === "trial_ended" || b.phase === "canceled") && !subscribed ? <p>{copy.chargeNow}</p> : null}
        {subscribed && b.currentPeriodEnd ? <p>{copy.renews(day(b.currentPeriodEnd))}</p> : null}

        {!isOwner ? (
          <p className="text-sm text-muted-foreground">{copy.ownerOnly}</p>
        ) : !b.stripeReady ? (
          <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p>
        ) : b.phase === "comped" ? null : (
          <div className="flex flex-wrap gap-2">
            {!subscribed ? (
              <Button variant="accent" disabled={busy !== null} onClick={() => void go("start", () => start({ data: { hostId, returnTo } }))}>
                {busy === "start" ? <Loader2 className="size-4 animate-spin" /> : null}
                {b.phase === "canceled" ? copy.reactivate : copy.addCard}
              </Button>
            ) : (
              <Button variant="outline" disabled={busy !== null} onClick={() => void go("portal", () => portal({ data: { hostId, returnTo } }))}>
                {busy === "portal" ? <Loader2 className="size-4 animate-spin" /> : null}
                {copy.updateCard}
              </Button>
            )}
            {b.phase !== "canceled" && b.phase !== "trial_ended" ? (
              <Button variant="ghost" className="text-destructive" disabled={busy !== null} onClick={() => setConfirm(true)}>
                {copy.cancel}
              </Button>
            ) : null}
          </div>
        )}
      </section>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.cancelTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.cancelBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{common.cancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void doCancel()}>
              {copy.cancelConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
