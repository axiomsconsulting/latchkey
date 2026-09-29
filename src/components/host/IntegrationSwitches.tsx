import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConical, Radio } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { common, integrations as copy } from "@/content/copy";
import { INTEGRATION_KEYS, type IntegrationKey, type Mode } from "@/lib/integration-modes";
import { getIntegrations, saveIntegrationModes } from "@/lib/services.functions";
import { cn } from "@/lib/utils";

export function IntegrationSwitches({ hostId }: { hostId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(getIntegrations);
  const save = useServerFn(saveIntegrationModes);
  const q = useQuery({ queryKey: ["integrations", hostId], queryFn: () => fn({ data: { hostId } }) });

  async function setMode(key: IntegrationKey, mode: Mode) {
    if (!q.data) return;
    const modes = { ...q.data.modes, [key]: mode };
    qc.setQueryData(["integrations", hostId], { ...q.data, modes });
    try {
      await save({ data: { hostId, modes } });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
      await qc.invalidateQueries({ queryKey: ["integrations", hostId] });
    }
  }

  return (
    <section className="card-soft p-5">
      <h2 className="text-lg">{copy.title}</h2>
      <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
      {q.isLoading || !q.data ? (
        <Skeleton className="mt-4 h-48 rounded-2xl" />
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {INTEGRATION_KEYS.map((key) => {
            const item = copy.items[key];
            const mode = q.data.modes[key];
            const ready = q.data.ready[key];
            return (
              <li key={key} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {item.name}
                    {mode === "live" ? (
                      <Badge variant={ready ? "default" : "destructive"}>{ready ? copy.ready : copy.needsSetup}</Badge>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">{mode === "demo" ? item.demo : item.live}</p>
                </div>
                <div role="radiogroup" aria-label={item.name} className="flex rounded-full bg-muted p-1">
                  {(["demo", "live"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={mode === m}
                      onClick={() => setMode(key, m)}
                      className={cn(
                        "spring flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium",
                        mode === m ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground",
                      )}
                    >
                      {m === "demo" ? <FlaskConical className="size-4" /> : <Radio className="size-4" />}
                      {m === "demo" ? copy.demo : copy.live}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
