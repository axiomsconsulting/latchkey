import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ConciergeBell } from "lucide-react";
import { toast } from "sonner";

import { InfoTip } from "@/components/host/InfoTip";
import { SaveButton, changed } from "@/components/host/SaveButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { common, receptionistAdminCopy as copy } from "@/content/copy";
import { TOPICS, type Receptionist } from "@/lib/receptionist";
import { getReceptionist, saveReceptionist } from "@/lib/receptionist.functions";
import { cn } from "@/lib/utils";

/** Settings → Door tablets → AI receptionist (receptionist.ts). Tablets are chosen on each tablet's card. */
export function ReceptionistSettings({ propertyId }: { propertyId: string }) {
  const getFn = useServerFn(getReceptionist);
  const saveFn = useServerFn(saveReceptionist);
  const qc = useQueryClient();
  const key = ["receptionist", propertyId];
  const q = useQuery({ queryKey: key, queryFn: () => getFn({ data: { propertyId } }) });
  const [s, setS] = useState<Receptionist | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setS(q.data.settings);
  }, [q.data]);
  if (q.isLoading || !q.data || !s) return <Skeleton className="h-32 rounded-2xl" />;
  const d = q.data;
  const dirty = changed(s, d.settings);
  const set = (patch: Partial<Receptionist>) => setS((x) => (x ? { ...x, ...patch } : x));
  const locked = !d.allowed;

  async function save() {
    setBusy(true);
    try {
      await saveFn({ data: { propertyId, settings: s as never } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: key }),
        qc.invalidateQueries({ queryKey: ["kiosk-devices"] }),
      ]);
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
            <ConciergeBell className="size-5 text-primary" /> {copy.title}
            <InfoTip label={copy.title}>{copy.safety}</InfoTip>
          </h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <SaveButton dirty={dirty} busy={busy} onClick={() => void save()} />
      </div>
      {!d.available ? <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p> : null}
      {locked ? <p className="rounded-xl bg-muted p-3 text-sm">{copy.notAllowed}</p> : null}

      <fieldset disabled={locked || !d.available} className="space-y-4 disabled:opacity-60">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
          <span className="font-medium">{copy.on}</span>
          <Switch checked={s.on} onCheckedChange={(on) => set({ on })} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
          <span>
            <span className="block font-medium">{copy.phones}</span>
            <span className="block text-sm text-muted-foreground">{copy.phonesHelp}</span>
          </span>
          <Switch checked={s.guestPhones} onCheckedChange={(guestPhones) => set({ guestPhones })} />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="rc-name">{copy.name}</Label>
            <Input
              id="rc-name"
              value={s.name}
              maxLength={30}
              placeholder={copy.namePlaceholder}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>{copy.voice}</Label>
            <div className="flex gap-2" role="radiogroup" aria-label={copy.voice}>
              {(["female", "male"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={s.voice === v}
                  onClick={() => set({ voice: v })}
                  className={cn(
                    "h-11 flex-1 rounded-xl border text-sm",
                    s.voice === v ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  {copy.voices[v]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
          <span className="flex items-center gap-1 font-medium">
            {copy.match}
            <InfoTip label={copy.match}>{copy.matchHelp}</InfoTip>
          </span>
          <Switch
            checked={s.voiceMatch === "opposite"}
            onCheckedChange={(v) => set({ voiceMatch: v ? "opposite" : "fixed" })}
          />
        </label>
        {!d.studio ? <p className="text-xs text-muted-foreground">{copy.studioOff}</p> : null}

        <div className="space-y-2">
          <Label>{copy.topics}</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {TOPICS.map((t) => (
              <label
                key={t}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5 text-sm"
              >
                {copy.topicNames[t]}
                <Switch
                  checked={s.topics[t]}
                  onCheckedChange={(v) => set({ topics: { ...s.topics, [t]: v } })}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label>{copy.detail}</Label>
          <div className="flex gap-2" role="radiogroup" aria-label={copy.detail}>
            {(["brief", "normal", "detailed"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={s.detail === v}
                onClick={() => set({ detail: v })}
                className={cn(
                  "h-11 flex-1 rounded-xl border text-sm",
                  s.detail === v ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                {copy.details[v]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="rc-notes">{copy.notes}</Label>
          <Textarea
            id="rc-notes"
            rows={3}
            maxLength={1000}
            value={s.notes}
            placeholder={copy.notesPlaceholder}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </div>
      </fieldset>
    </section>
  );
}
