import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, CalendarPlus, ExternalLink, Loader2, Mail, MessageCircle, Phone, Star, Wrench } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/host/EmptyState";
import { PageHeader } from "@/components/host/PageHeader";
import { PropertyPicker } from "@/components/host/PropertyPicker";
import { TradeContacts } from "@/components/host/TradeContacts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { common, services as copy, trades as tradesDir, tradesCopy } from "@/content/copy";
import { ContraStudio } from "@/components/host/ContraStudio";
import { TradeDirectory } from "@/components/host/TradeDirectory";
import { ExtrasInbox } from "@/components/host/ExtrasInbox";
import { useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { SERVICE_CATEGORIES, categoryById, formatPence, rateLabel } from "@/lib/services";
import { contactLinks, tradeCategoryLabel } from "@/lib/trade-contacts";
import { listTrades, assignTradeToJob } from "@/lib/trades.functions";
import {
  acknowledgeJob,
  appointProvider,
  createHostJob,
  listJobs,
  recommendForJob,
  setJobStatus,
} from "@/lib/services.functions";

export const Route = createFileRoute("/_authenticated/app/services")({
  head: () => ({
    meta: [
      { title: "Services · Latchkey host dashboard" },
      { name: "description", content: "Approve guest requests and book trusted Contra freelancers." },
    ],
  }),
  component: ServicesPage,
});

type Job = {
  id: string;
  category: string;
  title: string;
  note: string | null;
  status: string;
  urgency: string;
  source: string;
  scheduled_at: string | null;
  eta_at: string | null;
  guest_price_pence: number | null;
  quoted_pence: number | null;
  provider: { name: string; rating: number; contraUrl: string } | null;
  provider_mode: string | null;
  provider_ref: string | null;
  created_at: string;
  rooms: { display_name: string } | null;
  bookings: { guest_full_name: string | null } | null;
};

function when(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function ServicesPage() {
  const ws = useWorkspace();
  const properties = (ws.data?.properties ?? []) as Array<{ id: string; name: string }>;
  const { selectedId, select } = useSelectedProperty(properties);
  const jobsFn = useServerFn(listJobs);
  const jobs = useQuery({
    queryKey: ["jobs", selectedId],
    enabled: Boolean(selectedId),
    queryFn: () => jobsFn({ data: { propertyId: selectedId! } }),
    refetchInterval: 30_000,
  });
  const [recFor, setRecFor] = useState<Job | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  if (ws.isLoading) return <Skeleton className="mx-auto h-64 max-w-5xl rounded-2xl" />;
  if (!selectedId) return <EmptyState icon={Wrench} title={copy.title} body="Add a property first." />;

  const all = (jobs.data?.jobs ?? []) as unknown as Job[];
  const inbox = all.filter((j) => j.source === "guest");
  const planned = all.filter((j) => j.source !== "guest");
  const selectedProperty = properties.find((p) => p.id === selectedId) as
    | { postcode?: string | null; address?: string | null; country_code?: string | null }
    | undefined;


  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <PropertyPicker properties={properties} value={selectedId} onChange={select} />
            <Button onClick={() => setNewOpen(true)}>
              <CalendarPlus className="size-4" /> {copy.bookMaintenance}
            </Button>
          </div>
        }
      />

      <ExtrasInbox propertyId={selectedId} />

      <Tabs defaultValue="inbox">
        <TabsList className="h-12 rounded-2xl p-1">
          <TabsTrigger value="inbox" className="h-10 rounded-xl px-4">
            {copy.tabInbox} {inbox.filter((j) => j.status === "new").length ? <Badge className="ml-2">{inbox.filter((j) => j.status === "new").length}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="planned" className="h-10 rounded-xl px-4">{copy.tabScheduled}</TabsTrigger>
          <TabsTrigger value="trades" className="h-10 rounded-xl px-4">{tradesDir.tabLabel}</TabsTrigger>
          <TabsTrigger value="providers" className="h-10 rounded-xl px-4">{copy.tabProviders}</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4 space-y-3">
          {jobs.isLoading ? <Skeleton className="h-32 rounded-2xl" /> : inbox.length === 0 ? (
            <div className="card-soft p-8 text-center text-muted-foreground">{copy.emptyInbox}</div>
          ) : inbox.map((j) => <JobCard key={j.id} job={j} onRecommend={() => setRecFor(j)} />)}
        </TabsContent>

        <TabsContent value="planned" className="mt-4 space-y-3">
          {planned.length === 0 ? (
            <div className="card-soft p-8 text-center text-muted-foreground">{copy.emptyScheduled}</div>
          ) : planned.map((j) => <JobCard key={j.id} job={j} onRecommend={() => setRecFor(j)} />)}
        </TabsContent>

        <TabsContent value="trades" className="mt-4 space-y-6">
          <TradeContacts
            hostId={ws.data!.hostId}
            propertyId={selectedId}
            postcode={selectedProperty?.postcode ?? ""}
            countryCode={selectedProperty?.country_code ?? "GB"}
          />
          <TradeDirectory
            postcode={selectedProperty?.postcode ?? ""}
            address={selectedProperty?.address ?? null}
            countryCode={selectedProperty?.country_code ?? "GB"}
          />
        </TabsContent>


        <TabsContent value="providers" className="mt-4">
          <ContraStudio />
        </TabsContent>
      </Tabs>

      {recFor ? (
        <RecommendDialog
          job={recFor}
          hostId={ws.data!.hostId}
          propertyId={selectedId}
          countryCode={selectedProperty?.country_code ?? "GB"}
          onClose={() => setRecFor(null)}
        />
      ) : null}
      <NewJobDialog open={newOpen} onOpenChange={setNewOpen} hostId={ws.data!.hostId} propertyId={selectedId} />
    </div>
  );
}

function JobCard({ job, onRecommend }: { job: Job; onRecommend: () => void }) {
  const qc = useQueryClient();
  const ack = useServerFn(acknowledgeJob);
  const setStatus = useServerFn(setJobStatus);
  const [busy, setBusy] = useState<string | null>(null);

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

  const open = !["done", "declined", "cancelled"].includes(job.status);
  return (
    <article className="card-soft p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg">{job.title}</h3>
            <Badge variant={job.status === "new" ? "default" : "secondary"}>{copy.statuses[job.status] ?? job.status}</Badge>
            {job.urgency === "urgent" ? <Badge variant="destructive">Urgent</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[job.rooms?.display_name, job.bookings?.guest_full_name, when(job.created_at)].filter(Boolean).join(" · ")}
            {job.guest_price_pence ? ` · guest pays ${formatPence(job.guest_price_pence)}` : ""}
          </p>
          {job.note ? <p className="mt-2 text-sm">"{job.note}"</p> : null}
          {job.scheduled_at && !job.eta_at ? <p className="mt-1 text-sm">Wanted {when(job.scheduled_at)}</p> : null}
          {job.provider ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <BadgeCheck className="size-4 text-primary" />
              <span className="font-medium">{job.provider.name}</span>
              {job.eta_at ? <span>· arrives {when(job.eta_at)}</span> : null}
              {job.quoted_pence ? <span>· {formatPence(job.quoted_pence)}</span> : null}
              <Badge variant="outline">{job.provider_mode === "live" ? copy.liveBadge : copy.demoBadge} {job.provider_ref}</Badge>
            </p>
          ) : null}
        </div>
      </div>
      {open ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {job.status === "new" ? (
            <Button variant="outline" disabled={busy !== null} onClick={() => run("ack", () => ack({ data: { jobId: job.id } }))}>
              {busy === "ack" ? <Loader2 className="size-4 animate-spin" /> : null}
              {copy.acknowledge}
            </Button>
          ) : null}
          {!job.provider ? <Button onClick={onRecommend}>{copy.recommend}</Button> : null}
          {job.status === "booked" ? (
            <Button variant="outline" disabled={busy !== null} onClick={() => run("prog", () => setStatus({ data: { jobId: job.id, status: "in_progress", note: null } }))}>
              {copy.inProgress}
            </Button>
          ) : null}
          <Button variant="outline" disabled={busy !== null} onClick={() => run("done", () => setStatus({ data: { jobId: job.id, status: "done", note: null } }))}>
            {busy === "done" ? <Loader2 className="size-4 animate-spin" /> : null}
            {copy.markDone}
          </Button>
          {!job.provider ? (
            <Button variant="ghost" disabled={busy !== null} onClick={() => run("dec", () => setStatus({ data: { jobId: job.id, status: "declined", note: null } }))}>
              {copy.decline}
            </Button>
          ) : null}
        </div>
      ) : null}
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
          <div className="space-y-2"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /></div>
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
                        {t.is_preferred ? <Badge variant="secondary">{tradesCopy.preferred}</Badge> : null}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {[tradeCategoryLabel(t.category), t.area, t.phone].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {links.tel ? (
                        <Button asChild variant="ghost" size="icon" aria-label={tradesCopy.call}>
                          <a href={links.tel}><Phone className="size-4" /></a>
                        </Button>
                      ) : null}
                      {links.whatsapp ? (
                        <Button asChild variant="ghost" size="icon" aria-label={tradesCopy.whatsapp}>
                          <a href={links.whatsapp} target="_blank" rel="noreferrer"><MessageCircle className="size-4" /></a>
                        </Button>
                      ) : null}
                      {links.email ? (
                        <Button asChild variant="ghost" size="icon" aria-label={tradesCopy.email}>
                          <a href={links.email}><Mail className="size-4" /></a>
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


function NewJobDialog({ open, onOpenChange, hostId, propertyId }: { open: boolean; onOpenChange: (o: boolean) => void; hostId: string; propertyId: string }) {
  const qc = useQueryClient();
  const create = useServerFn(createHostJob);
  const [category, setCategory] = useState("boiler_service");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await create({
        data: {
          hostId,
          propertyId,
          roomId: null,
          category,
          title: title.trim() || categoryById(category)!.label,
          note: note.trim() || null,
          scheduledAt: date ? new Date(date).toISOString() : null,
          urgency: "low",
        },
      });
      await qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Added. Tap Find a provider to book it.");
      onOpenChange(false);
      setTitle(""); setNote(""); setDate("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader><DialogTitle>{copy.bookMaintenance}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Service</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SERVICE_CATEGORIES.filter((c) => c.kind !== "extra").map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="jt">Title (optional)</Label>
            <Input id="jt" className="h-12" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Annual boiler service" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="jd">Preferred date and time</Label>
            <Input id="jd" type="datetime-local" className="h-12" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="jn">Notes, or guest feedback that prompted this</Label>
            <Textarea id="jn" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
