import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Clock, Copy, Landmark, Mail, Phone, Printer, XCircle } from "lucide-react";
import { toast } from "sonner";

import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { Button } from "@/components/ui/button";
import { guest as guestCopy, reservationCopy as copy } from "@/content/copy";
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
  validateSearch: (s: Record<string, unknown>): { paid?: "1" | "0" } => (s["paid"] === "1" || s["paid"] === "0" ? { paid: s["paid"] as "1" | "0" } : {}),
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
  const state = r.status === "paid" ? "paid" : r.status === "confirmed" ? "confirmed" : r.status === "pending" ? (r.method === "bank" ? "awaitingTransfer" : "awaitingCard") : r.status;
  const tone = state === "paid" || state === "confirmed" ? "bg-success/10 text-success" : state === "expired" || state === "cancelled" ? "bg-destructive/10 text-destructive" : "bg-accent/15";
  const Icon = state === "paid" || state === "confirmed" ? Check : state === "expired" || state === "cancelled" ? XCircle : Clock;
  const copyText = (v: string) => void navigator.clipboard.writeText(v).then(() => toast.success(copy.copied), () => undefined);

  return (
    <GuestFrame theme={r.theme} name={r.propertyName}>
      <main className="mx-auto max-w-2xl space-y-5 py-6 sm:py-8">
        <section className={cn("flex items-start gap-3 rounded-2xl p-4", tone)} role="status">
          <Icon className="mt-0.5 size-6 shrink-0" />
          <div>
            <h1 className="text-2xl">{checking ? copy.checking : copy.states[state as keyof typeof copy.states].title}</h1>
            <p className="text-sm text-foreground">
              {state === "awaitingTransfer" && r.payBy
                ? copy.states.awaitingTransfer.body(new Date(r.payBy).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }))
                : copy.states[state as keyof typeof copy.states].body(r.business)}
            </p>
          </div>
        </section>

        <section className="card-soft space-y-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl">{r.propertyName}</h2>
            <p className="text-sm">
              {copy.reference} <span className="font-mono font-semibold tracking-wider">{r.reference}</span>
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
            <dd>{r.plan === "flex" ? (r.freeCancelUntil ? copy.flexUntil(formatUkDate(r.freeCancelUntil)) : copy.flex) : copy.nonRef}</dd>
            <dt className="text-muted-foreground">{copy.total}</dt>
            <dd className="font-semibold">{money(r.totalPence, r.currency)}</dd>
            <dt className="text-muted-foreground">{copy.payment}</dt>
            <dd>{copy.methods[r.method]}</dd>
          </dl>
        </section>

        {r.method === "bank" && (r.status === "pending" || r.status === "confirmed") ? (
          <section className="card-soft space-y-3 p-5">
            <h2 className="flex items-center gap-2 text-xl"><Landmark className="size-5 text-primary" /> {copy.bankTitle}</h2>
            <p className="text-sm text-muted-foreground">{copy.bankBody(money(r.totalPence, r.currency))}</p>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {[...r.bankLines, { label: copy.useReference, value: r.reference }].map((l) => (
                <li key={l.label} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="w-40 shrink-0 text-muted-foreground">{l.label}</span>
                  <span className="min-w-0 flex-1 break-all font-mono">{l.value}</span>
                  <button type="button" onClick={() => copyText(l.value)} aria-label={copy.copyLabel(l.label)} className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-secondary">
                    <Copy className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="flex flex-wrap gap-2">
          {r.contactEmail ? (
            <Button asChild variant="outline">
              <a href={`mailto:${r.contactEmail}?subject=${encodeURIComponent(`${copy.reference} ${r.reference}`)}`}><Mail className="size-4" /> {copy.email}</a>
            </Button>
          ) : null}
          {r.contactPhone ? (
            <Button asChild variant="outline">
              <a href={`tel:${r.contactPhone.replace(/\s+/g, "")}`}><Phone className="size-4" /> {copy.call}</a>
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => window.print()}>
            <Printer className="size-4" /> {copy.print}
          </Button>
        </section>
        <p className="text-xs text-muted-foreground">{copy.keepLink}</p>
      </main>
    </GuestFrame>
  );
}
