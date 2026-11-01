import { useEffect, useState } from "react";
import { PageSections, Section } from "@/components/PageSections";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomDomainSettings } from "@/components/host/CustomDomainSettings";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLandOn } from "@/hooks/use-land-on";
import { CurrencyPicker, PhoneInput, TimeZonePicker } from "@/components/WorldPickers";
import { AlertSettings } from "@/components/host/AlertSettings";
import { PlatformMessagesSettings } from "@/components/host/PlatformMessagesSettings";
import { checkPhone, splitPhone } from "@/lib/world";
import { worldCopy } from "@/content/copy";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  Building2,
  CreditCard,
  History,
  IdCard,
  Loader2,
  NotebookPen,
  MonitorSmartphone,
  Palette,
  Plus,
  QrCode,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
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
  settingsMenuCopy,
} from "@/content/copy";
import { SupportAccess } from "@/components/host/SupportAccess";
import { ApiAccessPanel } from "@/components/host/ApiAccessPanel";
import { useRole, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { TeamPanel } from "@/components/host/TeamPanel";
import { DEMO_EMAIL } from "@/lib/demo-account";
import { GoodbyeSettings } from "@/components/host/GoodbyeSettings";
import { WelcomeCardSettings } from "@/components/host/WelcomeCardSettings";
import { PrivacySettings } from "@/components/host/PrivacySettings";
import { GroupBrandSettings } from "@/components/host/GroupBrandSettings";
import { InvoiceSettings } from "@/components/host/InvoiceSettings";
import { ExtrasPriceList } from "@/components/host/ExtrasPriceList";
import { PaymentsPanel } from "@/components/host/PaymentsPanel";
import { ThemeStudio } from "@/components/host/ThemeStudio";
import { removeDemoData, saveHost } from "@/lib/host.functions";
import { GuestRecordsSettings } from "@/components/host/GuestRecordsSettings";
import { GuestMessagesSettings } from "@/components/host/GuestMessagesSettings";
import { StayAccessSettings } from "@/components/host/StayAccessSettings";
import { ReviewSettings } from "@/components/host/ReviewSettings";
import { CheckinJourney } from "@/components/host/CheckinJourney";
import { KioskCalibration } from "@/components/host/KioskCalibration";
import { DoorTablets } from "@/components/host/DoorTablets";
import { KioskRestSettings } from "@/components/host/KioskRestSettings";
import { PropertyPicker } from "@/components/host/PropertyPicker";
import { SaveButton, changed } from "@/components/host/SaveButton";
import { rebrand } from "@/lib/brand";

// Any section can be landed on (search, Today's links); those with their own card id glow there, the rest on their block.
const FOCUS = [
  "business",
  "group",
  "alerts",
  "messages",
  "team",
  "payments",
  "invoices",
  "api",
  "demo",
  "privacy",
  "checkin",
  "records",
  "guestTexts",
  "stayAccess",
  "reviews",
  "kioskRest",
  "kioskTablets",
  "kioskScreen",
  "goodbye",
  "welcomeCards",
  "extras",
  "money",
  "theme",
  "labels",
  "domain",
  "support",
  "shortcuts",
  "shortcuts2",
  "adminLink",
] as const;
/** The menu's groups, in order, with their icons (names in settingsMenuCopy). */
const SETTINGS_GROUPS = [
  { id: "business", icon: Building2 },
  { id: "checkin", icon: IdCard },
  { id: "rooms", icon: QrCode },
  { id: "reviews", icon: Star },
  { id: "money", icon: CreditCard },
  { id: "kiosk", icon: MonitorSmartphone },
  { id: "look", icon: Palette },
  { id: "apps", icon: Bell },
] as const;
// Latchkey-wide and per-business admin switches (demo / live, sample data) live in Latchkey admin → Businesses.
const OWN_CARD = new Set([
  "business",
  "alerts",
  "messages",
  "team",
  "payments",
  "invoices",
  "api",
  "demo",
  "privacy",
  "checkin",
  "records",
  "guestTexts",
  "stayAccess",
  "reviews",
  "kioskRest",
  "kioskTablets",
  "kioskScreen",
  "goodbye",
  "welcomeCards",
  "money",
]);

export const Route = createFileRoute("/_authenticated/app/settings")({
  // ?focus=<section> lands on that part of Settings.
  validateSearch: (s: Record<string, unknown>): { focus?: (typeof FOCUS)[number] } =>
    typeof s["focus"] === "string" && (FOCUS as readonly string[]).includes(s["focus"])
      ? { focus: s["focus"] as (typeof FOCUS)[number] }
      : {},
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
  // The menu at the top: one tab per group; a link to a section opens its tab, then lands on it.
  const superAdmin = workspace.data?.isSuperAdmin === true;
  const groupOf = (id: string): string => settingsMenuCopy.sections[id]?.[1] ?? "business";
  const [tab, setTab] = useState<string>(() =>
    focus ? (settingsMenuCopy.sections[focus]?.[1] ?? "business") : "business",
  );
  useEffect(() => {
    if (focus) setTab(groupOf(focus));
  }, [focus, superAdmin]);
  useLandOn(
    focus ? (OWN_CARD.has(focus) ? `settings-${focus}` : `section-${focus}`) : null,
    !workspace.isLoading && !!focus && tab === groupOf(focus),
  );
  // The price list moved to Properties → Extras; old links still find it.
  const navigate = useNavigate();
  useEffect(() => {
    if (focus === "extras")
      void navigate({ to: "/app/properties", search: { tab: "extras" }, replace: true });
    // Booking sites' names and icons live with the calendar links now.
    if (focus === "labels")
      void navigate({ to: "/app/connections", search: { focus: "sites" }, replace: true });
  }, [focus, navigate]);
  const { isOwner, canWrite: canWriteHost } = useRole();
  const save = useServerFn(saveHost);
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
  const propsList = (workspace.data?.properties ?? []) as Array<{
    id: string;
    name: string;
    short_code: string;
    theme_config: unknown;
    country_code?: string | null;
  }>;
  const homeCountry = propsList[0]?.country_code ?? "GB";
  const [phone, setPhone] = useState<{
    country: string;
    national: string;
    valid: boolean;
    e164: string | null;
  }>({ country: "GB", national: "", valid: true, e164: null });
  const { selectedId, select } = useSelectedProperty(propsList);
  const [demoBusy, setDemoBusy] = useState<"remove" | null>(null);

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
    setPhone({
      ...split,
      valid: !parsed || parsed.ok,
      e164: parsed && parsed.ok ? parsed.e164 : null,
    });
  }, [host, homeCountry]);

  // Save stays grey until a detail differs from what's saved.
  const businessDirty =
    !!host &&
    changed(
      { ...form, contact_phone: phone.national.trim() ? phone.e164 : null },
      {
        business_name: host.business_name ?? "",
        contact_email: host.contact_email ?? "",
        contact_phone: host.contact_phone ?? null,
        currency: host.currency ?? "GBP",
        timezone: host.timezone ?? "Europe/London",
      },
    );

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

  async function runDemo(action: "remove") {
    if (!workspace.data) return;
    setDemoBusy(action);
    try {
      await drop({ data: { hostId: workspace.data.hostId } });
      await qc.invalidateQueries();
      toast.success("Demo content removed");
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

  const groups = SETTINGS_GROUPS;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <>
            {/* Look and feel, extras, payments, guest records and the kiosk are set per property. */}
            {propsList.length > 1 ? (
              <PropertyPicker properties={propsList} value={selectedId} onChange={select} />
            ) : null}
            <Button asChild variant="outline">
              <Link to="/app/setup">
                <Plus className="size-4" />
                {propertyCount === 0 ? "Set up your rooms" : "Add property"}
              </Link>
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList
          aria-label={settingsMenuCopy.label}
          className="h-auto min-h-12 flex-wrap justify-start gap-1 rounded-2xl p-1"
        >
          {groups.map((g) => (
            <TabsTrigger
              key={g.id}
              value={g.id}
              className="h-10 gap-2 rounded-xl px-4"
              data-tour={`settings-tab-${g.id}`}
            >
              <g.icon className="size-4" aria-hidden /> {settingsMenuCopy.groups[g.id]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <PageSections page="settings" anchors only={(id) => groupOf(id) === tab}>
        <Section id="business">
          <form id="settings-business" onSubmit={submit} className="card-soft scroll-mt-24 p-5">
            {/* Business details and billing are the owner's; others can read them. */}
            <fieldset disabled={!isOwner} className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-start justify-between gap-3 sm:col-span-2">
                <h2 className="text-lg">{copy.business}</h2>
                {isOwner ? (
                  <SaveButton type="submit" dirty={businessDirty} busy={busy} label={copy.save} />
                ) : null}
              </div>

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
                <PhoneInput
                  id="cp"
                  country={phone.country}
                  national={phone.national}
                  onChange={setPhone}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cu">{copy.currency}</Label>
                <CurrencyPicker
                  id="cu"
                  value={form.currency}
                  onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tz">{copy.timezone}</Label>
                <TimeZonePicker
                  id="tz"
                  value={form.timezone}
                  onChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
                />
              </div>
            </fieldset>
          </form>
        </Section>

        <Section id="alerts">
          {workspace.data ? (
            <div id="settings-alerts" className="scroll-mt-24 rounded-2xl">
              <AlertSettings hostId={workspace.data.hostId} canWrite={canWriteHost} />
            </div>
          ) : null}
        </Section>
        <Section id="messages">
          {workspace.data ? (
            <div id="settings-messages" className="scroll-mt-24 rounded-2xl">
              <PlatformMessagesSettings hostId={workspace.data.hostId} isOwner={isOwner} />
            </div>
          ) : null}
        </Section>
        <Section id="group">
          {workspace.data && !demo ? (
            <GroupBrandSettings
              hostId={workspace.data.hostId}
              isOwner={isOwner}
              themeConfig={themedProperty?.theme_config}
            />
          ) : null}
        </Section>
        <Section id="team">
          {demo ? null : (
            <>
              {workspace.data ? (
                <div id="settings-team" className="scroll-mt-24 rounded-2xl">
                  <TeamPanel hostId={workspace.data.hostId} isOwner={isOwner} demo={demo} />
                </div>
              ) : null}
            </>
          )}
        </Section>
        <Section id="shortcuts">
          <>
            {isOwner ? (
              <Link
                to="/app/billing"
                className="card-soft flex items-center gap-3 p-5 hover:bg-secondary md:hidden"
              >
                <CreditCard className="size-5 text-primary" />
                <span>
                  <span className="block text-lg">{billingCopy.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {billingCopy.subtitle}
                  </span>
                </span>
              </Link>
            ) : null}
          </>
        </Section>
        <Section id="adminLink">
          {workspace.data?.isSuperAdmin ? (
            <Link
              to="/app/admin"
              className="card-soft flex items-center gap-3 p-5 hover:bg-secondary md:hidden"
            >
              <ShieldCheck className="size-5 text-primary" />
              <span>
                <span className="block text-lg">{adminCopy.title}</span>
                <span className="block text-sm text-muted-foreground">{adminCopy.subtitle}</span>
              </span>
            </Link>
          ) : null}
        </Section>
        <Section id="shortcuts2">
          <>
            {canWriteHost ? (
              <Link
                to="/app/register"
                className="card-soft flex items-center gap-3 p-5 hover:bg-secondary md:hidden"
              >
                <NotebookPen className="size-5 text-primary" />
                <span>
                  <span className="block text-lg">{registerCopy.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {registerCopy.subtitle}
                  </span>
                </span>
              </Link>
            ) : null}
            {isOwner ? (
              <Link
                to="/app/activity"
                className="card-soft flex items-center gap-3 p-5 hover:bg-secondary md:hidden"
              >
                <History className="size-5 text-primary" />
                <span>
                  <span className="block text-lg">{activityCopy.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {activityCopy.subtitle}
                  </span>
                </span>
              </Link>
            ) : null}
          </>
        </Section>

        {/* Tax, bank details and away (the price list itself is under Properties → Extras). */}
        <Section id="money">
          {themedProperty && workspace.data ? (
            <ExtrasPriceList
              propertyId={themedProperty.id}
              hostId={workspace.data.hostId}
              parts="money"
            />
          ) : null}
        </Section>
        <Section id="payments">
          {demo ? null : (
            <>
              {themedProperty && isOwner ? (
                <div id="settings-payments" className="scroll-mt-24 rounded-2xl">
                  <PaymentsPanel propertyId={themedProperty.id} />
                </div>
              ) : null}
            </>
          )}
        </Section>
        <Section id="invoices">
          {workspace.data ? (
            <div id="settings-invoices" className="scroll-mt-24 rounded-2xl">
              <InvoiceSettings hostId={workspace.data.hostId} isOwner={isOwner} />
            </div>
          ) : null}
        </Section>
        <Section id="domain">
          {demo ? null : (
            <>
              {workspace.data ? (
                <div id="settings-domain" className="scroll-mt-24 rounded-2xl">
                  <CustomDomainSettings
                    hostId={workspace.data.hostId}
                    isOwner={isOwner}
                    properties={
                      (workspace.data.properties ?? []) as Array<{ id: string; name: string }>
                    }
                  />
                </div>
              ) : null}
            </>
          )}
        </Section>
        <Section id="api">
          {demo ? null : (
            <>
              {workspace.data ? (
                <div id="settings-api" className="scroll-mt-24 rounded-2xl">
                  <ApiAccessPanel hostId={workspace.data.hostId} canWrite={canWriteHost} />
                </div>
              ) : null}
            </>
          )}
        </Section>
        <Section id="support">
          {demo ? null : (
            <>
              {workspace.data && !workspace.data.support ? (
                <SupportAccess
                  hostId={workspace.data.hostId}
                  until={
                    (host as { support_access_until?: string | null } | null)?.support_access_until
                  }
                  isOwner={isOwner}
                />
              ) : null}
            </>
          )}
        </Section>
        <Section id="theme">
          {themedProperty ? <ThemeStudio property={themedProperty} /> : null}
        </Section>

        <Section id="demo">
          {/* Owners can remove sample data; Latchkey admins load it from Latchkey admin → Businesses. */}
          {isOwner && hasDemo ? (
            <section id="settings-demo" className="card-soft scroll-mt-24 p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
                  <Sparkles className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg">{copy.demoTitle}</h2>
                  <p className="text-sm text-muted-foreground">{copy.demoOwnerBody}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
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
        </Section>

        <Section id="privacy">
          {workspace.data ? (
            <PrivacySettings hostId={workspace.data.hostId} isOwner={isOwner} />
          ) : null}
        </Section>
        <Section id="checkin">
          {themedProperty ? (
            <div id="settings-checkin" className="scroll-mt-24 rounded-2xl">
              <CheckinJourney
                property={themedProperty as unknown as { id: string; short_code: string }}
              />
            </div>
          ) : null}
        </Section>
        <Section id="guestTexts">
          {themedProperty && workspace.data ? (
            <div id="settings-guestTexts" className="scroll-mt-24 rounded-2xl">
              {/* The shared demo can try it (always demo mode) but not ask support for WhatsApp. */}
              <GuestMessagesSettings
                propertyId={(themedProperty as unknown as { id: string }).id}
                hostId={workspace.data.hostId}
                isOwner={isOwner && !demo}
              />
            </div>
          ) : null}
        </Section>
        <Section id="records">
          {themedProperty ? (
            <div id="settings-records" className="scroll-mt-24 rounded-2xl">
              <GuestRecordsSettings
                property={
                  themedProperty as unknown as {
                    id: string;
                    guest_records?: unknown;
                    country_code?: string | null;
                  }
                }
              />
            </div>
          ) : null}
        </Section>
        <Section id="stayAccess">
          {themedProperty ? (
            <div id="settings-stayAccess" className="scroll-mt-24 rounded-2xl">
              <StayAccessSettings propertyId={(themedProperty as { id: string }).id} />
            </div>
          ) : null}
        </Section>
        <Section id="reviews">
          {themedProperty ? (
            <div id="settings-reviews" className="scroll-mt-24 rounded-2xl">
              <ReviewSettings propertyId={(themedProperty as { id: string }).id} />
            </div>
          ) : null}
        </Section>
        <Section id="welcomeCards">
          {themedProperty ? (
            <div id="settings-welcomeCards" className="scroll-mt-24 rounded-2xl">
              <WelcomeCardSettings
                property={themedProperty as unknown as { id: string; short_code: string }}
              />
            </div>
          ) : null}
        </Section>
        <Section id="goodbye">
          {themedProperty ? (
            <div id="settings-goodbye" className="scroll-mt-24 rounded-2xl">
              <GoodbyeSettings
                property={themedProperty as unknown as { id: string; short_code: string }}
              />
            </div>
          ) : null}
        </Section>
        <Section id="kioskTablets">
          {themedProperty ? (
            <div id="settings-kioskTablets" className="scroll-mt-24 rounded-2xl">
              <DoorTablets
                property={themedProperty as unknown as { id: string; short_code: string }}
              />
            </div>
          ) : null}
        </Section>
        <Section id="kioskScreen">
          {themedProperty ? (
            <div id="settings-kioskScreen" className="scroll-mt-24 rounded-2xl">
              <KioskCalibration
                property={themedProperty as unknown as { id: string; short_code: string }}
              />
            </div>
          ) : null}
        </Section>
        <Section id="kioskRest">
          {themedProperty ? (
            <div id="settings-kioskRest" className="scroll-mt-24 rounded-2xl">
              <KioskRestSettings
                property={
                  themedProperty as unknown as {
                    id: string;
                    short_code: string;
                    kiosk_rest?: unknown;
                    quiet_hours_start?: string | null;
                    quiet_hours_end?: string | null;
                  }
                }
              />
            </div>
          ) : null}
        </Section>
      </PageSections>
    </div>
  );
}
