import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserCheck } from "lucide-react";
import { toast } from "sonner";

import { SaveButton } from "@/components/host/SaveButton";
import { Switch } from "@/components/ui/switch";
import { checkinSettings, common } from "@/content/copy";
import { registerApplies } from "@/lib/hotel-register";
import { getReturningTrust, saveReturningTrust } from "@/lib/host.functions";

const copy = checkinSettings.returning;

/** Settings → Check-in: let a returning guest skip the ID photo and selfie (rules in src/lib/returning-trust.ts). */
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
    enabled: uk,
    queryFn: () => getFn({ data: { propertyId: property.id } }),
  });
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setOn(q.data.on);
  }, [q.data]);

  async function onSave() {
    setBusy(true);
    try {
      await saveFn({ data: { propertyId: property.id, on } });
      await qc.invalidateQueries({ queryKey: ["returning-trust", property.id] });
      toast.success(checkinSettings.saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <UserCheck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{uk ? copy.body : copy.ukOnly}</p>
        </div>
        {uk ? (
          <SaveButton
            dirty={!!q.data && on !== q.data.on}
            busy={busy}
            onClick={() => void onSave()}
          />
        ) : null}
      </div>
      {uk ? (
        <>
          <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <span className="font-medium">{copy.on}</span>
            <Switch checked={on} onCheckedChange={setOn} disabled={!q.data?.available} />
          </label>
          {q.data && !q.data.available ? (
            <p className="mt-2 text-sm text-muted-foreground">{copy.needsUpdate}</p>
          ) : null}
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {copy.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="mt-3 rounded-xl bg-muted p-3 text-sm">{copy.privacy}</p>
        </>
      ) : null}
    </section>
  );
}
