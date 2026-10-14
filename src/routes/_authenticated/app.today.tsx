import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  BookOpen,

  CalendarSync,
  ChevronRight,
  DoorOpen,
  ExternalLink,
  Inbox,
  LogOut,
  Monitor,
  Printer,
  QrCode,
  Settings2,
  Sparkles,
  SprayCan,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { ChannelBadge, type Channel } from "@/components/ChannelBadge";
import { EmptyState } from "@/components/host/EmptyState";
import { GuestReviews } from "@/components/host/GuestReviews";
import { GuideLinkButton } from "@/components/host/GuideLinkButton";
import { PageHeader } from "@/components/host/PageHeader";
import { Peek, PeekFact } from "@/components/host/Peek";
import { PropertyPicker } from "@/components/host/PropertyPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { alerts as alertCopy, common, extrasCopy, linkTools, today as oldCopy, todayDash as copy } from "@/content/copy";
import { useAlerts, useBookingSites, useConnections, usePropertyBoard, useRole, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { platformKey } from "@/lib/booking-sites";
import { formatUkDate, formatUkTime, nightsBetween } from "@/lib/dates";
import { decideExtrasRequest, listExtrasRequests } from "@/lib/extras.functions";
import { SECTIONS } from "@/lib/guide";
import { getGuideEditor } from "@/lib/guide.functions";
import { markAlertRead } from "@/lib/host.functions";
import { formatPence } from "@/lib/services";
import { listJobs } from "@/lib/services.functions";
import { explainSyncError, linkState } from "@/lib/sync-status";
import { guideProgress, maintenanceAhead, openGuestRequests, tightTurnarounds, todayBoard, windowsToday, type TodayBooking } from "@/lib/today";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/today")({
  head: () => ({
    meta: [
      { title: "Today · Latchkey host dashboard" },
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

      <section aria-labelledby="guests-today" className="space-y-3">
        <h2 id="guests-today" className="sr-only">
          {copy.guestsTitle}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            className="flex items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm hover:bg-destructive/15"
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
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <WaitingOnYou propertyId={selectedId} />
        <CleaningToday windows={(data?.windows ?? []) as never} lists={lists} todayIso={todayIso} roomName={roomName} />
        <MaintenanceAhead propertyId={selectedId} />
        <Connections propertyId={selectedId} />
        <GuideCard propertyId={selectedId} arriving={lists.arriving} />
        {property ? <KioskCard property={property} /> : null}
      </div>

      <KeySettings isUk={(property?.country_code ?? "GB") === "GB"} />

      {workspace.data?.hostId ? <GuestReviews hostId={workspace.data.hostId} /> : null}
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

function Card({ icon: Icon, title, action, children, id }: { icon: typeof DoorOpen; title: string; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="card-soft flex flex-col p-5">
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Icon className="size-5 shrink-0 text-primary" />
        <h2 className="mr-auto text-lg">{title}</h2>
        <span className="text-sm">{action}</span>
      </div>
      {children}
    </section>
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
    <Card icon={Inbox} title={copy.waitingTitle} action={count ? <Badge>{count}</Badge> : null}>
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
    <Card icon={SprayCan} title={copy.cleaningTitle} action={<CardLink to="/app/properties" search={{ focus: "cleaning" }}>{copy.setTimes}</CardLink>}>
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
              <Link to="/app/properties" search={{ focus: "cleaning" }} className={rowClass}>
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
    <Card icon={Wrench} title={copy.maintenanceTitle} action={<CardLink to="/app/services" search={{ tab: "planned" }}>{copy.bookMaintenance}</CardLink>}>
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

function Connections({ propertyId }: { propertyId: string }) {
  const q = useConnections(propertyId);
  const sites = useBookingSites();
  type C = { id: string; channel: string; site_key?: string | null; listing_name: string | null; sync_status: string; sync_started_at?: string | null; last_error?: string | null; last_synced_at: string | null; rooms: { display_name: string } | null };
  const links = (q.data?.connections ?? []) as unknown as C[];
  const states = links.map((c) => linkState(c));
  const bad = states.filter((s) => s === "error" || s === "warning").length;
  const tone: Record<string, string> = { ok: "bg-success", syncing: "bg-primary animate-pulse", warning: "bg-accent", error: "bg-destructive", never: "bg-muted-foreground" };
  return (
    <Card
      icon={CalendarSync}
      title={copy.connectionsTitle}
      action={links.length ? <Badge variant={bad ? "destructive" : "secondary"}>{bad ? copy.someProblems(bad, links.length) : copy.allWorking(links.length)}</Badge> : null}
    >
      {q.isLoading ? <Skeleton className="h-16 rounded-xl" /> : null}
      {!q.isLoading && links.length === 0 ? <CardLink to="/app/connections">{copy.connect}</CardLink> : null}
      <ul className="space-y-1">
        {links.map((c, i) => {
          const site = sites.find((s) => s.key === platformKey(c as never));
          const state = states[i]!;
          return (
            <li key={c.id}>
              <Peek
                className="block"
                content={
                  <div>
                    <p className="font-medium">{c.listing_name ?? site?.label ?? c.channel}</p>
                    <PeekFact label={copy.room} value={c.rooms?.display_name ?? copy.wholeHouse} />
                    <PeekFact label={copy.status} value={linkTools.states[state]} />
                    <PeekFact label={copy.lastChecked} value={c.last_synced_at ? clock(c.last_synced_at) : "—"} />
                    {state === "error" || state === "warning" ? <p className="mt-2 rounded-lg bg-muted p-2">{explainSyncError(c.last_error)}</p> : null}
                  </div>
                }
              >
                <Link to="/app/connections" search={{ link: c.id }} className={rowClass}>
                  <span className={cn("size-2.5 shrink-0 rounded-full", tone[state])} aria-hidden />
                  <ChannelBadge channel={c.channel as Channel} label={site?.label} />
                  <span className="min-w-0 flex-1 truncate text-sm">{c.rooms?.display_name ?? c.listing_name ?? ""}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{linkTools.states[state]}</span>
                </Link>
              </Peek>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function GuideCard({ propertyId, arriving }: { propertyId: string; arriving: Stay[] }) {
  const fn = useServerFn(getGuideEditor);
  const { canWrite } = useRole();
  const q = useQuery({ queryKey: ["guide", propertyId], queryFn: () => fn({ data: { propertyId } }) });
  const keys = SECTIONS.map((s) => s.key);
  const p = guideProgress(keys, (q.data?.sections ?? []) as Array<{ roomId: string | null; sectionKey: (typeof keys)[number] }>);
  const title = (k: string) => SECTIONS.find((s) => s.key === k)?.title ?? k;
  return (
    <Card icon={BookOpen} title={copy.guideTitle} action={<CardLink to="/app/guides">{copy.editGuide}</CardLink>}>
      {q.isLoading ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : (
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
          <Link to="/app/guides" search={p.missing[0] ? { section: p.missing[0] } : {}} className={cn(rowClass, "flex-col items-stretch gap-2")}>
            <span className="text-sm font-medium">{copy.guideProgress(p.done.length, keys.length)}</span>
            <span className="h-2 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${(p.done.length / keys.length) * 100}%` }} />
            </span>
          </Link>
        </Peek>
      )}
      {canWrite && arriving.length ? (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-2 text-sm font-medium">{copy.guideToday}</p>
          <ul className="space-y-1.5">
            {arriving.slice(0, 6).map((b) => (
              <li key={b.id} className="flex items-center gap-2">
                <Link to="/app/bookings" search={{ guest: b.id }} className="min-w-0 flex-1 truncate text-sm hover:underline">
                  {b.guest_full_name ?? copy.guestNoName}
                </Link>
                <GuideLinkButton bookingId={b.id} className="h-8 px-3 text-xs" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function KioskCard({ property }: { property: { id: string; short_code: string } }) {
  const tile = "flex items-center gap-2 whitespace-nowrap rounded-xl border border-border px-3 py-2.5 text-sm font-medium hover:bg-muted";
  return (
    <Card icon={QrCode} title={copy.kioskTitle} action={<CardLink to="/app/properties" search={{ focus: "checkin" }}>{copy.checkinSettings}</CardLink>}>
      <p className="mb-3 text-sm text-muted-foreground">{copy.kioskBody}</p>
      <div className="flex flex-wrap gap-2">
        <Peek content={<p>{copy.kioskPeek}</p>}>
          <a href={`/kiosk/${property.short_code}`} target="_blank" rel="noopener noreferrer" className={tile}>
            <Monitor className="size-4 text-primary" /> {copy.openKiosk} <ExternalLink className="ml-auto size-3.5 text-muted-foreground" />
          </a>
        </Peek>
        <Peek content={<p>{copy.pagePeek(`/p/${property.short_code}`)}</p>}>
          <a href={`/p/${property.short_code}`} target="_blank" rel="noopener noreferrer" className={tile}>
            <DoorOpen className="size-4 text-primary" /> {copy.guestPage} <ExternalLink className="ml-auto size-3.5 text-muted-foreground" />
          </a>
        </Peek>
        <Peek content={<p>{copy.qrPeek}</p>}>
          <Link to="/app/print/$propertyId" params={{ propertyId: property.id }} className={tile}>
            <Printer className="size-4 text-primary" /> {copy.printQr}
          </Link>
        </Peek>
      </div>
    </Card>
  );
}

function KeySettings({ isUk }: { isUk: boolean }) {
  const { isOwner } = useRole();
  const links: Array<{ key: string; to: string; search?: Record<string, string> }> = [
    { key: "property", to: "/app/properties", search: { focus: "property" } },
    { key: "checkin", to: "/app/properties", search: { focus: "checkin" } },
    { key: "records", to: "/app/properties", search: { focus: "records" } },
    { key: "rooms", to: "/app/properties", search: { focus: "rooms" } },
    { key: "cleaning", to: "/app/properties", search: { focus: "cleaning" } },
    { key: "team", to: "/app/settings", search: { focus: "team" } },
    ...(isOwner ? [{ key: "payments", to: "/app/settings", search: { focus: "payments" } }] : []),
    { key: "invoices", to: "/app/settings", search: { focus: "invoices" } },
    { key: "api", to: "/app/settings", search: { focus: "api" } },
    ...(isOwner ? [{ key: "billing", to: "/app/billing" }] : []),
    ...(isUk ? [{ key: "register", to: "/app/register" }] : []),
  ];
  return (
    <Card icon={Settings2} title={copy.settingsTitle}>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {links.map((l) => {
          const [name, about] = copy.settingsLinks[l.key]!;
          return (
            <li key={l.key}>
              <Peek className="block" content={<p>{about}</p>}>
                <Link to={l.to as never} search={l.search as never} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-medium hover:bg-muted">
                  <span className="flex-1">{name}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </Peek>
            </li>
          );
        })}
      </ul>
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
                await mark({ data: { id: a.id } });
                await qc.invalidateQueries({ queryKey: ["alerts"] });
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

