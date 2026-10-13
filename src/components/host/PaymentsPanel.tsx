import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CreditCard, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { common, payments as copy } from "@/content/copy";
import { useRole, useWorkspace } from "@/hooks/use-host-data";
import {
  connectStripe,
  disconnectStripe,
  getPaymentStatus,
  refreshStripe,
  setPlatformStripe,
  syncPriceListToStripe,
} from "@/lib/payments.functions";

/**
 * Settings → Card payments. The host connects their own Stripe account in a
 * couple of taps (Latchkey starts the account with their email; Stripe asks
 * the rest), and guests' card payments go straight to them.
 */
export function PaymentsPanel({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const ws = useWorkspace();
  const { isOwner } = useRole();
  const hostId = ws.data?.hostId ?? "";
  const email = (ws.data?.host as { contact_email?: string | null } | null | undefined)?.contact_email ?? null;
  const statusFn = useServerFn(getPaymentStatus);
  const connect = useServerFn(connectStripe);
  const refresh = useServerFn(refreshStripe);
  const unlink = useServerFn(disconnectStripe);
  const platform = useServerFn(setPlatformStripe);
  const syncFn = useServerFn(syncPriceListToStripe);
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["payment-status", propertyId], queryFn: () => statusFn({ data: { propertyId } }) });

  // Back from Stripe's sign-up: check the account and say where things stand.
  useEffect(() => {
    if (!hostId || typeof window === "undefined") return;
    const back = new URLSearchParams(window.location.search).get("stripe");
    if (!back) return;
    window.history.replaceState(null, "", window.location.pathname);
    void refresh({ data: { hostId } })
      .then((r) => {
        toast[r.ready ? "success" : "message"](r.ready ? copy.backDone : copy.backPending);
        return qc.invalidateQueries({ queryKey: ["payment-status"] });
      })
      .catch(() => {});
  }, [hostId, refresh, qc]);

  async function run(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["payment-status"] });
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  async function goToStripe() {
    setBusy("connect");
    try {
      const { url } = await connect({ data: { hostId, returnTo: `${window.location.origin}${window.location.pathname}` } });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
      setBusy(null);
    }
  }

  const d = q.data;
  const spinner = (key: string) => (busy === key ? <Loader2 className="size-4 animate-spin" /> : null);

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
        {d ? (
          d.ready ? (
            <Badge variant="outline">{d.live ? copy.readyBadge : copy.testBadge}</Badge>
          ) : d.mode === "connected" ? (
            <Badge variant="secondary">{copy.pendingBadge}</Badge>
          ) : (
            <Badge variant="secondary">{copy.notConnected}</Badge>
          )
        ) : null}
      </div>

      {q.isLoading || !d ? (
        <Skeleton className="mt-4 h-24 rounded-2xl" />
      ) : !d.platformReady ? (
        <p className="mt-4 rounded-xl bg-muted p-3 text-sm">{copy.notAvailable}</p>
      ) : d.mode === "platform" ? (
        <div className="mt-4 space-y-3">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-4 text-primary" /> {copy.platformTitle}
          </p>
          <p className="text-sm text-muted-foreground">{copy.platformBody}</p>
          <div className="flex flex-wrap gap-2">
            <SyncButton busy={busy} onSync={() => void run("sync", () => syncFn({ data: { propertyId } }).then((r) => toast.success(copy.synced(r.created, r.updated))))} />
            {d.isSuperAdmin && isOwner ? (
              <Button variant="outline" disabled={busy !== null} onClick={() => void run("own", () => platform({ data: { hostId, on: false } }))}>
                {spinner("own")} {copy.useOwn}
              </Button>
            ) : null}
          </div>
        </div>
      ) : d.mode === "connected" && d.ready ? (
        <div className="mt-4 space-y-3">
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-primary" /> {d.accountName ? copy.connectedTo(d.accountName) : copy.connectedUnnamed}
          </p>
          {!d.webhookReady ? <p className="text-sm text-accent">{copy.webhookMissing}</p> : null}
          <p className="text-sm text-muted-foreground">{copy.syncedCount(d.syncedCount)}</p>
          <div className="flex flex-wrap gap-2">
            <SyncButton busy={busy} onSync={() => void run("sync", () => syncFn({ data: { propertyId } }).then((r) => toast.success(copy.synced(r.created, r.updated))))} />
            <Button asChild variant="outline">
              <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">
                {copy.openDashboard} <ExternalLink className="size-4" />
              </a>
            </Button>
            {isOwner ? (
              <Button variant="ghost" disabled={busy !== null} onClick={() => void run("unlink", () => unlink({ data: { hostId } }), copy.unlinked)}>
                {copy.unlink}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="font-medium">{d.mode === "connected" ? copy.pendingBody : copy.connectTitle}</p>
          {d.mode !== "connected" ? <p className="text-sm text-muted-foreground">{copy.connectBody(email)}</p> : null}
          {isOwner ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="accent" disabled={busy !== null} onClick={() => void goToStripe()}>
                {spinner("connect")} {d.mode === "connected" ? copy.continueCta : copy.connectCta}
              </Button>
              {d.mode === "connected" ? (
                <Button variant="outline" disabled={busy !== null} onClick={() => void run("check", () => refresh({ data: { hostId } }))}>
                  {spinner("check")} {copy.checkAgain}
                </Button>
              ) : null}
              {d.isSuperAdmin ? (
                <Button variant="ghost" disabled={busy !== null} onClick={() => void run("platform", () => platform({ data: { hostId, on: true } }))}>
                  {spinner("platform")} {copy.usePlatform}
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{copy.ownerOnly}</p>
          )}
        </div>
      )}
    </section>
  );
}

function SyncButton({ busy, onSync }: { busy: string | null; onSync: () => void }) {
  return (
    <Button onClick={onSync} disabled={busy !== null}>
      {busy === "sync" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} {copy.syncButton}
    </Button>
  );
}
