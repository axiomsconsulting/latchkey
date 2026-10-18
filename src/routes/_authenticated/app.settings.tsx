import { useEffect, useState } from "react";
import { CustomDomainSettings } from "@/components/host/CustomDomainSettings";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLandOn } from "@/hooks/use-land-on";
import { CurrencyPicker, PhoneInput, TimeZonePicker } from "@/components/WorldPickers";
import { AlertSettings } from "@/components/host/AlertSettings";
import { PlatformMessagesSettings } from "@/components/host/PlatformMessagesSettings";
import { checkPhone, splitPhone } from "@/lib/world";
import { worldCopy } from "@/content/copy";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, History, Loader2, NotebookPen, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/host/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  activity as activityCopy,
  adminCopy,
  billingCopy,
  common,
  registerPage as registerCopy,
  settings as copy,
} from "@/content/copy";
import { SupportAccess } from "@/components/host/SupportAccess";
import { ApiAccessPanel } from "@/components/host/ApiAccessPanel";
import { useRole, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { TeamPanel } from "@/components/host/TeamPanel";
import { DEMO_EMAIL } from "@/lib/demo-account";
import { ChannelLabels } from "@/components/host/ChannelLabels";
import { IntegrationSwitches } from "@/components/host/IntegrationSwitches";
import { InvoiceSettings } from "@/components/host/InvoiceSettings";
import { ExtrasPriceList } from "@/components/host/ExtrasPriceList";
import { PaymentsPanel } from "@/components/host/PaymentsPanel";
import { ThemeStudio } from "@/components/host/ThemeStudio";
import { loadDemoData, removeDemoData, saveHost } from "@/lib/host.functions";
import { rebrand } from "@/lib/brand";

const FOCUS = ["business", "alerts", "messages", "team", "payments", "invoices", "api", "demo", "privacy"] as const;

export const Route = createFileRoute("/_authenticated/app/settings")({
  // ?focus=<section> lands on that part of Settings.
  validateSearch: (s: Record<string, unknown>): { focus?: (typeof FOCUS)[number] } =>
    typeof s["focus"] === "string" && (FOCUS as readonly string[]).includes(s["focus"]) ? { focus: s["focus"] as (typeof FOCUS)[number] } : {},
  head: () => ({
    meta: [
      { title: rebrand("Settings · Latchkey host dashboard") },
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
  const { focus } = Route.useSearch();
  useLandOn(focus ? `settings-${focus}` : null, !workspace.isLoading);
  const { isOwner, canWrite: canWriteHost } = useRole();
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
  const propsList = (workspace.data?.properties ?? []) as Array<{ id: string; name: string; short_code: string; theme_config: unknown; country_code?: string | null }>;
  const homeCountry = propsList[0]?.country_code ?? "GB";
  const [phone, setPhone] = useState<{ country: string; national: string; valid: boolean; e164: string | null }>({ country: "GB", national: "", valid: true, e164: null });
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
    const split = splitPhone(host.contact_phone, homeCountry);
    const parsed = split.national ? checkPhone(split.national, split.country) : null;
    setPhone({ ...split, valid: !parsed || parsed.ok, e164: parsed && parsed.ok ? parsed.e164 : null });
  }, [host, homeCountry]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!host) return;
    if (!phone.valid) {
      toast.error(worldCopy.fixPhone);
      document.getElementById("cp")?.focus();
      return;
    }
    setBusy(true);
    try {
      await save({
        data: {
          id: host.id,
          business_name: form.business_name.trim(),
          contact_email: form.contact_email.trim() || null,
          contact_phone: phone.national.trim() ? phone.e164 : null,
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
  const demo = (host as { contact_email?: string | null } | null)?.contact_email === DEMO_EMAIL;

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

      <form id="settings-business" onSubmit={submit} className="card-soft scroll-mt-24 p-5">
        {/* Business details and billing are the owner's; others can read them. */}
        <fieldset disabled={!isOwner} className="grid gap-4 sm:grid-cols-2">
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
          <PhoneInput id="cp" country={phone.country} national={phone.national} onChange={setPhone} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cu">{copy.currency}</Label>
          <CurrencyPicker id="cu" value={form.currency} onChange={(v) => setForm((f) => ({ ...f, currency: v }))} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tz">{copy.timezone}</Label>
          <TimeZonePicker id="tz" value={form.timezone} onChange={(v) => setForm((f) => ({ ...f, timezone: v }))} />
        </div>

        {isOwner ? (
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {copy.save}
            </Button>
          </div>
        ) : null}
        </fieldset>
      </form>

      {workspace.data ? (
        <div id="settings-alerts" className="scroll-mt-24 rounded-2xl">
          <AlertSettings hostId={workspace.data.hostId} canWrite={canWriteHost} />
        </div>
      ) : null}
      {workspace.data ? (
        <div id="settings-messages" className="scroll-mt-24 rounded-2xl">
          <PlatformMessagesSettings hostId={workspace.data.hostId} isOwner={isOwner} />
        </div>
      ) : null}
      {workspace.data ? (
        <div id="settings-team" className="scroll-mt-24 rounded-2xl">
          <TeamPanel hostId={workspace.data.hostId} isOwner={isOwner} demo={demo} />
        </div>
      ) : null}
      {isOwner ? (
        <Link to="/app/billing" className="card-soft flex items-center gap-3 p-5 hover:bg-secondary md:hidden">
          <CreditCard className="size-5 text-primary" />
          <span>
            <span className="block text-lg">{billingCopy.title}</span>
            <span className="block text-sm text-muted-foreground">{billingCopy.subtitle}</span>
          </span>
        </Link>
      ) : null}
      {workspace.data?.isSuperAdmin ? (
        <Link to="/app/admin" className="card-soft flex items-center gap-3 p-5 hover:bg-secondary md:hidden">
          <ShieldCheck className="size-5 text-primary" />
          <span>
            <span className="block text-lg">{adminCopy.title}</span>
            <span className="block text-sm text-muted-foreground">{adminCopy.subtitle}</span>
          </span>
        </Link>
      ) : null}
      {canWriteHost ? (
        <Link to="/app/register" className="card-soft flex items-center gap-3 p-5 hover:bg-secondary md:hidden">
          <NotebookPen className="size-5 text-primary" />
          <span>
            <span className="block text-lg">{registerCopy.title}</span>
            <span className="block text-sm text-muted-foreground">{registerCopy.subtitle}</span>
          </span>
        </Link>
      ) : null}
      {isOwner ? (
        <Link to="/app/activity" className="card-soft flex items-center gap-3 p-5 hover:bg-secondary md:hidden">
          <History className="size-5 text-primary" />
          <span>
            <span className="block text-lg">{activityCopy.title}</span>
            <span className="block text-sm text-muted-foreground">{activityCopy.subtitle}</span>
          </span>
        </Link>
      ) : null}

      {themedProperty && workspace.data ? <ExtrasPriceList propertyId={themedProperty.id} hostId={workspace.data.hostId} /> : null}
      {themedProperty && isOwner ? (
        <div id="settings-payments" className="scroll-mt-24 rounded-2xl">
          <PaymentsPanel propertyId={themedProperty.id} />
        </div>
      ) : null}
      {workspace.data ? (
        <div id="settings-invoices" className="scroll-mt-24 rounded-2xl">
          <InvoiceSettings hostId={workspace.data.hostId} isOwner={isOwner} />
        </div>
      ) : null}
      {workspace.data ? (
        <div id="settings-domain" className="scroll-mt-24 rounded-2xl">
          <CustomDomainSettings
            hostId={workspace.data.hostId}
            isOwner={isOwner}
            properties={(workspace.data.properties ?? []) as Array<{ id: string; name: string }>}
          />
        </div>
      ) : null}
      {workspace.data ? (
        <div id="settings-api" className="scroll-mt-24 rounded-2xl">
          <ApiAccessPanel hostId={workspace.data.hostId} canWrite={canWriteHost} />
        </div>
      ) : null}
      {workspace.data && !workspace.data.support ? (
        <SupportAccess
          hostId={workspace.data.hostId}
          until={(host as { support_access_until?: string | null } | null)?.support_access_until}
          isOwner={isOwner}
        />
      ) : null}
      {themedProperty ? <ThemeStudio property={themedProperty} /> : null}
      {workspace.data ? (
        <ChannelLabels
          hostId={workspace.data.hostId}
          labels={((host as { channel_labels?: Record<string, string> } | null)?.channel_labels ?? {}) as Record<string, string>}
          sites={(host as { booking_sites?: unknown } | null)?.booking_sites}
        />
      ) : null}
      {workspace.data && isOwner ? <IntegrationSwitches hostId={workspace.data.hostId} /> : null}

      {isOwner ? (
      <section id="settings-demo" className="card-soft scroll-mt-24 p-5">
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
      ) : null}

      <section id="settings-privacy" className="card-soft scroll-mt-24 p-5">
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
