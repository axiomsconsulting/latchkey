import { useEffect, useState, type ReactNode } from "react";
import { trackEvent } from "@/lib/track";
import { isDemoBrowser } from "@/lib/demo-session";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  BookOpen,

  CalendarSync,
  ChevronRight,
  CircleCheck,
  CircleX,
  TriangleAlert,
  DoorOpen,
  Check,
  Download,
  ExternalLink,
  Loader2,
  Mail,
  X,
  Filter,
  Inbox,
  LogOut,
  Monitor,
  Printer,
  QrCode,
  Settings2,
  Sparkles,
  SprayCan,
  Wrench,
  Hand,
  Send,
  MessagesSquare,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { ChannelBadge, type Channel } from "@/components/ChannelBadge";
import { EmptyState } from "@/components/host/EmptyState";
import { GuestReviews } from "@/components/host/GuestReviews";
import { DashboardSections, DashSection } from "@/components/host/DashboardSections";
import { KioskWelcomePanel } from "@/components/host/KioskWelcomePanel";
import { KioskRestQuick } from "@/components/host/KioskRestSettings";
import { GuestMessages } from "@/components/host/GuestMessages";
import { GuideLinkButton } from "@/components/host/GuideLinkButton";
import { PageHeader } from "@/components/host/PageHeader";
import { Peek, PeekFact } from "@/components/host/Peek";
import { PropertyPicker } from "@/components/host/PropertyPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { alerts as alertCopy, common, extrasCopy, linkTools, today as oldCopy, todayDash as copy } from "@/content/copy";
import { useAlerts, useBookingSites, useConnections, usePropertyBoard, useRole, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { platformKey } from "@/lib/booking-sites";
import { formatUkDate, formatUkTime, nightsBetween } from "@/lib/dates";
import { decideExtrasRequest, listExtrasRequests } from "@/lib/extras.functions";
import { editorSections, type SectionKey, type StoredSection } from "@/lib/guide";
import { getGuideEditor, getRoomGuideCodes } from "@/lib/guide.functions";
import { emailBookingInvoice, ensureBookingInvoice, getInvoiceStatuses } from "@/lib/invoice.functions";
import { markAlertRead } from "@/lib/host.functions";
import { formatPence } from "@/lib/services";
import { listJobs } from "@/lib/services.functions";
import { explainSyncError, linkState } from "@/lib/sync-status";
import { guideProgress, maintenanceAhead, openGuestRequests, tightTurnarounds, todayBoard, windowsToday, type TodayBooking } from "@/lib/today";
import { cn } from "@/lib/utils";
import { rebrand } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/app/today")({
  head: () => ({
    meta: [
      { title: rebrand("Today · Latchkey host dashboard") },
      { name: "description", content: "Today at a glance: guests, requests, cleaning, maintenance, connections and check-in." },
    ],
  }),
  component: TodayPage,
});

type Stay = TodayBooking & { property_id: string; checked_in_at?: string | null; listing_name?: string | null };
type Room = { id: string; display_name: string };

const clock = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function TodayPage() {
  const workspace = useWorkspace();
  // The launch funnel: someone looking around the host demo.
  useEffect(() => {
    if (isDemoBrowser()) trackEvent("demo_host_view");
  }, []);
  const properties = workspace.data?.properties as Array<{ id: string; name: string }> | undefined;
  const { selectedId, select } = useSelectedProperty(properties);
  const board = usePropertyBoard(selectedId);

  if (workspace.isLoading || board.isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!properties || properties.length === 0 || !selectedId) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader title={oldCopy.title} subtitle={oldCopy.subtitle} />
        <div className="mt-6">
          <EmptyState icon={Sparkles} title="No rooms set up yet" body="Add your first property in Settings, or load the demo rooms to have a look around." />
        </div>
      </div>
    );
  }

  const data = board.data;
  const todayIso = data?.today ?? new Date().toISOString().slice(0, 10);
  const rooms = (data?.rooms ?? []) as Room[];
  const property = (data?.property ?? null) as { id: string; short_code: string; country_code?: string | null } | null;
  const stays = (data?.bookings ?? []) as unknown as Stay[];
  const lists = todayBoard(stays, todayIso);
  const roomName = (id: string | null) => rooms.find((r) => r.id === id)?.display_name ?? "No room";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title={oldCopy.title}
        subtitle={`${formatUkDate(todayIso, { withYear: true })} · ${copy.subtitle}`}
        actions={<PropertyPicker properties={properties} value={selectedId} onChange={select} />}
      />
      <p className="-mt-3 text-xs text-muted-foreground">{copy.hint}</p>

      <AlertsPanel />

      <DashboardSections
        page="today"
        storageKey="latchkey.todayLayout"
        items={[
          {
            id: "guests",
            wide: true,
            node: (
              <Card id="guests" icon={DoorOpen} title={copy.guestsTitle}>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <GuestTile icon={DoorOpen} label={copy.arriving} show="arriving" stays={lists.arriving} empty={copy.noneArriving} roomName={roomName} time="in" />
                  <GuestTile icon={BedDouble} label={copy.staying} show="staying" stays={lists.staying} empty={copy.noneStaying} roomName={roomName} time="out" />
                  <GuestTile icon={LogOut} label={copy.leaving} show="leaving" stays={lists.leaving} empty={copy.noneLeaving} roomName={roomName} time="out" />
                  <GuestTile
                    icon={Sparkles}
                    label={copy.needsDetails}
                    show="needs_details"
                    stays={lists.needsDetails}
                    empty={copy.noneNeeds}
                    roomName={roomName}
                    time="in"
                    tone={lists.needsDetails.length ? "attention" : undefined}
                  />
                </div>
                {lists.doubleBooked.length ? (
                  <Link
                    to="/app/bookings"
                    search={{ show: "double_booked" }}
                    className="mt-3 flex items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm hover:bg-destructive/15"
                  >
                    <AlertTriangle className="size-5 shrink-0 text-destructive" />
                    <span className="flex-1">
                      <span className="font-medium">
                        {lists.doubleBooked.length} · {oldCopy.doubleBookedTitle}
                      </span>
                      <span className="block text-muted-foreground">{oldCopy.doubleBookedBody}</span>
                    </span>
                    <ChevronRight className="size-4" />
                  </Link>
                ) : null}
              </Card>
            ),
          },
          { id: "messages", wide: true, node: <GuestMessages propertyId={selectedId} /> },
          { id: "leaving", node: lists.leaving.length ? <LeavingInvoices leaving={lists.leaving} roomName={roomName} /> : null },
          { id: "requests", node: <WaitingOnYou propertyId={selectedId} /> },
          { id: "cleaning", node: <CleaningToday windows={(data?.windows ?? []) as never} lists={lists} todayIso={todayIso} roomName={roomName} /> },
          { id: "maintenance", node: <MaintenanceAhead propertyId={selectedId} /> },
          { id: "connections", node: <Connections propertyId={selectedId} rooms={rooms} /> },
          { id: "guide", node: <GuideCard propertyId={selectedId} arriving={lists.arriving} rooms={rooms} /> },
          { id: "arrivalGuides", node: <ArrivalGuides arriving={lists.arriving} /> },
          { id: "kiosk", node: property ? <KioskCard property={property} arriving={lists.arriving} /> : null },
          { id: "welcome", node: property ? <WelcomeCard property={property} arriving={lists.arriving} /> : null },
          { id: "settings", wide: true, node: <KeySettings isUk={(property?.country_code ?? "GB") === "GB"} /> },
          { id: "reviews", wide: true, node: workspace.data?.hostId ? <GuestReviews hostId={workspace.data.hostId} /> : null },
        ]}
      />
    </div>
  );
}

/* --------------------------------- guests -------------------------------- */

function GuestPeek({ b, roomName }: { b: Stay; roomName: (id: string | null) => string }) {
  const sites = useBookingSites();
  const site = sites.find((s) => s.key === platformKey(b));
  const n = nightsBetween(b.check_in_date, b.check_out_date);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">{b.guest_full_name ?? copy.guestNoName}</span>
        <ChannelBadge channel={b.channel as Channel} label={site?.label} />
      </div>
      <div>
        <PeekFact label={copy.room} value={roomName(b.room_id)} />
        <PeekFact label={copy.arrives} value={`${formatUkDate(b.check_in_date)}${b.check_in_time ? `, ${formatUkTime(b.check_in_time)}` : ""}`} />
        <PeekFact label={copy.leaves} value={`${formatUkDate(b.check_out_date)}${b.check_out_time ? `, ${formatUkTime(b.check_out_time)}` : ""}`} />
        <PeekFact label={copy.nights} value={n} />
        <PeekFact label={copy.guests} value={b.guest_count ?? 1} />
        {b.reservation_code ? <PeekFact label={copy.reference} value={b.reservation_code} /> : null}
        <PeekFact label={copy.status} value={b.status === "checked_in" ? copy.checkedIn : b.status === "needs_details" ? copy.guestNoName : copy.notCheckedIn} />
      </div>
      <Link to="/app/bookings" search={{ guest: b.id }} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        {copy.openCard} <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}

function GuestTile({
  icon: Icon,
  label,
  show,
  stays,
  empty,
  roomName,
  time,
  tone,
}: {
  icon: typeof DoorOpen;
  label: string;
  show: "arriving" | "staying" | "leaving" | "needs_details";
  stays: Stay[];
  empty: string;
  roomName: (id: string | null) => string;
  time: "in" | "out";
  tone?: "attention" | undefined;
}) {
  const when = (b: Stay) => (time === "in" ? formatUkTime(b.check_in_time) : b.check_out_date === b.check_in_date ? "" : formatUkDate(b.check_out_date));
  return (
    <article className={cn("card-soft flex flex-col p-4", tone === "attention" && "ring-1 ring-accent/50")}>
      <Peek
        className="block"
        content={
          stays.length ? (
            <ul className="space-y-1.5">
              {stays.slice(0, 8).map((b) => (
                <li key={b.id}>
                  <Link to="/app/bookings" search={{ guest: b.id }} className="flex items-center justify-between gap-3 rounded-lg px-1 py-0.5 hover:bg-muted">
                    <span className="min-w-0 truncate">{b.guest_full_name ?? copy.guestNoName}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {roomName(b.room_id)} {when(b) ? `· ${when(b)}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
              {stays.length > 8 ? <li className="text-xs text-muted-foreground">{copy.seeAll(stays.length)}</li> : null}
            </ul>
          ) : (
            <p className="text-muted-foreground">{empty}</p>
          )
        }
      >
        <Link to="/app/bookings" search={{ show }} className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary", tone === "attention" && "bg-accent/15 text-accent")}>
            <Icon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-3xl leading-none">{stays.length}</span>
            <span className="block truncate text-sm text-muted-foreground">{label}</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      </Peek>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {stays.length === 0 ? <li className="text-xs text-muted-foreground">{empty}</li> : null}
        {stays.slice(0, 4).map((b) => (
          <li key={b.id} className="max-w-full">
            <Peek content={<GuestPeek b={b} roomName={roomName} />}>
              <Link
                to="/app/bookings"
                search={{ guest: b.id }}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium hover:bg-secondary/70"
              >
                <span className="truncate">{b.guest_full_name ?? copy.guestNoName}</span>
                <span className="shrink-0 text-muted-foreground">· {roomName(b.room_id)}</span>
              </Link>
            </Peek>
          </li>
        ))}
        {stays.length > 4 ? (
          <li>
            <Link to="/app/bookings" search={{ show }} className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium text-primary hover:underline">
              {copy.seeAll(stays.length)}
            </Link>
          </li>
        ) : null}
      </ul>
    </article>
  );
}

/* ------------------------------- cards ---------------------------------- */

/** Every Today card is a section the host can move and fold (see DashboardSections). */
function Card({ id, icon, title, action, children }: { id: string; icon: typeof DoorOpen; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <DashSection id={id} icon={icon} title={title} action={action}>
      {children}
    </DashSection>
  );
}

function CardLink({ to, search, children }: { to: string; search?: Record<string, string>; children: ReactNode }) {
  return (
    <Link to={to as never} search={search as never} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      {children} <ArrowRight className="size-3.5" />
    </Link>
  );
}

const rowClass = "flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 hover:bg-muted";

/** Invoices for guests leaving today: email (✓ once sent, ✗ with no email) and download. */
function LeavingInvoices({ leaving, roomName }: { leaving: Stay[]; roomName: (id: string | null) => string }) {
  const statusFn = useServerFn(getInvoiceStatuses);
  const ensure = useServerFn(ensureBookingInvoice);
  const emailFn = useServerFn(emailBookingInvoice);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { canWrite } = useRole();
  const ids = leaving.map((b) => b.id);
  const q = useQuery({ queryKey: ["invoice-status", ids], queryFn: () => statusFn({ data: { bookingIds: ids } }) });
  const [busy, setBusy] = useState<string | null>(null);
  const status = (id: string) => q.data?.find((x) => x.bookingId === id);
  const fixEmail = (id: string) => void navigate({ to: "/app/bookings", search: { guest: id, edit: true } });

  async function email(id: string) {
    setBusy(`e-${id}`);
    try {
      const r = await emailFn({ data: { bookingId: id, origin: window.location.origin } });
      if (r.sent) toast.success(copy.invoiceSent);
      else if (r.reason === "no_email") {
        toast.error(copy.invoiceNoEmail);
        fixEmail(id);
      } else if (r.reason === "demo") toast.info(copy.invoiceDemo);
      else toast.error(copy.invoiceFailed);
      await qc.invalidateQueries({ queryKey: ["invoice-status"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  async function download(id: string, token: string | null) {
    // Open the tab now (before waiting) so the browser doesn't block it.
    const tab = window.open("", "_blank");
    setBusy(`d-${id}`);
    try {
      const t = token ?? (await ensure({ data: { bookingId: id } })).token;
      if (tab) tab.location.href = `/invoice/${t}`;
      else window.location.href = `/invoice/${t}`;
      await qc.invalidateQueries({ queryKey: ["invoice-status"] });
    } catch (e) {
      tab?.close();
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card id="leaving" icon={LogOut} title={copy.leavingTitle}>
      <ul className="space-y-1">
        {leaving.map((b) => {
          const st = status(b.id);
          return (
            <li key={b.id} className="flex flex-wrap items-center gap-2">
              <Peek className="min-w-0 flex-1" content={<GuestPeek b={b} roomName={roomName} />}>
                <Link to="/app/bookings" search={{ guest: b.id }} className={rowClass}>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.guest_full_name ?? copy.guestNoName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {roomName(b.room_id)} · {formatUkTime(b.check_out_time ?? "11:00")}
                  </span>
                </Link>
              </Peek>
              {q.isLoading ? (
                <Skeleton className="h-8 w-40 rounded-lg" />
              ) : !st?.offered ? (
                <span className="text-xs text-muted-foreground">{copy.invoiceByPlatform}</span>
              ) : canWrite ? (
                <span className="flex items-center gap-1.5">
                  <span className="relative">
                    <Button size="sm" variant="outline" className="h-8" disabled={busy !== null} onClick={() => (st.email ? void email(b.id) : fixEmail(b.id))}>
                      {busy === `e-${b.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />} {copy.emailInvoice}
                    </Button>
                    {st.emailedAt ? (
                      <span
                        className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-success text-success-foreground"
                        title={copy.emailedOn(clock(st.emailedAt))}
                        aria-label={copy.emailedOn(clock(st.emailedAt))}
                      >
                        <Check className="size-3" />
                      </span>
                    ) : !st.email ? (
                      <button
                        type="button"
                        onClick={() => fixEmail(b.id)}
                        className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-destructive text-destructive-foreground"
                        title={copy.noEmailFix}
                        aria-label={copy.noEmailFix}
                      >
                        <X className="size-3" />
                      </button>
                    ) : null}
                  </span>
                  <Button size="sm" variant="ghost" className="h-8" disabled={busy !== null} onClick={() => void download(b.id, st.token)} aria-label={copy.downloadInvoice}>
                    {busy === `d-${b.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                    <span className="sr-only sm:not-sr-only">{copy.downloadInvoice}</span>
                  </Button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function WaitingOnYou({ propertyId }: { propertyId: string }) {
  const jobsFn = useServerFn(listJobs);
  const extrasFn = useServerFn(listExtrasRequests);
  const decide = useServerFn(decideExtrasRequest);
  const qc = useQueryClient();
  const { canWrite } = useRole();
  const jobs = useQuery({ queryKey: ["jobs", propertyId], queryFn: () => jobsFn({ data: { propertyId } }), refetchInterval: 30_000 });
  const extras = useQuery({ queryKey: ["extras-inbox", propertyId], queryFn: () => extrasFn({ data: { propertyId } }), refetchInterval: 30_000 });
  type J = { id: string; source: string; status: string; category: string; title: string; note: string | null; scheduled_at: string | null; created_at: string; archived_at?: string | null; rooms: { display_name: string } | null; bookings: { guest_full_name: string | null } | null };
  const open = openGuestRequests((jobs.data?.jobs ?? []) as unknown as J[]);
  const waitingExtras = (extras.data ?? []).filter((r) => r.status === "requested");
  const label: Record<string, string> = { new: copy.requestNew, acknowledged: copy.requestSeen, booked: copy.requestBooked, in_progress: copy.requestDoing };

  async function act(id: string, action: "approve" | "decline") {
    try {
      await decide({ data: { id, action, window: null, note: null } });
      await qc.invalidateQueries({ queryKey: ["extras-inbox", propertyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    }
  }

  const count = open.length + waitingExtras.length;
  return (
    <Card id="requests" icon={Inbox} title={copy.waitingTitle} action={count ? <Badge>{count}</Badge> : null}>
      {jobs.isLoading || extras.isLoading ? <Skeleton className="h-20 rounded-xl" /> : null}
      {!jobs.isLoading && !extras.isLoading && count === 0 ? <p className="text-sm text-muted-foreground">{copy.waitingEmpty}</p> : null}
      <ul className="space-y-1">
        {waitingExtras.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2">
            <Peek
              className="min-w-0 flex-1"
              content={
                <div>
                  <p className="font-medium">
                    {r.guest}
                    {r.room ? ` · ${r.room}` : ""}
                  </p>
                  <ul className="my-2 list-inside list-disc">
                    {r.items.map((i) => (
                      <li key={i.name}>
                        {i.qty}× {i.name}
                      </li>
                    ))}
                  </ul>
                  {r.note ? <PeekFact label={copy.note} value={r.note} /> : null}
                  <PeekFact label={copy.asked} value={clock(r.createdAt)} />
                  {r.totalPence > 0 ? <PeekFact label={copy.total} value={formatPence(r.totalPence)} /> : null}
                </div>
              }
            >
              <Link to="/app/services" search={{ request: r.id }} className={rowClass}>
                <Badge variant="secondary">{copy.extrasLabel}</Badge>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {r.guest} · {r.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
                </span>
              </Link>
            </Peek>
            {canWrite ? (
              <span className="flex gap-1">
                <Button size="sm" onClick={() => void act(r.id, "approve")}>
                  {extrasCopy.approve}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void act(r.id, "decline")}>
                  {extrasCopy.decline}
                </Button>
              </span>
            ) : null}
          </li>
        ))}
        {open.map((j) => (
          <li key={j.id}>
            <Peek
              className="block"
              content={
                <div>
                  <p className="font-medium">{j.title}</p>
                  {j.note ? <p className="mt-1 text-muted-foreground">{j.note}</p> : null}
                  <div className="mt-2">
                    {j.bookings?.guest_full_name ? <PeekFact label={copy.guests} value={j.bookings.guest_full_name} /> : null}
                    {j.rooms?.display_name ? <PeekFact label={copy.room} value={j.rooms.display_name} /> : null}
                    <PeekFact label={copy.asked} value={clock(j.created_at)} />
                    <PeekFact label={copy.status} value={label[j.status] ?? j.status} />
                  </div>
                </div>
              }
            >
              <Link to="/app/services" search={{ job: j.id }} className={rowClass}>
                <Badge variant={j.status === "new" ? "default" : "outline"}>{label[j.status] ?? j.status}</Badge>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {j.title}
                  {j.rooms?.display_name ? ` · ${j.rooms.display_name}` : ""}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </Peek>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CleaningToday({
  windows,
  lists,
  todayIso,
  roomName,
}: {
  windows: Array<{ id: string; room_id: string | null; day_of_week: number | null; start_time: string | null; end_time: string | null; reason: string | null }>;
  lists: ReturnType<typeof todayBoard<Stay>>;
  todayIso: string;
  roomName: (id: string | null) => string;
}) {
  const today = windowsToday(windows, todayIso);
  const tight = tightTurnarounds(lists);
  const stay = (id: string) => [...lists.arriving, ...lists.leaving].find((b) => b.id === id);
  return (
    <Card id="cleaning" icon={SprayCan} title={copy.cleaningTitle} action={<CardLink to="/app/housekeeping">{copy.openBoard}</CardLink>}>
      {today.length === 0 && tight.length === 0 ? <p className="text-sm text-muted-foreground">{copy.cleaningEmpty}</p> : null}
      <ul className="space-y-1">
        {tight.map((t) => {
          const out = stay(t.leavingId);
          const inn = stay(t.arrivingId);
          return (
            <li key={t.leavingId}>
              <Peek
                className="block"
                content={
                  <div>
                    <PeekFact label={copy.leaving} value={`${out?.guest_full_name ?? copy.guestNoName}, ${formatUkTime(out?.check_out_time ?? "11:00")}`} />
                    <PeekFact label={copy.arriving} value={`${inn?.guest_full_name ?? copy.guestNoName}, ${formatUkTime(inn?.check_in_time ?? "15:00")}`} />
                  </div>
                }
              >
                <Link to="/app/bookings" search={{ guest: t.arrivingId }} className={cn(rowClass, "bg-accent/10")}>
                  <AlertTriangle className="size-4 shrink-0 text-accent" />
                  <span className="flex-1 text-sm">{copy.turnaround(roomName(t.roomId), t.gapMinutes)}</span>
                </Link>
              </Peek>
            </li>
          );
        })}
        {today.map((w) => (
          <li key={w.id}>
            <Peek className="block" content={<p>{w.reason ?? "Cleaning"} · {w.room_id ? roomName(w.room_id) : copy.wholeHouse}</p>}>
              <Link to="/app/housekeeping" search={{ focus: "schedule" }} className={rowClass}>
                <span className="w-28 shrink-0 text-sm tabular-nums">
                  {formatUkTime(w.start_time)}–{formatUkTime(w.end_time)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {w.reason ?? "Cleaning"} · {w.room_id ? roomName(w.room_id) : copy.wholeHouse}
                </span>
              </Link>
            </Peek>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MaintenanceAhead({ propertyId }: { propertyId: string }) {
  const jobsFn = useServerFn(listJobs);
  const jobs = useQuery({ queryKey: ["jobs", propertyId], queryFn: () => jobsFn({ data: { propertyId } }), refetchInterval: 30_000 });
  type J = { id: string; source: string; status: string; category: string; title: string; note: string | null; scheduled_at: string | null; created_at: string; archived_at?: string | null; rooms: { display_name: string } | null; provider: { name: string } | null };
  const ahead = maintenanceAhead((jobs.data?.jobs ?? []) as unknown as J[], new Date());
  return (
    <Card id="maintenance" icon={Wrench} title={copy.maintenanceTitle} action={<CardLink to="/app/services" search={{ tab: "planned" }}>{copy.bookMaintenance}</CardLink>}>
      {jobs.isLoading ? <Skeleton className="h-16 rounded-xl" /> : ahead.length === 0 ? <p className="text-sm text-muted-foreground">{copy.maintenanceEmpty}</p> : null}
      <ul className="space-y-1">
        {ahead.map((j) => (
          <li key={j.id}>
            <Peek
              className="block"
              content={
                <div>
                  <p className="font-medium">{j.title}</p>
                  {j.note ? <p className="mt-1 text-muted-foreground">{j.note}</p> : null}
                  <div className="mt-2">
                    <PeekFact label={copy.arrives} value={clock(j.scheduled_at!)} />
                    {j.rooms?.display_name ? <PeekFact label={copy.room} value={j.rooms.display_name} /> : null}
                    {j.provider?.name ? <PeekFact label={copy.trade} value={j.provider.name} /> : null}
                    <PeekFact label={copy.status} value={j.status.replace("_", " ")} />
                  </div>
                </div>
              }
            >
              <Link to="/app/services" search={{ job: j.id }} className={rowClass}>
                <span className="w-32 shrink-0 text-sm tabular-nums">{clock(j.scheduled_at!)}</span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {j.title}
                  {j.rooms?.display_name ? ` · ${j.rooms.display_name}` : ""}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </Peek>
          </li>
        ))}
      </ul>
    </Card>
  );
}

type LinkStateKey = ReturnType<typeof linkState>;
const STATE_ORDER: LinkStateKey[] = ["error", "warning", "syncing", "never", "ok"];
const CONN_PREFS = "latchkey.todayConnections";
type ConnPrefs = { group: "room" | "platform"; hidden: LinkStateKey[]; open: string[] };

function readPrefs(): ConnPrefs {
  try {
    const v = JSON.parse(window.localStorage.getItem(CONN_PREFS) ?? "{}") as { group?: string; hidden?: string[]; open?: string[] };
    return {
      // By platform is the usual view.
      group: v.group === "room" ? "room" : "platform",
      hidden: (v.hidden ?? []).filter((x): x is LinkStateKey => (STATE_ORDER as string[]).includes(x)),
      open: (v.open ?? []).filter((x) => typeof x === "string").slice(0, 50),
    };
  } catch {
    return { group: "platform", hidden: [], open: [] };
  }
}

/** Working, waiting (not checked yet, needs a look, or not set up) and broken, for a group header. */
function StatusCounts({ ok, waiting, broken }: { ok: number; waiting: number; broken: number }) {
  return (
    <span className="flex items-center gap-2 text-xs tabular-nums">
      {ok ? (
        <span className="flex items-center gap-0.5 text-success" title={copy.countOk(ok)} aria-label={copy.countOk(ok)}>
          <CircleCheck className="size-4" /> {ok}
        </span>
      ) : null}
      {waiting ? (
        <span className="flex items-center gap-0.5 text-accent" title={copy.countWaiting(waiting)} aria-label={copy.countWaiting(waiting)}>
          <TriangleAlert className="size-4" /> {waiting}
        </span>
      ) : null}
      {broken ? (
        <span className="flex items-center gap-0.5 text-destructive" title={copy.countBroken(broken)} aria-label={copy.countBroken(broken)}>
          <CircleX className="size-4" /> {broken}
        </span>
      ) : null}
    </span>
  );
}

function Connections({ propertyId, rooms }: { propertyId: string; rooms: Room[] }) {
  const q = useConnections(propertyId);
  const sites = useBookingSites();
  const [prefs, setPrefsState] = useState<ConnPrefs>({ group: "platform", hidden: [], open: [] });
  useEffect(() => setPrefsState(readPrefs()), []);
  const setPrefs = (p: ConnPrefs) => {
    setPrefsState(p);
    try {
      window.localStorage.setItem(CONN_PREFS, JSON.stringify(p));
    } catch {
      // Not remembered this time.
    }
  };
  type C = { id: string; channel: string; room_id: string | null; site_key?: string | null; listing_name: string | null; sync_status: string; sync_started_at?: string | null; last_error?: string | null; last_synced_at: string | null; rooms: { display_name: string } | null };
  const links = ((q.data?.connections ?? []) as unknown as C[]).map((c) => ({ c, state: linkState(c), site: sites.find((x) => x.key === platformKey(c as never)), platform: platformKey(c as never) }));
  const count = (st: LinkStateKey) => links.filter((l) => l.state === st).length;
  const bad = count("error") + count("warning");
  const tone: Record<LinkStateKey, string> = { ok: "bg-success", syncing: "bg-primary animate-pulse", warning: "bg-accent", error: "bg-destructive", never: "bg-muted-foreground" };
  const roomLabel = (id: string | null) => rooms.find((r) => r.id === id)?.display_name ?? copy.wholeHouse;

  // Every platform this property uses, and every room: so a room missing a platform shows as "not set up".
  const platforms = [...new Map(links.map((l) => [l.platform, l])).values()];
  const roomIds = rooms.length ? rooms.map((r) => r.id) : [...new Set(links.map((l) => l.c.room_id))];
  type Entry = { key: string; link: (typeof links)[number] | null; label: ReactNode; text: string };
  const groups = (prefs.group === "platform"
    ? platforms.map((p) => ({
        key: `p:${p.platform}`,
        header: <ChannelBadge channel={p.c.channel as Channel} label={p.site?.label} />,
        sortBy: p.site?.label ?? p.platform,
        entries: roomIds.map((rid): Entry => {
          const link = links.find((l) => l.platform === p.platform && l.c.room_id === rid) ?? null;
          return { key: `${p.platform}-${rid}`, link, label: roomLabel(rid), text: roomLabel(rid) };
        }),
      }))
    : roomIds.map((rid) => ({
        key: `r:${rid}`,
        header: <span className="font-medium">{roomLabel(rid)}</span>,
        sortBy: roomLabel(rid),
        entries: platforms.map((p): Entry => {
          const link = links.find((l) => l.platform === p.platform && l.c.room_id === rid) ?? null;
          return { key: `${rid}-${p.platform}`, link, label: <ChannelBadge channel={p.c.channel as Channel} label={p.site?.label} />, text: p.site?.label ?? p.platform };
        }),
      }))
  ).sort((a, b) => a.sortBy.localeCompare(b.sortBy, "en-GB", { numeric: true }));

  const summary = !links.length
    ? null
    : bad
      ? copy.someProblems(bad, links.length)
      : count("ok") === links.length
        ? copy.allWorking(links.length)
        : copy.mixed(count("ok"), count("never") + count("syncing"));
  const shown = (e: Entry) => (e.link ? !prefs.hidden.includes(e.link.state) : !prefs.hidden.includes("never"));
  const toggleGroup = (key: string) => setPrefs({ ...prefs, open: prefs.open.includes(key) ? prefs.open.filter((k) => k !== key) : [...prefs.open, key] });

  return (
    <Card
      id="connections"
      icon={CalendarSync}
      title={copy.connectionsTitle}
      action={summary ? <Badge variant={bad ? "destructive" : "secondary"}>{summary}</Badge> : null}
    >
      {q.isLoading ? <Skeleton className="h-16 rounded-xl" /> : null}
      {!q.isLoading && links.length === 0 ? <CardLink to="/app/connections">{copy.connect}</CardLink> : null}
      {links.length ? (
        <div className="mb-2 flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-0.5 text-xs" role="radiogroup" aria-label={copy.groupBy}>
            {(["platform", "room"] as const).map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={prefs.group === g}
                onClick={() => setPrefs({ ...prefs, group: g })}
                className={cn("rounded-md px-2.5 py-1 font-medium", prefs.group === g ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                {g === "room" ? copy.byRoom : copy.byPlatform}
              </button>
            ))}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative ml-auto size-8" aria-label={copy.filterStates}>
                <Filter className="size-4" />
                {prefs.hidden.length ? <span className="absolute right-1 top-1 size-2 rounded-full bg-accent" /> : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 rounded-2xl p-3">
              <p className="mb-2 text-sm font-medium">{copy.filterStates}</p>
              <ul className="space-y-1.5">
                {STATE_ORDER.map((st) => (
                  <li key={st}>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={!prefs.hidden.includes(st)}
                        onCheckedChange={(on) => setPrefs({ ...prefs, hidden: on ? prefs.hidden.filter((x) => x !== st) : [...prefs.hidden, st] })}
                      />
                      <span className={cn("size-2 rounded-full", tone[st])} aria-hidden />
                      <span className="flex-1">{st === "never" ? copy.notCheckedOrSetUp : linkTools.states[st]}</span>
                      <span className="tabular-nums text-muted-foreground">{count(st)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      ) : null}
      <ul className="divide-y divide-border">
        {groups.map((g) => {
          const ok = g.entries.filter((e) => e.link?.state === "ok").length;
          const broken = g.entries.filter((e) => e.link?.state === "error").length;
          const waiting = g.entries.length - ok - broken;
          const isOpen = prefs.open.includes(g.key);
          const visible = g.entries.filter(shown);
          return (
            <li key={g.key}>
              <button type="button" onClick={() => toggleGroup(g.key)} aria-expanded={isOpen} className={cn(rowClass, "w-full py-2.5")}>
                <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                <span className="min-w-0 flex-1 truncate text-left">{g.header}</span>
                <StatusCounts ok={ok} waiting={waiting} broken={broken} />
              </button>
              {isOpen ? (
                <ul className="mb-2 ml-6 space-y-0.5">
                  {visible.length === 0 ? <li className="px-2 py-1 text-xs text-muted-foreground">{copy.noneMatch}</li> : null}
                  {visible.map((e) =>
                    e.link ? (
                      <li key={e.key}>
                        <Peek
                          className="block"
                          content={
                            <div>
                              <p className="font-medium">{e.link.c.listing_name ?? e.link.site?.label ?? e.link.c.channel}</p>
                              <PeekFact label={copy.room} value={roomLabel(e.link.c.room_id)} />
                              <PeekFact label={copy.status} value={linkTools.states[e.link.state]} />
                              <PeekFact label={copy.lastChecked} value={e.link.c.last_synced_at ? clock(e.link.c.last_synced_at) : "—"} />
                              {e.link.state === "error" || e.link.state === "warning" ? <p className="mt-2 rounded-lg bg-muted p-2">{explainSyncError(e.link.c.last_error)}</p> : null}
                            </div>
                          }
                        >
                          <Link to="/app/connections" search={{ link: e.link.c.id }} className={rowClass}>
                            <LinkIcon state={e.link.state} />
                            <span className="min-w-0 flex-1 truncate text-sm">{e.label}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{linkTools.states[e.link.state]}</span>
                          </Link>
                        </Peek>
                      </li>
                    ) : (
                      <li key={e.key}>
                        <Link to="/app/connections" className={cn(rowClass, "text-muted-foreground")}>
                          <TriangleAlert className="size-4 shrink-0 text-accent" />
                          <span className="min-w-0 flex-1 truncate text-sm">{e.label}</span>
                          <span className="shrink-0 text-xs">{copy.notSetUp}</span>
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function LinkIcon({ state }: { state: LinkStateKey }) {
  if (state === "ok") return <CircleCheck className="size-4 shrink-0 text-success" />;
  if (state === "error") return <CircleX className="size-4 shrink-0 text-destructive" />;
  if (state === "syncing") return <Loader2 className="size-4 shrink-0 animate-spin text-primary" />;
  return <TriangleAlert className="size-4 shrink-0 text-accent" />;
}

function GuideCard({ propertyId, arriving, rooms }: { propertyId: string; arriving: Stay[]; rooms: Room[] }) {
  const fn = useServerFn(getGuideEditor);
  const codesFn = useServerFn(getRoomGuideCodes);
  const { canWrite } = useRole();
  const q = useQuery({ queryKey: ["guide", propertyId], queryFn: () => fn({ data: { propertyId } }) });
  const codes = useQuery({ queryKey: ["room-guide-codes", propertyId], queryFn: () => codesFn({ data: { propertyId } }) });
  const stored = (q.data?.sections ?? []) as unknown as StoredSection[];
  // The sections in this guide: the host's own included, removed ones left out.
  const listed = editorSections(stored, q.data?.startersOff ?? []).shown;
  const keys = listed.map((s) => s.key);
  const written = stored.filter((x) => x.summary?.trim() || x.steps?.length) as Array<{ roomId: string | null; sectionKey: SectionKey }>;
  const p = guideProgress(keys, written);
  const title = (k: string) => listed.find((s) => s.key === k)?.title ?? k;
  const roomOwn = (id: string) => written.filter((w) => w.roomId === id).length;
  const codeOf = (id: string) => codes.data?.rooms.find((r) => r.id === id)?.code ?? null;
  return (
    <Card id="guide" icon={BookOpen} title={copy.guideTitle} action={<CardLink to="/app/guides">{copy.editGuide}</CardLink>}>
      {q.isLoading ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : (
        <ul className="space-y-0.5">
          <li>
            <Peek
              className="block"
              content={
                p.missing.length ? (
                  <div>
                    <p className="mb-1 font-medium">{copy.guideMissing}</p>
                    <ul className="space-y-0.5">
                      {p.missing.map((k) => (
                        <li key={k}>
                          <Link to="/app/guides" search={{ section: k }} className="hover:underline">
                            {title(k)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p>{copy.guideComplete}</p>
                )
              }
            >
              <Link to="/app/guides" search={p.missing[0] ? { section: p.missing[0] } : {}} className={cn(rowClass, "flex-wrap")}>
                <span className="min-w-0 flex-1 text-sm font-medium">{copy.wholeProperty}</span>
                <span className="text-xs text-muted-foreground">{copy.guideProgress(p.done.length, keys.length)}</span>
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(p.done.length / keys.length) * 100}%` }} />
                </span>
              </Link>
            </Peek>
          </li>
          {rooms.map((r) => {
            const code = codeOf(r.id);
            return (
              <li key={r.id} className="flex items-center gap-1">
                <Peek className="min-w-0 flex-1" content={<p>{roomOwn(r.id) ? copy.roomOwnSections(roomOwn(r.id)) : copy.roomUsesHouse}</p>}>
                  <Link to="/app/guides" search={{ room: r.id }} className={rowClass}>
                    <span className="min-w-0 flex-1 truncate text-sm">{r.display_name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{roomOwn(r.id) ? copy.roomOwnShort(roomOwn(r.id)) : copy.roomHouseShort}</span>
                  </Link>
                </Peek>
                {code ? (
                  <Peek content={<p>{copy.roomQrPeek}</p>}>
                    <Link
                      to="/app/room-qr/$propertyId"
                      params={{ propertyId }}
                      search={{ room: r.id }}
                      className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary"
                      aria-label={copy.roomQrLabel(r.display_name)}
                    >
                      <QrCode className="size-4" />
                    </Link>
                  </Peek>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {rooms.length && codes.data?.available ? (
        <p className="mt-2 rounded-xl bg-primary/5 px-3 py-2 text-xs">
          {copy.roomQrNudge}{" "}
          <Link to="/app/room-qr/$propertyId" params={{ propertyId }} className="font-medium text-primary hover:underline">
            {copy.printRoomQrs}
          </Link>
        </p>
      ) : null}
    </Card>
  );
}

function KioskCard({ property, arriving }: { property: { id: string; short_code: string; kiosk_rest?: unknown; quiet_hours_start?: string | null; quiet_hours_end?: string | null }; arriving: Stay[] }) {
  const { canWrite } = useRole();
  const tile = "flex items-center gap-2 whitespace-nowrap rounded-xl border border-border px-3 py-2.5 text-sm font-medium hover:bg-muted";
  return (
    <Card id="kiosk" icon={QrCode} title={copy.kioskTitle} action={<CardLink to="/app/settings" search={{ focus: "checkin" }}>{copy.checkinSettings}</CardLink>}>
      <p className="mb-3 text-sm text-muted-foreground">{copy.kioskBody}</p>
      <div className="flex flex-wrap gap-2">
        <Peek content={<p>{copy.kioskPeek}</p>}>
          <a href={`/kiosk/${property.short_code}`} target="_blank" rel="noopener noreferrer" className={tile}>
            <Monitor className="size-4 text-primary" /> {copy.openKiosk} <ExternalLink className="ml-auto size-3.5 text-muted-foreground" />
          </a>
        </Peek>
        <Peek content={<p>{copy.pagePeek(`/kiosk/${property.short_code}`)}</p>}>
          <a href={`/kiosk/${property.short_code}?guest=1`} target="_blank" rel="noopener noreferrer" className={tile}>
            <DoorOpen className="size-4 text-primary" /> {copy.guestPage} <ExternalLink className="ml-auto size-3.5 text-muted-foreground" />
          </a>
        </Peek>
        <Peek content={<p>{copy.qrPeek}</p>}>
          <Link to="/app/print/$propertyId" params={{ propertyId: property.id }} className={tile}>
            <Printer className="size-4 text-primary" /> {copy.printQr}
          </Link>
        </Peek>
      </div>
      {canWrite ? <KioskRestQuick property={property} /> : null}
    </Card>
  );
}

/** A welcome for an arriving guest, full screen on the kiosk: its own card, apart from the kiosk's settings. */
function WelcomeCard({ property, arriving }: { property: { id: string; short_code: string }; arriving: Stay[] }) {
  const { canWrite } = useRole();
  if (!canWrite) return null;
  return (
    <Card id="welcome" icon={Hand} title={copy.welcomeTitle}>
      <p className="mb-3 text-sm text-muted-foreground">{copy.welcomeBody}</p>
      <KioskWelcomePanel propertyId={property.id} shortCode={property.short_code} arriving={arriving} bare />
    </Card>
  );
}

/** Today's arrivals and their private guide links: copy one to send it the guest's own way. */
function ArrivalGuides({ arriving }: { arriving: Stay[] }) {
  const { canWrite } = useRole();
  if (!canWrite || !arriving.length) return null;
  return (
    <Card id="arrivalGuides" icon={Send} title={copy.guideToday}>
      <p className="mb-2 text-sm text-muted-foreground">{copy.guideTodayBody}</p>
      <ul className="space-y-1.5">
        {arriving.map((b) => (
          <li key={b.id} className="flex items-center gap-2">
            <Link to="/app/bookings" search={{ guest: b.id }} className="min-w-0 flex-1 truncate text-sm hover:underline">
              {b.guest_full_name ?? copy.guestNoName}
            </Link>
            <GuideLinkButton bookingId={b.id} className="h-8 px-3 text-xs" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Shortcuts to the settings hosts change most, grouped by what they're about. */
function KeySettings({ isUk }: { isUk: boolean }) {
  const { isOwner } = useRole();
  type L = { key: string; to: string; search?: Record<string, string> };
  const groups: Array<{ key: string; icon: typeof DoorOpen; links: L[] }> = [
    {
      key: "property",
      icon: BedDouble,
      links: [
        { key: "property", to: "/app/properties", search: { focus: "property" } },
        { key: "rooms", to: "/app/properties", search: { focus: "rooms" } },
        { key: "cleaning", to: "/app/housekeeping", search: { focus: "schedule" } },
      ],
    },
    {
      key: "guests",
      icon: DoorOpen,
      links: [
        { key: "checkin", to: "/app/settings", search: { focus: "checkin" } },
        { key: "records", to: "/app/settings", search: { focus: "records" } },
        ...(isUk ? [{ key: "register", to: "/app/register" }] : []),
      ],
    },
    {
      key: "messages",
      icon: MessagesSquare,
      links: [
        { key: "alerts", to: "/app/settings", search: { focus: "alerts" } },
        { key: "platformMessages", to: "/app/settings", search: { focus: "messages" } },
      ],
    },
    {
      key: "money",
      icon: Wallet,
      links: [
        ...(isOwner ? [{ key: "payments", to: "/app/settings", search: { focus: "payments" } }] : []),
        { key: "invoices", to: "/app/settings", search: { focus: "invoices" } },
        ...(isOwner ? [{ key: "billing", to: "/app/billing" }] : []),
      ],
    },
    {
      key: "team",
      icon: Users,
      links: [
        { key: "team", to: "/app/settings", search: { focus: "team" } },
        { key: "api", to: "/app/settings", search: { focus: "api" } },
        { key: "apiGuide", to: "/developers" },
      ],
    },
  ];
  return (
    <Card id="settings" icon={Settings2} title={copy.settingsTitle}>
      <p className="-mt-1 mb-3 text-sm text-muted-foreground">{copy.settingsBody}</p>
      {/* Columns follow the card's own width, so it reads well full width or in one column. */}
      <div className="@container">
        <div className="grid gap-4 @md:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5">
          {groups.filter((g) => g.links.length).map((g) => (
            <section key={g.key} aria-labelledby={`settings-group-${g.key}`} className="min-w-0">
              <h3 id={`settings-group-${g.key}`} className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <g.icon className="size-3.5" /> {copy.settingsGroups[g.key]}
              </h3>
              <ul className="space-y-1">
                {g.links.map((l) => {
                  const [name, about] = copy.settingsLinks[l.key]!;
                  return (
                    <li key={l.key}>
                      <Peek className="block" content={<p>{about}</p>}>
                        <Link to={l.to as never} search={l.search as never} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
                          <span className="min-w-0 flex-1 truncate">{name}</span>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </Peek>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </Card>
  );
}

function AlertsPanel() {
  const alerts = useAlerts();
  const mark = useServerFn(markAlertRead);
  const qc = useQueryClient();
  const items = alerts.data?.alerts ?? [];
  if (items.length === 0) return null;
  return (
    <section role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
      <h2 className="flex items-center gap-2 text-lg">
        <AlertTriangle className="size-5 text-destructive" /> {alertCopy.title}
      </h2>
      <ul className="mt-3 space-y-2">
        {items.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface p-3 text-sm">
            <span className="min-w-0 flex-1">
              {(a as { booking_id?: string | null }).booking_id ? (
                <Link to="/app/bookings" search={{ guest: (a as { booking_id: string }).booking_id }} className="hover:underline">
                  {a.message}
                </Link>
              ) : (
                a.message
              )}
              <span className="block text-xs text-muted-foreground">{clock(a.created_at)}</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await mark({ data: { id: a.id } });
                  await qc.invalidateQueries({ queryKey: ["alerts"] });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : common.errorBody);
                }
              }}
            >
              {alertCopy.dismiss}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

