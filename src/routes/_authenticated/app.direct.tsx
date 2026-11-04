import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarHeart,
  CalendarPlus,
  ChevronDown,
  Copy,
  ExternalLink,
  Heart,
  Loader2,
  Mail,
  Repeat,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/host/EmptyState";
import { PageHeader } from "@/components/host/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { common, directCopy as copy, vouchersAdminCopy } from "@/content/copy";
import { useRole, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { rebrand } from "@/lib/brand";
import { formatUkDate } from "@/lib/dates";
import { ENQUIRY_STATUSES, nightsBetween, replyMailto, type EnquiryStatus } from "@/lib/direct";
import {
  convertEnquiry,
  listDirect,
  removeDirectRecord,
  setEnquiryStatus,
} from "@/lib/direct.functions";
import {
  getDirectBookingSettings,
  hostCancelReservation,
  markRefundDone,
  setReservationStatus,
} from "@/lib/direct-booking.functions";
import { cancelPolicy, cleanRefund, groupReservations, refundMethod } from "@/lib/direct-cancel";
import { ErrorReport } from "@/components/host/ErrorReport";
import { readAppError } from "@/lib/app-error";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money } from "@/lib/direct-rates";
import { ArrangedSections } from "@/components/host/ArrangedSections";
import { InfoTip } from "@/components/host/InfoTip";
import { PropertyPicker } from "@/components/host/PropertyPicker";
import { DirectRates } from "@/components/host/DirectRates";
import { DirectBookingSettings } from "@/components/host/DirectBookingSettings";
import { LoyaltyVouchers } from "@/components/host/LoyaltyVouchers";
import { RoomGallery } from "@/components/host/RoomGallery";

const TABS = ["bookings", "enquiries", "guests", "vouchers", "setup"] as const;
const SETUP = ["rates", "photos", "booking"] as const;

export const Route = createFileRoute("/_authenticated/app/direct")({
  // ?tab= opens a part of the page; ?focus= opens a section of its set-up.
  validateSearch: (
    s: Record<string, unknown>,
  ): { tab?: (typeof TABS)[number]; focus?: (typeof SETUP)[number] } => ({
    ...(TABS.includes(s["tab"] as never) ? { tab: s["tab"] as (typeof TABS)[number] } : {}),
    ...(SETUP.includes(s["focus"] as never) ? { focus: s["focus"] as (typeof SETUP)[number] } : {}),
  }),
  head: () => ({ meta: [{ title: rebrand("Direct stays · Latchkey host dashboard") }] }),
  component: DirectPage,
});

type Data = Awaited<ReturnType<typeof listDirect>>;

function DirectPage() {
  const ws = useWorkspace();
  const { canWrite, loading } = useRole();
  const hostId = ws.data?.hostId ?? null;
  const fn = useServerFn(listDirect);
  const search = Route.useSearch();
  const navigate = useNavigate();
  const properties = (ws.data?.properties ?? []) as Array<{ id: string; name: string }>;
  const { selectedId, select } = useSelectedProperty(properties);
  const q = useQuery({
    queryKey: ["direct", hostId],
    enabled: !!hostId && canWrite,
    queryFn: () => fn({ data: { hostId: hostId! } }),
  });
  const settingsFn = useServerFn(getDirectBookingSettings);
  const setup = useQuery({
    queryKey: ["direct-booking", selectedId],
    enabled: !!selectedId && canWrite,
    queryFn: () => settingsFn({ data: { propertyId: selectedId! } }),
  });
  const openTab = (tab: (typeof TABS)[number]) =>
    void navigate({ to: "/app/direct", search: { tab }, replace: true });

  if (ws.isLoading || loading) return <Skeleton className="mx-auto h-64 max-w-5xl rounded-2xl" />;
  if (!canWrite)
    return <EmptyState icon={CalendarHeart} title={copy.title} body={copy.staffOnly} />;

  const d = q.data;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Everything on the page is for the property chosen above.
  const mine = <T extends { property_id: string | null }>(list: T[]) =>
    selectedId ? list.filter((x) => !x.property_id || x.property_id === selectedId) : list;
  const reservations = d ? mine(d.reservations) : [];
  const enquiries = d ? mine(d.enquiries) : [];
  const contacts = d ? mine(d.contacts) : [];
  const today = new Date().toISOString().slice(0, 10);
  const grouped = groupReservations(reservations, today);
  const openEnquiries = enquiries.filter((e) => e.status === "new" || e.status === "offered");
  const doneEnquiries = enquiries.filter((e) => e.status !== "new" && e.status !== "offered");
  const fresh = enquiries.filter((e) => e.status === "new").length;
  const tab = search.tab ?? (reservations.length || !enquiries.length ? "bookings" : "enquiries");
  const page = d?.properties.find((p) => p.id === selectedId && p.short_code);
  const url = page ? `${origin}/book/${page.short_code}` : null;
  const row = (r: (typeof reservations)[number]) => (
    <ReservationRow key={r.id} r={r} hostId={hostId!} />
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          properties.length > 1 ? (
            <PropertyPicker properties={properties} value={selectedId} onChange={select} />
          ) : undefined
        }
      />
      {q.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : q.error ? (
        <p className="card-soft p-6 text-muted-foreground">
          {q.error instanceof Error ? q.error.message : common.errorBody}
        </p>
      ) : d && !d.available ? (
        <p className="rounded-xl bg-muted p-4 text-sm">{copy.notReady}</p>
      ) : d ? (
        <>
          {/* The link to share: on the website, in the guide, in a thank-you email. */}
          {url ? (
            <section
              className="card-soft flex flex-wrap items-center gap-2 p-3"
              data-tour="direct-page-link"
            >
              <span className="min-w-0 flex-1 basis-56">
                <span className="flex items-center gap-1 text-sm font-medium">
                  {copy.linkTitle} <InfoTip label={copy.linkTitle}>{copy.linkBody}</InfoTip>
                </span>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {url}
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void navigator.clipboard.writeText(url).then(
                    () => toast.success(copy.copied),
                    () => toast.error(common.errorBody),
                  )
                }
              >
                <Copy className="size-4" /> {copy.copy}
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" /> {copy.open}
                </a>
              </Button>
            </section>
          ) : null}

          {/* Guests can only ask until the host turns booking on: say so where it matters. */}
          {setup.data && !setup.data.settings.instant && tab !== "setup" ? (
            <p className="flex flex-wrap items-center gap-2 rounded-xl bg-muted p-3 text-sm">
              <span className="min-w-0 flex-1 basis-56">{copy.enquiriesOnly}</span>
              <Button size="sm" variant="outline" onClick={() => openTab("setup")}>
                {copy.setUpBooking}
              </Button>
            </p>
          ) : null}

          <Tabs value={tab} onValueChange={(v) => openTab(v as (typeof TABS)[number])}>
            <TabsList data-tour="direct-tabs">
              <TabsTrigger value="bookings">
                {copy.bookingsTab(grouped.attention.length)}
              </TabsTrigger>
              <TabsTrigger value="enquiries">{copy.enquiriesTab(fresh)}</TabsTrigger>
              <TabsTrigger value="guests">{copy.guestsTab(contacts.length)}</TabsTrigger>
              <TabsTrigger value="vouchers">{vouchersAdminCopy.tab}</TabsTrigger>
              <TabsTrigger value="setup" data-tour="direct-setup-tab">
                {copy.setupTab}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="bookings" className="mt-4 space-y-3">
              {reservations.length === 0 ? (
                <EmptyState
                  icon={CalendarHeart}
                  title={copy.noBookings}
                  body={copy.noBookingsBody}
                />
              ) : (
                <>
                  {grouped.attention.length ? (
                    <h2 className="text-sm font-semibold">{copy.needsYou}</h2>
                  ) : null}
                  {grouped.attention.map(row)}
                  {grouped.attention.length && grouped.upcoming.length ? (
                    <h2 className="pt-2 text-sm font-semibold">{copy.comingUp}</h2>
                  ) : null}
                  {grouped.upcoming.map(row)}
                  {grouped.finished.length ? (
                    <details className="group pt-2">
                      <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                        {copy.finished(grouped.finished.length)}
                      </summary>
                      <div className="mt-3 space-y-3">{grouped.finished.map(row)}</div>
                    </details>
                  ) : null}
                </>
              )}
            </TabsContent>
            <TabsContent value="enquiries" className="mt-4 space-y-3">
              {enquiries.length === 0 ? (
                <EmptyState
                  icon={CalendarHeart}
                  title={copy.noEnquiries}
                  body={copy.noEnquiriesBody}
                />
              ) : (
                <>
                  {openEnquiries.map((e) => (
                    <EnquiryCard key={e.id} e={e} data={d} hostId={hostId!} origin={origin} />
                  ))}
                  {doneEnquiries.length ? (
                    <details className="group pt-2">
                      <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                        {copy.finished(doneEnquiries.length)}
                      </summary>
                      <div className="mt-3 space-y-3">
                        {doneEnquiries.map((e) => (
                          <EnquiryCard key={e.id} e={e} data={d} hostId={hostId!} origin={origin} />
                        ))}
                      </div>
                    </details>
                  ) : null}
                </>
              )}
            </TabsContent>
            <TabsContent value="guests" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">{copy.guestsBody}</p>
              {contacts.length === 0 ? (
                <EmptyState icon={Heart} title={copy.noGuests} body={copy.noGuestsBody} />
              ) : (
                contacts.map((c) => (
                  <ContactRow key={c.id} c={c} data={d} hostId={hostId!} origin={origin} />
                ))
              )}
            </TabsContent>
            <TabsContent value="vouchers" className="mt-4">
              {selectedId ? <LoyaltyVouchers propertyId={selectedId} /> : null}
            </TabsContent>
            {/* What the booking page offers, for this property: set once, then left alone. */}
            <TabsContent value="setup" className="mt-4">
              {selectedId ? (
                <ArrangedSections
                  storageKey="latchkey.directLayout"
                  focus={search.focus}
                  items={[
                    {
                      id: "booking",
                      title: copy.setupBooking,
                      hint: copy.setupBookingHint,
                      node: <DirectBookingSettings propertyId={selectedId} />,
                    },
                    {
                      id: "rates",
                      title: copy.setupRates,
                      hint: copy.setupRatesHint,
                      node: <DirectRates propertyId={selectedId} />,
                    },
                    {
                      id: "photos",
                      title: copy.setupPhotos,
                      hint: copy.setupPhotosHint,
                      node: <RoomGallery propertyId={selectedId} />,
                    },
                  ]}
                />
              ) : null}
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}

function EnquiryCard({
  e,
  data,
  hostId,
  origin,
}: {
  e: Data["enquiries"][number];
  data: Data;
  hostId: string;
  origin: string;
}) {
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
            {copy.dates(
              formatUkDate(e.check_in),
              formatUkDate(e.check_out),
              nightsBetween(e.check_in, e.check_out),
              e.guests,
            )}
            {property ? ` · ${property.name}` : ""}
            {e.quoted_pence != null && e.currency
              ? ` · ${copy.quoted(money(e.quoted_pence, e.currency))}`
              : ""}
          </p>
        </div>
        {e.is_returning ? (
          <Badge className="gap-1">
            <Repeat className="size-3" /> {copy.returning}
          </Badge>
        ) : null}
        <Badge variant="outline">{copy.status[e.status]}</Badge>
      </header>
      {e.message ? (
        <p className="whitespace-pre-line rounded-2xl bg-muted p-3 text-sm">{e.message}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {e.email}
        {e.phone ? ` · ${e.phone}` : ""} ·{" "}
        {copy.received(
          new Intl.DateTimeFormat("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(e.created_at)),
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <a
            href={replyMailto({
              email: e.email,
              business: data.business || property?.name || "",
              checkIn: e.check_in,
              checkOut: e.check_out,
              name: e.name,
              withdrawUrl: contact
                ? `${origin}/stay-again/withdraw/${contact.withdraw_token}`
                : null,
            })}
            onClick={() =>
              e.status === "new" &&
              void run(() => setStatus({ data: { id: e.id, status: "offered" } }))
            }
          >
            <Mail className="size-4" /> {copy.reply}
          </a>
        </Button>
        {e.booking_id ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/app/bookings" search={{ guest: e.booking_id } as never}>
              {copy.openStay}
            </Link>
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
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CalendarPlus className="size-4" />
            )}{" "}
            {copy.convert}
          </Button>
        )}
        <Select
          value={e.status}
          onValueChange={(v) =>
            void run(() => setStatus({ data: { id: e.id, status: v as EnquiryStatus } }))
          }
        >
          <SelectTrigger className="h-9 w-36" aria-label={copy.statusLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENQUIRY_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {copy.status[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="ghost"
          aria-label={copy.remove}
          disabled={busy}
          onClick={() =>
            window.confirm(copy.removeConfirm) &&
            void run(() => remove({ data: { kind: "enquiry", id: e.id } }))
          }
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </article>
  );
}

function ContactRow({
  c,
  data,
  hostId,
  origin,
}: {
  c: Data["contacts"][number];
  data: Data;
  hostId: string;
  origin: string;
}) {
  const remove = useServerFn(removeDirectRecord);
  const qc = useQueryClient();
  const property = data.properties.find((p) => p.id === c.property_id);
  return (
    <article className="card-soft flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-medium">{c.name || c.email}</p>
        <p className="truncate text-xs text-muted-foreground">
          {c.email}
          {property ? ` · ${property.name}` : ""} ·{" "}
          {copy.agreedOn(
            formatUkDate(c.consent_at.slice(0, 10)),
            c.source === "enquiry" ? copy.fromEnquiry : copy.fromStay,
          )}
        </p>
        <details className="mt-1 text-xs text-muted-foreground">
          <summary className="cursor-pointer">{copy.theirWords}</summary>
          <p className="mt-1 italic">“{c.consent_text}”</p>
        </details>
      </div>
      <Button asChild size="sm" variant="outline">
        <a
          href={replyMailto({
            email: c.email,
            business: data.business || property?.name || "",
            name: c.name,
            withdrawUrl: `${origin}/stay-again/withdraw/${c.withdraw_token}`,
          })}
        >
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

/** A booking made on the Stay with us page: what, when, how it's paid, and the host's next step. */
function ReservationRow({ r, hostId }: { r: Data["reservations"][number]; hostId: string }) {
  const fn = useServerFn(setReservationStatus);
  const doneFn = useServerFn(markRefundDone);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["direct", hostId] }),
      qc.invalidateQueries({ queryKey: ["board"] }),
    ]);
  async function act(f: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await f();
      await refresh();
      toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }
  const tone =
    r.status === "paid" || r.status === "confirmed"
      ? "default"
      : r.status === "pending"
        ? "secondary"
        : "outline";
  return (
    <article className="card-soft flex flex-wrap items-start gap-3 p-4">
      <div className="min-w-0 flex-1 basis-64 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-display text-lg leading-tight">{r.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{r.reference}</span>
          <Badge variant={tone}>
            {
              copy.resStatus[
                r.status === "pending" && r.method === "bank" ? "awaitingTransfer" : r.status
              ]
            }
          </Badge>
        </p>
        <p className="text-sm text-muted-foreground">
          {r.room_list && r.room_list.length > 1
            ? `${r.room_list.map((x) => x.name).join(", ")} · `
            : r.rooms?.display_name
              ? `${r.rooms.display_name} · `
              : ""}
          {copy.dates(
            formatUkDate(r.check_in),
            formatUkDate(r.check_out),
            nightsBetween(r.check_in, r.check_out),
            r.guests,
          )}
        </p>
        <p className="text-sm">
          <span className="font-semibold">{money(r.total_pence, r.currency)}</span> ·{" "}
          {copy.resMethod[r.method]} ·{" "}
          {r.plan === "flex"
            ? copy.resFlex(r.free_cancel_until ? formatUkDate(r.free_cancel_until) : null)
            : copy.resNonRef}
          {r.status === "cancelled" && r.refund_pence
            ? ` · ${
                r.refund_status === "to_do"
                  ? copy.refundToDo(money(r.refund_pence, r.currency))
                  : copy.refundDone(money(r.refund_pence, r.currency))
              }`
            : ""}
          {r.status === "pending" && r.pay_by
            ? ` · ${copy.payBy(new Date(r.pay_by).toLocaleDateString("en-GB", { day: "numeric", month: "short" }))}`
            : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {r.booking_id ? (
          <Button size="sm" variant="outline" asChild>
            <Link to="/app/bookings" search={{ guest: r.booking_id }}>
              {copy.openBooking}
            </Link>
          </Button>
        ) : null}
        {r.status === "pending" && r.method === "bank" ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void act(() => fn({ data: { id: r.id, status: "paid" } }), copy.markedPaid)
            }
          >
            {copy.markPaid}
          </Button>
        ) : null}
        {r.status !== "cancelled" && r.status !== "expired" ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={busy}
            onClick={() => setCancelling(true)}
          >
            {copy.cancel}
          </Button>
        ) : null}
        {r.status === "cancelled" && r.refund_status === "to_do" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void act(() => doneFn({ data: { id: r.id } }), copy.refundMarked)}
          >
            {copy.refundMarkDone}
          </Button>
        ) : null}
        {cancelling ? (
          <CancelDialog r={r} onClose={() => setCancelling(false)} onDone={() => void refresh()} />
        ) : null}
      </div>
    </article>
  );
}

/** Cancels by the rate the guest agreed to, with the refund to change if the host wants to be kinder (or firmer). */
function CancelDialog({
  r,
  onClose,
  onDone,
}: {
  r: Data["reservations"][number];
  onClose: () => void;
  onDone: () => void;
}) {
  const fn = useServerFn(hostCancelReservation);
  const today = new Date().toISOString().slice(0, 10);
  const policy = cancelPolicy(r, today);
  const [amount, setAmount] = useState((policy.refundPence / 100).toFixed(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof readAppError> | null>(null);
  const pence = cleanRefund(Math.round(Number(amount) * 100), r);
  const how = refundMethod(r.method, pence);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await fn({ data: { id: r.id, refundPence: pence } });
      toast.success(copy.cancelled);
      onDone();
      onClose();
    } catch (e) {
      setError(readAppError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] grid-cols-[minmax(0,1fr)] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{copy.cancelTitle(r.name)}</DialogTitle>
          <DialogDescription>
            {policy.free
              ? copy.cancelPolicyFree
              : r.plan === "flex"
                ? copy.cancelPolicyLate
                : copy.cancelPolicyNonRef}{" "}
            {copy.cancelRoomFree}
          </DialogDescription>
        </DialogHeader>
        {policy.paid ? (
          <div className="space-y-2">
            <Label htmlFor="refund-amount">
              {copy.refundLabel(money(r.total_pence, r.currency))}
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="refund-amount"
                type="number"
                min={0}
                step="0.01"
                className="w-32"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAmount((r.total_pence / 100).toFixed(2))}
              >
                {copy.refundAll}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAmount("0.00")}>
                {copy.refundNone}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {how === "card"
                ? copy.refundByCard
                : how === "by_host"
                  ? copy.refundByYou
                  : copy.refundNothing}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.notPaidYet}</p>
        )}
        {error ? <ErrorReport error={error} /> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {copy.cancelKeep}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void go()}>
            {busy ? <Loader2 className="animate-spin" /> : null}{" "}
            {pence > 0 ? copy.cancelAndRefund(money(pence, r.currency)) : copy.cancelNoRefundBtn}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
