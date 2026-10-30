import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { common, updateCopy as copy } from "@/content/copy";
import type { Audience, UpdateMode, UpdateRequest } from "@/lib/app-update";
import { UpdateChooser } from "@/components/host/UpdateChooser";
import { getAppUpdates, setAppUpdate } from "@/lib/app-updates.functions";

const show = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * Latchkey admin → Site settings → App updates: ask every host dashboard or
 * every door tablet to load the newest version, now or at a set time.
 */
export function AppUpdatesAdmin() {
  const getFn = useServerFn(getAppUpdates);
  const q = useQuery({ queryKey: ["app-updates"], queryFn: () => getFn() });
  return (
    <section className="card-soft p-5">
      <h2 className="text-xl">{copy.adminTitle}</h2>
      <p className="text-sm text-muted-foreground">{copy.adminBody}</p>
      {q.data ? <p className="mt-2 text-sm">{copy.running(q.data.version)}</p> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(["hosts", "kiosks"] as const).map((a) => (
          <AudienceRow
            key={a}
            audience={a}
            asked={q.data?.updates[a] ?? null}
            onDone={() => void q.refetch()}
          />
        ))}
      </div>
    </section>
  );
}

function AudienceRow({
  audience,
  asked,
  onDone,
}: {
  audience: Audience;
  asked: UpdateRequest | null;
  onDone: () => void;
}) {
  const setFn = useServerFn(setAppUpdate);
  const [busy, setBusy] = useState(false);
  async function save(at: string | null, mode: UpdateMode) {
    setBusy(true);
    try {
      const res = await setFn({ data: { audience, at, mode } });
      toast.success(copy.saved(res.told));
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
      <p className="font-medium">{copy[audience]}</p>
      <p className="text-muted-foreground">
        {asked ? copy.asked(show(asked.at), copy.modeName[asked.mode]!) : copy.none}
      </p>
      <UpdateChooser
        busy={busy}
        onChoose={(mode, at) => void save(at ?? new Date().toISOString(), mode)}
      />
      {asked && Date.parse(asked.at) > Date.now() ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(null, "idle")}>
          {copy.cancel}
        </Button>
      ) : null}
    </div>
  );
}
