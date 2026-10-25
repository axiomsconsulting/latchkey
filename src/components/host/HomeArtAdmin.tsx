import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";
import { ImagePlus, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SaveButton, changed } from "@/components/host/SaveButton";
import { ArtBackdrop } from "@/components/HomeArt";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { common, homeArtCopy as copy } from "@/content/copy";
import { DEFAULT_HOME_ART, DEFAULT_HOME_ART_STYLE, DEFAULT_HOME_GLASS, glassVars, HOME_ART_LIBRARY, HOME_ART_SLOTS, MAX_HOME_ART, type HomeArtItem, type HomeArtSlot, type HomeArtStyle, type HomeGlass } from "@/lib/home-art";
import { getHomeArtSettings, saveHomeArt, uploadHomeArt } from "@/lib/site.functions";

/**
 * Latchkey admin → Site settings → Home page pictures: which illustrations
 * show on the home page, where (beside the headline, or in the margin by a
 * section), which side of the photo to keep in view, and how faint all of
 * them are (transparency, dimming, tint colour and greyness, previewed live).
 * Add from Latchkey's set or upload a photo; remove; or go back to the defaults.
 */
export function HomeArtAdmin() {
  const fetchFn = useServerFn(getHomeArtSettings);
  const saveFn = useServerFn(saveHomeArt);
  const uploadFn = useServerFn(uploadHomeArt);
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery({ queryKey: ["home-art"], queryFn: () => fetchFn() });
  const [items, setItems] = useState<HomeArtItem[]>([]);
  // How faint every photo is: transparency, dimming, tint and greyness (one setting for the whole page).
  const [style, setStyle] = useState<HomeArtStyle>(DEFAULT_HOME_ART_STYLE);
  // The home page's boxes as frosted glass (or solid).
  const [glass, setGlass] = useState<HomeGlass>(DEFAULT_HOME_GLASS);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (q.data) {
      setItems(q.data.items);
      setStyle(q.data.style);
      setGlass(q.data.glass);
    }
  }, [q.data]);

  if (q.isLoading || !q.data) return <Skeleton className="h-64 rounded-2xl" />;
  const d = q.data;
  const set = (id: string, patch: Partial<HomeArtItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const add = (src: string, alt: string) =>
    setItems((list) => (list.length >= MAX_HOME_ART ? list : [...list, { id: `a${Date.now().toString(36)}`, src, alt, slot: list.some((i) => i.slot === "hero") ? "audience" : "hero", side: "right", opacity: 1 }]));
  const unused = HOME_ART_LIBRARY.filter((l) => !items.some((i) => i.src === l.src));

  async function save(list: HomeArtItem[] | null) {
    setBusy(true);
    try {
      await saveFn({ data: { items: list, style, glass } });
      await qc.invalidateQueries({ queryKey: ["home-art"] });
      await router.invalidate();
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  async function upload(f: File) {
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error(common.errorBody));
        r.readAsDataURL(f);
      });
      const { url } = await uploadFn({ data: { filename: f.name, dataUrl } });
      add(url, "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  }

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg">{copy.title}</h3>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        {d.available ? <SaveButton dirty={changed(items, d.items) || changed(style, d.style) || changed(glass, d.glass)} busy={busy} onClick={() => void save(items)} /> : null}
      </div>
      {!d.available ? <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p> : null}

      {/* How faint the photos are, with a live preview over sample words. */}
      <div className="grid gap-4 rounded-xl border border-border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3 text-sm">
          <p className="font-medium">{copy.lookTitle}</p>
          {([
            ["opacity", copy.transparency, 5, 60],
            ["dim", copy.dimming, 0, 90],
            ["grey", copy.greyness, 0, 100],
          ] as const).map(([key, label, lo, hi]) => (
            <label key={key} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
              <input type="range" min={lo} max={hi} step={1} value={Math.round(style[key] * 100)} onChange={(e) => setStyle({ ...style, [key]: Number(e.target.value) / 100 })} className="flex-1 accent-primary" aria-label={label} />
              <span className="w-10 text-right text-xs tabular-nums">{Math.round(style[key] * 100)}%</span>
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-28 shrink-0 text-xs text-muted-foreground">{copy.tint}</span>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={style.tint !== null} onCheckedChange={(v) => setStyle({ ...style, tint: v ? (DEFAULT_HOME_ART_STYLE.tint ?? "#183b2b") : null })} aria-label={copy.tint} />
            </label>
            {style.tint ? (
              <>
                <input type="color" value={style.tint} onChange={(e) => setStyle({ ...style, tint: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-input bg-surface" aria-label={copy.tintColour} />
                <input type="range" min={0} max={100} step={1} value={Math.round(style.tintStrength * 100)} onChange={(e) => setStyle({ ...style, tintStrength: Number(e.target.value) / 100 })} className="min-w-24 flex-1 accent-primary" aria-label={copy.tintStrength} />
                <span className="w-10 text-right text-xs tabular-nums">{Math.round(style.tintStrength * 100)}%</span>
              </>
            ) : null}
          </div>
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => setStyle(DEFAULT_HOME_ART_STYLE)}>{copy.lookReset}</button>
        </div>
        <div className="relative isolate overflow-hidden rounded-xl border border-border bg-background p-5" data-home-glass={glass.on ? "on" : "off"} style={glassVars(glass) as React.CSSProperties}>
          <ArtBackdrop item={items[0] ?? DEFAULT_HOME_ART[0]!} style={style} contained />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{copy.previewEyebrow}</p>
          <p className="mt-1 font-display text-2xl leading-tight">{copy.previewTitle}</p>
          <p className="mt-2 text-sm text-muted-foreground">{copy.previewBody}</p>
          {/* A box as it looks on the home page, glass or solid. */}
          <div className="card-soft mt-4 p-4 text-sm">{copy.previewBox}</div>
        </div>
      </div>

      {/* The boxes on the home page as frosted glass, iOS style; off = solid. */}
      <div className="space-y-3 rounded-xl border border-border p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block font-medium">{copy.glassTitle}</span>
            <span className="block text-xs text-muted-foreground">{copy.glassBody}</span>
          </span>
          <Switch checked={glass.on} onCheckedChange={(v) => setGlass({ ...glass, on: v })} aria-label={copy.glassTitle} />
        </div>
        {glass.on ? (
          <>
            {([
              ["clear", copy.glassClear, 0, 85, 1, (v: number) => `${v}%`, 100],
              ["blur", copy.glassBlur, 0, 40, 1, (v: number) => `${v}px`, 1],
              ["saturate", copy.glassSaturate, 100, 200, 5, (v: number) => `${v}%`, 100],
            ] as const).map(([key, label, lo, hi, step, show, scale]) => (
              <label key={key} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
                <input type="range" min={lo} max={hi} step={step} value={Math.round(glass[key] * scale)} onChange={(e) => setGlass({ ...glass, [key]: Number(e.target.value) / scale })} className="flex-1 accent-primary" aria-label={label} />
                <span className="w-12 text-right text-xs tabular-nums">{show(Math.round(glass[key] * scale))}</span>
              </label>
            ))}
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setGlass(DEFAULT_HOME_GLASS)}>{copy.lookReset}</button>
          </>
        ) : null}
      </div>

      {items.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((a) => (
            <li key={a.id} className="flex gap-3 rounded-xl border border-border p-3">
              <img src={a.src} alt="" className="size-24 shrink-0 rounded-lg bg-muted object-cover" />
              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="block text-xs text-muted-foreground">{copy.where}</span>
                    <select className="h-9 w-full rounded-lg border border-input bg-surface px-2" value={a.slot} onChange={(e) => set(a.id, { slot: e.target.value as HomeArtSlot })}>
                      {HOME_ART_SLOTS.map((s) => <option key={s} value={s}>{copy.slots[s]}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="block text-xs text-muted-foreground">{copy.side}</span>
                    <select className="h-9 w-full rounded-lg border border-input bg-surface px-2" value={a.side} onChange={(e) => set(a.id, { side: e.target.value === "left" ? "left" : "right" })}>
                      <option value="right">{copy.right}</option>
                      <option value="left">{copy.left}</option>
                    </select>
                  </label>
                </div>
                <label className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{copy.strength}</span>
                  <input type="range" min={10} max={100} step={5} value={Math.round(a.opacity * 100)} onChange={(e) => set(a.id, { opacity: Number(e.target.value) / 100 })} className="flex-1 accent-primary" aria-label={copy.strength} />
                  <span className="w-9 text-right text-xs tabular-nums">{Math.round(a.opacity * 100)}%</span>
                </label>
                <div className="flex items-center gap-2">
                  <Input className="h-9" placeholder={copy.altPlaceholder} value={a.alt} maxLength={120} onChange={(e) => set(a.id, { alt: e.target.value })} aria-label={copy.alt} />
                  <button type="button" onClick={() => setItems((list) => list.filter((i) => i.id !== a.id))} aria-label={copy.remove} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-muted p-3 text-sm">{copy.none}</p>
      )}

      <div className="space-y-2">
        <Label className="text-sm">{copy.addTitle}</Label>
        <div className="flex flex-wrap gap-2">
          {unused.map((l) => (
            <button key={l.src} type="button" onClick={() => add(l.src, l.alt)} disabled={items.length >= MAX_HOME_ART} title={l.alt} className="flex items-center gap-2 rounded-xl border border-border p-1.5 pr-3 text-xs hover:bg-secondary disabled:opacity-50">
              <img src={l.src} alt="" className="size-12 rounded-lg bg-muted object-cover" />
              <Plus className="size-3.5" /> {l.alt}
            </button>
          ))}
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <Button type="button" variant="outline" disabled={uploading || items.length >= MAX_HOME_ART} onClick={() => file.current?.click()}>
            {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />} {copy.upload}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{copy.uploadHint}</p>
      </div>

      {d.custom || changed(items, DEFAULT_HOME_ART) ? (
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void save(null)}>
          <RotateCcw className="size-4" /> {copy.reset}
        </Button>
      ) : null}
    </section>
  );
}
