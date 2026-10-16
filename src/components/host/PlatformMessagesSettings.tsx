import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, ExternalLink, Inbox, MailCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { common, platformMsgCopy as copy } from "@/content/copy";
import { formatUkDate } from "@/lib/dates";
import { ensureInboundAddress, getNotifySettings } from "@/lib/notify.functions";

const PLATFORM: Record<string, string> = { airbnb: "Airbnb", booking_com: "Booking.com", vrbo: "Vrbo", expedia: "Expedia", other: "Other", gmail_confirm: "Gmail" };

/** Settings: forward booking-site message emails so each lands in the guest's conversation. */
export function PlatformMessagesSettings({ hostId, isOwner }: { hostId: string; isOwner: boolean }) {
  const fetchFn = useServerFn(getNotifySettings);
  const ensure = useServerFn(ensureInboundAddress);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notify-settings", hostId], queryFn: () => fetchFn({ data: { hostId } }) });
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const d = q.data;
  if (q.isLoading) return <Skeleton className="h-48 rounded-2xl" />;
  if (!d?.available) return null;
  const confirm = d.inbound.recent.find((r) => r.platform === "gmail_confirm");
  const confirmLink = confirm?.body?.match(/https:\/\/\S+/)?.[0] ?? null;
  const confirmCode = confirm?.body?.match(/Confirmation code: (\d+)/)?.[1] ?? null;
  const received = d.inbound.recent.filter((r) => r.platform !== "gmail_confirm");

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <Inbox className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
      </div>

      {!d.inbound.ready ? (
        <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p>
      ) : d.inbound.address ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">{copy.address}</p>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2">
            <code className="min-w-0 flex-1 break-all px-1 text-sm">{d.inbound.address}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void navigator.clipboard.writeText(d.inbound.address!).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? copy.copied : copy.copy}
            </Button>
          </div>
        </div>
      ) : isOwner ? (
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void ensure({ data: { hostId } })
              .then(() => qc.invalidateQueries({ queryKey: ["notify-settings", hostId] }))
              .catch((e: unknown) => toast.error(e instanceof Error ? e.message : common.errorBody))
              .finally(() => setBusy(false));
          }}
        >
          {copy.make}
        </Button>
      ) : null}

      {confirm ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-accent/40 bg-accent/10 p-3 text-sm">
          <MailCheck className="size-5 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            {copy.confirm}
            {confirmCode ? (
              <>
                : <code className="font-semibold">{confirmCode}</code>
              </>
            ) : null}
          </span>
          {confirmLink ? (
            <Button asChild size="sm" variant="outline">
              <a href={confirmLink} target="_blank" rel="noreferrer">
                {copy.confirmOpen} <ExternalLink className="size-4" />
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}

      {d.inbound.address ? (
        <details className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">{copy.stepsTitle}</summary>
          <ol className="mt-2 list-inside list-decimal space-y-1.5 text-sm">
            {copy.gmail.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="mt-2 text-sm">{copy.outlook}</p>
          <p className="mt-2 text-sm text-muted-foreground">{copy.reply}</p>
          <p className="mt-2 text-xs text-muted-foreground">{copy.privacy}</p>
        </details>
      ) : null}

      {d.inbound.address ? (
        <div>
          <p className="mb-1 text-sm font-medium">{copy.recent}</p>
          {received.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.none}</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {received.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{formatUkDate(r.received_at.slice(0, 10))}</span>
                  <span className="shrink-0 text-xs font-medium">{PLATFORM[r.platform ?? "other"] ?? r.platform}</span>
                  <span className="min-w-0 flex-1 truncate">{r.guest_name ?? r.subject}</span>
                  {r.booking_id ? (
                    <Link to="/app/bookings" search={{ guest: r.booking_id }} className="text-xs text-success hover:underline">
                      {copy.matched}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">{copy.unmatched}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
