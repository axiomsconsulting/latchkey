import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserCheck } from "lucide-react";
import { toast } from "sonner";

import { InfoTip } from "@/components/host/InfoTip";
import { SaveButton } from "@/components/host/SaveButton";
import { Switch } from "@/components/ui/switch";
import { checkinSettings, common } from "@/content/copy";
import { registerApplies } from "@/lib/hotel-register";
import { getReturningTrust, saveReturningTrust } from "@/lib/host.functions";
import { RETURNING_MODES, type ReturningMode } from "@/lib/returning-checks";
import { cn } from "@/lib/utils";

const copy = checkinSettings.returning;

/**
 * Settings → Check-in: whether guests who've stayed before show their ID again
 * (src/lib/returning-checks.ts), and in the UK the older quick proof (returning-trust.ts).
 */
export function ReturningGuestsSettings({
  property,
}: {
  property: { id: string; country_code?: string | null };
}) {
  const uk = registerApplies(property.country_code);
  const getFn = useServerFn(getReturningTrust);
  const saveFn = useServerFn(saveReturningTrust);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["returning-trust", property.id],
    queryFn: () => getFn({ data: { propertyId: property.id } }),
  });
  const [on, setOn] = useState(false);
  const [mode, setMode] = useState<ReturningMode>("lenient");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    setOn(q.data.on);
    setMode(q.data.mode);
  }, [q.data]);

  async function onSave() {
    setBusy(true);
    try {
      await saveFn({
        data: { propertyId: property.id, on, ...(q.data?.modeAvailable ? { mode } : {}) },
      });
      await qc.invalidateQueries({ queryKey: ["returning-trust", property.id] });
      toast.success(checkinSettings.saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  const dirty = !!q.data && (on !== q.data.on || mode !== q.data.mode);
  return (
    <section className="card-soft p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <UserCheck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl">
            {copy.title} <InfoTip label={copy.title}>{copy.howKnown}</InfoTip>
          </h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <SaveButton dirty={dirty} busy={busy} onClick={() => void onSave()} />
      </div>
      <div role="radiogroup" aria-label={copy.title} className="mt-4 grid gap-2">
        {RETURNING_MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            disabled={!q.data?.modeAvailable}
            onClick={() => setMode(m)}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors disabled:opacity-60",
              mode === m ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
            )}
          >
            <span className="block font-medium">{copy.modes[m].label}</span>
            <span className="block text-sm text-muted-foreground">{copy.modes[m].help}</span>
          </button>
        ))}
      </div>
      {q.data && !q.data.modeAvailable ? (
        <p className="mt-2 text-sm text-muted-foreground">{copy.needsModeUpdate}</p>
      ) : null}
      {uk && mode !== "lenient" ? (
        <>
          <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <span>
              <span className="block font-medium">
                {copy.on} <InfoTip label={copy.on}>{copy.privacy}</InfoTip>
              </span>
              <span className="block text-sm text-muted-foreground">{copy.onHelp}</span>
            </span>
            <Switch checked={on} onCheckedChange={setOn} disabled={!q.data?.available} />
          </label>
          {q.data && !q.data.available ? (
            <p className="mt-2 text-sm text-muted-foreground">{copy.needsUpdate}</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
