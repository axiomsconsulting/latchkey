import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, CheckCircle2, CircleSlash, Loader2, TriangleAlert, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { common, connectionHealthCopy as copy } from "@/content/copy";
import type { Health, HealthLine } from "@/lib/connection-health";
import { testConnections } from "@/lib/connection-health.functions";
import { cn } from "@/lib/utils";

const ICON: Record<Health, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: TriangleAlert,
  fail: XCircle,
  off: CircleSlash,
};
const TONE: Record<Health, string> = {
  ok: "text-emerald-600",
  warn: "text-amber-600",
  fail: "text-destructive",
  off: "text-muted-foreground",
};

/** Latchkey admin → Integrations: every outside service checked at once, with what to do. */
export function ConnectionHealth() {
  const test = useServerFn(testConnections);
  const [lines, setLines] = useState<HealthLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      setLines(await test());
    } catch (e) {
      setError(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card-soft space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <Activity className="size-5" aria-hidden /> {copy.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <Button onClick={() => void run()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {lines ? copy.again : copy.run}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {lines ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {lines.map((l) => {
            const Icon = ICON[l.status];
            return (
              <li key={l.key} className="flex items-start gap-3 p-3">
                <Icon className={cn("mt-0.5 size-5 shrink-0", TONE[l.status])} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {l.name}{" "}
                    <span className={cn("text-xs font-normal", TONE[l.status])}>
                      {copy.status[l.status]}
                    </span>
                  </p>
                  <p className="break-words text-sm text-muted-foreground">{l.detail}</p>
                  {l.fix ? <p className="mt-1 text-sm">{l.fix}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
