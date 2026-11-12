import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Landmark, RefreshCw, Unplug, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { InfoTip } from "@/components/host/InfoTip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { bankTransfersCopy as copy, common } from "@/content/copy";
import {
  connectStarlingFeed,
  disconnectBankFeed,
  getBankTransfers,
  readBankNow,
  settleBankReceipt,
  uploadBankStatement,
} from "@/lib/bank-feed.functions";
import { BANKS } from "@/lib/bank-match";
import { money } from "@/lib/direct-rates";
import { cn } from "@/lib/utils";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const day = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Direct stays → Set-up → Bank transfers received (rules in src/lib/bank-match.ts): connect
 * Starling or upload any bank's statement; sure matches are marked paid, likely ones are checked here.
 */
export function BankTransfers({ propertyId }: { propertyId: string }) {
  const getFn = useServerFn(getBankTransfers);
  const connectFn = useServerFn(connectStarlingFeed);
  const disconnectFn = useServerFn(disconnectBankFeed);
  const readFn = useServerFn(readBankNow);
  const uploadFn = useServerFn(uploadBankStatement);
  const settleFn = useServerFn(settleBankReceipt);
  const qc = useQueryClient();
  const key = ["bank-transfers", propertyId];
  const q = useQuery({ queryKey: key, queryFn: () => getFn({ data: { propertyId } }) });
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function run<T>(name: string, f: () => Promise<T>, ok: (r: T) => string) {
    setBusy(name);
    try {
      const r = await f();
      toast.success(ok(r));
      await Promise.all([
        qc.invalidateQueries({ queryKey: key }),
        qc.invalidateQueries({ queryKey: ["direct"] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  if (q.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (q.error)
    return (
      <section className="card-soft p-5 text-sm">
        {q.error instanceof Error ? q.error.message : common.errorBody}
      </section>
    );
  const d = q.data!;
  if (!d.available)
    return (
      <section className="card-soft p-5">
        <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p>
      </section>
    );

  return (
    <section className="card-soft space-y-5 p-5" data-tour="bank-transfers">
      <div>
        <h2 className="flex items-center gap-2 text-lg">
          <Landmark className="size-5 text-primary" /> {copy.title}
          <InfoTip label={copy.title}>{copy.privacy}</InfoTip>
        </h2>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
        <p className="mt-1 text-sm font-medium">{copy.waiting(d.waiting.length)}</p>
      </div>

      {/* Which banks can do what. */}
      <div className="space-y-1.5">
        <h3 className="flex items-center gap-1 text-sm font-medium">
          {copy.yourBank}
          <InfoTip label={copy.yourBank}>{copy.banksHelp}</InfoTip>
        </h3>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {BANKS.map((b) => (
            <li key={b.key} className="rounded-lg border border-border p-2 text-xs">
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{b.name}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5",
                    b.way === "automatic" ? "bg-primary/10 text-primary" : "bg-muted",
                  )}
                >
                  {copy.ways[b.way]}
                </span>
              </span>
              <span className="text-muted-foreground">{b.export}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Starling: automatic. */}
      <div className="space-y-2 rounded-xl border border-border p-3">
        <h3 className="text-sm font-medium">{copy.starlingTitle}</h3>
        {d.feed ? (
          <>
            <p className="text-sm">
              {copy.connected(
                d.feed.label ?? "Starling",
                d.feed.lastReadAt ? when(d.feed.lastReadAt) : null,
              )}
            </p>
            {d.feed.lastError ? (
              <p className="text-sm text-destructive">{d.feed.lastError}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    "read",
                    () => readFn({ data: { propertyId } }),
                    (r) => copy.read(r.paid, r.check),
                  )
                }
              >
                <RefreshCw className={cn("size-4", busy === "read" && "animate-spin")} />
                {copy.readNow}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    "disconnect",
                    () => disconnectFn({ data: { propertyId } }),
                    () => copy.disconnected,
                  )
                }
              >
                <Unplug className="size-4" />
                {copy.disconnect}
              </Button>
            </div>
          </>
        ) : (
          <>
            <ol className="list-decimal space-y-0.5 pl-5 text-sm text-muted-foreground">
              {copy.starlingSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="starling-token">{copy.tokenLabel}</Label>
                <Input
                  id="starling-token"
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
              <Button
                disabled={token.trim().length < 20 || busy !== null}
                onClick={() =>
                  void run(
                    "connect",
                    () => connectFn({ data: { propertyId, token } }),
                    (r) => {
                      setToken("");
                      return copy.read(r.paid, r.check);
                    },
                  )
                }
              >
                {copy.connect}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Any bank: a statement. */}
      <div className="space-y-2 rounded-xl border border-border p-3">
        <h3 className="text-sm font-medium">{copy.uploadTitle}</h3>
        <p className="text-sm text-muted-foreground">{copy.uploadHelp}</p>
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            void run(
              "upload",
              async () => uploadFn({ data: { propertyId, csv: await f.text() } }),
              (r) => copy.uploaded(r.credits, r.paid, r.check),
            );
          }}
        />
        <Button variant="outline" disabled={busy !== null} onClick={() => file.current?.click()}>
          <Upload className="size-4" />
          {copy.upload}
        </Button>
      </div>

      {/* What matched. */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">{copy.listTitle}</h3>
        {d.receipts.length ? (
          <ul className="space-y-1.5">
            {d.receipts.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "rounded-lg border p-2.5 text-sm",
                  r.match === "check" ? "border-amber-500/60" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="tabular-nums">{day(r.date)}</span>
                  <span className="font-semibold tabular-nums">{money(r.amount, r.currency)}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {r.payer || r.details}
                  </span>
                  <span className="text-xs">
                    {r.match === "paid"
                      ? copy.paid
                      : r.match === "check"
                        ? copy.check
                        : copy.ignored}
                  </span>
                </div>
                {r.reference ? (
                  <p className="text-xs text-muted-foreground">
                    {copy.forBooking(r.guest ?? "", r.reference, money(r.total ?? 0, r.currency))}
                  </p>
                ) : null}
                {r.match === "check" ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">{copy.checkWhy}</span>
                    <Button
                      size="sm"
                      disabled={busy !== null}
                      onClick={() =>
                        void run(
                          r.id,
                          () =>
                            settleFn({ data: { propertyId, receiptId: r.id, action: "confirm" } }),
                          () => copy.paid,
                        )
                      }
                    >
                      <Check className="size-4" />
                      {copy.confirm}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() =>
                        void run(
                          r.id,
                          () =>
                            settleFn({ data: { propertyId, receiptId: r.id, action: "ignore" } }),
                          () => copy.ignored,
                        )
                      }
                    >
                      <X className="size-4" />
                      {copy.ignore}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.none}</p>
        )}
        {d.unmatched ? (
          <p className="text-xs text-muted-foreground">{copy.unmatched(d.unmatched)}</p>
        ) : null}
      </div>
    </section>
  );
}
