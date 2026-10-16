import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Star } from "lucide-react";

import { DashSection } from "@/components/host/DashboardSections";
import { Stars } from "@/components/host/ShellExtras";
import { feedbackCopy as copy } from "@/content/copy";
import { formatUkDate } from "@/lib/dates";
import { listGuestReviews } from "@/lib/feedback.functions";

/** What guests said about their stays, newest first, with the average. */
export function GuestReviews({ hostId }: { hostId: string }) {
  const fetchReviews = useServerFn(listGuestReviews);
  const q = useQuery({ queryKey: ["guest-reviews", hostId], enabled: !!hostId, queryFn: () => fetchReviews({ data: { hostId } }) });
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
            <Stars value={Math.round(avg)} size="size-4" /> {copy.reviewsAverage(avg.toFixed(1), rated.length)}
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
                <span className="font-medium">{r.bookings?.guest_full_name ?? "Guest"}</span>
                <span className="text-muted-foreground">
                  {r.properties?.name ? `${r.properties.name} · ` : ""}
                  {formatUkDate(r.created_at.slice(0, 10))}
                </span>
              </div>
              {r.message ? <p className="mt-1 whitespace-pre-wrap text-sm">{r.message}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </DashSection>
  );
}
