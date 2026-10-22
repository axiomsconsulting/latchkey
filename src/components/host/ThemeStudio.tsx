import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ImagePlus, KeyRound, Loader2, Save, Tablet, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { NAV_ICONS } from "@/components/NavIcon";
import { BrandBlock, ThemeBackdrop, ThemeFeatures, ThemeFooter, ThemeSideNotes } from "@/components/theme/ThemeDecor";
import { LogoMark } from "@/components/theme/LogoMark";
import { ThemeScope } from "@/components/theme/ThemeScope";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { common, themeStudio as copy } from "@/content/copy";
import { useWorkspace } from "@/hooks/use-host-data";
import { saveTheme, uploadBrandAsset } from "@/lib/services.functions";
import { ARTWORKS, FONT_CHOICES, LOGO_PRESETS, PILL, THEME_PRESETS, normaliseTheme, welcomeTitle, type ThemeConfig } from "@/lib/theme";
import { deleteThemeTemplate, listThemeTemplates, saveThemeTemplate } from "@/lib/theme-templates.functions";
import { cn } from "@/lib/utils";

const COLOUR_KEYS = ["primary", "accent", "background", "surface", "foreground"] as const;

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("That file couldn't be read."));
    r.readAsDataURL(file);
  });
}

/** One labelled choice from a short list. */
function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** A labelled slider with its value shown. */
function Range({ label, value, min, max, step, shown, onChange }: { label: string; value: number; min: number; max: number; step: number; shown: string; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <Label>{label}</Label>
        <span className="tabular-nums text-muted-foreground">{shown}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => v !== undefined && onChange(v)} />
    </div>
  );
}

function Group({ value, title, children }: { value: string; title: string; children: ReactNode }) {
  return (
    <AccordionItem value={value} className="rounded-2xl border border-border px-4">
      <AccordionTrigger className="text-base hover:no-underline">{title}</AccordionTrigger>
      <AccordionContent className="space-y-4 pb-4">{children}</AccordionContent>
    </AccordionItem>
  );
}

/** A small swatch card for a template in the gallery. */
function TemplateCard({ name, blurb, t, selected, badge, onPick, onDelete }: { name: string; blurb: string; t: ThemeConfig; selected: boolean; badge?: string; onPick: () => void; onDelete?: () => void }) {
  return (
    <div className={cn("relative rounded-2xl border p-3 text-left", selected ? "border-primary ring-2 ring-primary" : "border-border")} style={{ background: t.background, color: t.foreground }}>
      <button type="button" onClick={onPick} className="block w-full text-left">
        <span className="flex items-center gap-1">
          {[t.primary, t.accent, t.surface].map((c, i) => (
            <span key={i} className="size-5 border border-black/10" style={{ background: c, borderRadius: t.radius === 0 ? 0 : 9999 }} />
          ))}
          <span className="ml-auto h-5 px-2 text-[10px] leading-5" style={{ background: t.buttonColour === "accent" ? t.accent : t.primary, color: "#fff", borderRadius: t.buttonRadius === PILL ? 9999 : `${t.buttonRadius}rem`, textTransform: t.buttonCase === "upper" ? "uppercase" : "none" }}>
            Aa
          </span>
        </span>
        <span className="mt-2 block text-sm font-semibold" style={{ fontFamily: t.headingFont, textTransform: t.headingCase === "upper" ? "uppercase" : "none", letterSpacing: `${t.headingTracking}em` }}>
          {name}
        </span>
        <span className="block text-xs opacity-70">{blurb}</span>
      </button>
      {badge ? <Badge variant="secondary" className="absolute right-2 top-9 text-[10px]">{badge}</Badge> : null}
      {onDelete ? (
        <button type="button" onClick={onDelete} aria-label={`${copy.deleteTemplate} ${name}`} className="absolute bottom-2 right-2 grid size-7 place-items-center rounded-full opacity-60 hover:bg-black/10 hover:opacity-100">
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * A property's whole look for guests: colours, type, shapes, icons,
 * backdrop, logo and photo, and the words on its welcome screens. Start from
 * a template (built in, shared, or your own), change anything, and save any
 * look as a template for later or (Latchkey admin) for every host.
 */
export function ThemeStudio({ property }: { property: { id: string; name: string; short_code: string; theme_config: unknown } }) {
  const qc = useQueryClient();
  const save = useServerFn(saveTheme);
  const upload = useServerFn(uploadBrandAsset);
  const listFn = useServerFn(listThemeTemplates);
  const saveTplFn = useServerFn(saveThemeTemplate);
  const deleteTplFn = useServerFn(deleteThemeTemplate);
  const hostId = useWorkspace().data?.hostId ?? "";
  const templates = useQuery({ queryKey: ["theme-templates", hostId], enabled: !!hostId, queryFn: () => listFn({ data: { hostId } }) });
  const [theme, setTheme] = useState<ThemeConfig>(() => normaliseTheme(property.theme_config));
  const [slug, setSlug] = useState(property.short_code);
  const [busy, setBusy] = useState<null | "save" | "logo" | "font" | "cover" | "template">(null);
  const [tplName, setTplName] = useState("");
  const [share, setShare] = useState(false);
  const [googleFont, setGoogleFont] = useState("");

  useEffect(() => {
    setTheme(normaliseTheme(property.theme_config));
    setSlug(property.short_code);
  }, [property.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof ThemeConfig>(k: K, v: ThemeConfig[K]) => setTheme((t) => ({ ...t, [k]: v }));
  // A template keeps this property's own logo and photo.
  // A template changes the look, never the logo the host chose.
  const pickTemplate = (t: ThemeConfig) => setTheme({ ...t, logoPreset: theme.logoPreset, logoUrl: theme.logoUrl ?? t.logoUrl, coverImageUrl: theme.coverImageUrl ?? t.coverImageUrl });

  async function onUpload(kind: "logo" | "font" | "cover", file: File | undefined) {
    if (!file) return;
    setBusy(kind);
    try {
      const dataUrl = await readFile(file);
      const { url } = await upload({ data: { propertyId: property.id, kind, filename: file.name, dataUrl } });
      if (kind === "logo") set("logoUrl", url);
      else if (kind === "cover") set("coverImageUrl", url);
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

  async function saveTemplate() {
    if (!tplName.trim() || !hostId) return;
    setBusy("template");
    try {
      await saveTplFn({ data: { hostId, name: tplName.trim(), blurb: "", theme, share } });
      setTplName("");
      await templates.refetch();
      toast.success(share ? copy.templateShared : copy.templateSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  const fonts = [...new Set([...FONT_CHOICES, theme.headingFont, theme.bodyFont])];
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const tpl = templates.data?.templates ?? [];

  return (
    <section className="card-soft p-5">
      <h2 className="text-lg">{copy.title}</h2>
      <p className="text-sm text-muted-foreground">{copy.subtitle}</p>

      <div className="mt-5 grid gap-6 xl:grid-cols-[1fr_minmax(0,30rem)]">
        <div className="space-y-6">
          {/* Templates: built in, shared by Latchkey, and the host's own. */}
          <div>
            <h3 className="mb-2 text-base">{copy.presets}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {THEME_PRESETS.map((p) => (
                <TemplateCard key={p.presetId} name={p.name} blurb={p.blurb} t={p} selected={theme.presetId === p.presetId} onPick={() => pickTemplate({ ...p, customFontUrl: null, customFontName: null })} />
              ))}
              {tpl.map((x) => (
                <TemplateCard
                  key={x.id}
                  name={x.name}
                  blurb={x.blurb}
                  t={x.theme}
                  selected={theme.presetId === x.theme.presetId}
                  badge={x.shared ? copy.sharedBadge : copy.yoursBadge}
                  onPick={() => pickTemplate(x.theme)}
                  {...(!x.shared || templates.data?.superAdmin
                    ? { onDelete: () => void deleteTplFn({ data: { id: x.id } }).then(() => templates.refetch()).catch((e: unknown) => toast.error(e instanceof Error ? e.message : common.errorBody)) }
                    : {})}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border p-3">
              <Input className="h-10 min-w-0 flex-1" maxLength={60} placeholder={copy.templateName} value={tplName} onChange={(e) => setTplName(e.target.value)} />
              {templates.data?.superAdmin ? (
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={share} onCheckedChange={setShare} /> {copy.shareTemplate}
                </label>
              ) : null}
              <Button variant="outline" disabled={!tplName.trim() || busy !== null || !templates.data?.available} onClick={() => void saveTemplate()}>
                {busy === "template" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {copy.saveTemplate}
              </Button>
              <p className="w-full text-xs text-muted-foreground">{templates.data && !templates.data.available ? copy.templatesNotReady : copy.templateHelp}</p>
            </div>
          </div>

          <Accordion type="multiple" defaultValue={["colours"]} className="space-y-2">
            <Group value="colours" title={copy.colours}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {COLOUR_KEYS.map((k) => (
                  <label key={k} className="flex flex-col gap-1 text-sm">
                    {copy[k]}
                    <input type="color" value={theme[k]} onChange={(e) => set(k, e.target.value)} className="h-12 w-full cursor-pointer rounded-xl border border-border bg-transparent" />
                  </label>
                ))}
              </div>
              <Choice label={copy.background_style} value={theme.backgroundStyle} options={[["plain", copy.plain], ["gradient", copy.gradient]]} onChange={(v) => set("backgroundStyle", v)} />
            </Group>

            <Group value="type" title={copy.fonts}>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["headingFont", "bodyFont"] as const).map((k) => (
                  <div key={k} className="space-y-1">
                    <Label>{k === "headingFont" ? copy.heading : copy.body}</Label>
                    <Select value={theme[k]} onValueChange={(v) => set(k, v)}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-80">
                        {fonts.map((f) => (
                          <SelectItem key={f} value={f}><span style={{ fontFamily: f }}>{f}</span></SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <Label htmlFor="gf">{copy.anyGoogleFont}</Label>
                  <Input id="gf" className="h-10" placeholder="e.g. Cormorant Infant" value={googleFont} onChange={(e) => setGoogleFont(e.target.value.replace(/[^A-Za-z0-9 ]/g, ""))} />
                </div>
                <Button variant="outline" size="sm" className="h-10" disabled={googleFont.trim().length < 2} onClick={() => { set("headingFont", googleFont.trim()); setGoogleFont(""); }}>{copy.useForHeadings}</Button>
                <Button variant="outline" size="sm" className="h-10" disabled={googleFont.trim().length < 2} onClick={() => { set("bodyFont", googleFont.trim()); setGoogleFont(""); }}>{copy.useForText}</Button>
              </div>
              <p className="text-xs text-muted-foreground">{copy.googleFontHelp}</p>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-4 text-sm">
                {busy === "font" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {theme.customFontName ? copy.usingFont(theme.customFontName) : copy.uploadFont}
                <input type="file" accept=".ttf,.otf,.woff,.woff2" className="sr-only" onChange={(e) => onUpload("font", e.target.files?.[0])} />
              </label>
              {theme.customFontName ? (
                <Button variant="link" className="px-0" onClick={() => setTheme((t) => ({ ...t, customFontName: null, customFontUrl: null }))}>{copy.stopFont}</Button>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-3">
                <Choice label={copy.headingCase} value={theme.headingCase} options={[["normal", copy.caseNormal], ["upper", copy.caseUpper], ["smallcaps", copy.caseSmall]]} onChange={(v) => set("headingCase", v)} />
                <Range label={copy.tracking} value={theme.headingTracking} min={0} max={0.3} step={0.01} shown={`${Math.round(theme.headingTracking * 100)}`} onChange={(v) => set("headingTracking", v)} />
                <Range label={copy.weight} value={theme.headingWeight} min={300} max={900} step={100} shown={String(theme.headingWeight)} onChange={(v) => set("headingWeight", v)} />
              </div>
            </Group>

            <Group value="shapes" title={copy.corners}>
              <Range label={copy.cardCorners} value={theme.radius} min={0} max={2} step={0.125} shown={theme.radius === 0 ? copy.square : `${theme.radius}`} onChange={(v) => set("radius", v)} />
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Range label={copy.buttonCorners} value={theme.buttonRadius === PILL ? 2 : theme.buttonRadius} min={0} max={2} step={0.125} shown={theme.buttonRadius === PILL ? copy.pill : theme.buttonRadius === 0 ? copy.square : `${theme.buttonRadius}`} onChange={(v) => set("buttonRadius", v)} />
                </div>
                <label className="flex items-center gap-2 pb-0.5 text-sm">
                  <Switch checked={theme.buttonRadius === PILL} onCheckedChange={(v) => set("buttonRadius", v ? PILL : 1)} /> {copy.pill}
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Choice label={copy.buttonFill} value={theme.buttonFill} options={[["solid", copy.solid], ["gradient", copy.gradient], ["outline", copy.outlined]]} onChange={(v) => set("buttonFill", v)} />
                <Choice label={copy.buttonColour} value={theme.buttonColour} options={[["primary", copy.primary], ["accent", copy.accent]]} onChange={(v) => set("buttonColour", v)} />
                <Choice label={copy.buttonCase} value={theme.buttonCase} options={[["normal", copy.caseNormal], ["upper", copy.caseUpper]]} onChange={(v) => set("buttonCase", v)} />
              </div>
              <Choice label={copy.cardStyle} value={theme.cardStyle} options={[["shadow", copy.shadow], ["outline", copy.outlined], ["flat", copy.flat]]} onChange={(v) => set("cardStyle", v)} />
            </Group>

            <Group value="icons" title={copy.icons}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Range label={copy.iconWeight} value={theme.iconStroke} min={1} max={2.75} step={0.25} shown={theme.iconStroke.toFixed(2)} onChange={(v) => set("iconStroke", v)} />
                <Choice label={copy.iconColour} value={theme.iconTone} options={[["primary", copy.primary], ["accent", copy.accent], ["foreground", copy.foreground]]} onChange={(v) => set("iconTone", v)} />
                <Choice label={copy.iconFrame} value={theme.iconFrame} options={[["none", copy.none], ["circle", copy.circle], ["square", copy.squareShape]]} onChange={(v) => set("iconFrame", v)} />
              </div>
            </Group>

            <Group value="backdrop" title={copy.backdrop}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice label={copy.artwork} value={theme.artwork} options={ARTWORKS.map((a) => [a, copy.artworks[a] ?? a])} onChange={(v) => set("artwork", v)} />
                <Choice label={copy.frame} value={theme.frame} options={[["none", copy.none], ["line", copy.lineFrame], ["ornate", copy.ornate]]} onChange={(v) => set("frame", v)} />
              </div>
              {theme.artwork !== "none" ? <Range label={copy.artworkStrength} value={theme.artworkOpacity} min={0.04} max={0.5} step={0.02} shown={`${Math.round(theme.artworkOpacity * 100)}%`} onChange={(v) => set("artworkOpacity", v)} /> : null}
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="block font-medium">{copy.headerBand}</span>
                  <span className="block text-xs text-muted-foreground">{copy.headerBandHelp}</span>
                </span>
                <Switch checked={theme.headerBand} onCheckedChange={(v) => set("headerBand", v)} />
              </label>
            </Group>

            <Group value="logo" title={copy.logo}>
              <p className="mb-2 text-xs text-muted-foreground">{copy.logoHelp}</p>
              <div className="flex flex-wrap gap-2">
                {LOGO_PRESETS.map((l) => (
                  <button key={l} type="button" aria-label={copy.logoNames[l] ?? l} title={copy.logoNames[l] ?? l} aria-pressed={!theme.logoUrl && theme.logoPreset === l} onClick={() => setTheme((t) => ({ ...t, logoPreset: l, logoUrl: null }))} className={cn("spring rounded-2xl p-1 active:scale-90", !theme.logoUrl && theme.logoPreset === l ? "ring-2 ring-primary" : "")}>
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
              <div className="space-y-2">
                <Label>{copy.cover}</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {theme.coverImageUrl ? <img src={theme.coverImageUrl} alt="" className="h-16 w-28 rounded-lg object-cover" /> : null}
                  <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 text-sm">
                    {busy === "cover" ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} {copy.uploadCover}
                    <input type="file" accept=".png,.jpg,.jpeg,.webp" className="sr-only" onChange={(e) => onUpload("cover", e.target.files?.[0])} />
                  </label>
                  {theme.coverImageUrl ? <Button variant="ghost" size="sm" onClick={() => set("coverImageUrl", null)}>{copy.removeCover}</Button> : null}
                </div>
                <p className="text-xs text-muted-foreground">{copy.coverHelp}</p>
              </div>
            </Group>

            <Group value="words" title={copy.words}>
              <Choice label={copy.layout} value={theme.layout} options={[["left", copy.layoutLeft], ["centred", copy.layoutCentred]]} onChange={(v) => set("layout", v)} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label htmlFor="w-sub">{copy.subname}</Label><Input id="w-sub" className="h-10" maxLength={40} value={theme.subname} onChange={(e) => set("subname", e.target.value)} placeholder="St James's" /></div>
                <div className="space-y-1"><Label htmlFor="w-eye">{copy.eyebrow}</Label><Input id="w-eye" className="h-10" maxLength={40} value={theme.eyebrow} onChange={(e) => set("eyebrow", e.target.value)} placeholder="Welcome" /></div>
              </div>
              <div className="space-y-1"><Label htmlFor="w-title">{copy.welcomeTitleLabel}</Label><Input id="w-title" className="h-10" maxLength={80} value={theme.welcomeTitle} onChange={(e) => set("welcomeTitle", e.target.value)} placeholder="Welcome to {property}" /></div>
              <div className="space-y-1"><Label htmlFor="w-body">{copy.welcomeBodyLabel}</Label><Input id="w-body" className="h-10" maxLength={200} value={theme.welcomeBody} onChange={(e) => set("welcomeBody", e.target.value)} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label htmlFor="w-l">{copy.sideLeft}</Label><Input id="w-l" className="h-10" maxLength={80} value={theme.sideNotes[0]} onChange={(e) => set("sideNotes", [e.target.value, theme.sideNotes[1]])} placeholder="History · Hospitality" /></div>
                <div className="space-y-1"><Label htmlFor="w-r">{copy.sideRight}</Label><Input id="w-r" className="h-10" maxLength={80} value={theme.sideNotes[1]} onChange={(e) => set("sideNotes", [theme.sideNotes[0], e.target.value])} placeholder="London · Heritage" /></div>
              </div>
              <div className="space-y-2">
                <Label>{copy.features}</Label>
                {[0, 1, 2].map((i) => {
                  const f = theme.features[i] ?? { icon: "sparkles", text: "" };
                  const put = (next: { icon: string; text: string }) => {
                    const list = [...theme.features];
                    list[i] = next;
                    set("features", list.filter((x) => x && x.text.trim()));
                  };
                  return (
                    <div key={i} className="flex gap-2">
                      <Select value={f.icon} onValueChange={(v) => put({ ...f, icon: v })}>
                        <SelectTrigger className="h-10 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-72">{Object.keys(NAV_ICONS).map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input className="h-10" maxLength={40} value={f.text} placeholder={copy.featurePlaceholder} onChange={(e) => put({ ...f, text: e.target.value })} />
                    </div>
                  );
                })}
              </div>
              <div className="space-y-1"><Label htmlFor="w-tag">{copy.tagline}</Label><Input id="w-tag" className="h-10" maxLength={60} value={theme.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="A brighter stay awaits" /></div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{copy.poweredBy}</span>
                <Switch checked={theme.poweredBy} onCheckedChange={(v) => set("poweredBy", v)} />
              </label>
            </Group>
            <Group value="kiosk" title={copy.kioskGroup}>
              <p className="text-sm font-medium">{copy.kioskTouch}</p>
              <div role="radiogroup" aria-label={copy.kioskTouch} className="grid gap-2 sm:grid-cols-2">
                {(["standard", "expanded"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={theme.kioskTouch === v}
                    onClick={() => set("kioskTouch", v)}
                    className={`rounded-xl border p-3 text-left text-sm transition-colors ${theme.kioskTouch === v ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-secondary"}`}
                  >
                    <span className="block font-medium">{copy.kioskTouches[v].label}</span>
                    <span className="block text-muted-foreground">{copy.kioskTouches[v].help}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{copy.kioskTouchHelp}</p>
            </Group>
          </Accordion>

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

        {/* Live preview: the same pieces guests see. */}
        <div className="xl:sticky xl:top-6 xl:self-start">
          <p className="mb-2 text-sm font-medium text-muted-foreground">{copy.preview}</p>
          <ThemePreview theme={theme} name={property.name} />
        </div>
      </div>
    </section>
  );
}

/** A small welcome screen in the theme, built from the guest pages' own components. */
export function ThemePreview({ theme, name }: { theme: ThemeConfig; name: string }) {
  return (
    <ThemeScope theme={theme} full className="relative overflow-hidden rounded-3xl border border-border shadow-lifted">
      <ThemeBackdrop theme={theme} />
      <div className="relative space-y-4 p-6">
        {theme.headerBand ? (
          <div className="-mx-6 -mt-6 flex items-center gap-3 bg-primary px-6 py-4 text-primary-foreground">
            <LogoMark theme={theme} name={name} className="size-11 bg-transparent" />
            <div>
              <p className="font-display text-lg uppercase tracking-[0.08em]">{name}</p>
              {theme.subname ? <p className="text-[10px] uppercase tracking-[0.4em] opacity-90">{theme.subname}</p> : null}
            </div>
          </div>
        ) : theme.layout === "centred" ? (
          <BrandBlock theme={theme} name={name} size="md" />
        ) : (
          <BrandBlock theme={theme} name={name} size="md" />
        )}
        <div className={cn(theme.layout === "centred" && "text-center")}>
          {theme.eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">{theme.eyebrow}</p> : null}
          <h3 className="mt-1 text-2xl leading-tight">{welcomeTitle(theme, name, `Welcome to ${name}`)}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{theme.welcomeBody || "Let's get you checked in."}</p>
        </div>
        {theme.features.length ? <ThemeFeatures theme={theme} className={cn("text-xs", theme.layout === "centred" && "justify-center")} /> : null}
        {theme.coverImageUrl ? <img src={theme.coverImageUrl} alt="" className="aspect-[16/7] w-full rounded-xl object-cover" /> : null}
        <div className="grid grid-cols-2 gap-2">
          <Button className="h-11"><KeyRound className="size-4" /> Start check-in</Button>
          <Button variant="outline" className="h-11"><Tablet className="size-4" /> Guest guide</Button>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {"ABCDEF".split("").map((l) => (
            <Button key={l} variant="outline" className="h-10 px-0">{l}</Button>
          ))}
        </div>
        <div className="card-soft p-4">
          <p className="font-display">Wi-Fi</p>
          <p className="text-sm text-muted-foreground">Guest network · password on your card</p>
        </div>
        <ThemeFooter theme={theme} />
      </div>
      {/* Side notes need a wide screen; shown on the kiosk itself. */}
      <span className="hidden"><ThemeSideNotes theme={theme} /></span>
    </ThemeScope>
  );
}
