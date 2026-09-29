import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ChannelIcon } from "@/components/ChannelIcon";
import type { Channel } from "@/components/ChannelBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { channels, common, settings as copy } from "@/content/copy";
import { saveChannelLabels } from "@/lib/host.functions";

const LIST: Channel[] = ["airbnb", "booking_com", "homestay", "vrbo", "agoda", "direct", "other"];

/**
 * Hosts rename the platform buttons guests see ("Direct" → "Our website").
 * Only the wording changes: the id behind each one stays put, so calendar
 * matching and reports keep working.
 */
export function ChannelLabels({ hostId, labels }: { hostId: string; labels: Record<string, string> }) {
  const qc = useQueryClient();
  const save = useServerFn(saveChannelLabels);
  const [form, setForm] = useState<Record<string, string>>(() => ({ ...labels }));
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await save({ data: { hostId, labels: form } });
      await qc.invalidateQueries({ queryKey: ["workspace"] });
      toast.success(copy.channelsSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-3 p-5">
      <div>
        <h2 className="text-lg">{copy.channelsTitle}</h2>
        <p className="text-sm text-muted-foreground">{copy.channelsBody}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {LIST.map((c) => (
          <div key={c} className="flex items-center gap-3">
            <ChannelIcon channel={c} size={36} />
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor={`ch-${c}`} className="text-sm text-muted-foreground">{channels[c] ?? c}</Label>
              <Input
                id={`ch-${c}`}
                className="h-11"
                maxLength={40}
                placeholder={channels[c] ?? c}
                value={form[c] ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, [c]: e.target.value }))}
              />
            </div>
          </div>
        ))}
      </div>
      <Button type="button" onClick={submit} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {copy.save}
      </Button>
    </section>
  );
}
