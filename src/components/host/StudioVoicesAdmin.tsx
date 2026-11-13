import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, Mic, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { InfoTip } from "@/components/host/InfoTip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { common, studioVoicesCopy as copy } from "@/content/copy";
import {
  getStudioVoices,
  pickStudioVoice,
  recordStudioVoice,
  removeStudioVoices,
} from "@/lib/voice.functions";

/**
 * Latchkey admin → System: the voice concierge's studio voices. Paste an ElevenLabs API key,
 * pick a female and a male voice, and record every phrase once; door tablets then play the
 * recordings instead of their own robotic-sounding voices.
 */
export function StudioVoicesAdmin() {
  const getFn = useServerFn(getStudioVoices);
  const pickFn = useServerFn(pickStudioVoice);
  const recordFn = useServerFn(recordStudioVoice);
  const removeFn = useServerFn(removeStudioVoices);
  const q = useQuery({ queryKey: ["studio-voices"], queryFn: () => getFn() });
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const d = q.data;

  async function act(which: string, fn: () => Promise<void>) {
    setBusy(which);
    try {
      await fn();
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function recordAll(gender: "female" | "male") {
    let left = 1;
    let done = 0;
    while (left > 0) {
      const r = await recordFn({ data: { gender } });
      done += r.done;
      left = r.left;
      setProgress(copy.recording(done, done + left));
      if (r.done === 0 && left > 0) break;
    }
    toast.success(copy.recorded);
  }

  return (
    <section className="card-soft space-y-4 p-5">
      <h2 className="flex items-center gap-1 font-display text-xl">
        {copy.title}
        <InfoTip label={copy.title}>{copy.info}</InfoTip>
      </h2>
      {d?.error ? <p className="text-sm text-destructive">{d.error}</p> : null}

      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <KeyRound className="size-4 shrink-0" aria-hidden />
        {d?.hasKey ? copy.keySaved : copy.key}
      </p>

      {d?.hasKey && d.voices.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(["female", "male"] as const).map((g) => {
            const chosen = d[g];
            const ready = d.done[g];
            return (
              <div key={g} className="space-y-2 rounded-xl border border-border p-3 text-sm">
                <p className="font-medium">{copy.genders[g]}</p>
                <Select
                  value={chosen?.voiceId ?? ""}
                  onValueChange={(id) => {
                    const v = d.voices.find((x) => x.id === id);
                    if (v)
                      void act(`pick-${g}`, async () => {
                        await pickFn({ data: { gender: g, voiceId: v.id, name: v.name } });
                      });
                  }}
                >
                  <SelectTrigger aria-label={copy.genders[g]}>
                    <SelectValue placeholder={copy.pick} />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {d.voices
                      .filter((v) => !v.gender || v.gender === g)
                      .map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                          {v.accent ? ` · ${v.accent}` : ""}
                          {v.description ? ` · ${v.description}` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{copy.count(ready, d.total)}</p>
                <Button
                  size="sm"
                  disabled={busy !== null || !chosen || ready === d.total}
                  onClick={() => void act(`rec-${g}`, () => recordAll(g))}
                >
                  {busy === `rec-${g}` ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : ready === d.total ? (
                    <Play className="size-4" />
                  ) : (
                    <Mic className="size-4" />
                  )}
                  {busy === `rec-${g}` && progress
                    ? progress
                    : ready === d.total
                      ? copy.allRecorded
                      : copy.record}
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}

      {d?.hasKey ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={busy !== null}
          onClick={() => {
            if (!window.confirm(copy.removeConfirm)) return;
            void act("remove", async () => {
              await removeFn();
            });
          }}
        >
          <Trash2 className="size-4" /> {copy.remove}
        </Button>
      ) : null}
    </section>
  );
}
