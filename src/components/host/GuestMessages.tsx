import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessagesSquare, ShieldCheck } from "lucide-react";

import { DashSection } from "@/components/host/DashboardSections";
import { openGuestThread } from "@/components/host/HostInbox";
import { Peek, PeekFact } from "@/components/host/Peek";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { guestMessagesCopy as copy } from "@/content/copy";
import type { ChipKey, Scope } from "@/lib/conversations";
import { formatUkDate } from "@/lib/dates";
import { listStayConversations } from "@/lib/messages.functions";
import { formatPence } from "@/lib/services";
import { cn } from "@/lib/utils";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const TONE: Record<ChipKey, string> = {
  unread: "bg-destructive text-destructive-foreground",
  reply: "bg-accent text-accent-foreground",
  approve: "bg-accent/15 text-accent",
  unpaid: "bg-destructive/10 text-destructive",
  deliver: "bg-primary/10 text-primary",
  jobs: "bg-primary/10 text-primary",
  unseen: "bg-muted text-muted-foreground",
  sorted: "bg-success/15 text-success",
};

/**
 * The in-house conversation with every guest at a glance: messages, extras
 * and requests recorded with the stay, and what each is waiting on. A row
 * opens that guest's conversation.
 */
export function GuestMessages({ propertyId }: { propertyId: string }) {
  const fn = useServerFn(listStayConversations);
  const [scope, setScope] = useState<Scope>("now");
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const q = useQuery({ queryKey: ["stay-conversations", propertyId, scope], queryFn: () => fn({ data: { propertyId, scope } }), refetchInterval: 30_000 });
  const stays = q.data?.stays ?? [];
  const shown = onlyWaiting ? stays.filter((s) => s.conversation.needsHost) : stays;
  const waiting = stays.filter((s) => s.conversation.needsHost).length;
  const unread = stays.reduce((n, s) => n + (s.conversation.chips.find((c) => c.key === "unread")?.count ?? 0), 0);

  return (
    <DashSection
      id="messages"
      icon={MessagesSquare}
      title={copy.title}
      action={
        <span className="flex items-center gap-1.5">
          {unread ? <Badge variant="destructive">{copy.newCount(unread)}</Badge> : null}
          {waiting ? <Badge>{copy.waitingCount(waiting)}</Badge> : null}
        </span>
      }
    >
      <p className="mb-3 flex items-start gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>{copy.usp}</span>
      </p>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border p-0.5 text-xs" role="radiogroup" aria-label={copy.showLabel}>
          {(["now", "upcoming", "past"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={scope === s}
              onClick={() => setScope(s)}
              className={cn("rounded-md px-2.5 py-1 font-medium", scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              {copy.scopes[s]}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" className="size-4 accent-primary" checked={onlyWaiting} onChange={(e) => setOnlyWaiting(e.target.checked)} />
          {copy.onlyWaiting}
        </label>
      </div>
      {q.isLoading ? <Skeleton className="h-20 rounded-xl" /> : null}
      {!q.isLoading && shown.length === 0 ? <p className="text-sm text-muted-foreground">{onlyWaiting ? copy.nothingWaiting : copy.empty[scope]}</p> : null}
      <ul className="divide-y divide-border">
        {shown.map((s) => {
          const c = s.conversation;
          return (
            <li key={s.bookingId}>
              <Peek
                className="block"
                content={
                  <div className="space-y-2">
                    <p className="font-medium">
                      {s.guest ?? copy.guest} {s.room ? <span className="text-muted-foreground">· {s.room}</span> : null}
                    </p>
                    <div>
                      <PeekFact label={copy.stay} value={`${formatUkDate(s.checkIn)} → ${formatUkDate(s.checkOut)}`} />
                      <PeekFact label={copy.messages} value={c.messages} />
                      {c.unpaidPence ? <PeekFact label={copy.unpaid} value={formatPence(c.unpaidPence)} /> : null}
                    </div>
                    {s.requests.length ? (
                      <ul className="space-y-0.5 border-t border-border pt-2">
                        {s.requests.slice(0, 6).map((r) => (
                          <li key={r.id} className="flex justify-between gap-3">
                            <span className="min-w-0 truncate">{r.label || copy.extras}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {copy.requestStatus[r.status] ?? r.status}
                              {r.totalPence ? ` · ${formatPence(r.totalPence)}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {s.jobs.length ? (
                      <ul className="space-y-0.5 border-t border-border pt-2">
                        {s.jobs.slice(0, 6).map((j) => (
                          <li key={j.id} className="flex justify-between gap-3">
                            <Link to="/app/services" search={{ job: j.id }} className="min-w-0 truncate hover:underline">
                              {j.title}
                            </Link>
                            <span className="shrink-0 text-muted-foreground">{copy.jobStatus[j.status] ?? j.status}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                }
              >
                <button type="button" onClick={() => openGuestThread(s.bookingId)} className="-mx-2 flex w-[calc(100%+1rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2 py-2.5 text-left hover:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {s.guest ?? copy.guest}
                      {s.room ? <span className="font-normal text-muted-foreground"> · {s.room}</span> : null}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.lastBody ? `${c.lastFromGuest ? copy.them : copy.you}: ${c.lastBody}` : copy.noMessages}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1">
                    {c.chips.map((chip) => (
                      <span key={chip.key} className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", TONE[chip.key])}>
                        {copy.chips[chip.key]?.(chip.count) ?? chip.key}
                      </span>
                    ))}
                  </span>
                  {c.lastAt ? <span className="w-full text-[11px] text-muted-foreground sm:w-auto">{when(c.lastAt)}</span> : null}
                </button>
              </Peek>
            </li>
          );
        })}
      </ul>
    </DashSection>
  );
}
