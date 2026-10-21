import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, ChevronDown, ChevronRight, Search, UserCheck, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { visitorsCopy as copy } from "@/content/copy";
import { duration, summarise, type Count, type Filters, type Period, type PersonRow } from "@/lib/analytics";
import { getVisitorAnalytics } from "@/lib/analytics.functions";
import { formatUkDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

const at = (iso: string) => `${formatUkDate(iso.slice(0, 10))} ${new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
const periodLabel = (key: string, p: Period) =>
  p === "month"
    ? new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    : p === "week"
      ? copy.weekOf(formatUkDate(key))
      : formatUkDate(key);

/** Super admin: who visits, what they look at, for how long, and who became a known person. */
export function VisitorAnalytics() {
  const fetchData = useServerFn(getVisitorAnalytics);
  const [days, setDays] = useState(30);
  const [period, setPeriod] = useState<Period>("day");
  const [filters, setFilters] = useState<Filters>({ hideBots: true, hideTeam: true, who: "all", search: "" });
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["visitor-analytics", days], queryFn: () => fetchData({ data: { days } }) });
  const ownHost = typeof window === "undefined" ? undefined : window.location.hostname;
  const s = useMemo(() => (q.data ? summarise({ ...q.data, ownHost }, filters, period) : null), [q.data, filters, period, ownHost]);
  const viewsByVisit = useMemo(() => {
    const m = new Map<string, Array<{ path: string; at: string; durationMs: number }>>();
    for (const v of q.data?.views ?? []) m.set(v.visitId, [...(m.get(v.visitId) ?? []), v]);
    return m;
  }, [q.data]);
  const visitById = useMemo(() => new Map((q.data?.visits ?? []).map((v) => [v.id, v])), [q.data]);
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-6">
      <section className="card-soft flex flex-wrap items-end gap-4 p-4">
        <Choice label={copy.range} value={String(days)} onChange={(v) => setDays(Number(v))} options={[["1", copy.day1], ["7", copy.days7], ["30", copy.days30], ["90", copy.days90], ["365", copy.days365]]} />
        <Choice label={copy.club} value={period} onChange={(v) => setPeriod(v as Period)} options={[["day", copy.byDay], ["week", copy.byWeek], ["month", copy.byMonth]]} />
        <Choice
          label={copy.who}
          value={filters.who}
          onChange={(v) => set({ who: v as Filters["who"] })}
          options={[["all", copy.whoAll], ["known", copy.whoKnown], ["anonymous", copy.whoAnon], ["converted", copy.whoConverted]]}
        />
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={filters.hideBots} onCheckedChange={(v) => set({ hideBots: v })} /> {copy.hideBots}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={filters.hideTeam} onCheckedChange={(v) => set({ hideTeam: v })} /> {copy.hideTeam}
        </label>
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={copy.search} value={filters.search} onChange={(e) => set({ search: e.target.value })} />
        </div>
      </section>

      {q.isLoading || !s ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : q.data?.migrationPending ? (
        <p className="rounded-2xl bg-muted p-4">{copy.migration}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {(
              [
                [copy.tPeople, String(s.people)],
                [copy.tVisitors, String(s.visitors)],
                [copy.tVisits, String(s.visits)],
                [copy.tViews, String(s.views)],
                [copy.tAvg, duration(s.avgVisitMs)],
                [copy.tKnown, String(s.known)],
                [copy.tConverted, `${s.converted} · ${s.conversionPct}%`],
              ] as Array<[string, string]>
            ).map(([label, value]) => (
              <div key={label} className="card-soft p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          {filters.hideBots && s.botsHidden ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Bot className="size-4" /> {copy.botsHidden(s.botsHidden)}
            </p>
          ) : null}
          {q.data?.truncated ? <p className="text-sm text-muted-foreground">{copy.truncated}</p> : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card-soft p-5">
              <h2 className="text-lg">{copy.pages}</h2>
              <table className="mt-3 w-full text-left text-sm tabular-nums">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">{copy.page}</th>
                    <th className="py-1 font-medium">{copy.views}</th>
                    <th className="py-1 font-medium">{copy.uniques}</th>
                    <th className="py-1 font-medium">{copy.avgTime}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {s.pages.map((p) => (
                    <tr key={p.path}>
                      <td className="max-w-[16rem] truncate py-1.5 font-mono text-xs">{p.path}</td>
                      <td className="py-1.5">{p.views}</td>
                      <td className="py-1.5">{p.visitors}</td>
                      <td className="py-1.5">{duration(p.avgMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <div className="grid gap-4 sm:grid-cols-2">
              <Bars title={copy.sources} rows={s.sources} />
              <Bars title={copy.places} rows={s.places} />
              <Bars title={copy.devices} rows={s.devices} />
              <Bars title={copy.browsers} rows={s.browsers} />
            </div>
          </div>

          <section className="card-soft overflow-x-auto p-0">
            <div className="flex items-center gap-2 p-5 pb-2">
              <Users className="size-5 text-primary" />
              <h2 className="text-lg">{copy.people}</h2>
            </div>
            <p className="px-5 pb-3 text-sm text-muted-foreground">{copy.peopleBody}</p>
            <table className="w-full min-w-[60rem] text-left text-sm">
              <thead className="border-y border-border text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">{copy.person}</th>
                  <th className="px-4 py-2 font-medium">{copy.visitsCol(period)}</th>
                  <th className="px-4 py-2 font-medium">{copy.time}</th>
                  <th className="px-4 py-2 font-medium">{copy.from}</th>
                  <th className="px-4 py-2 font-medium">{copy.device}</th>
                  <th className="px-4 py-2 font-medium">{copy.lastSeen}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {s.rows.slice(0, 300).map((r) => (
                  <Fragment key={r.key}>
                    <tr className="cursor-pointer align-top hover:bg-secondary/40" onClick={() => setOpen(open === r.key ? null : r.key)}>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 font-medium">
                          {open === r.key ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          {r.label}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          <StatusBadge r={r} />
                          {r.isBot ? <Badge variant="destructive">{copy.bot}</Badge> : null}
                          {r.isTeam ? <Badge variant="outline">{copy.team}</Badge> : null}
                          {r.browsers > 1 ? <Badge variant="outline">{copy.browsersN(r.browsers)}</Badge> : null}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {r.visits} · {copy.pagesN(r.pages)}
                        <span className="block text-xs text-muted-foreground">
                          {r.clubs.slice(0, 3).map((c) => `${periodLabel(c.period, period)}: ${c.visits}`).join(" · ")}
                          {r.clubs.length > 3 ? " …" : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{duration(r.ms)}</td>
                      <td className="px-4 py-3">
                        {r.places.slice(0, 2).join(" · ")}
                        <span className="block text-xs text-muted-foreground">{r.sources.slice(0, 3).join(", ")}</span>
                      </td>
                      <td className="px-4 py-3 text-xs">{r.devices.slice(0, 2).join(" / ")}</td>
                      <td className="px-4 py-3 text-xs">{at(r.lastSeen)}</td>
                    </tr>
                    {open === r.key ? (
                      <tr>
                        <td colSpan={6} className="bg-secondary/30 px-6 py-4">
                          <PersonDetail r={r} period={period} visitById={visitById} viewsByVisit={viewsByVisit} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {s.rows.length === 0 ? <p className="p-5 text-muted-foreground">{copy.empty}</p> : null}
            {s.rows.length > 300 ? <p className="p-5 text-sm text-muted-foreground">{copy.more(s.rows.length - 300)}</p> : null}
          </section>
          <p className="text-xs text-muted-foreground">{copy.privacy}</p>
        </>
      )}
    </div>
  );
}

function StatusBadge({ r }: { r: PersonRow }) {
  if (r.converted)
    return (
      <Badge className="gap-1">
        <UserCheck className="size-3" /> {copy.convertedOn(formatUkDate(r.knownAt!.slice(0, 10)))}
      </Badge>
    );
  return <Badge variant="secondary">{r.status === "known" ? copy.known : r.status === "trial" ? copy.trial : copy.anonymous}</Badge>;
}

type VisitLite = { id: string; startedAt: string; pages: number; durationMs: number; ip: string | null; referrer: string | null; city: string | null; region: string | null; country: string | null };

function PersonDetail({
  r,
  period,
  visitById,
  viewsByVisit,
}: {
  r: PersonRow;
  period: Period;
  visitById: Map<string, VisitLite>;
  viewsByVisit: Map<string, Array<{ path: string; at: string; durationMs: number }>>;
}) {
  const visits = r.visitIds
    .map((id) => visitById.get(id))
    .filter((v): v is VisitLite => !!v)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <dl className="space-y-2 text-sm">
        <Item label={copy.firstSeen} value={at(r.firstSeen)} />
        {r.knownAt ? <Item label={copy.knownSince} value={at(r.knownAt)} /> : null}
        <Item label={copy.places} value={r.places.join("\n")} />
        <Item label={copy.ips} value={r.ips.join("\n") || "—"} />
        <Item label={copy.devices} value={r.devices.join("\n")} />
        <Item label={copy.sources} value={r.sources.join(", ")} />
        {r.botReason ? <Item label={copy.bot} value={r.botReason} /> : null}
        <div>
          <dt className="text-xs text-muted-foreground">{copy.clubbed(period)}</dt>
          <dd>
            <ul className="mt-1 space-y-0.5 tabular-nums">
              {r.clubs.map((c) => (
                <li key={c.period}>
                  {periodLabel(c.period, period)}: {copy.clubLine(c.visits, c.pages, duration(c.ms))}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
      <ol className="space-y-3">
        {visits.slice(0, 30).map((v) => (
          <li key={v.id} className="rounded-xl border border-border bg-background p-3">
            <p className="text-sm font-medium">
              {at(v.startedAt)} · {copy.pagesN(v.pages)} · {duration(v.durationMs)}
            </p>
            <p className="text-xs text-muted-foreground">
              {[v.city, v.region, v.country].filter(Boolean).join(", ") || "—"} {v.referrer ? `· ${copy.via} ${v.referrer}` : ""}
            </p>
            <ul className="mt-2 space-y-0.5 text-xs">
              {(viewsByVisit.get(v.id) ?? [])
                .slice()
                .sort((a, b) => a.at.localeCompare(b.at))
                .map((p, i) => (
                  <li key={i} className="flex justify-between gap-4 font-mono">
                    <span className="truncate">{p.path}</span>
                    <span className="shrink-0 text-muted-foreground">{duration(p.durationMs)}</span>
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-line break-words">{value}</dd>
    </div>
  );
}

function Bars({ title, rows }: { title: string; rows: Count[] }) {
  const max = Math.max(1, ...rows.map((r) => r.visits));
  return (
    <section className="card-soft p-4">
      <h3 className="font-medium">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {rows.slice(0, 6).map((r) => (
          <li key={r.key} className="text-xs">
            <div className="flex justify-between gap-2">
              <span className="truncate">{r.key}</span>
              <span className="tabular-nums text-muted-foreground">{r.visits}</span>
            </div>
            <span className={cn("mt-0.5 block h-1.5 rounded-full bg-primary/70")} style={{ width: `${(r.visits / max) * 100}%` }} />
          </li>
        ))}
        {rows.length === 0 ? <li className="text-xs text-muted-foreground">—</li> : null}
      </ul>
    </section>
  );
}

function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-40 text-sm text-foreground">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
