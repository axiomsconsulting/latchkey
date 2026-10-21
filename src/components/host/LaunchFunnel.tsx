import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Filter } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { funnelCopy as copy } from "@/content/copy";
import { getLaunchFunnel } from "@/lib/analytics.functions";

/** Super admin: who came from where, and how far they got (tour → host demo → trial). */
export function LaunchFunnel() {
  const fn = useServerFn(getLaunchFunnel);
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ["launch-funnel", days], queryFn: () => fn({ data: { days } }) });
  const rows = q.data?.rows ?? [];
  return (
    <section className="card-soft space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg"><Filter className="size-5 text-primary" /> {copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="h-10 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[7, 30, 90].map((d) => <SelectItem key={d} value={String(d)}>{copy.lastDays(d)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : q.data?.migrationPending ? (
        <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                {copy.columns.map((c, i) => <th key={c} className={i < 2 ? "py-2 font-medium" : "py-2 text-right font-medium"}>{c}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={`${r.utmSource}-${r.utmCampaign}`}>
                  <td className="py-2">{r.utmSource}</td>
                  <td className="py-2">{r.utmCampaign}</td>
                  {[r.tourViews, r.tourCompletes, r.hostDemoViews, r.trialsStarted, r.trialsCompleted].map((n, i) => <td key={i} className="py-2 text-right tabular-nums">{n}</td>)}
                  <td className="py-2 text-right tabular-nums">{r.demoToTrial === null ? "—" : `${r.demoToTrial}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
