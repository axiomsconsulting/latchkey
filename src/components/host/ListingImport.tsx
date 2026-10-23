import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, CircleDashed, DownloadCloud, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { ChannelIcon } from "@/components/ChannelIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { common, listingImportCopy as copy } from "@/content/copy";
import {
  LISTING_PLATFORMS,
  PLATFORM_PROFILES,
  countryCode,
  detectPlatform,
  gathered,
  looksLikeListing,
  parseLinks,
  planImport,
  type ImportPlan,
  type Listing,
  type ListingPlatform,
} from "@/lib/listing-import";
import { applyListingImport, listingImportStatus, scrapeListing } from "@/lib/listing-import.functions";
import { COUNTRY_CHOICES } from "@/lib/regions";
import { cn } from "@/lib/utils";

type Property = {
  id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  country_code: string | null;
  default_check_in_time: string;
  default_check_out_time: string;
  parking_notes: string | null;
};

type Job = {
  url: string;
  platform: ListingPlatform;
  state: "queued" | "reading" | "done" | "failed";
  startedAt?: number;
  listing?: Listing;
  error?: string | undefined;
  /** How many of the found items are shown so far (they tick in once the page is read). */
  shown: number;
};

/** The Properties page's "Import from your listings" button: shown only when Latchkey admin has switched it on. */
export function ListingImportButton({ property, rooms }: { property: Property; rooms: Array<{ id: string; display_name: string }> }) {
  const statusFn = useServerFn(listingImportStatus);
  const q = useQuery({ queryKey: ["listing-import-status"], queryFn: () => statusFn(), staleTime: 5 * 60_000 });
  const [open, setOpen] = useState(false);
  if (!q.data?.enabled) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} title={copy.openHint}>
        <DownloadCloud className="size-4" /> {copy.open}
      </Button>
      {open ? <ListingImport property={property} rooms={rooms} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * Listing import, in three steps: paste links (each recognised, with what that
 * site shows publicly), read them one by one with a progress bar for the whole
 * list and for each page (what was found ticks in as each page comes back),
 * then review everything as one plan and add what the host keeps.
 */
function ListingImport({ property, rooms, onClose }: { property: Property; rooms: Array<{ id: string; display_name: string }>; onClose: () => void }) {
  const [step, setStep] = useState<"links" | "reading" | "review" | "done">("links");
  const [text, setText] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [withPrices, setWithPrices] = useState(false);
  const [dates, setDates] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    const a = d.toISOString().slice(0, 10);
    d.setDate(d.getDate() + 2);
    return { checkIn: a, checkOut: d.toISOString().slice(0, 10) };
  });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [result, setResult] = useState<{ roomsAdded: number; roomsUpdated: number; photos: number; photosSkipped: number } | null>(null);
  const scrape = useServerFn(scrapeListing);

  function addLinks() {
    const found = parseLinks(text);
    setLinks((l) => [...new Set([...l, ...found])].slice(0, 20));
    setText("");
  }
  const readable = links.filter((l) => detectPlatform(l));

  async function readOne(i: number, list: Job[]) {
    const job = list[i]!;
    setJobs((js) => js.map((j, k) => (k === i ? { ...j, state: "reading", startedAt: Date.now(), error: undefined } : j)));
    try {
      const r = await scrape({ data: { propertyId: property.id, url: job.url, dates: withPrices ? dates : null } });
      setJobs((js) => js.map((j, k) => (k === i ? { ...j, state: "done", listing: r.listing, shown: 0 } : j)));
    } catch (e) {
      setJobs((js) => js.map((j, k) => (k === i ? { ...j, state: "failed", error: e instanceof Error ? e.message : common.errorBody } : j)));
    }
  }

  async function readAll() {
    const list: Job[] = readable.map((url) => ({ url, platform: detectPlatform(url)!, state: "queued", shown: 0 }));
    setJobs(list);
    setStep("reading");
    // One page at a time: the host sees each one being read, and Firecrawl isn't flooded.
    for (let i = 0; i < list.length; i++) await readOne(i, list);
  }

  // What was found ticks in, one item at a time, once a page is back.
  useEffect(() => {
    const pending = jobs.findIndex((j) => j.state === "done" && j.listing && j.shown < gathered(j.listing).length);
    if (pending < 0) return;
    const t = window.setTimeout(() => setJobs((js) => js.map((j, k) => (k === pending ? { ...j, shown: j.shown + 1 } : j))), 140);
    return () => window.clearTimeout(t);
  }, [jobs]);

  const finished = jobs.filter((j) => j.state === "done" || j.state === "failed").length;
  const listings = jobs.filter((j) => j.state === "done" && j.listing).map((j) => j.listing!);
  const plan = useMemo(() => (step === "review" ? planImport(listings, rooms) : null), [step]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 font-display text-xl">
            {copy.title} <Badge variant="secondary">{copy.experimental}</Badge>
          </DialogTitle>
          <DialogDescription>{copy.intro}</DialogDescription>
        </DialogHeader>

        {step === "links" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {copy.sites}:
              {LISTING_PLATFORMS.map((p) => (
                <span key={p} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
                  <ChannelIcon channel={p} label={PLATFORM_PROFILES[p].label} size="0.9em" /> {PLATFORM_PROFILES[p].label}
                </span>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="li-links">{copy.linksLabel}</Label>
              <Textarea id="li-links" rows={3} placeholder={copy.linksPlaceholder} value={text} onChange={(e) => setText(e.target.value)} />
              <Button variant="outline" onClick={addLinks} disabled={!parseLinks(text).length}>
                {copy.add}
              </Button>
            </div>

            {links.length ? (
              <ul className="space-y-2">
                {links.map((url) => {
                  const p = detectPlatform(url);
                  const prof = p ? PLATFORM_PROFILES[p] : null;
                  return (
                    <li key={url} className="rounded-xl border border-border p-3 text-sm">
                      <div className="flex items-start gap-2">
                        {p ? <ChannelIcon channel={p} label={prof!.label} size="1.25em" /> : <AlertTriangle className="size-5 text-destructive" />}
                        <span className="min-w-0 flex-1">
                          <span className="block break-all font-medium">{url}</span>
                          {!prof ? <span className="block text-destructive">{copy.unknown}</span> : !looksLikeListing(url) ? <span className="block text-destructive">{copy.notListing}</span> : null}
                        </span>
                        <button type="button" onClick={() => setLinks((l) => l.filter((x) => x !== url))} aria-label={copy.remove} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary">
                          <X className="size-4" />
                        </button>
                      </div>
                      {prof ? (
                        <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                          <p className="sm:col-span-2">{prof.tip}</p>
                          <p><span className="font-medium text-foreground">{copy.shows}:</span> {prof.shows.join(", ")}.</p>
                          <p><span className="font-medium text-foreground">{copy.hidden}:</span> {prof.hidden.join(", ")}.</p>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <div className="space-y-2 rounded-xl bg-muted/50 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="size-4" checked={withPrices} onChange={(e) => setWithPrices(e.target.checked)} /> {copy.prices}
              </label>
              <p className="text-xs text-muted-foreground">{copy.pricesHelp}</p>
              {withPrices ? (
                <div className="flex flex-wrap gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="li-in" className="text-xs">{copy.checkIn}</Label>
                    <Input id="li-in" type="date" className="h-10" value={dates.checkIn} onChange={(e) => setDates((d) => ({ ...d, checkIn: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="li-out" className="text-xs">{copy.checkOut}</Label>
                    <Input id="li-out" type="date" className="h-10" value={dates.checkOut} min={dates.checkIn} onChange={(e) => setDates((d) => ({ ...d, checkOut: e.target.value }))} />
                  </div>
                </div>
              ) : null}
            </div>

            <Button onClick={() => void readAll()} disabled={!readable.length}>
              <Sparkles className="size-4" /> {copy.read(readable.length)}
            </Button>
          </div>
        ) : null}

        {step === "reading" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{copy.overall(finished, jobs.length)}</p>
              <Progress value={jobs.length ? (finished / jobs.length) * 100 : 0} aria-label={copy.overall(finished, jobs.length)} />
            </div>
            <ol className="space-y-3">
              {jobs.map((j, i) => (
                <ReadingRow key={j.url} job={j} onRetry={() => void readOne(i, jobs)} />
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button disabled={finished < jobs.length || !listings.length} onClick={() => setStep("review")}>
                {copy.review}
              </Button>
              <Button variant="ghost" disabled={finished < jobs.length} onClick={() => setStep("links")}>
                {copy.back}
              </Button>
            </div>
          </div>
        ) : null}

        {step === "review" && plan ? (
          <Review
            plan={plan}
            property={property}
            rooms={rooms}
            onBack={() => setStep("reading")}
            onDone={(r) => {
              setResult(r);
              setStep("done");
            }}
          />
        ) : null}

        {step === "done" && result ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-lg"><CheckCircle2 className="size-5 text-success" /> {copy.applied(result)}</p>
            {result.photosSkipped ? <p className="text-sm text-muted-foreground">{copy.photosSkipped(result.photosSkipped)}</p> : null}
            <p className="text-sm text-muted-foreground">{copy.finished}</p>
            <Button onClick={onClose}>{copy.close}</Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** One page: waiting, being read (a bar that fills over the usual time, with the seconds), or what it found. */
function ReadingRow({ job: j, onRetry }: { job: Job; onRetry: () => void }) {
  const label = PLATFORM_PROFILES[j.platform].label;
  const [, tick] = useState(0);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (j.state !== "reading") return;
    timer.current = window.setInterval(() => tick((n) => n + 1), 500);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [j.state]);
  const secs = j.startedAt ? Math.round((Date.now() - j.startedAt) / 1000) : 0;
  const items = j.listing ? gathered(j.listing) : [];
  // Reading: fills towards 90% over about 30 seconds (it can't know sooner), then jumps to done.
  const value = j.state === "done" ? 100 : j.state === "reading" ? Math.min(90, (secs / 30) * 90) : 0;
  return (
    <li className={cn("rounded-xl border p-3", j.state === "failed" ? "border-destructive/40" : "border-border")}>
      <div className="flex items-center gap-2 text-sm">
        <ChannelIcon channel={j.platform} label={label} size="1.1em" />
        <span className="min-w-0 flex-1 truncate font-medium">{j.listing?.propertyName ?? j.url}</span>
        {j.state === "queued" ? (
          <span className="flex items-center gap-1 text-muted-foreground"><CircleDashed className="size-4" /> {copy.queued}</span>
        ) : j.state === "reading" ? (
          <Loader2 className="size-4 animate-spin text-primary" />
        ) : j.state === "done" ? (
          <span className="flex items-center gap-1 text-success"><CheckCircle2 className="size-4" /> {copy.done}</span>
        ) : (
          <Button size="sm" variant="outline" onClick={onRetry}><RotateCcw className="size-4" /> {copy.retry}</Button>
        )}
      </div>
      {j.state !== "queued" ? <Progress className={cn("mt-2 h-1.5", j.state === "failed" && "bg-destructive/20")} value={value} /> : null}
      {j.state === "reading" ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {copy.reading(label)} · {secs}s ({copy.usually})
        </p>
      ) : null}
      {j.state === "failed" ? <p className="mt-1.5 text-sm text-destructive">{copy.failed}: {j.error}</p> : null}
      {j.state === "done" ? (
        items.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={copy.found}>
            {items.slice(0, j.shown).map((g) => (
              <li key={g.key} className="flex max-w-full items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs animate-in fade-in zoom-in-95">
                <CheckCircle2 className="size-3.5 shrink-0 text-success" /> <span className="truncate">{g.label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-sm text-muted-foreground">{copy.nothingFound}</p>
        )
      ) : null}
    </li>
  );
}

type FieldKey = "name" | "address" | "postcode" | "country" | "checkIn" | "checkOut" | "parking";

/** Everything found, as one plan: tick what to keep, change anything, then add it. */
function Review({
  plan,
  property,
  rooms,
  onBack,
  onDone,
}: {
  plan: ImportPlan;
  property: Property;
  rooms: Array<{ id: string; display_name: string }>;
  onBack: () => void;
  onDone: (r: { roomsAdded: number; roomsUpdated: number; photos: number; photosSkipped: number }) => void;
}) {
  const apply = useServerFn(applyListingImport);
  const qc = useQueryClient();
  const country = countryCode(plan.property.country, COUNTRY_CHOICES);
  const current: Record<FieldKey, string> = {
    name: property.name,
    address: property.address ?? "",
    postcode: property.postcode ?? "",
    country: property.country_code ?? "",
    checkIn: property.default_check_in_time.slice(0, 5),
    checkOut: property.default_check_out_time.slice(0, 5),
    parking: property.parking_notes ?? "",
  };
  const found: Record<FieldKey, string | null> = {
    name: plan.property.name,
    address: plan.property.address,
    postcode: plan.property.postcode,
    country,
    checkIn: plan.property.checkInFrom,
    checkOut: plan.property.checkOutBy,
    parking: plan.property.parking,
  };
  const keys = (Object.keys(found) as FieldKey[]).filter((k) => found[k] && found[k] !== current[k]);
  const [fields, setFields] = useState(() => Object.fromEntries(keys.map((k) => [k, { on: k !== "name" || !current.name, value: found[k]! }])) as Record<FieldKey, { on: boolean; value: string }>);
  const [rules, setRules] = useState(plan.property.houseRules.length > 0);
  const [cover, setCover] = useState<string | null>(null);
  const [roomList, setRoomList] = useState(() =>
    plan.rooms.map((r) => ({ ...r, on: true, photoUrl: r.photos[0] ?? null as string | null })),
  );
  const [busy, setBusy] = useState(false);
  const changes = Object.values(fields).filter((f) => f.on).length + (rules ? 1 : 0) + (cover ? 1 : 0) + roomList.filter((r) => r.on).length;

  async function submit() {
    setBusy(true);
    try {
      const f = (k: FieldKey) => (fields[k]?.on && fields[k]!.value.trim() ? fields[k]!.value.trim() : undefined);
      const time = (v: string | undefined) => (v && /^\d{2}:\d{2}$/.test(v) ? v : undefined);
      const r = await apply({
        data: {
          propertyId: property.id,
          property: {
            ...(f("name") ? { name: f("name") } : {}),
            ...(f("address") ? { address: f("address") } : {}),
            ...(f("postcode") ? { postcode: f("postcode") } : {}),
            ...(f("country") && /^[A-Z]{2}$/.test(f("country")!) ? { country_code: f("country") } : {}),
            ...(time(f("checkIn")) ? { default_check_in_time: time(f("checkIn")) } : {}),
            ...(time(f("checkOut")) ? { default_check_out_time: time(f("checkOut")) } : {}),
            ...(f("parking") ? { parking_notes: f("parking") } : {}),
          },
          houseRules: rules ? plan.property.houseRules : [],
          propertyLinks: plan.propertyLinks,
          coverPhotoUrl: cover,
          rooms: roomList
            .filter((x) => x.on && x.name.trim())
            .map((x) => ({ existingId: x.existingId, name: x.name.trim(), description: x.description, maxGuests: Math.min(30, Math.max(1, x.maxGuests)), ensuite: x.ensuite, amenities: x.amenities.slice(0, 30), photoUrl: x.photoUrl, listingUrl: x.url })),
        },
      });
      await Promise.all([qc.invalidateQueries({ queryKey: ["board"] }), qc.invalidateQueries({ queryKey: ["workspace"] }), qc.invalidateQueries({ queryKey: ["guide"] })]);
      toast.success(copy.applied(r));
      onDone(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  const thumb = "aspect-[4/3] w-full rounded-lg object-cover";
  return (
    <div className="space-y-6">
      {keys.length || plan.property.houseRules.length ? (
        <section className="space-y-3">
          <h3 className="text-lg">{copy.propertyTitle}</h3>
          <ul className="space-y-2">
            {keys.map((k) => (
              <li key={k} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" className="size-4" checked={fields[k]!.on} onChange={(e) => setFields((s) => ({ ...s, [k]: { ...s[k]!, on: e.target.checked } }))} />
                  {copy.fields[k]}
                </label>
                <div className="min-w-0 space-y-1">
                  <Input className="h-10" value={fields[k]!.value} disabled={!fields[k]!.on} onChange={(e) => setFields((s) => ({ ...s, [k]: { ...s[k]!, value: e.target.value } }))} />
                  <p className="truncate text-xs text-muted-foreground">{copy.current(current[k] || copy.empty)}</p>
                </div>
              </li>
            ))}
            {plan.property.houseRules.length ? (
              <li className="rounded-xl border border-border p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" className="size-4" checked={rules} onChange={(e) => setRules(e.target.checked)} /> {copy.rules(plan.property.houseRules.length)}
                </label>
                <p className="mt-1 text-xs text-muted-foreground">{copy.rulesHelp}</p>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">{plan.property.houseRules.slice(0, 6).map((r) => <li key={r}>{r}</li>)}</ul>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {plan.photos.length ? (
        <section className="space-y-2">
          <h3 className="text-lg">{copy.coverTitle}</h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <button type="button" onClick={() => setCover(null)} className={cn("grid aspect-[4/3] place-items-center rounded-lg border text-xs", cover === null ? "border-primary ring-2 ring-primary" : "border-border")}>
              {copy.noCover}
            </button>
            {plan.photos.slice(0, 11).map((p) => (
              <button key={p} type="button" onClick={() => setCover(p)} aria-pressed={cover === p} className={cn("overflow-hidden rounded-lg border", cover === p ? "border-primary ring-2 ring-primary" : "border-transparent")}>
                <img src={p} alt="" loading="lazy" referrerPolicy="no-referrer" className={thumb} />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {roomList.length ? (
        <section className="space-y-3">
          <h3 className="text-lg">{copy.roomsTitle}</h3>
          <ul className="grid gap-3 md:grid-cols-2">
            {roomList.map((r, i) => {
              const set = (patch: Partial<(typeof roomList)[number]>) => setRoomList((l) => l.map((x, k) => (k === i ? { ...x, ...patch } : x)));
              const choices = r.photos.length ? r.photos : plan.photos;
              const price = plan.prices.find((p) => p.platform === r.from);
              return (
                <li key={`${r.name}-${i}`} className={cn("space-y-2 rounded-xl border p-3", r.on ? "border-border" : "border-dashed border-border opacity-60")}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" className="size-4" checked={r.on} onChange={(e) => set({ on: e.target.checked })} aria-label={r.name} />
                    <ChannelIcon channel={r.from} label={PLATFORM_PROFILES[r.from].label} size="1em" />
                    <Badge variant={r.existingId ? "outline" : "secondary"} className="font-normal">
                      {r.existingId ? copy.roomUpdate(rooms.find((x) => x.id === r.existingId)?.display_name ?? r.name) : copy.roomNew}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">{copy.roomName}</Label>
                      <Input className="h-10" value={r.name} disabled={!r.on} onChange={(e) => set({ name: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{copy.sleeps}</Label>
                      <Input className="h-10" type="number" min={1} max={30} value={r.maxGuests} disabled={!r.on} onChange={(e) => set({ maxGuests: Number(e.target.value) || 1 })} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" checked={r.ensuite} disabled={!r.on} onChange={(e) => set({ ensuite: e.target.checked })} /> {copy.ensuite}
                    {r.amenities.length ? <span className="text-muted-foreground">· {copy.amenities(r.amenities.length)}</span> : null}
                  </label>
                  {r.description ? (
                    <div className="space-y-1">
                      <Label className="text-xs">{copy.description}</Label>
                      <Textarea rows={3} value={r.description} disabled={!r.on} onChange={(e) => set({ description: e.target.value })} />
                    </div>
                  ) : null}
                  {choices.length ? (
                    <div className="space-y-1">
                      <Label className="text-xs">{copy.photo}</Label>
                      <div className="grid grid-cols-4 gap-1.5">
                        <button type="button" disabled={!r.on} onClick={() => set({ photoUrl: null })} className={cn("grid aspect-[4/3] place-items-center rounded-md border text-[10px]", r.photoUrl === null ? "border-primary ring-2 ring-primary" : "border-border")}>
                          {copy.noPhoto}
                        </button>
                        {choices.slice(0, 7).map((p) => (
                          <button key={p} type="button" disabled={!r.on} onClick={() => set({ photoUrl: p })} aria-pressed={r.photoUrl === p} className={cn("overflow-hidden rounded-md border", r.photoUrl === p ? "border-primary ring-2 ring-primary" : "border-transparent")}>
                            <img src={p} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-[4/3] w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {r.pricePerNight || price ? (
                    <p className="text-xs text-muted-foreground">
                      {copy.price(r.pricePerNight ? `${price?.currency ?? ""} ${r.pricePerNight}`.trim() : `${price!.currency ?? ""} ${price!.amount}${price!.per ? ` per ${price!.per}` : ""}`.trim(), PLATFORM_PROFILES[r.from].label)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button onClick={() => void submit()} disabled={busy || changes === 0}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null} {busy ? copy.applying : copy.apply(changes)}
        </Button>
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          {copy.back}
        </Button>
      </div>
    </div>
  );
}
