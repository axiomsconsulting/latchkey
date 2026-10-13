import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Heart, Loader2 } from "lucide-react";

import { Stars } from "@/components/host/ShellExtras";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { feedbackCopy as copy } from "@/content/copy";
import { getGuestReview, sendGuestReview } from "@/lib/feedback.functions";

/** "How was your stay?": stars and a note, once per stay, seen only by the host. */
export function StayReview({ token }: { token: string }) {
  const fetchReview = useServerFn(getGuestReview);
  const send = useServerFn(sendGuestReview);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["stay-review", token], queryFn: () => fetchReview({ data: { token } }) });
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const d = q.data;
  if (!d || !d.open) return null;

  if (d.sent) {
    return (
      <section className="card-soft flex items-center gap-3 p-5">
        <Heart className="size-5 shrink-0 text-accent" />
        <p>{copy.guestThanks}</p>
        {d.rating ? <Stars value={d.rating} size="size-5" /> : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="review" className="card-soft space-y-3 p-5">
      <h2 id="review" className="text-xl">
        {copy.guestTitle}
      </h2>
      <p className="text-muted-foreground">{copy.guestBody}</p>
      <Stars value={rating} onChange={setRating} size="size-10" />
      <Textarea rows={3} placeholder={copy.guestComment} value={message} onChange={(e) => setMessage(e.target.value)} />
      <Button
        size="lg"
        disabled={busy || rating === null}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await send({ data: { token, rating: rating!, message } });
            await qc.invalidateQueries({ queryKey: ["stay-review", token] });
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : null}
        {copy.guestSend}
      </Button>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
