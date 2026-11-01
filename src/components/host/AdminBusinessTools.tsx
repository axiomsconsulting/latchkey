import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { IntegrationSwitches } from "@/components/host/IntegrationSwitches";
import { HostWhatsAppAdmin } from "@/components/host/WhatsAppAdmin";
import { Button } from "@/components/ui/button";
import { adminCopy as copy, common, settings as settingsCopy } from "@/content/copy";
import { useWorkspace } from "@/hooks/use-host-data";
import { loadDemoData, removeDemoData } from "@/lib/host.functions";

/**
 * Latchkey admin → Businesses: the switches that are Latchkey's to decide for
 * the business being viewed (yours, or the one opened with "view as host"):
 * each integration in demo or live, and its sample data.
 */
export function AdminBusinessTools() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const load = useServerFn(loadDemoData);
  const drop = useServerFn(removeDemoData);
  const [busy, setBusy] = useState<"load" | "remove" | null>(null);
  const hostId = ws.data?.hostId;
  if (!hostId) return null;
  const name = (ws.data?.host as { business_name?: string } | null)?.business_name ?? "";
  const hasDemo = ws.data?.hasDemo ?? false;

  async function run(action: "load" | "remove") {
    setBusy(action);
    try {
      if (action === "load") await load({ data: { hostId: hostId! } });
      else await drop({ data: { hostId: hostId! } });
      await qc.invalidateQueries();
      toast.success(action === "load" ? copy.sampleLoaded : copy.sampleRemoved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="card-soft flex items-start gap-3 p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <Building2 className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg">{copy.viewingTitle(name)}</h2>
          <p className="text-sm text-muted-foreground">{copy.viewingBody}</p>
        </div>
      </div>
      <IntegrationSwitches hostId={hostId} />
      <HostWhatsAppAdmin hostId={hostId} />
      <div className="card-soft p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg">{settingsCopy.demoTitle}</h3>
            <p className="text-sm text-muted-foreground">{settingsCopy.demoBody}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void run("load")} disabled={busy !== null}>
            {busy === "load" ? <Loader2 className="size-4 animate-spin" /> : null}
            {hasDemo ? settingsCopy.resetDemo : settingsCopy.loadDemo}
          </Button>
          {hasDemo ? (
            <Button variant="outline" onClick={() => void run("remove")} disabled={busy !== null}>
              {busy === "remove" ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy === "remove" ? settingsCopy.removing : settingsCopy.removeDemo}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
