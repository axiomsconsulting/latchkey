import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DoorClosed, KeyRound, Plane } from "lucide-react";
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
import { common, goodbyeCopy as copy, kioskCardsCopy } from "@/content/copy";
import { TodayCardList } from "@/components/host/KioskCardsPanel";
import { CardColourField, CardPreview } from "@/components/host/CardColourField";
import {
  LATE_LEAD_CHOICES,
  START_CHOICES,
  goodbyeText,
  normaliseGoodbye,
  type Goodbye,
} from "@/lib/checkout-goodbye";
import { getGoodbyeSettings, saveGoodbyeSettings } from "@/lib/goodbye.functions";
import { pingKiosk } from "@/lib/kiosk-ping";

/**
 * Settings → Kiosk → Check-out goodbye: what the door tablet says to guests
 * leaving today (a personal goodbye, safe travels, where the keys go, the
 * front door) and when it starts, with a late check-out in mind.
 */
export function GoodbyeSettings({ property }: { property: { id: string; short_code: string } }) {
  const getFn = useServerFn(getGoodbyeSettings);
  const saveFn = useServerFn(saveGoodbyeSettings);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["goodbye", property.id],
    queryFn: () => getFn({ data: { propertyId: property.id } }),
  });
  const [form, setForm] = useState<Goodbye>(() => normaliseGoodbye(null));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setForm(q.data.goodbye);
  }, [q.data]);
  const saved = q.data?.goodbye ?? normaliseGoodbye(null);
  const dirty = !!q.data && changed(form, saved);
  const set = <K extends keyof Goodbye>(k: K, v: Goodbye[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onSave() {
    setBusy(true);
    try {
      await saveFn({ data: { propertyId: property.id, goodbye: form } });
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
          <Plane className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <SaveButton dirty={dirty} busy={busy} onClick={() => void onSave()} />
      </div>
      {q.data && !q.data.available ? (
        <p className="mt-3 text-sm text-muted-foreground">{copy.unavailable}</p>
      ) : null}

      <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border p-3">
        <span className="font-medium">{copy.on}</span>
        <Switch checked={form.on} onCheckedChange={(v) => set("on", v)} />
      </label>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="gb-msg">{copy.message}</Label>
            <Textarea
              id="gb-msg"
              rows={3}
              maxLength={300}
              value={form.message}
              onChange={(e) => set("message", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{copy.messageHelp}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="gb-keys">{copy.keyDrop}</Label>
            <Textarea
              id="gb-keys"
              rows={2}
              maxLength={300}
              value={form.keyDrop}
              onChange={(e) => set("keyDrop", e.target.value)}
            />
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>{copy.lockDoor}</span>
            <Switch checked={form.lockDoor} onCheckedChange={(v) => set("lockDoor", v)} />
          </label>
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
              <Label>{copy.lateLead}</Label>
              <Select
                value={String(form.lateLeadMinutes)}
                onValueChange={(v) => set("lateLeadMinutes", Number(v))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LATE_LEAD_CHOICES.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {copy.lateLeadOption(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="rounded-xl bg-muted p-3 text-sm">{copy.howItEnds}</p>
          <div className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-sm font-medium">{kioskCardsCopy.todayListOut}</p>
            <TodayCardList property={property} kind="out" />
          </div>
        </div>

        {/* What the tablet shows, for one guest. */}
        <div className="space-y-3">
          <CardPreview
            colour={form.colour}
            label={copy.preview}
            text={goodbyeText(form, copy.sampleName)}
            button={copy.express}
          >
            {form.keyDrop ? (
              <p className="mt-3 flex gap-2 text-sm font-semibold">
                <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden /> {form.keyDrop}
              </p>
            ) : null}
            {form.lockDoor ? (
              <p className="mt-2 flex gap-2 text-sm font-semibold">
                <DoorClosed className="mt-0.5 size-4 shrink-0" aria-hidden /> {copy.lockLine}
              </p>
            ) : null}
          </CardPreview>
          <CardColourField value={form.colour} onChange={(v) => set("colour", v)} />
        </div>
      </div>
    </section>
  );
}
