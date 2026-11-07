import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  CalendarClock,
  CalendarPlus,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { TradeContacts } from "@/components/host/TradeContacts";
import { TradeDirectory } from "@/components/host/TradeDirectory";
import { ExtrasInbox } from "@/components/host/ExtrasInbox";
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
  jobTools,
  services as copy,
  trades as tradesDir,
  tradesCopy,
} from "@/content/copy";
import { useLandOn } from "@/hooks/use-land-on";
import { useRole, useWorkspace } from "@/hooks/use-host-data";
import { zonedParts } from "@/lib/dates";
import { archiveJobs, deleteJobs } from "@/lib/guests.functions";
import { zonedToUtc } from "@/lib/guide";
import { CLOSED_JOB, jobColours, jobRooms, jobWhen } from "@/lib/job-lines";
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

export const SERVICE_TABS = ["inbox", "planned", "trades", "archive"] as const;
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
  provider: { name: string; rating: number; contraUrl: string } | null;
  provider_mode: string | null;
  provider_ref: string | null;
  created_at: string;
  archived_at?: string | null;
  rooms: { display_name: string } | null;
  bookings: { guest_full_name: string | null } | null;
};

function when(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Services, under the housekeeping timeline on Bookings (it was its own page): guest requests,
 * maintenance and cleaning jobs, the host's own tradespeople and the local directory. Each open
 * job with a time is a coloured line on the timeline above; the same colour marks it here.
 * ?tab= opens a tab, ?job= lands on a job, ?request= on an extras request.
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
  const properties = (ws.data?.properties ?? []) as Array<{
    id: string;
    postcode?: string | null;
    address?: string | null;
    country_code?: string | null;
  }>;
  const jobsFn = useServerFn(listJobs);
  const jobs = useQuery({
    queryKey: ["jobs", propertyId],
    queryFn: () => jobsFn({ data: { propertyId } }),
    refetchInterval: 30_000,
  });
  const [recFor, setRecFor] = useState<Job | null>(null);
  const [planFor, setPlanFor] = useState<Job | null>(null);
  const [tab, setTab] = useState<string>(tabParam ?? "inbox");
  useEffect(() => {
    if (tabParam) setTab(tabParam);
  }, [tabParam]);
  // A job link (or a line on the timeline) opens whichever tab holds that job.
  useEffect(() => {
    if (!jobParam || !jobs.data) return;
    const j = (jobs.data.jobs as unknown as Job[]).find((x) => x.id === jobParam);
    if (j) setTab(j.archived_at ? "archive" : j.source === "guest" ? "inbox" : "planned");
  }, [jobParam, jobs.data]);
  useLandOn(
    jobParam ? `job-${jobParam}` : requestParam ? `request-${requestParam}` : null,
    !!jobs.data,
  );
  const [newOpen, setNewOpen] = useState(false);

  const everything = useMemo(() => (jobs.data?.jobs ?? []) as unknown as Job[], [jobs.data]);
  const colours = useMemo(
    () =>
      jobColours(
        everything.filter(
          (j) => !j.archived_at && !(CLOSED_JOB as readonly string[]).includes(j.status),
        ),
      ),
    [everything],
  );
  const all = everything.filter((j) => !j.archived_at);
  const archived = everything.filter((j) => j.archived_at);
  const inbox = all.filter((j) => j.source === "guest");
  const planned = all.filter((j) => j.source !== "guest");
  const selectedProperty = properties.find((p) => p.id === propertyId);
  const card = (j: Job, isArchived = false) => (
    <JobCard
      key={j.id}
      job={j}
      archived={isArchived}
      colour={colours[j.id]}
      rooms={rooms}
      timezone={timezone}
      onRecommend={() => setRecFor(j)}
      onPlan={() => setPlanFor(j)}
    />
  );

  return (
    <section id="services" className="scroll-mt-24 space-y-4" data-tour="services">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <Button onClick={() => setNewOpen(true)} data-tour="services-new">
          <CalendarPlus className="size-4" /> {copy.bookMaintenance}
        </Button>
      </div>

      <ExtrasInbox propertyId={propertyId} />

      <Tabs value={tab} onValueChange={setTab}>
        {/* Phones: two rows of two, so no tab runs off the screen. */}
        <TabsList
          className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl p-1 sm:inline-flex sm:h-12 sm:w-auto"
          data-tour="services-tabs"
        >
          <TabsTrigger value="inbox" className="h-10 rounded-xl px-4">
            {copy.tabInbox}{" "}
            {inbox.filter((j) => j.status === "new").length ? (
              <Badge className="ml-2">{inbox.filter((j) => j.status === "new").length}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="planned" className="h-10 rounded-xl px-4">
            {copy.tabScheduled}
          </TabsTrigger>
          <TabsTrigger value="trades" className="h-10 rounded-xl px-4">
            {tradesDir.tabLabel}
          </TabsTrigger>
          <TabsTrigger value="archive" className="h-10 rounded-xl px-4">
            {jobTools.archiveTab}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4 space-y-3">
          {jobs.isLoading ? (
            <Skeleton className="h-32 rounded-2xl" />
          ) : inbox.length === 0 ? (
            <div className="card-soft p-8 text-center text-muted-foreground">{copy.emptyInbox}</div>
          ) : (
            inbox.map((j) => card(j))
          )}
        </TabsContent>

        <TabsContent value="planned" className="mt-4 space-y-3">
          {planned.length === 0 ? (
            <div className="card-soft p-8 text-center text-muted-foreground">
              {copy.emptyScheduled}
            </div>
          ) : (
            planned.map((j) => card(j))
          )}
        </TabsContent>

        <TabsContent value="trades" className="mt-4 space-y-6">
          <TradeContacts
            hostId={ws.data!.hostId}
            propertyId={propertyId}
            postcode={selectedProperty?.postcode ?? ""}
            countryCode={selectedProperty?.country_code ?? "GB"}
          />
          <TradeDirectory
            postcode={selectedProperty?.postcode ?? ""}
            address={selectedProperty?.address ?? null}
            countryCode={selectedProperty?.country_code ?? "GB"}
          />
        </TabsContent>

        <TabsContent value="archive" className="mt-4 space-y-3">
          {archived.length === 0 ? (
            <div className="card-soft p-8 text-center text-muted-foreground">
              {jobTools.archiveEmpty}
            </div>
          ) : (
            archived.map((j) => card(j, true))
          )}
        </TabsContent>
      </Tabs>

      {recFor ? (
        <RecommendDialog
          job={recFor}
          hostId={ws.data!.hostId}
          propertyId={propertyId}
          countryCode={selectedProperty?.country_code ?? "GB"}
          onClose={() => setRecFor(null)}
        />
      ) : null}
      {newOpen || planFor ? (
        <JobDialog
          job={planFor}
          onClose={() => {
            setNewOpen(false);
            setPlanFor(null);
          }}
          hostId={ws.data!.hostId}
          propertyId={propertyId}
          rooms={rooms}
          timezone={timezone}
        />
      ) : null}
    </section>
  );
}

function JobCard({
  job,
  onRecommend,
  onPlan,
  colour,
  rooms,
  timezone,
  archived = false,
}: {
  job: Job;
  onRecommend: () => void;
  onPlan: () => void;
  /** Its line's colour on the timeline (open jobs only). */
  colour: string | undefined;
  rooms: Room[];
  timezone: string;
  archived?: boolean;
}) {
  const qc = useQueryClient();
  const ack = useServerFn(acknowledgeJob);
  const setStatus = useServerFn(setJobStatus);
  const archiveFn = useServerFn(archiveJobs);
  const deleteFn = useServerFn(deleteJobs);
  const { canWrite } = useRole();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["jobs"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  const open = !archived && !["done", "declined", "cancelled"].includes(job.status);
  const roomNames = jobRooms(job)
    .map((id) => rooms.find((r) => r.id === id)?.display_name)
    .filter(Boolean);
  const plan = jobWhen(job, timezone);
  return (
    <article id={`job-${job.id}`} className="card-soft scroll-mt-24 p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {open && colour ? (
              <span
                aria-hidden
                title={copy.lineColour}
                className="h-1.5 w-6 shrink-0 rounded-full"
                style={{ background: colour }}
              />
            ) : null}
            <h3 className="text-lg">{job.title}</h3>
            <Badge variant={job.status === "new" ? "default" : "secondary"}>
              {copy.statuses[job.status] ?? job.status}
            </Badge>
            {job.urgency === "urgent" ? <Badge variant="destructive">Urgent</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[
              roomNames.length ? roomNames.join(", ") : copy.wholeProperty,
              job.bookings?.guest_full_name,
              when(job.created_at, timezone),
            ]
              .filter(Boolean)
              .join(" · ")}
            {job.guest_price_pence ? ` · guest pays ${formatPence(job.guest_price_pence)}` : ""}
          </p>
          {job.note ? <p className="mt-2 text-sm">"{job.note}"</p> : null}
          {plan ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm">
              <CalendarClock className="size-4 text-muted-foreground" /> {plan}
            </p>
          ) : null}
          {job.provider ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <BadgeCheck className="size-4 text-primary" />
              <span className="font-medium">{job.provider.name}</span>
              {job.eta_at ? <span>· arrives {when(job.eta_at, timezone)}</span> : null}
              {job.quoted_pence ? <span>· {formatPence(job.quoted_pence)}</span> : null}
              <Badge variant="outline">
                {job.provider_mode === "live" ? copy.liveBadge : copy.demoBadge} {job.provider_ref}
              </Badge>
            </p>
          ) : null}
        </div>
      </div>
      {open ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {job.status === "new" ? (
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => run("ack", () => ack({ data: { jobId: job.id } }))}
            >
              {busy === "ack" ? <Loader2 className="size-4 animate-spin" /> : null}
              {copy.acknowledge}
            </Button>
          ) : null}
          {!job.provider ? <Button onClick={onRecommend}>{copy.recommend}</Button> : null}
          {canWrite ? (
            <Button variant="outline" disabled={busy !== null} onClick={onPlan}>
              <CalendarClock className="size-4" /> {copy.plan}
            </Button>
          ) : null}
          {job.status === "booked" ? (
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
          {!job.provider ? (
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
        </div>
      ) : null}
      {canWrite ? (
        <div className="mt-3 flex flex-wrap justify-end gap-1 border-t border-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() =>
              run("archive", async () => {
                await archiveFn({ data: { ids: [job.id], archived: !archived } });
                toast.success(archived ? jobTools.restored : jobTools.archived);
              })
            }
          >
            {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            {archived ? jobTools.restore : jobTools.archive}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={busy !== null}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" /> {common.remove}
          </Button>
        </div>
      ) : null}
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
    </article>
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

/** What a job covers on the property's clock, as the dialog's fields. */
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

/**
 * Adding a job, or changing when it happens and where: the rooms it covers (none = the whole
 * property), and the day, as a whole day or the tradesperson's window. Times are the property's.
 */
function JobDialog({
  job,
  onClose,
  hostId,
  propertyId,
  rooms,
  timezone,
}: {
  /** Null to add a new job. */
  job: Job | null;
  onClose: () => void;
  hostId: string;
  propertyId: string;
  rooms: Room[];
  timezone: string;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createHostJob);
  const update = useServerFn(updateJobPlan);
  const start = planFields(job, timezone);
  const [category, setCategory] = useState("boiler_service");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<string[]>(job ? jobRooms(job) : []);
  const [date, setDate] = useState(start.date);
  const [allDay, setAllDay] = useState(start.allDay);
  const [from, setFrom] = useState(start.from);
  const [to, setTo] = useState(start.to);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (date && !allDay && to <= from) {
      toast.error(copy.windowOrder);
      return;
    }
    setBusy(true);
    const scheduledAt = date
      ? zonedToUtc(date, allDay ? "00:00" : from, timezone).toISOString()
      : null;
    const windowEnd = date && !allDay ? zonedToUtc(date, to, timezone).toISOString() : null;
    try {
      if (job) {
        await update({
          data: { jobId: job.id, roomIds: picked, scheduledAt, windowEnd, allDay: allDay },
        });
      } else {
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
          },
        });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["jobs"] }),
        qc.invalidateQueries({ queryKey: ["housekeeping-range", propertyId] }),
      ]);
      toast.success(job ? copy.planSaved : copy.added);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>{job ? job.title : copy.bookMaintenance}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {job ? null : (
            <>
              <div className="space-y-2">
                <Label>Service</Label>
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
                <Label htmlFor="jt">Title (optional)</Label>
                <Input
                  id="jt"
                  className="h-12"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Annual boiler service"
                />
              </div>
            </>
          )}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{copy.roomsLabel}</legend>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={picked.length === 0}
                onClick={() => setPicked([])}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  picked.length === 0
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-secondary",
                )}
              >
                {copy.wholeProperty}
              </button>
              {rooms.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={picked.includes(r.id)}
                  onClick={() => toggle(r.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm",
                    picked.includes(r.id)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-secondary",
                  )}
                >
                  {r.display_name}
                </button>
              ))}
            </div>
          </fieldset>
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
          {date ? (
            <div className="space-y-3 rounded-2xl border border-border p-3">
              <label className="flex items-center justify-between gap-3 text-sm font-medium">
                {copy.allDay}
                <Switch checked={allDay} onCheckedChange={setAllDay} />
              </label>
              {allDay ? null : (
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
              )}
              <p className="text-xs text-muted-foreground">{copy.windowHelp}</p>
            </div>
          ) : null}
          {job ? null : (
            <div className="space-y-2">
              <Label htmlFor="jn">Notes, or guest feedback that prompted this</Label>
              <Textarea id="jn" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {job ? common.save : "Add"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
