import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/host/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { common, settings as copy } from "@/content/copy";
import { useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { IntegrationSwitches } from "@/components/host/IntegrationSwitches";
import { ExtrasPriceList } from "@/components/host/ExtrasPriceList";
import { ThemeStudio } from "@/components/host/ThemeStudio";
import { loadDemoData, removeDemoData, saveHost } from "@/lib/host.functions";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Latchkey host dashboard" },
      {
        name: "description",
        content: "Your business details, demo content and guest data retention.",
      },
    ],
  }),
  component: SettingsPage,
});

type Host = {
  id: string;
  business_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  currency: string;
  timezone: string;
};

function SettingsPage() {
  const workspace = useWorkspace();
  const save = useServerFn(saveHost);
  const load = useServerFn(loadDemoData);
  const drop = useServerFn(removeDemoData);
  const qc = useQueryClient();

  const host = (workspace.data?.host ?? null) as Host | null;
  const [form, setForm] = useState({
    business_name: "",
    contact_email: "",
    contact_phone: "",
    currency: "GBP",
    timezone: "Europe/London",
  });
  const [busy, setBusy] = useState(false);
  const propsList = (workspace.data?.properties ?? []) as Array<{ id: string; name: string; short_code: string; theme_config: unknown }>;
  const { selectedId } = useSelectedProperty(propsList);
  const [demoBusy, setDemoBusy] = useState<"load" | "remove" | null>(null);

  useEffect(() => {
    if (!host) return;
    setForm({
      business_name: host.business_name ?? "",
      contact_email: host.contact_email ?? "",
      contact_phone: host.contact_phone ?? "",
      currency: host.currency ?? "GBP",
      timezone: host.timezone ?? "Europe/London",
    });
  }, [host]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!host) return;
    setBusy(true);
    try {
      await save({
        data: {
          id: host.id,
          business_name: form.business_name.trim(),
          contact_email: form.contact_email.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          currency: form.currency.toUpperCase(),
          timezone: form.timezone,
        },
      });
      await qc.invalidateQueries({ queryKey: ["workspace"] });
      toast.success(copy.saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  async function runDemo(action: "load" | "remove") {
    if (!workspace.data) return;
    setDemoBusy(action);
    try {
      if (action === "load") await load({ data: { hostId: workspace.data.hostId } });
      else await drop({ data: { hostId: workspace.data.hostId } });
      await qc.invalidateQueries();
      toast.success(action === "load" ? "Demo rooms loaded" : "Demo content removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setDemoBusy(null);
    }
  }

  if (workspace.isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const hasDemo = workspace.data?.hasDemo ?? false;
  const themedProperty = propsList.find((p) => p.id === selectedId) ?? null;
  const propertyCount = (workspace.data?.properties ?? []).length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <Button asChild variant="outline">
            <Link to="/app/setup">
              <Plus className="size-4" />
              {propertyCount === 0 ? "Set up your rooms" : "Add property"}
            </Link>
          </Button>
        }
      />

      <form onSubmit={submit} className="card-soft grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="text-lg sm:col-span-2">{copy.business}</h2>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="bn">{copy.businessName}</Label>
          <Input
            id="bn"
            className="h-12"
            required
            value={form.business_name}
            onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ce">{copy.contactEmail}</Label>
          <Input
            id="ce"
            type="email"
            className="h-12"
            value={form.contact_email}
            onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cp">{copy.contactPhone}</Label>
          <Input
            id="cp"
            className="h-12"
            value={form.contact_phone}
            onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cu">{copy.currency}</Label>
          <Input
            id="cu"
            maxLength={3}
            className="h-12 uppercase"
            value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tz">{copy.timezone}</Label>
          <Input
            id="tz"
            className="h-12"
            value={form.timezone}
            onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
          />
        </div>

        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {copy.save}
          </Button>
        </div>
      </form>

      {themedProperty && workspace.data ? <ExtrasPriceList propertyId={themedProperty.id} hostId={workspace.data.hostId} /> : null}
      {themedProperty ? <ThemeStudio property={themedProperty} /> : null}
      {workspace.data ? <IntegrationSwitches hostId={workspace.data.hostId} /> : null}

      <section className="card-soft p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg">{copy.demoTitle}</h2>
            <p className="text-sm text-muted-foreground">{copy.demoBody}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => runDemo("load")} disabled={demoBusy !== null}>
            {demoBusy === "load" ? <Loader2 className="size-4 animate-spin" /> : null}
            {hasDemo ? copy.resetDemo : copy.loadDemo}
          </Button>
          {hasDemo ? (
            <Button
              variant="outline"
              onClick={() => runDemo("remove")}
              disabled={demoBusy !== null}
            >
              {demoBusy === "remove" ? <Loader2 className="size-4 animate-spin" /> : null}
              {demoBusy === "remove" ? copy.removing : copy.removeDemo}
            </Button>
          ) : null}
        </div>
      </section>

      <section className="card-soft p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg">{copy.privacyTitle}</h2>
            <p className="text-sm text-muted-foreground">{copy.privacyBody}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
