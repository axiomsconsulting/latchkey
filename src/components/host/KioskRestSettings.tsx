import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock3, Loader2, Moon, MonitorOff, QrCode } from "lucide-react";
import { toast } from "sonner";

import { NightGlow } from "@/components/guest/KioskNightLight";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { common, kioskRestCopy as copy } from "@/content/copy";
import { saveKioskRest } from "@/lib/kiosk.functions";
import { pingKiosk } from "@/lib/kiosk-ping";
import {
  DEFAULT_NIGHT_LOOK,
  NIGHT_MODES,
  NIGHT_PALETTES,
  NIGHT_PALETTE_KEYS,
  NIGHT_SPEED,
  normaliseRest,
  type KioskRest,
} from "@/lib/kiosk-rest";
import { cn } from "@/lib/utils";

type RestProperty = { id: string; short_code: string; kiosk_rest?: unknown; quiet_hours_start?: string | null; quiet_hours_end?: string | null };

/** Saves the choice and tells the property's kiosk at once (the realtime ping). */
function useSaveRest(property: RestProperty) {
  const save = useServerFn(saveKioskRest);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (rest: KioskRest, done: string) => {
    setBusy(true);
    try {
      await save({ data: { propertyId: property.id, rest } });
      await pingKiosk(property.short_code);
      await Promise.all([qc.invalidateQueries({ queryKey: ["board"] }), qc.invalidateQueries({ queryKey: ["workspace"] })]);
      toast.success(done);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

const hhmm = (t: string | null | undefined, fallback: string) => (t ? t.slice(0, 5) : fallback);

/** A choice tile: bordered, ringed when picked. */
const tile = (on: boolean) =>
  cn(
    "rounded-xl border text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    on ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-secondary",
  );

/**
 * Properties → Kiosk at rest: the night light (style, colours, speed, when),
 * what shows otherwise (clock screensaver or nothing) and the QR code on the
 * clock screensaver. Every style and colour is previewed live, sped up.
 */
export function KioskRestSettings({ property }: { property: RestProperty }) {
  const [rest, setRest] = useState<KioskRest>(() => normaliseRest(property.kiosk_rest));
  useEffect(() => setRest(normaliseRest(property.kiosk_rest)), [property.id, property.kiosk_rest]);
  const { busy, run } = useSaveRest(property);
  const set = (patch: Partial<KioskRest>) => setRest((r) => ({ ...r, ...patch }));
  const quiet = { start: hhmm(property.quiet_hours_start, "22:00"), end: hhmm(property.quiet_hours_end, "07:00") };

  return (
    <section className="card-soft p-5">
      <h2 className="text-xl">{copy.title}</h2>
      <p className="text-sm text-muted-foreground">{copy.body}</p>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
            <div>
              <Label htmlFor="kr-night" className="flex items-center gap-2 text-base">
                <Moon className="size-4 text-primary" /> {copy.nightLight}
              </Label>
              <p className="text-sm text-muted-foreground">{copy.nightLightHelp}</p>
            </div>
            <Switch id="kr-night" checked={rest.nightLight} onCheckedChange={(v) => set({ nightLight: v })} />
          </div>

          {rest.nightLight ? (
            <>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{copy.when}</legend>
                <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
                  {(["always", "quiet"] as const).map((w) => (
                    <button key={w} type="button" role="radio" aria-checked={rest.nightWhen === w} onClick={() => set({ nightWhen: w })} className={cn(tile(rest.nightWhen === w), "p-3")}>
                      <span className="block font-medium">{copy.whenOptions[w]}</span>
                      {w === "quiet" ? <span className="block text-muted-foreground">{copy.quietBetween(quiet.start, quiet.end)}</span> : null}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{copy.style}</legend>
                <div role="radiogroup" className="grid grid-cols-3 gap-2">
                  {NIGHT_MODES.map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={rest.mode === m} onClick={() => set({ mode: m })} className={cn(tile(rest.mode === m), "flex flex-col justify-start overflow-hidden")}>
                      <span className="relative block aspect-[4/3]">
                        <NightGlow rest={{ ...rest, mode: m }} depth={DEFAULT_NIGHT_LOOK.depth} brightness={DEFAULT_NIGHT_LOOK.brightness} />
                      </span>
                      <span className="block px-2.5 py-2">
                        <span className="block font-medium">{copy.modes[m].label}</span>
                        <span className="block text-xs text-muted-foreground">{copy.modes[m].help}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{copy.colours}</legend>
                <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {NIGHT_PALETTE_KEYS.map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={rest.palette === k} onClick={() => set({ palette: k })} className={cn(tile(rest.palette === k), "p-2")}>
                      <span className="block h-8 rounded-lg" style={{ background: `linear-gradient(90deg, ${NIGHT_PALETTES[k].join(", ")})` }} />
                      <span className="mt-1.5 block font-medium">{copy.palettes[k]}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="space-y-2">
                <Label htmlFor="kr-speed" className="flex items-baseline justify-between text-sm font-medium">
                  {copy.speed} <span className="font-normal text-muted-foreground">{copy.speedValue(rest.speed)}</span>
                </Label>
                <input
                  id="kr-speed"
                  type="range"
                  min={NIGHT_SPEED.min}
                  max={NIGHT_SPEED.max}
                  step={1}
                  value={rest.speed}
                  onChange={(e) => set({ speed: Number(e.target.value) })}
                  className="h-11 w-full accent-[var(--primary)]"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{copy.speedEnds[0]}</span>
                  <span>{copy.speedEnds[1]}</span>
                </div>
              </div>
            </>
          ) : null}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{rest.nightLight ? (rest.nightWhen === "quiet" ? copy.otherwiseQuiet : copy.otherwiseOff) : copy.otherwise}</legend>
            <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
              {(["clock", "blank"] as const).map((o) => (
                <button key={o} type="button" role="radio" aria-checked={rest.otherwise === o} onClick={() => set({ otherwise: o })} className={cn(tile(rest.otherwise === o), "flex items-start gap-3 p-3")}>
                  {o === "clock" ? <Clock3 className="mt-0.5 size-5 text-primary" /> : <MonitorOff className="mt-0.5 size-5 text-primary" />}
                  <span>
                    <span className="block font-medium">{copy.otherwiseOptions[o].label}</span>
                    <span className="block text-muted-foreground">{copy.otherwiseOptions[o].help}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
            <div>
              <Label htmlFor="kr-qr" className="flex items-center gap-2 text-base">
                <QrCode className="size-4 text-primary" /> {copy.clockQr}
              </Label>
              <p className="text-sm text-muted-foreground">{copy.clockQrHelp}</p>
            </div>
            <Switch id="kr-qr" checked={rest.clockQr} onCheckedChange={(v) => set({ clockQr: v })} />
          </div>
        </div>

        {/* The night light as it will look (sped up), or what shows instead. */}
        <aside className="space-y-2">
          <p className="text-sm font-medium">{copy.preview}</p>
          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-black lg:aspect-[3/4]">
            {rest.nightLight ? (
              <NightGlow rest={rest} depth={DEFAULT_NIGHT_LOOK.depth} brightness={DEFAULT_NIGHT_LOOK.brightness} />
            ) : (
              <div className="grid size-full place-items-center text-center text-sm text-white/60">
                <span className="space-y-2">
                  {rest.otherwise === "clock" ? <Clock3 className="mx-auto size-10" /> : <MonitorOff className="mx-auto size-10" />}
                  <span className="block">{copy.otherwiseOptions[rest.otherwise].label}</span>
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{copy.bandsNote}</p>
        </aside>
      </div>

      <Button className="mt-5" disabled={busy} onClick={() => void run(rest, copy.saved)}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null} {common.save}
      </Button>
    </section>
  );
}

/**
 * Today's kiosk card: switch what the kiosk shows at rest straight away
 * (night light, clocks or screen off). Turning the night light on lights an
 * idle kiosk at once; any touch still wakes it, ready to check in.
 */
export function KioskRestQuick({ property }: { property: RestProperty }) {
  const rest = normaliseRest(property.kiosk_rest);
  const { busy, run } = useSaveRest(property);
  const now: "night" | "clock" | "blank" = rest.nightLight ? "night" : rest.otherwise;
  const options = [
    { key: "night" as const, icon: Moon, next: { ...rest, nightLight: true } },
    { key: "clock" as const, icon: Clock3, next: { ...rest, nightLight: false, otherwise: "clock" as const } },
    { key: "blank" as const, icon: MonitorOff, next: { ...rest, nightLight: false, otherwise: "blank" as const } },
  ];
  const quiet = { start: hhmm(property.quiet_hours_start, "22:00"), end: hhmm(property.quiet_hours_end, "07:00") };
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-sm font-medium">{copy.quickTitle}</p>
      <div role="radiogroup" aria-label={copy.quickTitle} className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {options.map(({ key, icon: Icon, next }) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={now === key}
            disabled={busy}
            onClick={() => (now === key ? undefined : void run(next, copy.quickDone[key]))}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors disabled:opacity-60",
              now === key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {busy && now !== key ? null : <Icon className="size-4" />} {copy.quick[key]}
          </button>
        ))}
      </div>
      {rest.nightLight && rest.nightWhen === "quiet" ? (
        <p className="text-xs text-muted-foreground">{copy.quickQuiet(quiet.start, quiet.end, copy.quick[rest.otherwise])}</p>
      ) : null}
    </div>
  );
}
