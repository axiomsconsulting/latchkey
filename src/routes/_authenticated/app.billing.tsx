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
import { billingCopy as copy, common, offerCopy } from "@/content/copy";
import { useRole, useWorkspace } from "@/hooks/use-host-data";
import { cancelSubscription, changePlan, getBilling, openBillingPortal, startSubscription } from "@/lib/billing.functions";
import { monthlyPrice, type Plan } from "@/lib/pricing-model";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
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
        {b.price.offerPence !== null && b.price.offerPence < b.price.pence ? (
          <p className="rounded-xl bg-accent/10 p-3 text-sm font-medium ring-1 ring-accent/30">
            {offerCopy.billing(b.price.offerLabel ?? "Launch offer", money(b.price.offerPence, b.price.currency), money(b.price.pence, b.price.currency))}
          </p>
        ) : null}

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

      {b.plans ? (
        <PlanPicker
          hostId={hostId}
          plans={b.plans}
          current={b.price.planKey}
          apiAddon={b.price.apiAddon}
          rooms={b.price.rooms}
          canChange={isOwner}
        />
      ) : null}

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

type PlanWithLabels = Plan & { featureLabels: string[] };

/** Three plans side by side; the recommended one stands out. */
function PlanPicker({
  hostId,
  plans,
  current,
  apiAddon,
  rooms,
  canChange,
}: {
  hostId: string;
  plans: { currency: string; apiAddon: { pricePence: number; includedRequests: number }; plans: PlanWithLabels[] };
  current: string | null;
  apiAddon: boolean;
  rooms: number;
  canChange: boolean;
}) {
  const change = useServerFn(changePlan);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const model = { currency: plans.currency, trialDays: 0, plans: plans.plans, apiAddon: plans.apiAddon };
  const currentPlan = plans.plans.find((p) => p.key === current);

  async function pick(planKey: string, addon: boolean) {
    setBusy(planKey);
    try {
      await change({ data: { hostId, planKey, apiAddon: addon } });
      await qc.invalidateQueries({ queryKey: ["billing"] });
      await qc.invalidateQueries({ queryKey: ["api-access"] });
      toast.success(copy.planChanged);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl">{copy.plansTitle}</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.plans.map((p) => {
          const yours = p.key === current;
          return (
            <article key={p.key} className={cn("card-soft flex flex-col p-5", p.highlight && "ring-2 ring-primary", yours && "bg-secondary/40")}>
              <div className="flex items-center gap-2">
                <h3 className="text-lg">{p.name}</h3>
                {p.highlight ? <Badge>{copy.recommended}</Badge> : null}
                {yours ? <Badge variant="secondary">{copy.yourPlan}</Badge> : null}
              </div>
              <p className="text-sm text-muted-foreground">{p.tagline}</p>
              <p className="mt-3 text-3xl font-semibold">
                {money(p.basePence, plans.currency)}
                <span className="text-base font-normal text-muted-foreground"> {copy.perMonth}</span>
              </p>
              <p className="text-sm text-muted-foreground">{copy.planRooms(p.includedRooms, money(p.extraRoomPence, plans.currency), p.maxProperties)}</p>
              <p className="mt-1 text-sm">{copy.youWouldPay(money(monthlyPrice(model, p, { rooms: Math.max(1, rooms), properties: 1, apiAddon: apiAddon && p.apiRequests === 0 }), plans.currency), rooms)}</p>
              <ul className="mt-3 flex-1 space-y-1 text-sm">
                {p.featureLabels.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {f}
                  </li>
                ))}
                {p.apiRequests > 0 ? <li className="text-muted-foreground">{copy.apiIncluded(p.apiRequests)}</li> : null}
              </ul>
              {canChange && !yours ? (
                <Button className="mt-4" variant={p.highlight ? "default" : "outline"} disabled={busy !== null} onClick={() => void pick(p.key, apiAddon)}>
                  {busy === p.key ? <Loader2 className="size-4 animate-spin" /> : null}
                  {copy.choosePlan(p.name)}
                </Button>
              ) : null}
            </article>
          );
        })}
      </div>
      {currentPlan && currentPlan.apiRequests === 0 ? (
        <div className="card-soft flex flex-wrap items-center gap-4 p-5">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium">{copy.apiAddonTitle}</h3>
            <p className="text-sm text-muted-foreground">
              {copy.apiAddonBody(money(plans.apiAddon.pricePence, plans.currency), plans.apiAddon.includedRequests)}
            </p>
          </div>
          <Switch
            checked={apiAddon}
            disabled={!canChange || busy !== null}
            onCheckedChange={(on) => void pick(currentPlan.key, on)}
            aria-label={copy.apiAddonTitle}
          />
        </div>
      ) : null}
    </section>
  );
}
