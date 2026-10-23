import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SaveButton, changed } from "@/components/host/SaveButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { adminCopy as copy, common } from "@/content/copy";
import { getKioskSaverDefaults, saveKioskSaverDefaults } from "@/lib/admin.functions";
import { BRIGHTNESS, DEFAULT_SAVER, SIZE, TIMING, glow, normaliseDefaults, type SaverDefaults } from "@/lib/kiosk-saver";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Super admin: where every kiosk's screensaver starts, how small or large
 * hosts may make its clocks, and the kiosk's timings.
 */
export function KioskSaverAdmin() {
  const fetchFn = useServerFn(getKioskSaverDefaults);
  const saveFn = useServerFn(saveKioskSaverDefaults);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["kiosk-saver-defaults"], queryFn: () => fetchFn() });
  const [form, setForm] = useState<SaverDefaults>(DEFAULT_SAVER);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setForm(q.data.defaults);
  }, [q.data]);

  // Moving one limit past the other, or the starting size outside them, is tidied as you go.
  const set = (patch: Partial<SaverDefaults>) => setForm((f) => normaliseDefaults({ ...f, ...patch }));

  async function save() {
    setBusy(true);
    try {
      await saveFn({ data: normaliseDefaults(form) });
      await qc.invalidateQueries({ queryKey: ["kiosk-saver-defaults"] });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  const row = (id: string, label: string, value: number, lo: number, hi: number, onValue: (v: number) => void) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-sm tabular-nums text-muted-foreground">{pct(value)}</span>
      </div>
      <Slider id={id} min={lo} max={hi} step={SIZE.step} value={[value]} onValueChange={([v]) => v !== undefined && onValue(v)} />
    </div>
  );

  // Typed freely, tidied (whole minutes, in range) when the field is left.
  const minutes = (id: string, label: string, key: "resetMinutes" | "saverMinutes" | "welcomeMinutes", lo: number, hi: number, help?: string) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={lo}
        max={hi}
        step={1}
        className="h-10 w-28"
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value === "" ? lo : Number(e.target.value) }))}
        onBlur={() => set({})}
      />
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-lg">
            <MonitorSmartphone className="size-5 text-primary" /> {copy.kioskSaverTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{copy.kioskSaverHelp}</p>
        </div>
        <SaveButton dirty={!!q.data?.available && changed(normaliseDefaults(form), q.data.defaults)} busy={busy} onClick={() => void save()} />
      </div>
      {q.data && !q.data.available ? <p className="text-sm text-muted-foreground">{copy.kioskSaverNotReady}</p> : null}
      <div className="grid gap-5 md:grid-cols-[1fr_14rem]">
        <div className="space-y-5">
          {row("ks-bright", copy.kioskSaverBrightness, form.brightness, BRIGHTNESS.min, BRIGHTNESS.max, (brightness) => set({ brightness }))}
          {row("ks-size", copy.kioskSaverSize, form.size, form.sizeMin, form.sizeMax, (size) => set({ size }))}
          {row("ks-min", copy.kioskSaverSizeMin, form.sizeMin, SIZE.min, SIZE.max, (sizeMin) => set({ sizeMin: Math.min(sizeMin, form.sizeMax) }))}
          {row("ks-max", copy.kioskSaverSizeMax, form.sizeMax, SIZE.min, SIZE.max, (sizeMax) => set({ sizeMax: Math.max(sizeMax, form.sizeMin) }))}
        </div>
        {/* How the screensaver's text and a clock hand look at these settings. */}
        <div className="grid place-items-center gap-2 rounded-xl bg-black p-4 text-center" aria-hidden>
          <svg viewBox="0 0 100 100" className="size-24">
            <circle cx="50" cy="50" r="47" fill="none" stroke="white" strokeOpacity={glow(0.22, form.brightness)} strokeWidth={0.8 * form.size} />
            <line x1="50" y1="50" x2="50" y2="27" stroke="white" strokeOpacity={glow(0.55, form.brightness)} strokeWidth={2.2 * form.size} strokeLinecap="round" transform="rotate(300 50 50)" />
            <line x1="50" y1="50" x2="50" y2="15" stroke="white" strokeOpacity={glow(0.45, form.brightness)} strokeWidth={1.2 * form.size} strokeLinecap="round" transform="rotate(60 50 50)" />
          </svg>
          <span className="uppercase tracking-[0.3em]" style={{ fontSize: `${0.7 * form.size}rem`, color: `rgb(255 255 255 / ${glow(0.28, form.brightness)})` }}>
            London
          </span>
        </div>
      </div>
      <div className="space-y-4 border-t border-border pt-4">
        <h3 className="font-medium">{copy.kioskTimingsTitle}</h3>
        {minutes("ks-reset", copy.kioskResetMinutes, "resetMinutes", TIMING.reset.min, TIMING.reset.max)}
        {minutes("ks-saver", copy.kioskSaverMinutes, "saverMinutes", form.resetMinutes, TIMING.saver.max, copy.kioskSaverMinutesHelp)}
        {minutes("ks-welcome", copy.kioskWelcomeMinutes, "welcomeMinutes", TIMING.welcome.min, TIMING.welcome.max, copy.kioskWelcomeMinutesHelp)}
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <h3 className="font-medium">{copy.kioskQrTitle}</h3>
        <p className="text-sm text-muted-foreground">{copy.kioskQrHelp}</p>
        <div role="radiogroup" aria-label={copy.kioskQrTitle} className="grid gap-2 sm:grid-cols-2">
          {(["panel", "icon"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={form.qrStyle === v}
              onClick={() => setForm((f) => ({ ...f, qrStyle: v }))}
              className={`rounded-xl border p-3 text-left text-sm transition-colors ${form.qrStyle === v ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-secondary"}`}
            >
              <span className="block font-medium">{copy.kioskQrStyles[v].label}</span>
              <span className="block text-muted-foreground">{copy.kioskQrStyles[v].help}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
