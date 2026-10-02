import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Check, Minus, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPricing } from "@/lib/pricing.functions";
import { DEFAULT_PRICING, monthlyPence, money } from "@/lib/pricing";
import { pricingCopy as c } from "@/content/copy";

function Stepper({ label, value, set, min }: { label: string; value: number; set: (n: number) => void; min: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-2">
        <Button type="button" size="icon" variant="outline" aria-label={`Fewer ${label}`} onClick={() => set(Math.max(min, value - 1))}><Minus className="size-4" /></Button>
        <span className="w-6 text-center font-semibold tabular-nums">{value}</span>
        <Button type="button" size="icon" variant="outline" aria-label={`More ${label}`} onClick={() => set(Math.min(50, value + 1))}><Plus className="size-4" /></Button>
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
  const total = monthlyPence(p, Array.from({ length: props }, () => rooms));

  return (
    <section id="pricing" className="my-10 grid gap-5 rounded-3xl bg-secondary p-6 sm:p-8 md:grid-cols-2">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">{c.eyebrow}</p>
        <h2 className="mt-3 text-3xl">{c.title(p.trial_days)}</h2>
        <ul className="mt-5 space-y-2 text-sm">
          <li className="flex gap-2"><Check className="size-4 text-primary" />{c.base(money(p.base_pence, p.currency))}</li>
          <li className="flex gap-2"><Check className="size-4 text-primary" />{c.room(money(p.extra_room_pence, p.currency))}</li>
          <li className="flex gap-2"><Check className="size-4 text-primary" />{c.property(money(p.extra_property_pence, p.currency))}</li>
          <li className="flex gap-2"><ShieldCheck className="size-4 text-primary" />{c.guarantee}</li>
        </ul>
        <Button asChild size="lg" variant="accent" className="mt-6 h-14"><Link to="/auth">{c.cta(p.trial_days)}</Link></Button>
      </div>
      <div className="card-soft space-y-4 p-6">
        <h3 className="text-lg">{c.estimator}</h3>
        <Stepper label={c.properties} value={props} set={setProps} min={1} />
        <Stepper label={c.roomsEach} value={rooms} set={setRooms} min={1} />
        <p className="border-t border-border pt-4 text-sm text-muted-foreground">{c.after(p.trial_days)}</p>
        <p className="font-display text-4xl">{money(total, p.currency)}<span className="text-base text-muted-foreground"> {c.perMonth}</span></p>
      </div>
    </section>
  );
}

/** Invitation shown on demo screens. */
export function DemoTrialCta() {
  const fetchPricing = useServerFn(getPricing);
  const q = useQuery({ queryKey: ["pricing"], queryFn: () => fetchPricing() });
  const days = (q.data ?? DEFAULT_PRICING).trial_days;
  return (
    <div className="mx-auto my-6 flex max-w-3xl flex-wrap items-center justify-between gap-4 rounded-3xl bg-primary p-5 text-primary-foreground">
      <div>
        <p className="font-display text-lg">{c.demoTitle}</p>
        <p className="text-sm opacity-90">{c.demoBody(days)}</p>
      </div>
      <Button asChild variant="accent" className="h-12"><Link to="/auth">{c.cta(days)}</Link></Button>
    </div>
  );
}
