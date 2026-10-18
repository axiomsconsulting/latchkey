import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Copy, History, Loader2, Maximize2 } from "lucide-react";

import { EmptyState } from "@/components/host/EmptyState";
import { PageHeader } from "@/components/host/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { activity as copy } from "@/content/copy";
import { useRole, useWorkspace } from "@/hooks/use-host-data";
import { fieldChanges, rowName } from "@/lib/activity";
import { listActivity, type ActivityRow } from "@/lib/team.functions";
import { rebrand } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/app/activity")({
  head: () => ({ meta: [{ title: rebrand("Activity · Latchkey host dashboard") }] }),
  component: ActivityPage,
});

const when = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function ActivityPage() {
  const workspace = useWorkspace();
  const { isOwner, loading } = useRole();
  const fetchPage = useServerFn(listActivity);
  const hostId = workspace.data?.hostId ?? "";
  const pages = useInfiniteQuery({
    queryKey: ["activity", hostId],
    enabled: !!hostId && isOwner,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => fetchPage({ data: { hostId, ...(pageParam ? { before: pageParam } : {}) } }),
    getNextPageParam: (last) => (last.more ? last.items[last.items.length - 1]?.id : undefined),
  });

  const rows = pages.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      {loading || pages.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !isOwner ? (
        <EmptyState icon={History} title={copy.title} body={copy.ownerOnly} />
      ) : rows.length === 0 ? (
        <EmptyState icon={History} title={copy.title} body={copy.empty} />
      ) : (
        <ol className="card-soft divide-y divide-border overflow-hidden">
          {rows.map((r) => (
            <ActivityItem key={r.id} row={r} />
          ))}
        </ol>
      )}
      {pages.hasNextPage ? (
        <Button variant="outline" onClick={() => void pages.fetchNextPage()} disabled={pages.isFetchingNextPage}>
          {pages.isFetchingNextPage ? <Loader2 className="size-4 animate-spin" /> : null}
          {copy.more}
        </Button>
      ) : null}
    </div>
  );
}

/** Long or structured values open in a window instead of stretching the page. */
const LONG = 80;
const isLong = (v: string | null | undefined) => !!v && (v.length > LONG || v.includes("\n"));

/** JSON is shown indented so it can be read; anything else as it is. */
function readable(v: string | null | undefined): string {
  if (!v) return "—";
  const t = v.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(t), null, 2);
    } catch {
      return v;
    }
  }
  return v;
}

function ActivityItem({ row }: { row: ActivityRow }) {
  const name = rowName(row.changed);
  const changes = fieldChanges(row.action, row.changed);
  const [open, setOpen] = useState<{ field: string; from: string | null; to: string | null } | null>(null);
  return (
    <li className="min-w-0 space-y-1 p-4">
      <p className="break-words">
        <span className="font-medium">{row.actor === "system" ? copy.system : row.actor}</span>{" "}
        {copy.actions[row.action] ?? row.action} {copy.tables[row.table] ?? row.table}
        {name ? <span className="font-medium"> “{name}”</span> : null}
      </p>
      <p className="text-xs text-muted-foreground">{when.format(new Date(row.at))}</p>
      {changes.length ? (
        <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
          {changes.map((c) => {
            const long = !c.hidden && (isLong(c.from) || isLong(c.to));
            return (
              <li key={c.field} className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {c.field}: {c.hidden ? copy.redacted : `${c.from ?? "—"} → ${c.to ?? "—"}`}
                </span>
                {long ? (
                  <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2" onClick={() => setOpen({ field: c.field, from: c.from ?? null, to: c.to ?? null })}>
                    <Maximize2 className="size-3.5" /> {copy.view}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <ValueWindow change={open} onClose={() => setOpen(null)} />
    </li>
  );
}

function ValueWindow({ change, onClose }: { change: { field: string; from: string | null; to: string | null } | null; onClose: () => void }) {
  const [wrap, setWrap] = useState(true);
  return (
    <Dialog open={!!change} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="flex max-h-[85vh] w-[min(56rem,calc(100vw-2rem))] max-w-none flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{change?.field}</DialogTitle>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={wrap} onCheckedChange={setWrap} /> {copy.wrap}
        </label>
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto md:grid-cols-2">
          <ValuePane label={copy.before} value={readable(change?.from)} wrap={wrap} />
          <ValuePane label={copy.after} value={readable(change?.to)} wrap={wrap} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ValuePane({ label, value, wrap }: { label: string; value: string; wrap: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() =>
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? copy.copied : copy.copy}
        </Button>
      </div>
      <pre className={wrap ? "max-h-[55vh] overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-xs" : "max-h-[55vh] overflow-auto whitespace-pre p-3 font-mono text-xs"}>
        {value}
      </pre>
    </section>
  );
}
