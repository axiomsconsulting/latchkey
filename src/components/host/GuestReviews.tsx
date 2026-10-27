import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Star } from "lucide-react";
import { toast } from "sonner";

import { DashSection } from "@/components/host/DashboardSections";
import { Stars } from "@/components/host/ShellExtras";
import { Switch } from "@/components/ui/switch";
import { common, feedbackCopy as copy } from "@/content/copy";
import { formatUkDate } from "@/lib/dates";
import { listGuestReviews, setReviewShown } from "@/lib/feedback.functions";
import { PUBLIC_REVIEW_MIN } from "@/lib/stay-access";

/** What guests said about their stays, newest first, with the average. */
export function GuestReviews({ hostId }: { hostId: string }) {
  const fetchReviews = useServerFn(listGuestReviews);
  const setShown = useServerFn(setReviewShown);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["guest-reviews", hostId],
    enabled: !!hostId,
    queryFn: () => fetchReviews({ data: { hostId } }),
  });
  const rows = q.data ?? [];
  const rated = rows.filter((r) => r.rating);
  const avg = rated.length ? rated.reduce((n, r) => n + (r.rating ?? 0), 0) / rated.length : null;

  return (
    <DashSection
      id="reviews"
      icon={Star}
      title={copy.reviewsTitle}
      action={
        avg !== null ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Stars value={Math.round(avg)} size="size-4" />{" "}
            {copy.reviewsAverage(avg.toFixed(1), rated.length)}
          </span>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.reviewsEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.slice(0, 10).map((r) => (
            <li key={r.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {r.rating ? <Stars value={r.rating} size="size-4" /> : null}
                {r.score ? (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold tabular-nums">
                    {r.score}/10
                  </span>
                ) : null}
                <span className="font-medium">{r.bookings?.guest_full_name ?? "Guest"}</span>
                <span className="text-muted-foreground">
                  {r.properties?.name ? `${r.properties.name} · ` : ""}
                  {formatUkDate(r.created_at.slice(0, 10))}
                </span>
              </div>
              {r.message ? <p className="mt-1 whitespace-pre-wrap text-sm">{r.message}</p> : null}
              {/* Shared by the guest for the booking page (direct stays scoring 9+): the host can keep it off. */}
              {r.public_ok && (r.score ?? 0) >= PUBLIC_REVIEW_MIN ? (
                <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={!r.host_hidden}
                    onCheckedChange={(v) =>
                      void setShown({ data: { id: r.id, shown: v } })
                        .then(() => qc.invalidateQueries({ queryKey: ["guest-reviews", hostId] }))
                        .catch((e: unknown) =>
                          toast.error(e instanceof Error ? e.message : common.errorBody),
                        )
                    }
                    aria-label={copy.reviewOnPage}
                  />
                  {copy.reviewOnPage}
                </label>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </DashSection>
  );
}
