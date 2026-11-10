import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { InfoTip } from "@/components/host/InfoTip";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { common, kioskReviewsCopy as copy } from "@/content/copy";
import { pingKiosk } from "@/lib/kiosk-ping";
import { dateLabel, ratingLabel } from "@/lib/kiosk-reviews";
import {
  fetchKioskReviews,
  listKioskReviews,
  setKioskReviewHidden,
  setKioskReviewsOn,
} from "@/lib/kiosk-reviews.functions";
import { normaliseTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Settings → Door tablets: the property's best reviews on the door tablet while an ID is
 * checked. A switch, Fetch reviews (from the property's and rooms' listing links), and the
 * list, where any review can be hidden.
 */
export function KioskReviewsSettings({
  property,
}: {
  property: { id: string; short_code: string; theme_config?: unknown };
}) {
  const listFn = useServerFn(listKioskReviews);
  const fetchFn = useServerFn(fetchKioskReviews);
  const hideFn = useServerFn(setKioskReviewHidden);
  const onFn = useServerFn(setKioskReviewsOn);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["kiosk-reviews", property.id],
    queryFn: () => listFn({ data: { propertyId: property.id } }),
  });
  const [on, setOn] = useState(() => normaliseTheme(property.theme_config).kioskReviews);
  const [busy, setBusy] = useState(false);
  const reviews = q.data?.reviews ?? [];
  const shown = reviews.filter((r) => !r.hidden).length;

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-3 p-5">
      <h2 className="flex items-center gap-1 font-display text-xl">
        {copy.title}
        <InfoTip label={copy.title}>{copy.info}</InfoTip>
      </h2>
      {q.data && !q.data.available ? (
        <p className="text-sm text-muted-foreground">{copy.needsUpdate}</p>
      ) : (
        <>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
            <span className="font-medium">{copy.show}</span>
            <Switch
              checked={on}
              disabled={busy}
              onCheckedChange={(v) =>
                void run(async () => {
                  const res = await onFn({ data: { propertyId: property.id, on: v } });
                  setOn(v);
                  await qc.invalidateQueries({ queryKey: ["workspace"] });
                  void pingKiosk(res.code);
                })
              }
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={busy || !q.data?.canFetch}
              onClick={() =>
                void run(async () => {
                  const res = await fetchFn({ data: { propertyId: property.id } });
                  toast.success(copy.fetched(res.kept, res.pages));
                  await q.refetch();
                })
              }
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {copy.fetch}
            </Button>
            <span className="text-sm text-muted-foreground">
              {q.data && !q.data.canFetch
                ? copy.notReady
                : reviews.length
                  ? copy.count(shown, reviews.length)
                  : copy.none}
            </span>
          </div>
          {reviews.length ? (
            <ul className="max-h-96 space-y-2 overflow-y-auto">
              {reviews.map((r) => (
                <li
                  key={r.id}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border border-border p-3 text-sm",
                    r.hidden && "opacity-50",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p>“{r.quote}”</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{r.first_name}</span> ·{" "}
                      {ratingLabel(Number(r.rating), r.out_of)} · {dateLabel(r.review_date)} ·{" "}
                      {r.site}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await hideFn({
                          data: { propertyId: property.id, id: r.id, hidden: !r.hidden },
                        });
                        await q.refetch();
                      })
                    }
                  >
                    {r.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    {r.hidden ? copy.showIt : copy.hide}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
