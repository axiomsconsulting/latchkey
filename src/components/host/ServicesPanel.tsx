import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  CalendarClock,
  ChevronDown,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Pencil,
  Phone,
  Repeat,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ExtrasInbox } from "@/components/host/ExtrasInbox";
import { TradeContacts } from "@/components/host/TradeContacts";
import { TradeDirectory } from "@/components/host/TradeDirectory";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  common,
  housekeepingCopy,
  jobTools,
  services as copy,
  trades as tradesDir,
  tradesCopy,
} from "@/content/copy";
import { useLandOn } from "@/hooks/use-land-on";
import { useRole, useWorkspace } from "@/hooks/use-host-data";
import { zonedParts } from "@/lib/dates";
import { listExtrasRequests } from "@/lib/extras.functions";
import { deleteJobs } from "@/lib/guests.functions";
import { zonedToUtc } from "@/lib/guide";
import { deleteRepeatingService, saveRepeatingService } from "@/lib/host.functions";
import {
  CLOSED_JOB,
  jobRooms,
  jobSpan,
  nextVisit,
  serviceColours,
  windowGroups,
  type WindowGroup,
} from "@/lib/job-lines";
import { markSeen, readSeen, unseen, type SeenStore } from "@/lib/seen";
import { SERVICE_CATEGORIES, categoryById, formatPence } from "@/lib/services";
import { contactLinks, tradeCategoryLabel } from "@/lib/trade-contacts";
import { listTrades, assignTradeToJob } from "@/lib/trades.functions";
import {
  acknowledgeJob,
  createHostJob,
  listJobs,
  setJobStatus,
  updateJobPlan,
} from "@/lib/services.functions";
import { cn } from "@/lib/utils";

export const SERVICE_TABS = ["inbox", "planned", "trades"] as const;
export type ServiceTab = (typeof SERVICE_TABS)[number];

type Room = { id: string; display_name: string };

type Job = {
  id: string;
  category: string;
  title: string;
  note: string | null;
  status: string;
  urgency: string;
  source: string;
  room_id: string | null;
  room_ids?: string[] | null;
  scheduled_at: string | null;
  eta_at: string | null;
  window_end?: string | null;
  all_day?: boolean | null;
  guest_price_pence: number | null;
  quoted_pence: number | null;
  provider: { id?: string; name: string; contact?: string | null } | null;
  provider_mode: string | null;
  provider_ref: string | null;
  created_at: string;
  archived_at?: string | null;
  rooms: { display_name: string } | null;
  bookings: { guest_full_name: string | null } | null;
};

type Trade = {
  id: string;
  name: string;
  company_name: string | null;
  category: string;
  phone: string | null;
  whatsapp_phone: string | null;
  email: string | null;
  area: string | null;
  is_preferred: boolean;
};

const closed = (j: Job) => !!j.archived_at || (CLOSED_JOB as readonly string[]).includes(j.status);
const SEEN_KEY = (propertyId: string) => `latchkey.servicesSeen.${propertyId}`;

/** The day and time on the property's clock: "Thu 6 Nov" and "10:00". */
function dayLabel(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}
const dateLabel = (day: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${day}T12:00:00Z`));
const timeLabel = (iso: string, tz: string) => zonedParts(new Date(iso), tz).time;

/** A job's "when" column: the day, then the window, all day, or not booked yet. */
function jobWhenColumn(j: Job, tz: string): { top: string; bottom: string | null } {
  const from = j.eta_at ?? j.scheduled_at;
  if (!from || !jobSpan(j, tz)) return { top: copy.notBooked, bottom: null };
  const allDay = jobSpan(j, tz)!.allDay;
  return {
    top: dayLabel(from, tz),
    bottom: allDay ? copy.allDay : `${timeLabel(from, tz)}–${timeLabel(j.window_end!, tz)}`,
  };
}

/** A repeating service's "when": its days, then the next visit; a one-off closure's day and times. */
function groupWhenColumn(g: WindowGroup, tz: string): { top: string; bottom: string | null } {
  if (!g.weekly)
    return {
      top: dayLabel(g.startsAt!, tz),
      bottom: `${timeLabel(g.startsAt!, tz)}–${timeLabel(g.endsAt!, tz)}`,
    };
  const now = zonedParts(new Date(), tz);
  const next = nextVisit(g, now.date, now.time);
  return {
    top: copy.everyDays(g.days.map((d) => housekeepingCopy.schedule.short[d]!)),
    bottom: next ? copy.nextVisit(`${dateLabel(next)}, ${g.start}–${g.end}`) : null,
  };
}

/** Who's coming, with call, text and WhatsApp (and email) links. */
function ContactLine({
  name,
  trade,
  phone,
  countryCode,
}: {
  name: string;
  trade: Trade | undefined;
  phone?: string | null | undefined;
  countryCode: string;
}) {
  const links = contactLinks(trade ?? { phone: phone ?? null }, countryCode);
  const icon =
    "grid size-9 place-items-center rounded-full border border-border hover:bg-secondary";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <BadgeCheck className="size-4 text-primary" />
      <span className="font-medium">{name}</span>
      {trade ? (
        <span className="text-muted-foreground">· {tradeCategoryLabel(trade.category)}</span>
      ) : null}
      <span className="flex gap-1.5">
        {links.tel ? (
          <a href={links.tel} className={icon} aria-label={tradesCopy.call} title={tradesCopy.call}>
            <Phone className="size-4" />
          </a>
        ) : null}
        {links.sms ? (
          <a href={links.sms} className={icon} aria-label={copy.text} title={copy.text}>
            <MessageSquare className="size-4" />
          </a>
        ) : null}
        {links.whatsapp ? (
          <a
            href={links.whatsapp}
            target="_blank"
            rel="noreferrer"
            className={icon}
            aria-label={tradesCopy.whatsapp}
            title={tradesCopy.whatsapp}
          >
            <MessageCircle className="size-4" />
          </a>
        ) : null}
        {links.email ? (
          <a
            href={links.email}
            className={icon}
            aria-label={tradesCopy.email}
            title={tradesCopy.email}
          >
            <Mail className="size-4" />
          </a>
        ) : null}
      </span>
    </div>
  );
}

/** One service: when on the left, what and who on the right. */
function ServiceRow({
  id,
  when,
  colour,
  repeating = false,
  children,
}: {
  id: string;
  when: { top: string; bottom: string | null };
  colour: string | undefined;
  repeating?: boolean;
  children: ReactNode;
}) {
  return (
    <article
      id={id}
      className="card-soft grid scroll-mt-24 gap-3 p-4 sm:grid-cols-[12.5rem_minmax(0,1fr)] sm:p-5"
    >
      <div className="flex items-start gap-2 sm:flex-col sm:gap-1">
        <span
          aria-hidden
          title={copy.lineColour}
          className={cn("mt-2 h-1.5 w-6 shrink-0 rounded-full sm:mt-0", !colour && "bg-border")}
          style={colour ? { background: colour } : undefined}
        />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium">
            {repeating ? <Repeat className="size-4 shrink-0 text-muted-foreground" /> : null}
            {when.top}
          </p>
          {when.bottom ? <p className="text-sm text-muted-foreground">{when.bottom}</p> : null}
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </article>
  );
}

/** Finished work, folded at the end of a tab. */
function Finished({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!count) return null;
  return (
    <div className="pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        {copy.finished(count)}
      </button>
      {open ? <div className="mt-3 space-y-3">{children}</div> : null}
    </div>
  );
}

/**
 * Services, under the housekeeping timeline on Bookings: Requests (guests' requests and extras
 * orders), Maintenance (one-off jobs and repeating services such as the weekly cleaning, which
 * are the schedule's windows) and Contacts (the host's own people and the local directory).
 * Each open job and service has a colour, matching its line on the timeline. A tab shows how
 * many items arrived since this browser last looked at it. Finished work folds away at the end.
 */
export function ServicesPanel({
  propertyId,
  rooms,
  timezone,
  tab: tabParam,
  job: jobParam,
  request: requestParam,
}: {
  propertyId: string;
  rooms: Room[];
  timezone: string;
  tab?: ServiceTab | undefined;
  job?: string | undefined;
  request?: string | undefined;
}) {
  const ws = useWorkspace();
  const hostId = ws.data!.hostId;
  const properties = (ws.data?.properties ?? []) as Array<{
    id: string;
    postcode?: string | null;
    address?: string | null;
    country_code?: string | null;
  }>;
  const selectedProperty = properties.find((p) => p.id === propertyId);
  const countryCode = selectedProperty?.country_code ?? "GB";
  const jobsFn = useServerFn(listJobs);
  const jobs = useQuery({
    queryKey: ["jobs", propertyId],
    queryFn: () => jobsFn({ data: { propertyId } }),
    refetchInterval: 30_000,
  });
  const extrasFn = useServerFn(listExtrasRequests);
  const extras = useQuery({
    queryKey: ["extras-inbox", propertyId],
    queryFn: () => extrasFn({ data: { propertyId } }),
    refetchInterval: 20_000,
  });
  const tradesFn = useServerFn(listTrades);
  const trades = useQuery({
    queryKey: ["trades", hostId, propertyId],
    queryFn: () => tradesFn({ data: { hostId, propertyId } }),
  });
  const tradeById = useMemo(
    () => new Map(((trades.data ?? []) as Trade[]).map((t) => [t.id, t])),
    [trades.data],
  );

  const [recFor, setRecFor] = useState<Job | null>(null);
  const [planFor, setPlanFor] = useState<Job | null>(null);
  const [groupFor, setGroupFor] = useState<WindowGroup | null>(null);
  const [tab, setTab] = useState<string>(tabParam ?? "inbox");
  useEffect(() => {
    if (tabParam) setTab(tabParam);
  }, [tabParam]);

  const everything = useMemo(() => (jobs.data?.jobs ?? []) as unknown as Job[], [jobs.data]);
  const groups = useMemo(() => windowGroups(jobs.data?.windows ?? []), [jobs.data]);
  const colours = useMemo(
    () =>
      serviceColours(
        everything.filter((j) => !closed(j)),
        groups,
      ),
    [everything, groups],
  );
  const inbox = everything.filter((j) => j.source === "guest");
  const planned = everything.filter((j) => j.source !== "guest");
  // Weekly services and one-off closures still to come.
  const services = groups.filter(
    (g) => g.weekly || (g.endsAt && Date.parse(g.endsAt) > Date.now()),
  );
  const extraIds = ((extras.data ?? []) as Array<{ id: string }>).map((r) => `x:${r.id}`);

  // A job link (or a line on the timeline) opens whichever tab holds that job.
  useEffect(() => {
    if (!jobParam || !jobs.data) return;
    if (jobParam.startsWith("w:")) return setTab("planned");
    const j = everything.find((x) => x.id === jobParam);
    if (j) setTab(j.source === "guest" ? "inbox" : "planned");
  }, [jobParam, jobs.data, everything]);
  useEffect(() => {
    if (requestParam) setTab("inbox");
  }, [requestParam]);
  useLandOn(
    jobParam ? `job-${jobParam}` : requestParam ? `request-${requestParam}` : null,
    !!jobs.data,
  );

  // "New" badges: what this browser hasn't seen on each tab yet.
  const ids: Record<"inbox" | "planned", string[]> = {
    inbox: [...inbox.filter((j) => !closed(j)).map((j) => j.id), ...extraIds],
    planned: [...planned.filter((j) => !closed(j)).map((j) => j.id), ...services.map((g) => g.key)],
  };
  const ready = !!jobs.data && !!extras.data;
  const [seen, setSeen] = useState<SeenStore | null>(null);
  useEffect(() => {
    try {
      setSeen(readSeen(window.localStorage.getItem(SEEN_KEY(propertyId))));
    } catch {
      setSeen({});
    }
  }, [propertyId]);
  const idsKey = JSON.stringify(ids);
  useEffect(() => {
    if (!seen || !ready) return;
    let next = seen;
    for (const k of ["inbox", "planned"] as const) {
      // The first visit, and the open tab, count as seen.
      if (!next[k] || k === tab) {
        const merged = markSeen(next[k], ids[k]);
        if (merged.length !== (next[k] ?? []).length || !next[k]) next = { ...next, [k]: merged };
      }
    }
    if (next !== seen) {
      setSeen(next);
      try {
        window.localStorage.setItem(SEEN_KEY(propertyId), JSON.stringify(next));
      } catch {
        // Private browsing: badges just won't remember.
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, ready, tab, idsKey, propertyId]);
  const fresh = (k: "inbox" | "planned") => (seen && ready ? unseen(ids[k], seen[k]).length : 0);
  const badge = (k: "inbox" | "planned") =>
    fresh(k) && tab !== k ? (
      <Badge className="ml-2" aria-label={copy.newBadge(fresh(k))}>
        {copy.newShort(fresh(k))}
      </Badge>
    ) : null;

  const jobRow = (j: Job) => (
    <JobRow
      key={j.id}
      job={j}
      colour={closed(j) ? undefined : colours[j.id]}
      rooms={rooms}
      timezone={timezone}
      trade={j.provider?.id ? tradeById.get(j.provider.id) : undefined}
      countryCode={countryCode}
      onRecommend={() => setRecFor(j)}
      onPlan={() => setPlanFor(j)}
    />
  );
  const openRequests = inbox.filter((j) => !closed(j));
  const openPlanned = planned.filter((j) => !closed(j));

  return (
    <section id="services" className="scroll-mt-24" data-tour="services">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList
          className="grid h-auto w-full grid-cols-3 gap-1 rounded-2xl p-1 sm:inline-flex sm:h-12 sm:w-auto"
          data-tour="services-tabs"
        >
          <TabsTrigger value="inbox" className="h-10 rounded-xl px-2 sm:px-4">
            {copy.tabInbox}
            {badge("inbox")}
          </TabsTrigger>
          <TabsTrigger value="planned" className="h-10 rounded-xl px-2 sm:px-4">
            {copy.tabScheduled}
            {badge("planned")}
          </TabsTrigger>
          <TabsTrigger value="trades" className="h-10 rounded-xl px-2 sm:px-4">
            {tradesDir.tabLabel}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4 space-y-3">
          {/* Extras guests ordered: only when there are some. */}
          <ExtrasInbox propertyId={propertyId} hideEmpty />
          {jobs.isLoading ? (
            <Skeleton className="h-32 rounded-2xl" />
          ) : openRequests.length === 0 && extraIds.length === 0 ? (
            <div className="card-soft p-8 text-center text-muted-foreground">{copy.emptyInbox}</div>
          ) : (
            openRequests.map(jobRow)
          )}
          <Finished count={inbox.length - openRequests.length}>
            {inbox.filter(closed).map(jobRow)}
          </Finished>
        </TabsContent>

        <TabsContent value="planned" className="mt-4 space-y-3">
          {jobs.isLoading ? (
            <Skeleton className="h-32 rounded-2xl" />
          ) : openPlanned.length === 0 && services.length === 0 ? (
            <div className="card-soft p-8 text-center text-muted-foreground">
              {copy.emptyScheduled}
            </div>
          ) : (
            <>
              {services.map((g) => (
                <GroupRow
                  key={g.key}
                  group={g}
                  colour={colours[g.key]}
                  rooms={rooms}
                  timezone={timezone}
                  propertyId={propertyId}
                  trade={g.tradeId ? tradeById.get(g.tradeId) : undefined}
                  countryCode={countryCode}
                  onEdit={() => setGroupFor(g)}
                />
              ))}
              {openPlanned.map(jobRow)}
            </>
          )}
          <Finished count={planned.length - openPlanned.length}>
            {planned.filter(closed).map(jobRow)}
          </Finished>
        </TabsContent>

        <TabsContent value="trades" className="mt-4 space-y-6">
          <TradeContacts
            hostId={hostId}
            propertyId={propertyId}
            postcode={selectedProperty?.postcode ?? ""}
            countryCode={countryCode}
          />
          <TradeDirectory
            postcode={selectedProperty?.postcode ?? ""}
            address={selectedProperty?.address ?? null}
            countryCode={countryCode}
          />
        </TabsContent>
      </Tabs>

      {recFor ? (
        <RecommendDialog
          job={recFor}
          hostId={hostId}
          propertyId={propertyId}
          countryCode={countryCode}
          onClose={() => setRecFor(null)}
        />
      ) : null}
      {planFor || groupFor ? (
        <ServiceDialog
          job={planFor}
          group={groupFor}
          onClose={() => {
            setPlanFor(null);
            setGroupFor(null);
          }}
          propertyId={propertyId}
          rooms={rooms}
          timezone={timezone}
        />
      ) : null}
    </section>
  );
}

const roomsText = (ids: string[], rooms: Room[]) =>
  ids.length
    ? ids
        .map((id) => rooms.find((r) => r.id === id)?.display_name)
        .filter(Boolean)
        .join(", ")
    : copy.wholeProperty;

/** A repeating service (or a one-off closure) from the schedule. */
function GroupRow({
  group,
  colour,
  rooms,
  timezone,
  propertyId,
  trade,
  countryCode,
  onEdit,
}: {
  group: WindowGroup;
  colour: string | undefined;
  rooms: Room[];
  timezone: string;
  propertyId: string;
  trade: Trade | undefined;
  countryCode: string;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const remove = useServerFn(deleteRepeatingService);
  const { canWrite } = useRole();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const title = group.reason ?? housekeepingCopy.windowDefault;
  async function drop() {
    setBusy(true);
    try {
      await remove({ data: { propertyId, ids: group.ids } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["jobs"] }),
        qc.invalidateQueries({ queryKey: ["housekeeping-range"] }),
        qc.invalidateQueries({ queryKey: ["board"] }),
      ]);
      toast.success(copy.removed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ServiceRow
      id={`job-${group.key}`}
      when={groupWhenColumn(group, timezone)}
      colour={colour}
      repeating={group.weekly}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg">{title}</h3>
        <Badge variant="secondary">{group.weekly ? copy.repeating : copy.closure}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{roomsText(group.rooms, rooms)}</p>
      {trade ? (
        <ContactLine
          name={trade.company_name || trade.name}
          trade={trade}
          countryCode={countryCode}
        />
      ) : group.weekly ? (
        <p className="mt-2 text-sm text-muted-foreground">{copy.noContact}</p>
      ) : null}
      {canWrite ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {group.weekly ? (
            <Button variant="outline" onClick={onEdit} disabled={busy}>
              <Pencil className="size-4" /> {copy.change}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => setConfirm(true)}
            disabled={busy}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}{" "}
            {common.remove}
          </Button>
        </div>
      ) : null}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{jobTools.deleteTitle(title)}</AlertDialogTitle>
            <AlertDialogDescription>{copy.removeRepeating}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void drop()}
            >
              {common.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ServiceRow>
  );
}

function JobRow({
  job,
  onRecommend,
  onPlan,
  colour,
  rooms,
  timezone,
  trade,
  countryCode,
}: {
  job: Job;
  onRecommend: () => void;
  onPlan: () => void;
  /** Its line's colour on the timeline (open jobs only). */
  colour: string | undefined;
  rooms: Room[];
  timezone: string;
  trade: Trade | undefined;
  countryCode: string;
}) {
  const qc = useQueryClient();
  const ack = useServerFn(acknowledgeJob);
  const setStatus = useServerFn(setJobStatus);
  const deleteFn = useServerFn(deleteJobs);
  const { canWrite } = useRole();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    try {
      await fn();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["jobs"] }),
        qc.invalidateQueries({ queryKey: ["housekeeping-range"] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  const open = !closed(job);
  return (
    <ServiceRow id={`job-${job.id}`} when={jobWhenColumn(job, timezone)} colour={colour}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg">{job.title}</h3>
        <Badge variant={job.status === "new" ? "default" : "secondary"}>
          {copy.statuses[job.status] ?? job.status}
        </Badge>
        {job.urgency === "urgent" ? <Badge variant="destructive">Urgent</Badge> : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {[roomsText(jobRooms(job), rooms), job.bookings?.guest_full_name]
          .filter(Boolean)
          .join(" · ")}
        {job.guest_price_pence ? ` · guest pays ${formatPence(job.guest_price_pence)}` : ""}
        {job.quoted_pence ? ` · ${formatPence(job.quoted_pence)}` : ""}
      </p>
      {job.note ? <p className="mt-2 text-sm">"{job.note}"</p> : null}
      {job.provider ? (
        <ContactLine
          name={job.provider.name}
          trade={trade}
          phone={job.provider.contact}
          countryCode={countryCode}
        />
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {open && job.status === "new" ? (
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => run("ack", () => ack({ data: { jobId: job.id } }))}
          >
            {busy === "ack" ? <Loader2 className="size-4 animate-spin" /> : null}
            {copy.acknowledge}
          </Button>
        ) : null}
        {open && !job.provider ? <Button onClick={onRecommend}>{copy.recommend}</Button> : null}
        {open && canWrite ? (
          <Button variant="outline" disabled={busy !== null} onClick={onPlan}>
            <CalendarClock className="size-4" /> {copy.plan}
          </Button>
        ) : null}
        {open && job.status === "booked" ? (
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              run("prog", () =>
                setStatus({ data: { jobId: job.id, status: "in_progress", note: null } }),
              )
            }
          >
            {copy.inProgress}
          </Button>
        ) : null}
        {open ? (
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              run("done", () => setStatus({ data: { jobId: job.id, status: "done", note: null } }))
            }
          >
            {busy === "done" ? <Loader2 className="size-4 animate-spin" /> : null}
            {copy.markDone}
          </Button>
        ) : null}
        {open && !job.provider ? (
          <Button
            variant="ghost"
            disabled={busy !== null}
            onClick={() =>
              run("dec", () =>
                setStatus({ data: { jobId: job.id, status: "declined", note: null } }),
              )
            }
          >
            {copy.decline}
          </Button>
        ) : null}
        {canWrite ? (
          <Button
            variant="ghost"
            className="ml-auto text-destructive"
            disabled={busy !== null}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" /> {common.remove}
          </Button>
        ) : null}
      </div>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{jobTools.deleteTitle(job.title)}</AlertDialogTitle>
            <AlertDialogDescription>{jobTools.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                void run("delete", async () => {
                  await deleteFn({ data: { ids: [job.id] } });
                  toast.success(jobTools.deleted);
                })
              }
            >
              {common.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ServiceRow>
  );
}

/** Picks someone from the host's own address book for this job. */
function RecommendDialog({
  job,
  hostId,
  propertyId,
  countryCode,
  onClose,
}: {
  job: Job;
  hostId: string;
  propertyId: string;
  countryCode: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listTrades);
  const assign = useServerFn(assignTradeToJob);
  const [busy, setBusy] = useState<string | null>(null);

  const trades = useQuery({
    queryKey: ["trades", hostId, propertyId],
    queryFn: () => listFn({ data: { hostId, propertyId } }),
  });

  const all = (trades.data ?? []) as Array<{
    id: string;
    name: string;
    company_name: string | null;
    category: string;
    phone: string | null;
    whatsapp_phone: string | null;
    email: string | null;
    area: string | null;
    is_preferred: boolean;
  }>;
  const matching = all.filter((t) => t.category === job.category);
  const shown = matching.length > 0 ? matching : all;

  async function pick(tradeId: string) {
    setBusy(tradeId);
    try {
      await assign({ data: { jobId: job.id, tradeId, etaIso: job.scheduled_at ?? null } });
      await qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success(job.source === "guest" ? copy.guestTold : "Booked");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl rounded-3xl">
        <DialogHeader>
          <DialogTitle>{copy.recommendedTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{job.title}</p>
        {trades.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : shown.length === 0 ? (
          <p className="text-muted-foreground">{tradesCopy.noneForJob}</p>
        ) : (
          <ul className="space-y-2">
            {shown.map((t) => {
              const links = contactLinks(t, countryCode);
              return (
                <li key={t.id} className="rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {t.company_name || t.name}
                        {t.is_preferred ? (
                          <Badge variant="secondary">{tradesCopy.preferred}</Badge>
                        ) : null}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {[tradeCategoryLabel(t.category), t.area, t.phone]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {links.tel ? (
                        <Button asChild variant="ghost" size="icon" aria-label={tradesCopy.call}>
                          <a href={links.tel}>
                            <Phone className="size-4" />
                          </a>
                        </Button>
                      ) : null}
                      {links.whatsapp ? (
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          aria-label={tradesCopy.whatsapp}
                        >
                          <a href={links.whatsapp} target="_blank" rel="noreferrer">
                            <MessageCircle className="size-4" />
                          </a>
                        </Button>
                      ) : null}
                      {links.email ? (
                        <Button asChild variant="ghost" size="icon" aria-label={tradesCopy.email}>
                          <a href={links.email}>
                            <Mail className="size-4" />
                          </a>
                        </Button>
                      ) : null}
                      <Button disabled={busy !== null} onClick={() => pick(t.id)}>
                        {busy === t.id ? <Loader2 className="size-4 animate-spin" /> : null}
                        {copy.appoint}
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A job's day and window on the property's clock, as the dialog's fields. */
function planFields(job: Job | null, timezone: string) {
  const from = job?.eta_at ?? job?.scheduled_at ?? null;
  const parts = (iso: string) => zonedParts(new Date(iso), timezone);
  const start = from ? parts(from) : null;
  const end = job?.window_end ? parts(job.window_end) : null;
  return {
    date: start?.date ?? "",
    allDay: job ? !!job.all_day || !job.window_end : true,
    from: start && job?.window_end ? start.time : "08:00",
    to: end?.time ?? "12:00",
  };
}

const chipClass = (on: boolean) =>
  cn(
    "rounded-full border px-3 py-1.5 text-sm",
    on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary",
  );

/**
 * Adding a service (Bookings' Add service button), or changing one: a single visit (a job, on a
 * day, all day or in the tradesperson's window) or a repeating one (every week on chosen days
 * between two times, saved as the schedule's windows), the rooms it affects (none = the whole
 * property) and who comes, from the host's own contacts. Times are the property's.
 */
export function ServiceDialog({
  job = null,
  group = null,
  onClose,
  onSaved,
  propertyId,
  rooms,
  timezone,
}: {
  /** Changing a job's time and rooms. */
  job?: Job | null;
  /** Changing a repeating service. */
  group?: WindowGroup | null;
  onClose: () => void;
  onSaved?: (kind: "once" | "weekly") => void;
  propertyId: string;
  rooms: Room[];
  timezone: string;
}) {
  const qc = useQueryClient();
  const ws = useWorkspace();
  const hostId = ws.data?.hostId ?? "";
  const create = useServerFn(createHostJob);
  const update = useServerFn(updateJobPlan);
  const saveWeekly = useServerFn(saveRepeatingService);
  const tradesFn = useServerFn(listTrades);
  const trades = useQuery({
    queryKey: ["trades", hostId, propertyId],
    enabled: !!hostId,
    queryFn: () => tradesFn({ data: { hostId, propertyId } }),
  });
  const s = housekeepingCopy.schedule;
  const start = planFields(job, timezone);
  const [kind, setKind] = useState<"once" | "weekly">(group ? "weekly" : "once");
  const [category, setCategory] = useState("boiler_service");
  const [title, setTitle] = useState(group?.reason ?? "");
  const [what, setWhat] = useState(group?.reason ?? s.reasons[0]!);
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<string[]>(job ? jobRooms(job) : (group?.rooms ?? []));
  const [date, setDate] = useState(start.date);
  const [allDay, setAllDay] = useState(start.allDay);
  const [days, setDays] = useState<number[]>(group?.days ?? []);
  const [from, setFrom] = useState(group?.start ?? start.from);
  const [to, setTo] = useState(group?.end ?? start.to);
  const [tradeId, setTradeId] = useState<string>(group?.tradeId ?? "none");
  const [busy, setBusy] = useState(false);

  const toggleRoom = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleDay = (d: number) =>
    setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  const editing = !!job || !!group;
  const timed = kind === "weekly" || (!!date && !allDay);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (timed && to <= from) return void toast.error(copy.windowOrder);
    if (kind === "weekly" && !days.length) return void toast.error(copy.pickDays);
    if (kind === "weekly" && !what.trim()) return void toast.error(copy.nameIt);
    setBusy(true);
    const contact = tradeId === "none" ? null : tradeId;
    try {
      if (kind === "weekly") {
        await saveWeekly({
          data: {
            propertyId,
            replaceIds: group?.ids ?? [],
            reason: what.trim(),
            roomIds: picked,
            days,
            start: from,
            end: to,
            tradeId: contact,
          },
        });
      } else {
        const scheduledAt = date
          ? zonedToUtc(date, allDay ? "00:00" : from, timezone).toISOString()
          : null;
        const windowEnd = date && !allDay ? zonedToUtc(date, to, timezone).toISOString() : null;
        if (job)
          await update({
            data: { jobId: job.id, roomIds: picked, scheduledAt, windowEnd, allDay },
          });
        else
          await create({
            data: {
              hostId,
              propertyId,
              roomId: null,
              roomIds: picked,
              category,
              title: title.trim() || categoryById(category)!.label,
              note: note.trim() || null,
              scheduledAt,
              windowEnd,
              allDay,
              urgency: "low",
              tradeId: contact,
            },
          });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["jobs"] }),
        qc.invalidateQueries({ queryKey: ["housekeeping-range"] }),
        qc.invalidateQueries({ queryKey: ["board"] }),
      ]);
      toast.success(editing ? copy.planSaved : copy.added);
      onSaved?.(kind);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  const people = (trades.data ?? []) as Trade[];
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>
            {job ? job.title : group ? copy.changeService : copy.addService}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {editing ? null : (
            <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
              {(["once", "weekly"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={cn(
                    "flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium",
                    kind === k ? "bg-background shadow-soft" : "text-muted-foreground",
                  )}
                >
                  {k === "weekly" ? (
                    <Repeat className="size-4" />
                  ) : (
                    <CalendarClock className="size-4" />
                  )}
                  {k === "weekly" ? copy.kindWeekly : copy.kindOnce}
                </button>
              ))}
            </div>
          )}
          {kind === "once" && !job ? (
            <>
              <div className="space-y-2">
                <Label>{copy.serviceLabel}</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_CATEGORIES.filter((c) => c.kind !== "extra").map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="jt">{copy.titleLabel}</Label>
                <Input
                  id="jt"
                  className="h-12"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Annual boiler service"
                />
              </div>
            </>
          ) : null}
          {kind === "weekly" ? (
            <div className="space-y-2">
              <Label htmlFor="jw">{copy.whatLabel}</Label>
              <div className="flex flex-wrap gap-1.5">
                {s.reasons.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setWhat(r)}
                    className={chipClass(what === r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <Input
                id="jw"
                className="h-11"
                maxLength={80}
                value={what}
                onChange={(e) => setWhat(e.target.value)}
              />
            </div>
          ) : null}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{copy.roomsLabel}</legend>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={picked.length === 0}
                onClick={() => setPicked([])}
                className={chipClass(picked.length === 0)}
              >
                {copy.wholeProperty}
              </button>
              {rooms.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={picked.includes(r.id)}
                  onClick={() => toggleRoom(r.id)}
                  className={chipClass(picked.includes(r.id))}
                >
                  {r.display_name}
                </button>
              ))}
            </div>
          </fieldset>
          {kind === "weekly" ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{copy.daysLabel}</legend>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={days.includes(d)}
                    onClick={() => toggleDay(d)}
                    className={chipClass(days.includes(d))}
                  >
                    {s.short[d]}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="jd">{copy.dayLabel}</Label>
              <Input
                id="jd"
                type="date"
                className="h-12"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          )}
          {kind === "weekly" || date ? (
            <div className="space-y-3 rounded-2xl border border-border p-3">
              {kind === "once" ? (
                <label className="flex items-center justify-between gap-3 text-sm font-medium">
                  {copy.allDay}
                  <Switch checked={allDay} onCheckedChange={setAllDay} />
                </label>
              ) : null}
              {timed ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="jf" className="text-xs">
                      {copy.windowFrom}
                    </Label>
                    <Input
                      id="jf"
                      type="time"
                      className="h-11"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="jto" className="text-xs">
                      {copy.windowTo}
                    </Label>
                    <Input
                      id="jto"
                      type="time"
                      className="h-11"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {kind === "weekly" ? copy.weeklyHelp : copy.windowHelp}
              </p>
            </div>
          ) : null}
          {job ? null : (
            <div className="space-y-2">
              <Label>{copy.contactLabel}</Label>
              <Select value={tradeId} onValueChange={setTradeId}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{copy.noOneYet}</SelectItem>
                  {people.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.company_name || t.name} · {tradeCategoryLabel(t.category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {people.length ? null : (
                <p className="text-xs text-muted-foreground">{copy.contactsHint}</p>
              )}
            </div>
          )}
          {kind === "once" && !job ? (
            <div className="space-y-2">
              <Label htmlFor="jn">{copy.noteLabel}</Label>
              <Textarea id="jn" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          ) : null}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {editing ? common.save : copy.addCta}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
