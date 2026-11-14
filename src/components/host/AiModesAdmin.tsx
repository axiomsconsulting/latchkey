import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { common, aiModesCopy as copy } from "@/content/copy";
import type { AiMode, AiModes } from "@/lib/assistant-modes";
import { getAiModes, saveAiModes } from "@/lib/admin.functions";
import { cn } from "@/lib/utils";

/** Latchkey admin → System: each assistant answers with AI, or with recorded phrases and the guide only. */
export function AiModesAdmin() {
  const getFn = useServerFn(getAiModes);
  const saveFn = useServerFn(saveAiModes);
  const q = useQuery({ queryKey: ["ai-modes"], queryFn: () => getFn() });
  const [modes, setModes] = useState<AiModes | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setModes(q.data);
  }, [q.data]);
  if (!modes) return q.isLoading ? <Loader2 className="size-5 animate-spin" /> : null;
  const changed =
    !!q.data &&
    (q.data.concierge !== modes.concierge || q.data.receptionist !== modes.receptionist);
  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <Sparkles className="size-5" aria-hidden /> {copy.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <Button
          disabled={!changed || busy}
          onClick={() => {
            setBusy(true);
            void saveFn({ data: modes })
              .then(() => q.refetch())
              .then(() => toast.success(copy.saved))
              .catch((e: unknown) => toast.error(e instanceof Error ? e.message : common.errorBody))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {common.save}
        </Button>
      </div>
      {(["concierge", "receptionist"] as const).map((who) => (
        <div key={who} className="space-y-2 rounded-xl border border-border p-3">
          <p className="font-medium">{copy.who[who]}</p>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={copy.who[who]}>
            {(["assisted", "full"] as AiMode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={modes[who] === m}
                onClick={() => setModes({ ...modes, [who]: m })}
                className={cn(
                  "rounded-xl border p-3 text-left text-sm",
                  modes[who] === m
                    ? "border-primary bg-primary/5 ring-2 ring-primary"
                    : "border-border",
                )}
              >
                <span className="block font-medium">{copy.mode[m]}</span>
                <span className="block text-muted-foreground">{copy.modeHelp[who][m]}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
