import { cancelMyReservation } from "@/lib/direct-booking.functions";
import type { CancelPolicy } from "@/lib/direct-cancel";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  ChevronDown,
  Clock,
  Copy,
  FileSignature,
  Landmark,
  Loader2,
  Mail,
  Phone,
  Printer,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { Button } from "@/components/ui/button";
import { AgreementBlocks } from "@/components/partners/AgreementText";
import {
  guest as guestCopy,
  reservationCopy as copy,
  stayTermsCopy as termsCopy,
} from "@/content/copy";
import { parseMarkdown } from "@/lib/partner-agreement";
import { formatUkDate, nightsBetween } from "@/lib/dates";
import { money } from "@/lib/direct-rates";
import { partyText } from "@/lib/direct-booking";
import { confirmReservationPayment, getReservation } from "@/lib/direct-booking.functions";
import { cn } from "@/lib/utils";

/**
 * A direct booking's confirmation (its private link): the booking and its
 * reference, whether it's paid, and how to pay: the host's bank details for a
 * transfer (local or international, by the guest's country), or a note to pay
 * at the property. Back from a card payment, it checks Stripe at once.
 */
export const Route = createFileRoute("/reserve/$token")({
  validateSearch: (s: Record<string, unknown>): { paid?: "1" | "0" } =>
    s["paid"] === "1" || s["paid"] === "0" ? { paid: s["paid"] as "1" | "0" } : {},
  loader: ({ params }) => getReservation({ data: { token: params.token } }),
  head: () => ({ meta: [{ title: copy.pageTitle }, { name: "robots", content: "noindex" }] }),
  errorComponent: () => (
    <GuestFrame>
      <GuestMessage text={guestCopy.error} />
    </GuestFrame>
  ),
  component: ReservationPage,
});

function ReservationPage() {
  const r = Route.useLoaderData();
  const { paid } = Route.useSearch();
  const { token } = Route.useParams();
  const confirm = useServerFn(confirmReservationPayment);
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  // Back from Stripe: confirm now rather than wait for the webhook.
  useEffect(() => {
    if (!r.found || paid !== "1" || r.status !== "pending" || r.method !== "card") return;
    setChecking(true);
    void confirm({ data: { token } })
      .then((x) => (x.paid ? router.invalidate() : undefined))
      .finally(() => setChecking(false));
  }, [r, paid, token, confirm, router]);

  if (!r.found) {
    return (
      <GuestFrame>
        <GuestMessage text={copy.notFound} />
      </GuestFrame>
    );
  }

  const nights = nightsBetween(r.checkIn, r.checkOut);
  const state =
    r.status === "paid"
      ? "paid"
      : r.status === "confirmed"
        ? "confirmed"
        : r.status === "pending"
          ? r.method === "bank"
            ? "awaitingTransfer"
            : "awaitingCard"
          : r.status;
  const tone =
    state === "paid" || state === "confirmed"
      ? "bg-success/10 text-success"
      : state === "expired" || state === "cancelled"
        ? "bg-destructive/10 text-destructive"
        : "bg-accent/15";
  const Icon =
    state === "paid" || state === "confirmed"
      ? Check
      : state === "expired" || state === "cancelled"
        ? XCircle
        : Clock;
  const copyText = (v: string) =>
    void navigator.clipboard.writeText(v).then(
      () => toast.success(copy.copied),
      () => undefined,
    );

  return (
    <GuestFrame theme={r.theme} name={r.propertyName}>
      <main className="mx-auto max-w-2xl space-y-5 py-6 sm:py-8">
        <section className={cn("flex items-start gap-3 rounded-2xl p-4", tone)} role="status">
          <Icon className="mt-0.5 size-6 shrink-0" />
          <div>
            <h1 className="text-2xl">
              {checking ? copy.checking : copy.states[state as keyof typeof copy.states].title}
            </h1>
            <p className="text-sm text-foreground">
              {state === "awaitingTransfer" && r.payBy
                ? copy.states.awaitingTransfer.body(
                    new Date(r.payBy).toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    }),
                  )
                : copy.states[state as keyof typeof copy.states].body(r.business)}
            </p>
          </div>
        </section>

        <section className="card-soft space-y-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl">{r.propertyName}</h2>
            <p className="text-sm">
              {copy.reference}{" "}
              <span className="font-mono font-semibold tracking-wider">{r.reference}</span>
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{copy.room}</dt>
            <dd>{r.roomNames.length > 1 ? r.roomNames.join(", ") : r.roomName}</dd>
            <dt className="text-muted-foreground">{copy.dates}</dt>
            <dd>
              {formatUkDate(r.checkIn)} – {formatUkDate(r.checkOut)} · {copy.nights(nights)}
            </dd>
            <dt className="text-muted-foreground">{copy.guests}</dt>
            <dd>{partyText(r.guests - r.children, r.children)}</dd>
            <dt className="text-muted-foreground">{copy.rate}</dt>
            <dd>
              {r.plan === "flex"
                ? r.freeCancelUntil
                  ? copy.flexUntil(formatUkDate(r.freeCancelUntil))
                  : copy.flex
                : copy.nonRef}
            </dd>
            <dt className="text-muted-foreground">{copy.total}</dt>
            <dd className="font-semibold">{money(r.totalPence, r.currency)}</dd>
            <dt className="text-muted-foreground">{copy.payment}</dt>
            <dd>{copy.methods[r.method]}</dd>
          </dl>
        </section>

        {r.method === "bank" && (r.status === "pending" || r.status === "confirmed") ? (
          <section className="card-soft space-y-3 p-5">
            <h2 className="flex items-center gap-2 text-xl">
              <Landmark className="size-5 text-primary" /> {copy.bankTitle}
            </h2>
            <p className="text-sm text-muted-foreground">
              {copy.bankBody(money(r.totalPence, r.currency))}
            </p>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {[...r.bankLines, { label: copy.useReference, value: r.reference }].map((l) => (
                <li key={l.label} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="w-40 shrink-0 text-muted-foreground">{l.label}</span>
                  <span className="min-w-0 flex-1 break-all font-mono">{l.value}</span>
                  <button
                    type="button"
                    onClick={() => copyText(l.value)}
                    aria-label={copy.copyLabel(l.label)}
                    className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-secondary"
                  >
                    <Copy className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {r.agreements.length ? (
          <section className="card-soft space-y-3 p-5">
            <h2 className="flex items-center gap-2 text-xl">
              <FileSignature className="size-5 text-primary" /> {termsCopy.yourCopy}
            </h2>
            <p className="text-sm text-muted-foreground">{termsCopy.yourCopyHelp}</p>
            {r.agreements.map((a) => (
              <AgreedText
                key={a.kind}
                title={a.kind === "licence" ? termsCopy.licenceTitle : termsCopy.termsTitle}
                text={a.text}
              />
            ))}
          </section>
        ) : null}

        {r.status === "cancelled" && r.refundPence > 0 ? (
          <p className="card-soft p-4 text-sm">
            {r.refundStatus === "to_do"
              ? copy.refundFromHost(money(r.refundPence, r.currency), r.business)
              : copy.refundDone(money(r.refundPence, r.currency))}
          </p>
        ) : null}

        <CancelBooking
          token={token}
          cancel={r.cancel}
          currency={r.currency}
          total={r.totalPence}
          business={r.business}
          freeUntil={r.freeCancelUntil}
        />

        <section className="flex flex-wrap gap-2">
          {r.contactEmail ? (
            <Button asChild variant="outline">
              <a
                href={`mailto:${r.contactEmail}?subject=${encodeURIComponent(`${copy.reference} ${r.reference}`)}`}
              >
                <Mail className="size-4" /> {copy.email}
              </a>
            </Button>
          ) : null}
          {r.contactPhone ? (
            <Button asChild variant="outline">
              <a href={`tel:${r.contactPhone.replace(/\s+/g, "")}`}>
                <Phone className="size-4" /> {copy.call}
              </a>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => {
              // Each agreement prints in full.
              document.querySelectorAll("details[data-print-open]").forEach((d) => {
                (d as HTMLDetailsElement).open = true;
              });
              window.print();
            }}
          >
            <Printer className="size-4" /> {copy.print}
          </Button>
        </section>
        <p className="text-xs text-muted-foreground">{copy.keepLink}</p>
      </main>
    </GuestFrame>
  );
}

/** Cancelling from the booking page, saying plainly what happens to the money first. */
function CancelBooking({
  token,
  cancel,
  currency,
  total,
  business,
  freeUntil,
}: {
  token: string;
  cancel: CancelPolicy;
  currency: string;
  total: number;
  business: string;
  freeUntil: string | null;
}) {
  const fn = useServerFn(cancelMyReservation);
  const router = useRouter();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!cancel.open) return null;
  if (!cancel.guestCan)
    return (
      <section className="card-soft p-5 text-sm">
        <h2 className="text-xl">{copy.cancelTitle}</h2>
        <p className="mt-1 text-muted-foreground">{copy.cancelAskHost(business)}</p>
      </section>
    );
  const refund = money(cancel.refundPence, currency);
  const says = cancel.free
    ? cancel.refund === "card"
      ? copy.cancelFreeCard(refund)
      : cancel.refund === "by_host"
        ? copy.cancelFreeHost(refund, business)
        : copy.cancelFreeUnpaid
    : copy.cancelNoRefund(money(total, currency));
  async function go() {
    setBusy(true);
    try {
      const res = await fn({ data: { token, expectRefund: cancel.refundPence } });
      if (res.changed) toast.info(copy.cancelChanged);
      await router.invalidate();
      setSure(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : copy.cancelFailed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card-soft space-y-3 p-5">
      <h2 className="text-xl">{copy.cancelTitle}</h2>
      <p className="text-sm">
        {freeUntil && cancel.free ? `${copy.cancelFreeUntil(formatUkDate(freeUntil))} ` : ""}
        {says}
      </p>
      {sure ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" disabled={busy} onClick={() => void go()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}{" "}
            {cancel.refundPence > 0 ? copy.cancelDoRefund(refund) : copy.cancelDo}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setSure(false)}>
            {copy.cancelKeep}
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setSure(true)}>
          {copy.cancelOpen}
        </Button>
      )}
    </section>
  );
}

/** One agreement as the guest agreed to it, folded (opened for printing). */
function AgreedText({ title, text }: { title: string; text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <details data-print-open className="group rounded-2xl border border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 text-sm leading-relaxed [&_h2]:text-xl [&_h3]:mt-4 [&_h3]:text-base [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2">
        <AgreementBlocks blocks={blocks} />
      </div>
    </details>
  );
}
