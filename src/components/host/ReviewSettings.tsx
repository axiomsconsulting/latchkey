import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "lucide-react";
import { toast } from "sonner";

import { SaveButton, changed } from "@/components/host/SaveButton";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { common, reviewSettingsCopy as copy } from "@/content/copy";
import { getStayAccess, saveStayAccess } from "@/lib/stay-access.functions";

type Form = { askReview: boolean; reviewText: string; showDirectReviews: boolean };

/**
 * Settings → Guests → Reviews, for one property: the last day's ask for a
 * review and its words, and showing direct guests' best reviews (9+/10,
 * shared with their agreement) on the booking page. Saved with the room QR
 * settings (properties.stay_access), but only these fields.
 */
export function ReviewSettings({ propertyId }: { propertyId: string }) {
  const fetchFn = useServerFn(getStayAccess);
  const saveFn = useServerFn(saveStayAccess);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["stay-access", propertyId],
    queryFn: () => fetchFn({ data: { propertyId } }),
  });
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const saved: Form | null = q.data
    ? {
        askReview: q.data.settings.askReview,
        reviewText: q.data.settings.reviewText,
        showDirectReviews: q.data.settings.showDirectReviews,
      }
    : null;
  useEffect(() => {
    if (saved) setForm(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  if (q.isLoading || !q.data || !form || !saved) return <Skeleton className="h-48 rounded-2xl" />;
  const set = (patch: Partial<Form>) => setForm((f) => f && { ...f, ...patch });

  async function save() {
    setBusy(true);
    try {
      await saveFn({ data: { propertyId, settings: form! } });
      await qc.invalidateQueries({ queryKey: ["stay-access", propertyId] });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg">
            <Star className="size-5 text-primary" /> {copy.title}
          </h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        {q.data.available ? (
          <SaveButton dirty={changed(form, saved)} busy={busy} onClick={() => void save()} />
        ) : null}
      </div>
      {!q.data.available ? (
        <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p>
      ) : null}
      <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
        <div className="min-w-0 text-sm">
          <Label htmlFor="rv-ask" className="text-base">
            {copy.ask}
          </Label>
          <p className="text-muted-foreground">{copy.askHelp}</p>
        </div>
        <Switch
          id="rv-ask"
          checked={form.askReview}
          onCheckedChange={(v) => set({ askReview: v })}
        />
      </div>
      {form.askReview ? (
        <div className="space-y-1">
          <Label htmlFor="rv-text">{copy.text}</Label>
          <Textarea
            id="rv-text"
            rows={3}
            maxLength={280}
            value={form.reviewText}
            onChange={(e) => set({ reviewText: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">{copy.textHelp}</p>
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
        <div className="min-w-0 text-sm">
          <Label htmlFor="rv-show" className="text-base">
            {copy.show}
          </Label>
          <p className="text-muted-foreground">{copy.showHelp}</p>
        </div>
        <Switch
          id="rv-show"
          checked={form.showDirectReviews}
          onCheckedChange={(v) => set({ showDirectReviews: v })}
        />
      </div>
    </section>
  );
}
