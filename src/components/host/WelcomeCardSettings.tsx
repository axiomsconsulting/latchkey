import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Hand } from "lucide-react";
import { toast } from "sonner";

import { SaveButton, changed } from "@/components/host/SaveButton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { common, goodbyeCopy, kioskCardsCopy as copy } from "@/content/copy";
import {
  LATE_LEAD_CHOICES,
  START_CHOICES,
  arrivalText,
  normaliseArrivals,
  type ArrivalCards,
} from "@/lib/checkout-goodbye";
import { getGoodbyeSettings, saveGoodbyeSettings } from "@/lib/goodbye.functions";
import { pingKiosk } from "@/lib/kiosk-ping";

/**
 * Settings → Kiosk → Check-in cards: the welcome on the door tablet for each
 * guest arriving today, and when it starts (an early check-in in mind). The
 * same shape as Check-out cards (GoodbyeSettings).
 */
export function WelcomeCardSettings({
  property,
}: {
  property: { id: string; short_code: string };
}) {
  const getFn = useServerFn(getGoodbyeSettings);
  const saveFn = useServerFn(saveGoodbyeSettings);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["goodbye", property.id],
    queryFn: () => getFn({ data: { propertyId: property.id } }),
  });
  const [form, setForm] = useState<ArrivalCards>(() => normaliseArrivals(null));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setForm(q.data.arrivals);
  }, [q.data]);
  const saved = q.data?.arrivals ?? normaliseArrivals(null);
  const dirty = !!q.data && changed(form, saved);
  const set = <K extends keyof ArrivalCards>(k: K, v: ArrivalCards[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function onSave() {
    setBusy(true);
    try {
      await saveFn({ data: { propertyId: property.id, arrivals: form } });
      await pingKiosk(property.short_code);
      await qc.invalidateQueries({ queryKey: ["goodbye", property.id] });
      toast.success(copy.saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <Hand className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl">{copy.settingsTitle}</h2>
          <p className="text-sm text-muted-foreground">{copy.settingsBody}</p>
        </div>
        <SaveButton dirty={dirty} busy={busy} onClick={() => void onSave()} />
      </div>
      {q.data && !q.data.available ? (
        <p className="mt-3 text-sm text-muted-foreground">{goodbyeCopy.unavailable}</p>
      ) : null}

      <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border p-3">
        <span className="font-medium">{copy.on}</span>
        <Switch checked={form.on} onCheckedChange={(v) => set("on", v)} />
      </label>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="wc-msg">{goodbyeCopy.message}</Label>
            <Textarea
              id="wc-msg"
              rows={3}
              maxLength={300}
              value={form.message}
              onChange={(e) => set("message", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{goodbyeCopy.messageHelp}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{copy.startBefore}</Label>
              <Select
                value={String(form.startBeforeMinutes)}
                onValueChange={(v) => set("startBeforeMinutes", Number(v))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {START_CHOICES.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {copy.minutesBefore(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{copy.earlyLead}</Label>
              <Select
                value={String(form.earlyLeadMinutes)}
                onValueChange={(v) => set("earlyLeadMinutes", Number(v))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LATE_LEAD_CHOICES.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {copy.earlyLeadOption(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="rounded-xl bg-muted p-3 text-sm">{copy.howItEnds}</p>
        </div>

        {/* What the tablet shows, for one guest. */}
        <div className="rounded-2xl bg-primary-foreground p-5 text-primary ring-1 ring-border">
          <p className="text-xs uppercase tracking-[0.2em] opacity-80">{goodbyeCopy.preview}</p>
          <p className="mt-3 font-display text-2xl leading-tight">
            {arrivalText(form, goodbyeCopy.sampleName)}
          </p>
          <p className="mt-4 inline-block rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            {copy.checkIn}
          </p>
        </div>
      </div>
    </section>
  );
}
