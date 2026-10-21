import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarHeart, CalendarPlus, Copy, ExternalLink, Heart, Loader2, Mail, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/host/EmptyState";
import { PageHeader } from "@/components/host/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { common, directCopy as copy } from "@/content/copy";
import { useRole, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { rebrand } from "@/lib/brand";
import { formatUkDate } from "@/lib/dates";
import { ENQUIRY_STATUSES, nightsBetween, replyMailto, type EnquiryStatus } from "@/lib/direct";
import { convertEnquiry, listDirect, removeDirectRecord, setEnquiryStatus } from "@/lib/direct.functions";

export const Route = createFileRoute("/_authenticated/app/direct")({
  head: () => ({ meta: [{ title: rebrand("Direct stays · Latchkey host dashboard") }] }),
  component: DirectPage,
});

type Data = Awaited<ReturnType<typeof listDirect>>;

function DirectPage() {
  const ws = useWorkspace();
  const { canWrite, loading } = useRole();
  const hostId = ws.data?.hostId ?? null;
  const fn = useServerFn(listDirect);
  const q = useQuery({ queryKey: ["direct", hostId], enabled: !!hostId && canWrite, queryFn: () => fn({ data: { hostId: hostId! } }) });

  if (ws.isLoading || loading) return <Skeleton className="mx-auto h-64 max-w-5xl rounded-2xl" />;
  if (!canWrite) return <EmptyState icon={CalendarHeart} title={copy.title} body={copy.staffOnly} />;

  const d = q.data;
  const fresh = d?.enquiries.filter((e) => e.status === "new").length ?? 0;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      {q.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : q.error ? (
        <p className="card-soft p-6 text-muted-foreground">{q.error instanceof Error ? q.error.message : common.errorBody}</p>
      ) : d && !d.available ? (
        <p className="rounded-xl bg-muted p-4 text-sm">{copy.notReady}</p>
      ) : d ? (
        <>
          {/* The link to share: on the website, in the guide, in a thank-you email. */}
          <section className="card-soft space-y-3 p-5">
            <h2 className="text-lg">{copy.linkTitle}</h2>
            <p className="text-sm text-muted-foreground">{copy.linkBody}</p>
            <ul className="space-y-2">
              {d.properties.filter((p) => p.short_code).map((p) => {
                const url = `${origin}/enquire/${p.short_code}`;
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted p-3">
                    <span className="min-w-0 flex-1 basis-48">
                      <span className="block text-sm font-medium">{p.name}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">{url}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success(copy.copied), () => toast.error(common.errorBody))}
                    >
                      <Copy className="size-4" /> {copy.copy}
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <a href={url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> {copy.open}</a>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>

          <Tabs defaultValue="enquiries">
            <TabsList>
              <TabsTrigger value="enquiries">{copy.enquiriesTab(fresh)}</TabsTrigger>
              <TabsTrigger value="guests">{copy.guestsTab(d.contacts.length)}</TabsTrigger>
            </TabsList>
            <TabsContent value="enquiries" className="mt-4 space-y-3">
              {d.enquiries.length === 0 ? (
                <EmptyState icon={CalendarHeart} title={copy.noEnquiries} body={copy.noEnquiriesBody} />
              ) : (
                d.enquiries.map((e) => <EnquiryCard key={e.id} e={e} data={d} hostId={hostId!} origin={origin} />)
              )}
            </TabsContent>
            <TabsContent value="guests" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">{copy.guestsBody}</p>
              {d.contacts.length === 0 ? (
                <EmptyState icon={Heart} title={copy.noGuests} body={copy.noGuestsBody} />
              ) : (
                d.contacts.map((c) => <ContactRow key={c.id} c={c} data={d} hostId={hostId!} origin={origin} />)
              )}
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}

function EnquiryCard({ e, data, hostId, origin }: { e: Data["enquiries"][number]; data: Data; hostId: string; origin: string }) {
  const setStatus = useServerFn(setEnquiryStatus);
  const convert = useServerFn(convertEnquiry);
  const remove = useServerFn(removeDirectRecord);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { select } = useSelectedProperty(data.properties);
  const [busy, setBusy] = useState(false);
  const property = data.properties.find((p) => p.id === e.property_id);
  const contact = data.contacts.find((c) => c.email === e.email);
  const refresh = () => qc.invalidateQueries({ queryKey: ["direct", hostId] });

  async function run(f: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await f();
      if (ok) toast.success(ok);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card-soft space-y-3 p-5">
      <header className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg leading-tight">{e.name}</h3>
          <p className="text-sm text-muted-foreground">
            {copy.dates(formatUkDate(e.check_in), formatUkDate(e.check_out), nightsBetween(e.check_in, e.check_out), e.guests)}
            {property ? ` · ${property.name}` : ""}
          </p>
        </div>
        {e.is_returning ? <Badge className="gap-1"><Repeat className="size-3" /> {copy.returning}</Badge> : null}
        <Badge variant="outline">{copy.status[e.status]}</Badge>
      </header>
      {e.message ? <p className="whitespace-pre-line rounded-2xl bg-muted p-3 text-sm">{e.message}</p> : null}
      <p className="text-xs text-muted-foreground">
        {e.email}
        {e.phone ? ` · ${e.phone}` : ""} · {copy.received(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(e.created_at)))}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <a
            href={replyMailto({ email: e.email, business: data.business || property?.name || "", checkIn: e.check_in, checkOut: e.check_out, name: e.name, withdrawUrl: contact ? `${origin}/stay-again/withdraw/${contact.withdraw_token}` : null })}
            onClick={() => e.status === "new" && void run(() => setStatus({ data: { id: e.id, status: "offered" } }))}
          >
            <Mail className="size-4" /> {copy.reply}
          </a>
        </Button>
        {e.booking_id ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/app/bookings" search={{ guest: e.booking_id } as never}>{copy.openStay}</Link>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await convert({ data: { id: e.id, roomId: null } });
                select(e.property_id);
                await navigate({ to: "/app/bookings", search: { guest: r.bookingId } as never });
              }, copy.converted)
            }
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />} {copy.convert}
          </Button>
        )}
        <Select value={e.status} onValueChange={(v) => void run(() => setStatus({ data: { id: e.id, status: v as EnquiryStatus } }))}>
          <SelectTrigger className="h-9 w-36" aria-label={copy.statusLabel}><SelectValue /></SelectTrigger>
          <SelectContent>
            {ENQUIRY_STATUSES.map((s) => <SelectItem key={s} value={s}>{copy.status[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" aria-label={copy.remove} disabled={busy} onClick={() => window.confirm(copy.removeConfirm) && void run(() => remove({ data: { kind: "enquiry", id: e.id } }))}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </article>
  );
}

function ContactRow({ c, data, hostId, origin }: { c: Data["contacts"][number]; data: Data; hostId: string; origin: string }) {
  const remove = useServerFn(removeDirectRecord);
  const qc = useQueryClient();
  const property = data.properties.find((p) => p.id === c.property_id);
  return (
    <article className="card-soft flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-medium">{c.name || c.email}</p>
        <p className="truncate text-xs text-muted-foreground">
          {c.email}
          {property ? ` · ${property.name}` : ""} · {copy.agreedOn(formatUkDate(c.consent_at.slice(0, 10)), c.source === "enquiry" ? copy.fromEnquiry : copy.fromStay)}
        </p>
        <details className="mt-1 text-xs text-muted-foreground">
          <summary className="cursor-pointer">{copy.theirWords}</summary>
          <p className="mt-1 italic">“{c.consent_text}”</p>
        </details>
      </div>
      <Button asChild size="sm" variant="outline">
        <a href={replyMailto({ email: c.email, business: data.business || property?.name || "", name: c.name, withdrawUrl: `${origin}/stay-again/withdraw/${c.withdraw_token}` })}>
          <Mail className="size-4" /> {copy.email}
        </a>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label={copy.removeGuest}
        onClick={async () => {
          if (!window.confirm(copy.removeGuestConfirm)) return;
          try {
            await remove({ data: { kind: "contact", id: c.id } });
            await qc.invalidateQueries({ queryKey: ["direct", hostId] });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : common.errorBody);
          }
        }}
      >
        <Trash2 className="size-4" />
      </Button>
    </article>
  );
}
