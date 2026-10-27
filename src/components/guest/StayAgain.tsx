import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BadgePercent, CalendarHeart, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { stayAgainCopy as copy } from "@/content/copy";
import { getStayAgain, saveStayAgain } from "@/lib/direct.functions";
import { formatUkDate } from "@/lib/dates";

/**
 * "Book direct next time": an invitation back to the property's own booking
 * page, leading with the best offer running now (or the next one soon), else
 * the non-refundable saving, with why booking direct is better. Below it,
 * separately and optionally, the guest can ask to hear about offers (an
 * unticked box, the exact words kept with their consent, a link to withdraw).
 */
export function StayAgain({ token }: { token: string }) {
  const fetchFn = useServerFn(getStayAgain);
  const saveFn = useServerFn(saveStayAgain);
  const q = useQuery({
    queryKey: ["stay-again", token],
    queryFn: () => fetchFn({ data: { token } }),
  });
  const [email, setEmail] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdraw, setWithdraw] = useState<string | null>(null);
  useEffect(() => {
    if (q.data?.found) {
      setEmail(q.data.email);
      setWithdraw(q.data.withdrawToken);
    }
  }, [q.data]);

  const d = q.data;
  if (!d || !d.found) return null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await saveFn({ data: { token, email, agree: true } });
      setWithdraw(r.withdrawToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
    } finally {
      setBusy(false);
    }
  }

  const until = (iso: string) => formatUkDate(iso);
  const title = d.offer
    ? copy.titleOffer(d.offer.percent)
    : d.nonRef
      ? copy.titleOffer(d.nonRef)
      : copy.titlePlain;
  const body = d.offer
    ? d.offer.running
      ? copy.offerRunning(d.offer.label, d.offer.percent, until(d.offer.to), d.offer.someRooms)
      : copy.offerSoon(
          d.offer.label,
          d.offer.percent,
          until(d.offer.from),
          until(d.offer.to),
          d.offer.someRooms,
        )
    : d.nonRef
      ? copy.nonRef(d.nonRef)
      : copy.plain(d.business);

  return (
    <section
      aria-labelledby="stay-again"
      className="overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-surface to-accent/10 p-5 sm:p-6"
    >
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
          {d.offer || d.nonRef ? (
            <BadgePercent className="size-6" />
          ) : (
            <CalendarHeart className="size-6" />
          )}
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            {copy.eyebrow}
          </p>
          <h2 id="stay-again" className="text-2xl">
            {title}
          </h2>
          <p className="text-muted-foreground">{body}</p>
        </div>
      </div>
      <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        {copy.perks.map((perk) => (
          <li key={perk} className="flex items-center gap-2 rounded-xl bg-surface/70 px-3 py-2">
            <Check className="size-4 shrink-0 text-primary" /> {perk}
          </li>
        ))}
      </ul>
      {d.shortCode ? (
        <Button asChild size="lg" className="mt-4 w-full sm:w-auto">
          <a href={`/book/${d.shortCode}`}>
            {d.canBook ? copy.bookDirect : copy.askDirect} <ArrowRight />
          </a>
        </Button>
      ) : null}

      {/* Optional and separate: hearing about offers first (the exact words are kept with their consent). */}
      <div className="mt-5 border-t border-border/60 pt-4">
        {withdraw ? (
          <p className="flex flex-wrap items-center gap-2 text-sm" role="status">
            <Check className="size-4 text-primary" /> {copy.onList(d.business)}{" "}
            <a
              href={`/stay-again/withdraw/${withdraw}`}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {copy.changedMind}
            </a>
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium">{copy.hearFirst}</p>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={agree}
                onCheckedChange={(v) => setAgree(v === true)}
                className="mt-0.5"
              />
              <span>{d.consent}</span>
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="email"
                className="h-11 bg-surface"
                autoComplete="email"
                placeholder={copy.emailPlaceholder}
                aria-label={copy.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button
                variant="outline"
                onClick={() => void save()}
                disabled={!agree || !email.trim() || busy}
                className="shrink-0"
              >
                {busy ? <Loader2 className="animate-spin" /> : null} {copy.save}
              </Button>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
