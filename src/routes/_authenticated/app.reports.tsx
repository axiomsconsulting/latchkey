import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BedDouble,
  ChartColumn,
  Clock,
  Download,
  Gift,
  LogIn,
  MessageCircle,
  SprayCan,
  Wrench,
} from "lucide-react";

import { EmptyState } from "@/components/host/EmptyState";
import { PageHeader } from "@/components/host/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { common, reportsCopy as copy } from "@/content/copy";
import { useRole, useWorkspace } from "@/hooks/use-host-data";
import { rebrand } from "@/lib/brand";
import { addDays, formatUkDate } from "@/lib/dates";
import { daysCsv, presetRange, type Range } from "@/lib/reports";
import { getOperationsReport } from "@/lib/reports.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/reports")({
  head: () => ({ meta: [{ title: rebrand("Reports · Latchkey host dashboard") }] }),
  component: ReportsPage,
});

type Preset = "7d" | "30d" | "month" | "lastMonth" | "custom";

const londonToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

function ReportsPage() {
  const ws = useWorkspace();
  const { canWrite, loading } = useRole();
  const properties = (ws.data?.properties ?? []) as Array<{ id: string; name: string }>;
  const hostId = ws.data?.hostId ?? null;
  const [propertyId, setPropertyId] = useState<string>("all");
  const [preset, setPreset] = useState<Preset>("30d");
  const [custom, setCustom] = useState<Range>(() => presetRange("30d", londonToday()));
  const range = preset === "custom" ? custom : presetRange(preset, londonToday());
  const fn = useServerFn(getOperationsReport);
  const q = useQuery({
    queryKey: ["ops-report", hostId, propertyId, range.from, range.to],
    enabled: !!hostId && canWrite && range.from < range.to,
    queryFn: () =>
      fn({
        data: {
          hostId: hostId!,
          propertyId: propertyId === "all" ? null : propertyId,
          from: range.from,
          to: range.to,
        },
      }),
  });

  if (ws.isLoading || loading) return <Skeleton className="mx-auto h-64 max-w-6xl rounded-2xl" />;
  if (!canWrite) return <EmptyState icon={ChartColumn} title={copy.title} body={copy.staffOnly} />;
  if (!properties.length)
    return <EmptyState icon={ChartColumn} title={copy.title} body={copy.noProperty} />;

  const d = q.data;
  const r = d?.report;
  const money = (pence: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: d?.currency ?? "GBP" }).format(
      pence / 100,
    );
  const show = (v: number | null, unit = "") => (v === null ? "—" : `${v}${unit}`);

  function download() {
    if (!r) return;
    const url = URL.createObjectURL(new Blob([daysCsv(r)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `operations-${range.from}-to-${addDays(range.to, -1)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <Button variant="outline" onClick={download} disabled={!r} data-tour="reports-download">
            <Download className="size-4" /> {copy.download}
          </Button>
        }
      />

      <div
        className="card-soft grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
        data-tour="reports-range"
      >
        <div className="space-y-1">
          <Label>{copy.property}</Label>
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{copy.allProperties}</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{copy.period}</Label>
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["7d", "30d", "month", "lastMonth", "custom"] as const).map((p) => (
                <SelectItem key={p} value={p}>
                  {copy.presets[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {preset === "custom" ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="rep-from">{copy.from}</Label>
              <Input
                id="rep-from"
                type="date"
                className="h-11"
                value={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rep-to">{copy.to}</Label>
              <Input
                id="rep-to"
                type="date"
                className="h-11"
                value={addDays(custom.to, -1)}
                onChange={(e) => setCustom((c) => ({ ...c, to: addDays(e.target.value, 1) }))}
              />
            </div>
          </>
        ) : (
          <p className="self-end pb-3 text-sm text-muted-foreground sm:col-span-2">
            {copy.rangeLine(formatUkDate(range.from), formatUkDate(addDays(range.to, -1)))}
          </p>
        )}
      </div>

      {q.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : q.error ? (
        <p className="card-soft p-6 text-muted-foreground">
          {q.error instanceof Error ? q.error.message : common.errorBody}
        </p>
      ) : r && d ? (
        <>
          {/* The headline numbers. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={BedDouble}
              label={copy.occupancy}
              value={show(r.occupancy, "%")}
              hint={copy.occupancyHint(r.occupiedNights, r.availableNights)}
            />
            <Kpi
              icon={LogIn}
              label={copy.checkIns}
              value={show(r.checkInRate, "%")}
              hint={copy.checkInsHint(r.arrivals, r.departures)}
            />
            <Kpi
              icon={SprayCan}
              label={copy.ready}
              value={d.hasReadiness ? show(r.readyOnArrival, "%") : "—"}
              hint={d.hasReadiness ? copy.readyHint : copy.readyNotYet}
            />
            <Kpi
              icon={Gift}
              label={copy.extras}
              value={money(r.extras.revenuePence)}
              hint={copy.extrasHint(r.extras.paidCount, r.extras.requested)}
            />
          </div>

          <section className="card-soft p-5" aria-labelledby="rep-days">
            <h2 id="rep-days" className="text-lg">
              {copy.byDay}
            </h2>
            <p className="text-sm text-muted-foreground">{copy.byDayHint(r.rooms)}</p>
            {/* One bar per night, as a share of the rooms that could be sold. */}
            <div
              className="mt-4 flex h-40 items-end gap-px overflow-hidden rounded-xl bg-muted/50 p-2"
              role="img"
              aria-label={copy.byDay}
            >
              {r.days.map((x) => {
                const share = x.available ? x.occupied / x.available : 0;
                return (
                  <span
                    key={x.day}
                    title={copy.dayTitle(
                      formatUkDate(x.day),
                      x.occupied,
                      x.available,
                      x.arrivals,
                      x.departures,
                    )}
                    className={cn(
                      "min-w-0 flex-1 rounded-t-sm",
                      share >= 0.999 ? "bg-primary" : "bg-primary/60",
                    )}
                    style={{ height: `${Math.max(2, share * 100)}%` }}
                  />
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>{formatUkDate(range.from)}</span>
              <span>{formatUkDate(addDays(range.to, -1))}</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label={copy.arrivals} value={String(r.arrivals)} />
              <Stat label={copy.departures} value={String(r.departures)} />
              <Stat
                label={copy.averageStay}
                value={r.averageStay === null ? "—" : copy.nights(r.averageStay)}
              />
              <Stat label={copy.averageParty} value={show(r.averageParty)} />
            </dl>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card-soft p-5" aria-labelledby="rep-sites">
              <h2 id="rep-sites" className="text-lg">
                {copy.bySite}
              </h2>
              <p className="text-sm text-muted-foreground">{copy.bySiteHint}</p>
              {r.sites.length ? (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 font-medium">{copy.site}</th>
                      <th className="py-2 text-right font-medium">{copy.stays}</th>
                      <th className="py-2 text-right font-medium">{copy.nightsCol}</th>
                      <th className="py-2 text-right font-medium">{copy.share}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {r.sites.map((s) => (
                      <tr key={s.site}>
                        <td className="py-2">{d.siteLabels[s.site] ?? s.site}</td>
                        <td className="py-2 text-right tabular-nums">{s.stays}</td>
                        <td className="py-2 text-right tabular-nums">{s.nights}</td>
                        <td className="py-2 text-right tabular-nums">{show(s.share, "%")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">{copy.noStays}</p>
              )}
            </section>

            <section className="card-soft space-y-4 p-5" aria-labelledby="rep-service">
              <h2 id="rep-service" className="text-lg">
                {copy.service}
              </h2>
              <ServiceRow
                icon={MessageCircle}
                title={copy.replies}
                value={
                  r.replies.medianReplyMinutes === null
                    ? "—"
                    : copy.duration(r.replies.medianReplyMinutes)
                }
                hint={copy.repliesHint(r.replies.threads)}
              />
              <ServiceRow
                icon={Clock}
                title={copy.requests}
                value={
                  r.requests.medianAcknowledgeMinutes === null
                    ? "—"
                    : copy.duration(Math.round(r.requests.medianAcknowledgeMinutes))
                }
                hint={copy.requestsHint(
                  r.requests.created,
                  r.requests.done,
                  r.requests.openNow,
                  r.requests.medianCompleteHours,
                )}
              />
              <ServiceRow
                icon={Wrench}
                title={copy.maintenance}
                value={String(r.maintenance.openNow)}
                hint={copy.maintenanceHint(r.maintenance.created, r.maintenance.done)}
              />
            </section>
          </div>
          <p className="text-xs text-muted-foreground">{copy.footnote}</p>
        </>
      ) : null}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof BedDouble;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article className="card-soft p-5">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4 text-primary" /> {label}
      </p>
      <p className="mt-2 font-display text-3xl tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-display text-xl tabular-nums">{value}</dd>
    </div>
  );
}

function ServiceRow({
  icon: Icon,
  title,
  value,
  hint,
}: {
  icon: typeof BedDouble;
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-3">
          <span className="font-medium">{title}</span>
          <span className="font-display text-xl tabular-nums">{value}</span>
        </p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
