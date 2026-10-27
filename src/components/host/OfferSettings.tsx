import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { SaveButton, changed } from "@/components/host/SaveButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { common, offerCopy as copy } from "@/content/copy";
import { getOfferSettings, saveOffer } from "@/lib/admin.functions";
import { offerRunning, ukToday, type Offer } from "@/lib/offer";

/** Super admin: the launch offer for new hosts (price, name, first and last day). */
export function OfferSettings() {
  const fetchSettings = useServerFn(getOfferSettings);
  const save = useServerFn(saveOffer);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["offer-settings"], queryFn: () => fetchSettings() });
  const [form, setForm] = useState<Offer | null>(null);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    setForm(q.data.offer);
    setPrice((q.data.offer.pricePence / 100).toFixed(2));
  }, [q.data]);

  if (q.isLoading || !q.data || !form) return <Skeleton className="h-48 rounded-2xl" />;
  const live = offerRunning(form, ukToday());
  const dirty = changed(
    { ...form, price },
    { ...q.data.offer, price: (q.data.offer.pricePence / 100).toFixed(2) },
  );

  async function submit() {
    if (!form) return;
    setBusy(true);
    try {
      await save({
        data: { ...form, pricePence: Math.max(0, Math.round(Number(price || 0) * 100)) },
      });
      await qc.invalidateQueries({ queryKey: ["offer-settings"] });
      await qc.invalidateQueries({ queryKey: ["public-offer"] });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-5 text-accent" />
        <h2 className="text-xl">{copy.adminTitle}</h2>
        <Badge variant={live ? "default" : "secondary"}>{live ? copy.live : copy.notLive}</Badge>
        <SaveButton
          className="ml-auto"
          dirty={dirty}
          busy={busy}
          label={copy.save}
          onClick={() => void submit()}
        />
      </div>
      <p className="text-muted-foreground">{copy.adminBody}</p>
      {q.data.migrationPending ? (
        <p className="rounded-xl bg-muted p-3 text-sm">
          Run migration 0029 first (Lovable applies it on the next sync).
        </p>
      ) : null}
      <label className="flex items-center gap-2">
        <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />{" "}
        {copy.enabled}
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="offer-price">{copy.price}</Label>
          <Input
            id="offer-price"
            type="number"
            min={0}
            step="0.5"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="offer-label">{copy.label}</Label>
          <Input
            id="offer-label"
            maxLength={60}
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="offer-start">{copy.startsOn}</Label>
          <Input
            id="offer-start"
            type="date"
            value={form.startsOn}
            onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="offer-end">{copy.endsOn}</Label>
          <Input
            id="offer-end"
            type="date"
            value={form.endsOn}
            onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{copy.counts(q.data.waiting, q.data.used)}</p>
    </section>
  );
}
