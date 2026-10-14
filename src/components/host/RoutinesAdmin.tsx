import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, Loader2, Play, Zap } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { common, routinesCopy as copy, studioCopy } from "@/content/copy";
import { listRoutines, runRoutineNow, saveRoutine, type RoutineRow } from "@/lib/admin.functions";
import { formatUkDate } from "@/lib/dates";
import { JOBS, type Job } from "@/lib/jobs";
import { creditPence, type CostModel } from "@/lib/pricing-model";
import { money } from "@/lib/pricing";

const when = (iso: string) => `${formatUkDate(iso.slice(0, 10))} ${new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;

/** Credits a routine spent this month, where Latchkey can tell. */
function creditsFor(job: Job, uses: number, c: CostModel): number | null {
  if (job.metric === "ai:id_read") return uses * c.creditsPerAiRead;
  if (job.metric === "api:request") return (uses / 1000) * c.creditsPer1kApi;
  return null;
}

/** Super admin: every routine that spends Run credits, with switches, schedules and run-now. */
export function RoutinesAdmin() {
  const fetchList = useServerFn(listRoutines);
  const q = useQuery({ queryKey: ["admin-routines"], queryFn: () => fetchList() });

  if (q.isLoading || !q.data) return <Skeleton className="h-64 rounded-2xl" />;
  const { settings, usageMonth, costs, migrationPending } = q.data;

  return (
    <section className="space-y-4">
      <div className="card-soft space-y-2 p-5">
        <h2 className="text-xl">{copy.title}</h2>
        <p className="text-muted-foreground">{copy.body}</p>
        {migrationPending ? <p className="rounded-xl bg-warning/15 p-3 text-sm">{studioCopy.migration}</p> : null}
      </div>
      {JOBS.map((job) => (
        <RoutineCard key={job.key} job={job} row={settings.find((s) => s.key === job.key)} uses={usageMonth[job.metric] ?? 0} costs={costs} />
      ))}
    </section>
  );
}

function RoutineCard({ job, row, uses, costs }: { job: Job; row: RoutineRow | undefined; uses: number; costs: CostModel }) {
  const save = useServerFn(saveRoutine);
  const run = useServerFn(runRoutineNow);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const enabled = row?.enabled ?? true;
  const every = row?.every_minutes ?? job.defaultEvery ?? null;
  const credits = creditsFor(job, uses, costs);
  const intervals = Object.keys(copy.intervals)
    .map(Number)
    .filter((m) => m >= (job.defaultEvery ?? 0));

  async function act(key: string, fn: () => Promise<unknown>, done: (r: unknown) => string) {
    setBusy(key);
    try {
      const r = await fn();
      await qc.invalidateQueries({ queryKey: ["admin-routines"] });
      toast.success(done(r));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  const store = (next: { enabled?: boolean; everyMinutes?: number | null }) =>
    void act(
      "save",
      () => save({ data: { key: job.key, enabled: next.enabled ?? enabled, everyMinutes: next.everyMinutes !== undefined ? next.everyMinutes : job.kind === "scheduled" ? every : null } }),
      () => copy.saved,
    );

  return (
    <article className="card-soft flex flex-col gap-4 p-5 md:flex-row md:items-start">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
        {job.kind === "scheduled" ? <Clock className="size-5" /> : <Zap className="size-5" />}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg">{job.name}</h3>
          <Badge variant="outline">{job.kind === "scheduled" ? copy.scheduled : copy.onUse}</Badge>
          {!enabled ? <Badge variant="destructive">{copy.off}</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">{job.what}</p>
        {job.wakes ? <p className="text-sm text-muted-foreground">{copy.wakes(job.wakes)}</p> : null}
        <p className="text-sm">
          {copy.thisMonth(uses)} ·{" "}
          {credits !== null ? copy.credits(credits.toFixed(1), money(Math.round(credits * creditPence(costs)), "GBP")) : copy.inRoomCost}
        </p>
        <p className="text-xs text-muted-foreground">
          {row?.last_run_at ? copy.lastRun(when(row.last_run_at), row.last_status ?? "", row.last_duration_ms) : copy.never}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 md:flex-col md:items-end">
        <label className="flex items-center gap-2 text-sm">
          {enabled ? copy.on : copy.off}
          <Switch checked={enabled} disabled={busy !== null} onCheckedChange={(v) => store({ enabled: v })} aria-label={`${job.name}: ${enabled ? copy.on : copy.off}`} />
        </label>
        {job.kind === "scheduled" ? (
          <Select value={String(every ?? job.defaultEvery)} disabled={busy !== null} onValueChange={(v) => store({ everyMinutes: Number(v) })}>
            <SelectTrigger className="w-48" aria-label={copy.every}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {intervals.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {copy.intervals[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {job.runnable ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              void act(
                "run",
                () => run({ data: { key: job.key as "calendar_sync" | "retention" | "demo_tour" } }),
                (r) => copy.ran((r as { status: string }).status),
              )
            }
          >
            {busy === "run" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} {copy.runNow}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
