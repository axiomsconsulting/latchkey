import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/host/EmptyState";
import { PageHeader } from "@/components/host/PageHeader";
import { PricingAdmin } from "@/components/host/PricingAdmin";
import { PricingStudio } from "@/components/host/PricingStudio";
import { RoutinesAdmin } from "@/components/host/RoutinesAdmin";
import { VisitorAnalytics } from "@/components/host/VisitorAnalytics";
import { Stars } from "@/components/host/ShellExtras";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { adminCopy as copy, channels, common } from "@/content/copy";
import { useWorkspace } from "@/hooks/use-host-data";
import {
  addSuperAdmin,
  getAdminOverview,
  listSuperAdmins,
  removeSuperAdmin,
  getSiteSettings,
  listAllFeedback,
  listAnnouncements,
  resolveTrialFlag,
  saveSiteSettings,
  sendAnnouncement,
  setAnnouncementActive,
  setFeedbackStatus,
  setHostPackage,
  setHostPlan,
  viewAsHost,
  type HostStats,
} from "@/lib/admin.functions";
import { formatUkDate } from "@/lib/dates";
import { setPlatformStripe } from "@/lib/payments.functions";
import { DEFAULT_PRICING, monthlyPence, money, type PricingConfig } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/app/admin")({
  head: () => ({ meta: [{ title: "Admin · Latchkey" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

const day = (iso: string | null) => (iso ? formatUkDate(iso.slice(0, 10), { withYear: true }) : "—");

/** The super admin's view of the whole service. */
function AdminPage() {
  const ws = useWorkspace();
  const fetchOverview = useServerFn(getAdminOverview);
  const isSuper = ws.data?.isSuperAdmin === true;
  const q = useQuery({ queryKey: ["admin-overview"], enabled: isSuper, queryFn: () => fetchOverview() });

  if (ws.isLoading) return <Skeleton className="mx-auto h-64 max-w-6xl rounded-2xl" />;
  if (!isSuper) return <EmptyState icon={ShieldCheck} title={copy.title} body={copy.notAdmin} />;

  const pricing = (q.data?.pricing as PricingConfig | null) ?? DEFAULT_PRICING;
  const hosts = q.data?.hosts ?? [];
  const openFlags = (q.data?.flags ?? []).filter((f: { resolved_at: string | null }) => !f.resolved_at).length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      <Tabs defaultValue="overview">
        <TabsList className="h-12 flex-wrap rounded-2xl p-1">
          <TabsTrigger value="overview" className="h-10 rounded-xl px-4">{copy.tabOverview}</TabsTrigger>
          <TabsTrigger value="hosts" className="h-10 rounded-xl px-4">{copy.tabHosts}</TabsTrigger>
          <TabsTrigger value="flags" className="h-10 rounded-xl px-4">
            {copy.tabFlags} {openFlags ? <Badge variant="destructive" className="ml-2">{openFlags}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="feedback" className="h-10 rounded-xl px-4">{copy.tabFeedback}</TabsTrigger>
          <TabsTrigger value="messages" className="h-10 rounded-xl px-4">{copy.tabMessages}</TabsTrigger>
          <TabsTrigger value="visitors" className="h-10 rounded-xl px-4">{copy.tabVisitors}</TabsTrigger>
          <TabsTrigger value="pricing" className="h-10 rounded-xl px-4">{copy.tabPricing}</TabsTrigger>
          <TabsTrigger value="routines" className="h-10 rounded-xl px-4">{copy.tabRoutines}</TabsTrigger>
          <TabsTrigger value="settings" className="h-10 rounded-xl px-4">{copy.tabSettings}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          {q.isLoading ? <Skeleton className="h-48 rounded-2xl" /> : <Overview hosts={hosts} pricing={pricing} />}
        </TabsContent>
        <TabsContent value="hosts" className="mt-4">
          {q.isLoading ? <Skeleton className="h-48 rounded-2xl" /> : <HostTable hosts={hosts} pricing={pricing} />}
        </TabsContent>
        <TabsContent value="flags" className="mt-4">
          <Flags flags={q.data?.flags ?? []} hosts={hosts} />
        </TabsContent>
        <TabsContent value="feedback" className="mt-4">
          <FeedbackInbox />
        </TabsContent>
        <TabsContent value="messages" className="mt-4">
          <Announcements hosts={hosts} />
        </TabsContent>
        <TabsContent value="visitors" className="mt-4">
          <VisitorAnalytics />
        </TabsContent>
        <TabsContent value="pricing" className="mt-4">
          <PricingStudio />
        </TabsContent>
        <TabsContent value="routines" className="mt-4">
          <RoutinesAdmin />
        </TabsContent>
        <TabsContent value="settings" className="mt-4 space-y-6">
          <SiteSettings />
          <PricingAdmin />
          <SuperAdmins />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** What each business pays a month, if it's subscribed. */
function monthly(h: HostStats, pricing: PricingConfig) {
  return monthlyPence(pricing, h.rooms_per_property.length ? h.rooms_per_property : [1]);
}

function Overview({ hosts, pricing }: { hosts: HostStats[]; pricing: PricingConfig }) {
  const real = hosts.filter((h) => !h.is_demo);
  const sum = (f: (h: HostStats) => number) => real.reduce((n, h) => n + f(h), 0);
  const paying = real.filter((h) => h.subscription_status === "active" || h.subscription_status === "past_due");
  const trialing = real.filter((h) => h.subscription_status === "trialing" && h.trial_ends_at && Date.parse(h.trial_ends_at) > Date.now());
  const ended = real.length - paying.length - trialing.length - real.filter((h) => h.subscription_status === "comped").length;
  const platforms = useMemo(() => {
    const total: Record<string, number> = {};
    for (const h of real) for (const [k, v] of Object.entries(h.channels)) total[k] = (total[k] ?? 0) + v;
    return Object.entries(total).sort((a, b) => b[1] - a[1]);
  }, [real]);
  const maxPlatform = Math.max(1, ...platforms.map(([, n]) => n));

  const tiles: Array<[string, string]> = [
    [copy.statBusinesses, String(real.length)],
    [copy.statProperties, String(sum((h) => h.properties))],
    [copy.statRooms, String(sum((h) => h.rooms_per_property.reduce((a, b) => a + b, 0)))],
    [copy.statBookings30, String(sum((h) => h.bookings_30d))],
    [copy.statCheckins30, String(sum((h) => h.checkins_30d))],
    [copy.statMrr, money(paying.reduce((n, h) => n + monthly(h, pricing), 0), pricing.currency)],
    [copy.statPaying, String(paying.length)],
    [copy.statTrialing, String(trialing.length)],
    [copy.statEnded, String(Math.max(0, ended))],
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map(([label, value]) => (
          <div key={label} className="card-soft p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <section className="card-soft p-5">
        <h2 className="text-lg">{copy.platforms}</h2>
        <ul className="mt-3 space-y-2">
          {platforms.map(([k, n]) => (
            <li key={k} className="grid grid-cols-[8rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
              <span className="truncate">{(channels as Record<string, string>)[k] ?? k}</span>
              <span className="h-3 rounded-full bg-primary/80" style={{ width: `${(n / maxPlatform) * 100}%` }} />
              <span className="text-right tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function planLabel(h: HostStats) {
  if (h.subscription_status === "trialing") {
    const ended = !h.trial_ends_at || Date.parse(h.trial_ends_at) <= Date.now();
    return ended ? `Trial ended ${day(h.trial_ends_at)}` : `Trial to ${day(h.trial_ends_at)}`;
  }
  return { active: "Paying", past_due: "Payment failing", canceled: "Cancelled", comped: "Free" }[h.subscription_status] ?? h.subscription_status;
}

function HostTable({ hosts, pricing }: { hosts: HostStats[]; pricing: PricingConfig }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const plan = useServerFn(setHostPlan);
  const view = useServerFn(viewAsHost);
  const platformStripe = useServerFn(setPlatformStripe);
  const pkg = useServerFn(setHostPackage);
  const plans = ["start", "grow", "pro"];

  async function act(fn: () => Promise<unknown>, done?: () => Promise<unknown>) {
    try {
      await fn();
      await qc.invalidateQueries();
      await done?.();
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    }
  }

  return (
    <section className="card-soft overflow-x-auto p-0">
      <table className="w-full min-w-[56rem] text-left text-sm">
        <thead className="border-b border-border text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">{copy.colBusiness}</th>
            <th className="px-4 py-2 font-medium">{copy.colPlan}</th>
            <th className="px-4 py-2 font-medium">{copy.colSize}</th>
            <th className="px-4 py-2 font-medium">{copy.colUse}</th>
            <th className="px-4 py-2 font-medium">{copy.colBill}</th>
            <th className="px-4 py-2 font-medium">{copy.colLast}</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {hosts.map((h) => (
            <tr key={h.host_id} className="align-top">
              <td className="px-4 py-3">
                <span className="font-medium">{h.business_name}</span>
                {h.is_demo ? <Badge variant="outline" className="ml-2">Demo</Badge> : null}
                <span className="block text-xs text-muted-foreground">{h.owner_email ?? "No email yet (trial)"}</span>
                <span className="block text-xs text-muted-foreground">Joined {day(h.created_at)}</span>
              </td>
              <td className="px-4 py-3">
                {planLabel(h)}
                {h.plan_key ? (
                  <span className="block text-xs text-muted-foreground">
                    {h.plan_key}
                    {h.api_addon ? " + API" : ""}
                  </span>
                ) : null}
                {h.support_access_until && Date.parse(h.support_access_until) > Date.now() ? (
                  <Badge variant="secondary" className="mt-1 block w-fit">{copy.supportOn}</Badge>
                ) : null}
              </td>
              <td className="px-4 py-3 tabular-nums">
                {h.properties} · {h.rooms_per_property.reduce((a, b) => a + b, 0)}
              </td>
              <td className="px-4 py-3 tabular-nums">
                {h.bookings_30d} / {h.bookings_total}
              </td>
              <td className="px-4 py-3 tabular-nums">{money(monthly(h, pricing), pricing.currency)}</td>
              <td className="px-4 py-3">{day(h.last_sign_in_at)}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void act(() => view({ data: { hostId: h.host_id } }), () => navigate({ to: "/app/today" }))}
                  >
                    <Eye className="size-4" /> {copy.viewAs}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" aria-label="More">
                        ⋯
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => void act(() => plan({ data: { hostId: h.host_id, action: "extend_trial", days: 14 } }))}>
                        {copy.extend}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void act(() => plan({ data: { hostId: h.host_id, action: "back_to_trial", days: 14 } }))}>
                        {copy.backToTrial}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void act(() => plan({ data: { hostId: h.host_id, action: "comp" } }))}>
                        {copy.comp}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {plans.map((k) => (
                        <DropdownMenuItem key={k} onClick={() => void act(() => pkg({ data: { hostId: h.host_id, planKey: k, apiAddon: h.api_addon ?? false } }))}>
                          {copy.planPackage}: {k[0]!.toUpperCase() + k.slice(1)} {h.plan_key === k ? "✓" : ""}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuItem
                        onClick={() => void act(() => pkg({ data: { hostId: h.host_id, planKey: h.plan_key ?? "grow", apiAddon: !(h.api_addon ?? false) } }))}
                      >
                        {h.api_addon ? copy.apiAddonOff : copy.apiAddonOn}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => void act(() => platformStripe({ data: { hostId: h.host_id, on: true } }))}>
                        {copy.platformStripeOn}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void act(() => platformStripe({ data: { hostId: h.host_id, on: false } }))}>
                        {copy.platformStripeOff}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => void act(() => plan({ data: { hostId: h.host_id, action: "end_access" } }))}
                      >
                        {copy.endAccess}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Flags({
  flags,
  hosts,
}: {
  flags: Array<{ id: string; host_id: string; matched_host_id: string | null; reason: string; detail: string; created_at: string; resolved_at: string | null; resolution: string | null }>;
  hosts: HostStats[];
}) {
  const qc = useQueryClient();
  const resolve = useServerFn(resolveTrialFlag);
  const name = (id: string | null) => hosts.find((h) => h.host_id === id)?.business_name ?? "Unknown";
  if (flags.length === 0) return <div className="card-soft p-8 text-center text-muted-foreground">{copy.flagsEmpty}</div>;
  return (
    <ul className="space-y-3">
      {flags.map((f) => (
        <li key={f.id} className="card-soft flex flex-wrap items-start gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {copy.flagReason[f.reason] ?? f.reason}: {name(f.host_id)} ↔ {name(f.matched_host_id)}
            </p>
            <p className="text-sm text-muted-foreground">{f.detail}</p>
            <p className="text-xs text-muted-foreground">{day(f.created_at)}</p>
          </div>
          {f.resolved_at ? (
            <Badge variant="secondary">{copy.resolved}</Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void resolve({ data: { id: f.id, resolution: "" } }).then(() => qc.invalidateQueries({ queryKey: ["admin-overview"] }))
              }
            >
              {copy.resolve}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function FeedbackInbox() {
  const fetchList = useServerFn(listAllFeedback);
  const setStatus = useServerFn(setFeedbackStatus);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-feedback"], queryFn: () => fetchList() });
  if (q.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <div className="card-soft p-8 text-center text-muted-foreground">{copy.feedbackEmpty}</div>;
  return (
    <ul className="space-y-3">
      {rows.map((f) => (
        <li key={f.id} className="card-soft p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={f.kind === "bug" ? "destructive" : "secondary"}>{copy.kinds[f.kind] ?? f.kind}</Badge>
            {f.rating ? <Stars value={f.rating} size="size-4" /> : null}
            <span className="text-sm text-muted-foreground">
              {f.hosts?.business_name ?? "—"} · {day(f.created_at)}
              {f.page ? ` · ${f.page}` : ""}
            </span>
            <Select
              value={f.status}
              onValueChange={(v) =>
                void setStatus({ data: { id: f.id, status: v as "new" | "seen" | "planned" | "done" } }).then(() =>
                  qc.invalidateQueries({ queryKey: ["admin-feedback"] }),
                )
              }
            >
              <SelectTrigger className="ml-auto h-9 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(copy.statuses).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {f.message ? <p className="mt-2 whitespace-pre-wrap">{f.message}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function Announcements({ hosts }: { hosts: HostStats[] }) {
  const fetchList = useServerFn(listAnnouncements);
  const send = useServerFn(sendAnnouncement);
  const toggle = useServerFn(setAnnouncementActive);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-announcements"], queryFn: () => fetchList() });
  const [form, setForm] = useState({ to: "all", title: "", body: "", days: "" });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await send({
        data: {
          hostId: form.to === "all" ? null : form.to,
          title: form.title,
          body: form.body,
          expiresInDays: form.days ? Number(form.days) : null,
        },
      });
      await qc.invalidateQueries({ queryKey: ["admin-announcements"] });
      setForm({ to: "all", title: "", body: "", days: "" });
      toast.success(copy.msgSent);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={submit} className="card-soft space-y-3 p-5">
        <h2 className="text-lg">{copy.sendTitle}</h2>
        <div className="space-y-1">
          <Label>{copy.audience}</Label>
          <Select value={form.to} onValueChange={(v) => setForm((f) => ({ ...f, to: v }))}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">{copy.everyone}</SelectItem>
              {hosts
                .filter((h) => !h.is_demo)
                .map((h) => (
                  <SelectItem key={h.host_id} value={h.host_id}>
                    {h.business_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ann-title">{copy.msgTitle}</Label>
          <Input id="ann-title" required maxLength={120} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ann-body">{copy.msgBody}</Label>
          <Textarea id="ann-body" required rows={5} maxLength={2000} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ann-days">{copy.msgExpires}</Label>
          <Input id="ann-days" inputMode="numeric" className="w-32" value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value.replace(/\D/g, "") }))} />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {copy.msgSend}
        </Button>
      </form>
      <ul className="space-y-3">
        {(q.data ?? []).map((a) => (
          <li key={a.id} className="card-soft p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{a.title}</span>
              <Badge variant={a.active ? "default" : "outline"}>{a.active ? copy.msgActive : copy.msgOff}</Badge>
              <span className="text-xs text-muted-foreground">
                {a.hosts?.business_name ?? copy.everyone} · {day(a.created_at)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => void toggle({ data: { id: a.id, active: !a.active } }).then(() => qc.invalidateQueries({ queryKey: ["admin-announcements"] }))}
              >
                {a.active ? copy.msgStop : copy.msgResume}
              </Button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{a.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SiteSettings() {
  const fetchSettings = useServerFn(getSiteSettings);
  const save = useServerFn(saveSiteSettings);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["site-settings"], queryFn: () => fetchSettings() });
  const [form, setForm] = useState({ signupsOpen: true, invoiceNightlyLines: true, supportEmail: "", notice: "" });
  useEffect(() => {
    if (q.data) {
      setForm({
        signupsOpen: q.data.signups_open,
        invoiceNightlyLines: q.data.invoice_nightly_lines,
        supportEmail: q.data.support_email ?? "",
        notice: q.data.notice ?? "",
      });
    }
  }, [q.data]);

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
        <Label htmlFor="signups" className="text-base">
          {copy.signupsOpen}
        </Label>
        <Switch id="signups" checked={form.signupsOpen} onCheckedChange={(v) => setForm((f) => ({ ...f, signupsOpen: v }))} />
      </div>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
        <div>
          <Label htmlFor="nightly" className="text-base">
            {copy.nightlyLines}
          </Label>
          <p className="text-sm text-muted-foreground">{copy.nightlyLinesHelp}</p>
        </div>
        <Switch
          id="nightly"
          checked={form.invoiceNightlyLines}
          onCheckedChange={(v) => setForm((f) => ({ ...f, invoiceNightlyLines: v }))}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="support-email">{copy.supportEmail}</Label>
        <Input id="support-email" type="email" value={form.supportEmail} onChange={(e) => setForm((f) => ({ ...f, supportEmail: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="notice">{copy.notice}</Label>
        <Textarea id="notice" rows={2} maxLength={300} value={form.notice} onChange={(e) => setForm((f) => ({ ...f, notice: e.target.value }))} />
      </div>
      <Button
        onClick={() =>
          void save({ data: form })
            .then(() => qc.invalidateQueries({ queryKey: ["site-settings"] }))
            .then(() => toast.success(copy.saved))
            .catch((e: unknown) => toast.error(e instanceof Error ? e.message : common.errorBody))
        }
      >
        {common.save}
      </Button>
    </section>
  );
}

/** Who can manage Latchkey. A new super admin needs to sign in with a confirmed email. */
function SuperAdmins() {
  const fetchList = useServerFn(listSuperAdmins);
  const add = useServerFn(addSuperAdmin);
  const remove = useServerFn(removeSuperAdmin);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["super-admins"], queryFn: () => fetchList() });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["super-admins"] });
      toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-4 p-5">
      <div>
        <h2 className="text-lg">{copy.superAdminsTitle}</h2>
        <p className="text-sm text-muted-foreground">{copy.superAdminsBody}</p>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {(q.data ?? []).map((a) => (
          <li key={a.email} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {a.email} {a.you ? <Badge variant="secondary" className="ml-1">{copy.you}</Badge> : null}
              </span>
              {a.addedBy ? <span className="block text-xs text-muted-foreground">{copy.addedBy(a.addedBy, day(a.addedAt))}</span> : null}
            </span>
            {!a.you && (q.data?.length ?? 0) > 1 ? (
              <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => void run(() => remove({ data: { email: a.email } }), copy.removed)}>
                {copy.removeAdmin}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => add({ data: { email } }), copy.added).then(() => setEmail(""));
        }}
      >
        <Input type="email" required className="h-11 min-w-64 flex-1" placeholder={copy.addPlaceholder} value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" disabled={busy}>
          {copy.addAdmin}
        </Button>
      </form>
    </section>
  );
}
