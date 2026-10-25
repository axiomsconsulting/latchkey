import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Heart, Loader2, Star } from "lucide-react";

import { ChannelIcon } from "@/components/ChannelIcon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { reviewNudgeCopy as copy } from "@/content/copy";
import { getGuestReview, sendGuestReview } from "@/lib/feedback.functions";
import { cn } from "@/lib/utils";

export type ReviewAsk = { text: string; direct: boolean; showsOnPage: boolean; site: { key: string; label: string; iconUrl: string | null } };

/**
 * The last day's nudge: five stars beside the logo of the site they booked
 * with, and the host's words on why reviews matter. Booked on a site: where
 * their review goes. Booked directly: a score out of 10 and a few words
 * right here, and, if the host shows reviews on their booking page, a
 * separate, unticked choice to let it appear there with their first name.
 */
export function ReviewNudge({ token, ask, place }: { token: string; ask: ReviewAsk; place: string }) {
  return (
    <section aria-labelledby="review-nudge" className="rounded-3xl border-2 border-accent/40 bg-accent/10 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex gap-0.5" aria-hidden>
          {Array.from({ length: 5 }, (_, i) => <Star key={i} className="size-6 fill-amber-400 text-amber-400" />)}
        </span>
        <ChannelIcon channel={ask.site.key} iconUrl={ask.site.iconUrl} label={ask.site.label} size={32} />
        <h2 id="review-nudge" className="text-xl">{ask.direct ? copy.titleDirect : copy.title(ask.site.label)}</h2>
      </div>
      <p className="mt-2 text-lg">{ask.text}</p>
      {ask.direct ? <DirectReview token={token} showsOnPage={ask.showsOnPage} place={place} /> : <p className="mt-2 text-muted-foreground">{copy.onSite(ask.site.label)}</p>}
    </section>
  );
}

function DirectReview({ token, showsOnPage, place }: { token: string; showsOnPage: boolean; place: string }) {
  const fetchReview = useServerFn(getGuestReview);
  const send = useServerFn(sendGuestReview);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["stay-review", token], queryFn: () => fetchReview({ data: { token } }) });
  const [score, setScore] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [publicOk, setPublicOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = q.data;
  if (!d || !d.open) return null;
  if (d.sent) {
    return (
      <p className="mt-3 flex items-center gap-2">
        <Heart className="size-5 shrink-0 text-accent" /> {copy.thanks}
      </p>
    );
  }

  async function submit() {
    if (score === null) return;
    setBusy(true);
    setError(null);
    try {
      await send({ data: { token, score, message, publicOk: showsOnPage && publicOk } });
      await qc.invalidateQueries({ queryKey: ["stay-review", token] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <fieldset>
        <legend className="mb-2 font-medium">{copy.scoreLabel}</legend>
        <div role="radiogroup" aria-label={copy.scoreLabel} className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={score === n}
              onClick={() => setScore(n)}
              className={cn("h-11 rounded-xl border text-lg font-semibold tabular-nums", score === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface hover:bg-secondary")}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>{copy.low}</span>
          <span>{copy.high}</span>
        </p>
      </fieldset>
      <Textarea rows={3} placeholder={copy.comment} value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} aria-label={copy.comment} />
      {showsOnPage ? (
        <label className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3 text-sm">
          <Checkbox checked={publicOk} onCheckedChange={(v) => setPublicOk(v === true)} className="mt-0.5" />
          <span>{copy.publicOk(place)} <span className="text-muted-foreground">{copy.optional}</span></span>
        </label>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button size="lg" disabled={busy || score === null} onClick={() => void submit()}>
        {busy ? <Loader2 className="size-5 animate-spin" /> : null} {copy.send}
      </Button>
    </div>
  );
}
