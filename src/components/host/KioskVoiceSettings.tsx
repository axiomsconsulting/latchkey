import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Volume2 } from "lucide-react";
import { toast } from "sonner";

import { InfoTip } from "@/components/host/InfoTip";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { common, kioskVoiceCopy as copy } from "@/content/copy";
import { pingKiosk } from "@/lib/kiosk-ping";
import { normaliseTheme } from "@/lib/theme";
import { PHRASES, pickVoice, type VoiceGender } from "@/lib/voice-concierge";
import { getVoiceAccess, saveKioskVoice } from "@/lib/voice.functions";
import { cn } from "@/lib/utils";

/** Settings → Door tablets: the voice check-in concierge (Pro plan), its voice, and a sample. */
export function KioskVoiceSettings({
  property,
}: {
  property: { id: string; short_code: string; theme_config?: unknown };
}) {
  const accessFn = useServerFn(getVoiceAccess);
  const saveFn = useServerFn(saveKioskVoice);
  const qc = useQueryClient();
  const access = useQuery({
    queryKey: ["voice-access", property.id],
    queryFn: () => accessFn({ data: { propertyId: property.id } }),
  });
  const t = normaliseTheme(property.theme_config);
  const [on, setOn] = useState(t.kioskVoice);
  const [gender, setGender] = useState<VoiceGender>(t.kioskVoiceGender);
  const [busy, setBusy] = useState(false);
  const allowed = access.data?.allowed ?? false;

  async function save(next: { on: boolean; gender: VoiceGender }) {
    setBusy(true);
    try {
      const res = await saveFn({ data: { propertyId: property.id, ...next } });
      setOn(next.on);
      setGender(next.gender);
      await qc.invalidateQueries({ queryKey: ["workspace"] });
      void pingKiosk(res.code);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  function hear(g: VoiceGender) {
    if (!("speechSynthesis" in window)) {
      toast.error(copy.noVoices);
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(PHRASES.hello);
    const v = pickVoice(synth.getVoices(), g);
    if (v) u.voice = v;
    else u.pitch = g === "female" ? 1.15 : 0.85;
    synth.speak(u);
  }

  return (
    <section className="card-soft space-y-3 p-5">
      <h2 className="flex items-center gap-1 font-display text-xl">
        {copy.title}
        <InfoTip label={copy.title}>
          <div className="space-y-2">
            {copy.info.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </InfoTip>
      </h2>
      {access.data && !allowed ? (
        <p className="rounded-xl bg-muted p-3 text-sm">{copy.proOnly}</p>
      ) : null}
      <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
        <span className="font-medium">{copy.offer}</span>
        <Switch
          checked={on}
          disabled={busy || !allowed}
          onCheckedChange={(v) => void save({ on: v, gender })}
        />
      </label>
      <div role="radiogroup" aria-label={copy.voice} className="grid gap-2 sm:grid-cols-2">
        {(["female", "male"] as const).map((g) => (
          <div
            key={g}
            className={cn(
              "flex items-center justify-between gap-2 rounded-xl border p-3 text-sm",
              gender === g ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border",
            )}
          >
            <button
              type="button"
              role="radio"
              aria-checked={gender === g}
              disabled={busy || !allowed}
              className="flex-1 text-left font-medium disabled:opacity-60"
              onClick={() => void save({ on, gender: g })}
            >
              {copy.genders[g]}
            </button>
            <Button type="button" size="sm" variant="ghost" onClick={() => hear(g)}>
              <Volume2 className="size-4" /> {copy.hear}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
