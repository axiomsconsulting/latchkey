import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { common, demoDefaultsCopy as copy } from "@/content/copy";
import { viewAsHost } from "@/lib/admin.functions";
import { settingLabel } from "@/lib/demo-defaults";
import { clearDemoDefaults, listDemoDefaults } from "@/lib/demo.functions";

/**
 * Latchkey admin: open the shared demo business to change its settings, and see or clear
 * what's been kept. What's changed there stays through the daily rebuild.
 */
export function DemoDefaultsAdmin() {
  const listFn = useServerFn(listDemoDefaults);
  const clearFn = useServerFn(clearDemoDefaults);
  const viewFn = useServerFn(viewAsHost);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["demo-defaults"], queryFn: () => listFn() });
  const rows = q.data?.rows ?? [];

  async function open() {
    if (!q.data?.hostId) return;
    setBusy(true);
    try {
      await viewFn({ data: { hostId: q.data.hostId } });
      await qc.invalidateQueries({ queryKey: ["workspace"] });
      await navigate({ to: "/app/settings" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }
  async function clear(shortCode: string) {
    try {
      await clearFn({ data: { shortCode } });
      await qc.invalidateQueries({ queryKey: ["demo-defaults"] });
      toast.success(copy.cleared);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    }
  }

  return (
    <section className="card-soft space-y-3 p-5">
      <p className="text-sm text-muted-foreground">{copy.body}</p>
      <Button disabled={busy || !q.data?.hostId} onClick={() => void open()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Settings2 className="size-4" />}
        {copy.open}
      </Button>
      {q.data && !q.data.available ? <p className="text-sm">{copy.needsUpdate}</p> : null}
      {rows.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {rows.map((r) => (
            <li key={r.shortCode} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <span className="min-w-0 flex-1 basis-48">
                <span className="block font-medium">{r.shortCode}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.keys.map(settingLabel).join(", ")}
                </span>
              </span>
              <Button variant="outline" size="sm" onClick={() => void clear(r.shortCode)}>
                {copy.clear}
              </Button>
            </li>
          ))}
        </ul>
      ) : q.data?.available ? (
        <p className="text-sm text-muted-foreground">{copy.none}</p>
      ) : null}
    </section>
  );
}
