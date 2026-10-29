import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { SaveButton, changed } from "@/components/host/SaveButton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { checkinSettings, common } from "@/content/copy";
import {
  KEEP_DAY_CHOICES,
  normaliseRecords,
  type GuestRecords,
  type KeepDays,
} from "@/lib/guest-records";
import { registerApplies } from "@/lib/hotel-register";
import { saveGuestRecords } from "@/lib/host.functions";

const copy = checkinSettings.records;

/**
 * Per-property ID records: the data-regulator confirmation photos need, and
 * how long details and photos are kept. Which steps ask for them (who's
 * staying, every adult's ID, keeping the ID photo, the face photo) is set in
 * the check-in journey (CheckinJourney), which writes the same switches.
 */
export function GuestRecordsSettings({
  property,
}: {
  property: { id: string; guest_records?: unknown; country_code?: string | null };
}) {
  // UK properties keep the guest register, which needs to know who's staying.
  const uk = registerApplies(property.country_code);
  const [form, setForm] = useState<GuestRecords>(() => normaliseRecords(property.guest_records));
  const [saved, setSaved] = useState<GuestRecords>(form);
  const [busy, setBusy] = useState(false);
  const save = useServerFn(saveGuestRecords);
  const qc = useQueryClient();

  useEffect(() => {
    const r = normaliseRecords(property.guest_records);
    setForm(r);
    setSaved(r);
  }, [property.id, property.guest_records]);
  const dirty = changed(form, saved);

  async function onSave() {
    setBusy(true);
    try {
      await save({ data: { propertyId: property.id, records: form } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["board"] }),
        qc.invalidateQueries({ queryKey: ["workspace"] }),
      ]);
      setSaved(form);
      toast.success(checkinSettings.saved);
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
          <ShieldCheck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <SaveButton dirty={dirty} busy={busy} onClick={() => void onSave()} />
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-border p-4">
        <Checkbox
          id="gr-regulator"
          className="mt-1"
          checked={form.regulatorConfirmed}
          onCheckedChange={(v) => setForm((f) => ({ ...f, regulatorConfirmed: v === true }))}
        />
        <div>
          <Label htmlFor="gr-regulator" className="text-base leading-snug">
            {copy.regulator}
          </Label>
          <p className="mt-1 text-sm text-muted-foreground">{copy.regulatorHelp}</p>
        </div>
      </div>

      <p className="mt-4 rounded-xl bg-muted p-3 text-sm">{copy.stepsInJourney}</p>

      <div className="mt-4 space-y-2">
        <Label htmlFor="gr-keep">{copy.keepDays}</Label>
        <Select
          value={String(form.keepDays)}
          onValueChange={(v) => setForm((f) => ({ ...f, keepDays: Number(v) as KeepDays }))}
        >
          <SelectTrigger id="gr-keep" className="h-11 sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KEEP_DAY_CHOICES.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {copy.keepDaysOption(n)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="mt-4 rounded-xl bg-muted p-3 text-sm">
        {uk ? copy.lawNoteUk : copy.lawNoteElsewhere}
      </p>
    </section>
  );
}
