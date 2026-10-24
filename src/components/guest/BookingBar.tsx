import { useEffect, useState } from "react";
import { CalendarDays, ChevronDown, Minus, Plus, Users } from "lucide-react";

import { StayDatePicker } from "@/components/guest/StayDatePicker";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { bookPageCopy as copy } from "@/content/copy";
import { formatUkDate, nightsBetween } from "@/lib/dates";
import type { Bounds, Focus, Stay } from "@/lib/date-pick";
import { partyText } from "@/lib/direct-booking";
import { cn } from "@/lib/utils";

/** Two months side by side from tablet width up, one on a phone. */
function useMonths(): 1 | 2 {
  const [months, setMonths] = useState<1 | 2>(1);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setMonths(mq.matches ? 2 : 1);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return months;
}

/**
 * Arrive · Leave · Guests across the top of the booking page, hotel style.
 * Arrive or Leave opens the calendar underneath (folding away again with
 * Done, or once both ends are tapped); Guests opens adults and, when the
 * host asks, children. It sets what's shown: rooms aren't searched.
 */
export function BookingBar({
  stay,
  bounds,
  adults,
  children,
  askChildren,
  maxGuests,
  onStay,
  onParty,
  full,
  offer,
}: {
  stay: Stay;
  bounds: Bounds;
  adults: number;
  children: number;
  askChildren: boolean;
  maxGuests: number;
  onStay: (stay: Stay) => void;
  onParty: (adults: number, children: number) => void;
  full: (day: string) => boolean;
  offer: (day: string) => boolean;
}) {
  const months = useMonths();
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<Focus>("in");
  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  const openAt = (f: Focus) => {
    setFocus(f);
    setOpen((o) => !(o && focus === f));
  };
  const box = "flex min-h-14 min-w-0 items-center gap-2 rounded-2xl border bg-surface px-3 py-2 text-left transition-colors hover:border-primary sm:gap-3";

  return (
    <section aria-label={copy.barLabel} className="card-soft space-y-3 p-3 sm:p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(["in", "out"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => openAt(f)}
            aria-expanded={open && focus === f}
            className={cn(box, open && focus === f ? "border-primary ring-2 ring-primary/30" : "border-border")}
          >
            <CalendarDays className="size-5 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block truncate text-xs uppercase tracking-wide text-muted-foreground">
                {f === "in" ? copy.arrive : copy.leave}
              </span>
              <span className="block truncate font-medium">{formatUkDate(f === "in" ? stay.checkIn : stay.checkOut)}</span>
            </span>
            {f === "out" ? <span className="ml-auto hidden shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs sm:inline">{copy.nightsShort(nights)}</span> : null}
          </button>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={cn(box, "col-span-2 border-border sm:col-span-1")}>
              <Users className="size-5 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block text-xs uppercase tracking-wide text-muted-foreground">{copy.guestsBox}</span>
                <span className="block truncate font-medium">{partyText(adults, askChildren ? children : 0)}</span>
              </span>
              <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3">
            <Counter label={copy.adults} value={adults} min={1} max={maxGuests - (askChildren ? children : 0)} onChange={(v) => onParty(v, children)} />
            {askChildren ? <Counter label={copy.children} hint={copy.childrenHint} value={children} min={0} max={Math.min(19, maxGuests - adults)} onChange={(v) => onParty(adults, v)} /> : null}
          </PopoverContent>
        </Popover>
      </div>

      {open ? (
        <div className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
          <StayDatePicker
            stay={stay}
            focus={focus}
            bounds={bounds}
            months={months}
            full={full}
            offer={offer}
            onChange={(s, f) => {
              onStay(s);
              setFocus(f);
            }}
            onDone={() => window.setTimeout(() => setOpen(false), 250)}
          />
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{copy.done}</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Counter({ label, hint, value, min, max, onChange }: { label: string; hint?: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>
        <span className="block font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <span className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label={copy.fewerOf(label)} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Minus className="size-4" />
        </Button>
        <span className="w-6 text-center tabular-nums" aria-live="polite">{value}</span>
        <Button type="button" variant="outline" size="icon" aria-label={copy.moreOf(label)} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus className="size-4" />
        </Button>
      </span>
    </div>
  );
}
