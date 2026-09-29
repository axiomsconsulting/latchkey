import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { LogoMark } from "@/components/theme/LogoMark";
import { ThemeScope } from "@/components/theme/ThemeScope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { common, themeStudio as copy } from "@/content/copy";
import { saveTheme, uploadBrandAsset } from "@/lib/services.functions";
import { FONT_CHOICES, THEME_PRESETS, normaliseTheme, type LogoPreset, type ThemeConfig } from "@/lib/theme";
import { cn } from "@/lib/utils";

const LOGOS: LogoPreset[] = ["key", "arch", "fern", "knot", "lantern", "monogram"];
const COLOUR_KEYS = ["primary", "accent", "background", "surface", "foreground"] as const;

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("That file couldn't be read."));
    r.readAsDataURL(file);
  });
}

export function ThemeStudio({ property }: { property: { id: string; name: string; short_code: string; theme_config: unknown } }) {
  const qc = useQueryClient();
  const save = useServerFn(saveTheme);
  const upload = useServerFn(uploadBrandAsset);
  const [theme, setTheme] = useState<ThemeConfig>(() => normaliseTheme(property.theme_config));
  const [slug, setSlug] = useState(property.short_code);
  const [busy, setBusy] = useState<null | "save" | "logo" | "font">(null);

  useEffect(() => {
    setTheme(normaliseTheme(property.theme_config));
    setSlug(property.short_code);
  }, [property.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof ThemeConfig>(k: K, v: ThemeConfig[K]) => setTheme((t) => ({ ...t, [k]: v }));

  async function onUpload(kind: "logo" | "font", file: File | undefined) {
    if (!file) return;
    setBusy(kind);
    try {
      const dataUrl = await readFile(file);
      const { url } = await upload({ data: { propertyId: property.id, kind, filename: file.name, dataUrl } });
      if (kind === "logo") set("logoUrl", url);
      else {
        const name = file.name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9 ]/g, " ").trim().slice(0, 40) || "Custom";
        setTheme((t) => ({ ...t, customFontUrl: url, customFontName: name }));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setBusy("save");
    try {
      await save({ data: { propertyId: property.id, theme, shortCode: slug } });
      await qc.invalidateQueries({ queryKey: ["workspace"] });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <section className="card-soft p-5">
      <h2 className="text-lg">{copy.title}</h2>
      <p className="text-sm text-muted-foreground">{copy.subtitle}</p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-base">{copy.presets}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {THEME_PRESETS.map((p) => (
                <button
                  key={p.presetId}
                  type="button"
                  onClick={() => setTheme({ ...p, logoUrl: theme.logoUrl, customFontUrl: null, customFontName: null })}
                  className={cn(
                    "spring rounded-2xl border p-3 text-left active:scale-95",
                    theme.presetId === p.presetId ? "border-primary ring-2 ring-primary" : "border-border",
                  )}
                  style={{ background: p.background, color: p.foreground }}
                >
                  <span className="flex gap-1">
                    {[p.primary, p.accent, p.surface].map((c) => (
                      <span key={c} className="size-5 rounded-full border border-black/10" style={{ background: c }} />
                    ))}
                  </span>
                  <span className="mt-2 block text-sm font-semibold" style={{ fontFamily: p.headingFont }}>{p.name}</span>
                  <span className="block text-xs opacity-70">{p.blurb}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-base">{copy.colours}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {COLOUR_KEYS.map((k) => (
                <label key={k} className="flex flex-col gap-1 text-sm">
                  {copy[k]}
                  <input
                    type="color"
                    value={theme[k]}
                    onChange={(e) => set(k, e.target.value)}
                    className="h-12 w-full cursor-pointer rounded-xl border border-border bg-transparent"
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-base">{copy.fonts}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["headingFont", "bodyFont"] as const).map((k) => (
                <div key={k} className="space-y-1">
                  <Label>{k === "headingFont" ? copy.heading : copy.body}</Label>
                  <Select value={theme[k]} onValueChange={(v) => set(k, v)}>
                    <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FONT_CHOICES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <label className="mt-3 flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-4 text-sm">
              {busy === "font" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {theme.customFontName ? `Using “${theme.customFontName}” for headings` : copy.uploadFont}
              <input type="file" accept=".ttf,.otf,.woff,.woff2" className="sr-only" onChange={(e) => onUpload("font", e.target.files?.[0])} />
            </label>
            {theme.customFontName ? (
              <Button variant="link" className="px-0" onClick={() => setTheme((t) => ({ ...t, customFontName: null, customFontUrl: null }))}>
                Stop using uploaded font
              </Button>
            ) : null}
          </div>

          <div>
            <h3 className="mb-2 text-base">{copy.logo}</h3>
            <div className="flex flex-wrap gap-2">
              {LOGOS.map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-label={l}
                  aria-pressed={!theme.logoUrl && theme.logoPreset === l}
                  onClick={() => setTheme((t) => ({ ...t, logoPreset: l, logoUrl: null }))}
                  className={cn("spring rounded-2xl p-1 active:scale-90", !theme.logoUrl && theme.logoPreset === l ? "ring-2 ring-primary" : "")}
                >
                  <ThemeScope theme={theme} className="rounded-xl bg-transparent">
                    <LogoMark theme={{ logoPreset: l, logoUrl: null }} name={property.name} className="size-12" />
                  </ThemeScope>
                </button>
              ))}
              <label className="flex size-14 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-border" aria-label={copy.uploadLogo}>
                {busy === "logo" ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
                <input type="file" accept=".png,.jpg,.jpeg,.webp,.svg" className="sr-only" onChange={(e) => onUpload("logo", e.target.files?.[0])} />
              </label>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-base">{copy.corners}</h3>
            <Slider min={0} max={2} step={0.125} value={[theme.radius]} onValueChange={([v]) => set("radius", v ?? 1)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="slug">{copy.link}</Label>
            <div className="flex items-center gap-1 rounded-xl border border-input bg-surface pl-3">
              <span className="truncate text-sm text-muted-foreground">{origin}/</span>
              <Input id="slug" className="h-12 border-0 shadow-none" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
            </div>
            <p className="text-xs text-muted-foreground">{copy.linkHelp}</p>
          </div>

          <Button onClick={submit} disabled={busy !== null}>
            {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {copy.save}
          </Button>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-sm font-medium text-muted-foreground">{copy.preview}</p>
          <ThemeScope theme={theme} className="overflow-hidden rounded-3xl border border-border shadow-lifted">
            <div className="space-y-4 p-5" style={{ borderRadius: "var(--radius)" }}>
              <div className="flex items-center gap-3">
                <LogoMark theme={theme} name={property.name} />
                <span className="font-display text-lg">{property.name}</span>
              </div>
              <h3 className="text-2xl">Welcome. Let's get you checked in.</h3>
              <div className="grid grid-cols-6 gap-1">
                {"ABCDEF".split("").map((l) => (
                  <span key={l} className="grid h-10 place-items-center bg-card text-sm font-semibold shadow-soft" style={{ borderRadius: "var(--radius)" }}>{l}</span>
                ))}
              </div>
              <div className="bg-card p-4 shadow-soft" style={{ borderRadius: "var(--radius)" }}>
                <p className="font-display">Wi-Fi</p>
                <p className="text-sm text-muted-foreground">TrinityGuest · password on your card</p>
              </div>
              <span className="flex h-12 items-center justify-center bg-primary font-medium text-primary-foreground" style={{ borderRadius: "var(--radius)" }}>
                Start check-in
              </span>
              <span className="flex h-10 items-center justify-center bg-accent text-sm font-medium text-accent-foreground" style={{ borderRadius: "var(--radius)" }}>
                Order breakfast · £12
              </span>
            </div>
          </ThemeScope>
        </div>
      </div>
    </section>
  );
}
