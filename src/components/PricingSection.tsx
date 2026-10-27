import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Minus, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPricing } from "@/lib/pricing.functions";
import { DEFAULT_PRICING, monthlyPence, money } from "@/lib/pricing";
import { getPublicOffer } from "@/lib/admin.functions";
import { formatUkDate } from "@/lib/dates";
import { offerCopy as o, pricingCopy as c } from "@/content/copy";

/** The launch offer running today, if any. */
function useOffer() {
  const fetchOffer = useServerFn(getPublicOffer);
  return (
    useQuery({ queryKey: ["public-offer"], queryFn: () => fetchOffer(), staleTime: 5 * 60_000 })
      .data ?? null
  );
}

/** A line under the home page's buttons while an offer runs. */
export function OfferRibbon() {
  const offer = useOffer();
  const fetchPricing = useServerFn(getPricing);
  const q = useQuery({ queryKey: ["pricing"], queryFn: () => fetchPricing() });
  if (!offer) return null;
  const p = q.data ?? DEFAULT_PRICING;
  return (
    <a
      href="#pricing"
      className="mt-6 inline-flex max-w-full items-center gap-2 rounded-2xl bg-accent/10 px-4 py-2.5 text-sm font-medium text-foreground ring-1 ring-accent/30 transition hover:bg-accent/15"
    >
      <Sparkles className="size-4 shrink-0 text-accent" />
      <span>
        {o.ribbon(
          offer.label,
          p.trial_days,
          money(offer.pricePence, p.currency),
          formatUkDate(offer.endsOn, { withYear: true }),
        )}
      </span>
      <ArrowRight className="size-4 shrink-0" />
    </a>
  );
}

function Stepper({
  label,
  value,
  set,
  min,
}: {
  label: string;
  value: number;
  set: (n: number) => void;
  min: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label={`Fewer ${label}`}
          onClick={() => set(Math.max(min, value - 1))}
        >
          <Minus className="size-4" />
        </Button>
        <span className="w-6 text-center font-semibold tabular-nums">{value}</span>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label={`More ${label}`}
          onClick={() => set(Math.min(50, value + 1))}
        >
          <Plus className="size-4" />
        </Button>
      </span>
    </div>
  );
}

export function PricingSection() {
  const fetchPricing = useServerFn(getPricing);
  const q = useQuery({ queryKey: ["pricing"], queryFn: () => fetchPricing() });
  const p = q.data ?? DEFAULT_PRICING;
  const [props, setProps] = useState(1);
  const [rooms, setRooms] = useState(3);
  const total = monthlyPence(
    p,
    Array.from({ length: props }, () => rooms),
  );
  const offer = useOffer();
  const until = offer ? formatUkDate(offer.endsOn, { withYear: true }) : "";
  const offerPrice = offer ? Math.min(offer.pricePence, total) : null;

  return (
    <section
      id="pricing"
      className="my-10 grid gap-5 rounded-3xl bg-secondary p-6 sm:p-8 md:grid-cols-2"
    >
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">{c.eyebrow}</p>
        <h2 className="mt-3 text-3xl">{c.title(p.trial_days)}</h2>
        {offer ? (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
            <Sparkles className="size-4" /> {o.badge(offer.label, until)}
          </p>
        ) : null}
        <ul className="mt-5 space-y-2 text-sm">
          <li className="flex gap-2">
            <Check className="size-4 text-primary" />
            {c.base(money(p.base_pence, p.currency))}
          </li>
          <li className="flex gap-2">
            <Check className="size-4 text-primary" />
            {c.room(money(p.extra_room_pence, p.currency))}
          </li>
          <li className="flex gap-2">
            <Check className="size-4 text-primary" />
            {c.property(money(p.extra_property_pence, p.currency))}
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="size-4 text-primary" />
            {c.guarantee}
          </li>
        </ul>
        <Button asChild size="lg" variant="accent" className="mt-6 h-14">
          <Link to="/start">{c.cta(p.trial_days)}</Link>
        </Button>
      </div>
      <div className="card-soft space-y-4 p-6">
        <h3 className="text-lg">{c.estimator}</h3>
        <Stepper label={c.properties} value={props} set={setProps} min={1} />
        <Stepper label={c.roomsEach} value={rooms} set={setRooms} min={1} />
        <p className="border-t border-border pt-4 text-sm text-muted-foreground">
          {c.after(p.trial_days)}
        </p>
        {offer && offerPrice !== null && offerPrice < total ? (
          <div className="space-y-1">
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-display text-4xl">{money(offerPrice, p.currency)}</span>
              <span className="text-base text-muted-foreground">{o.firstMonth}</span>
            </p>
            <p className="text-sm">
              <s
                className="text-muted-foreground"
                aria-label={`Usually ${money(total, p.currency)} a month`}
              >
                {money(total, p.currency)}
              </s>{" "}
              {o.thenUsual(money(total, p.currency))}
            </p>
          </div>
        ) : (
          <p className="font-display text-4xl">
            {money(total, p.currency)}
            <span className="text-base text-muted-foreground"> {c.perMonth}</span>
          </p>
        )}
        {offer ? (
          <>
            <ol className="grid gap-2 border-t border-border pt-4 text-sm sm:grid-cols-3">
              {o
                .journey(
                  p.trial_days,
                  money(offerPrice ?? offer.pricePence, p.currency),
                  money(total, p.currency),
                )
                .map((step, i) => (
                  <li key={step} className="flex items-start gap-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
            </ol>
            <p className="text-xs text-muted-foreground">{o.newOnly(until)}</p>
          </>
        ) : null}
      </div>
    </section>
  );
}

/** Invitation shown on demo screens. */
export function DemoTrialCta() {
  const fetchPricing = useServerFn(getPricing);
  const q = useQuery({ queryKey: ["pricing"], queryFn: () => fetchPricing() });
  const days = (q.data ?? DEFAULT_PRICING).trial_days;
  const offer = useOffer();
  return (
    <div className="mx-auto my-6 flex max-w-3xl flex-wrap items-center justify-between gap-4 rounded-3xl bg-primary p-5 text-primary-foreground">
      <div>
        <p className="font-display text-lg">{c.demoTitle}</p>
        <p className="text-sm opacity-90">{c.demoBody(days)}</p>
        {offer ? (
          <p className="mt-1 text-sm font-semibold">
            {o.demo(
              money(offer.pricePence, (q.data ?? DEFAULT_PRICING).currency),
              formatUkDate(offer.endsOn, { withYear: true }),
            )}
          </p>
        ) : null}
      </div>
      <Button asChild variant="accent" className="h-12">
        <Link to="/start">{c.cta(days)}</Link>
      </Button>
    </div>
  );
}
