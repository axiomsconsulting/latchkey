import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Loader2 } from "lucide-react";

import { EmptyState } from "@/components/host/EmptyState";
import { PageHeader } from "@/components/host/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { activity as copy } from "@/content/copy";
import { useRole, useWorkspace } from "@/hooks/use-host-data";
import { fieldChanges, rowName } from "@/lib/activity";
import { listActivity, type ActivityRow } from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/app/activity")({
  head: () => ({ meta: [{ title: "Activity · Latchkey host dashboard" }] }),
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
        <ol className="card-soft divide-y divide-border">
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

function ActivityItem({ row }: { row: ActivityRow }) {
  const name = rowName(row.changed);
  const changes = fieldChanges(row.action, row.changed);
  return (
    <li className="space-y-1 p-4">
      <p>
        <span className="font-medium">{row.actor === "system" ? copy.system : row.actor}</span>{" "}
        {copy.actions[row.action] ?? row.action} {copy.tables[row.table] ?? row.table}
        {name ? <span className="font-medium"> “{name}”</span> : null}
      </p>
      <p className="text-xs text-muted-foreground">{when.format(new Date(row.at))}</p>
      {changes.length ? (
        <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
          {changes.map((c) => (
            <li key={c.field}>
              {c.field}: {c.hidden ? copy.redacted : `${c.from ?? "—"} → ${c.to ?? "—"}`}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
