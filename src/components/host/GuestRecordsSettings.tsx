import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { checkinSettings, common } from "@/content/copy";
import { KEEP_DAY_CHOICES, normaliseRecords, type GuestRecords, type KeepDays } from "@/lib/guest-records";
import { saveGuestRecords } from "@/lib/host.functions";

const copy = checkinSettings.records;

type Toggle = "askWhoIsStaying" | "checkEveryAdult" | "idPhoto" | "facePhoto";
const TOGGLES: Array<{ key: Toggle; photo: boolean }> = [
  { key: "askWhoIsStaying", photo: false },
  { key: "checkEveryAdult", photo: false },
  { key: "idPhoto", photo: true },
  { key: "facePhoto", photo: true },
];

/**
 * Per-property switches for who's staying and the ID records kept about
 * them. Photo options only take effect once the host confirms they are
 * registered with their data regulator.
 */
export function GuestRecordsSettings({ property }: { property: { id: string; guest_records?: unknown } }) {
  const [form, setForm] = useState<GuestRecords>(() => normaliseRecords(property.guest_records));
  const [busy, setBusy] = useState(false);
  const save = useServerFn(saveGuestRecords);
  const qc = useQueryClient();

  useEffect(() => setForm(normaliseRecords(property.guest_records)), [property.id, property.guest_records]);

  async function onSave() {
    setBusy(true);
    try {
      await save({ data: { propertyId: property.id, records: form } });
      await qc.invalidateQueries({ queryKey: ["board"] });
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
        <div>
          <h2 className="text-xl">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
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

      <div className="mt-4 space-y-4">
        {TOGGLES.map(({ key, photo }) => {
          const locked = photo && !form.regulatorConfirmed;
          return (
            <div key={key} className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
              <div>
                <Label htmlFor={`gr-${key}`} className="text-base">
                  {copy[key]}
                </Label>
                <p className="text-sm text-muted-foreground">{copy[`${key}Help`]}</p>
                {locked && form[key] ? <p className="mt-1 text-sm text-destructive">{copy.regulatorNeeded}</p> : null}
              </div>
              <Switch
                id={`gr-${key}`}
                checked={form[key] && !locked}
                disabled={locked}
                onCheckedChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="gr-keep">{copy.keepDays}</Label>
        <Select value={String(form.keepDays)} onValueChange={(v) => setForm((f) => ({ ...f, keepDays: Number(v) as KeepDays }))}>
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

      <p className="mt-4 rounded-xl bg-muted p-3 text-sm">{copy.lawNote}</p>

      <Button className="mt-4" onClick={onSave} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {common.save}
      </Button>
    </section>
  );
}
