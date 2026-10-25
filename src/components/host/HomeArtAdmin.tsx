import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";
import { ImagePlus, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SaveButton, changed } from "@/components/host/SaveButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { common, homeArtCopy as copy } from "@/content/copy";
import { DEFAULT_HOME_ART, HOME_ART_LIBRARY, HOME_ART_SLOTS, MAX_HOME_ART, type HomeArtItem, type HomeArtSlot } from "@/lib/home-art";
import { getHomeArtSettings, saveHomeArt, uploadHomeArt } from "@/lib/site.functions";

/**
 * Latchkey admin → Site settings → Home page pictures: which illustrations
 * show on the home page, where (beside the headline, or in the margin by a
 * section), on which side and how strongly. Add from Latchkey's set or
 * upload a transparent PNG, WebP or SVG; remove; or go back to the defaults.
 */
export function HomeArtAdmin() {
  const fetchFn = useServerFn(getHomeArtSettings);
  const saveFn = useServerFn(saveHomeArt);
  const uploadFn = useServerFn(uploadHomeArt);
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery({ queryKey: ["home-art"], queryFn: () => fetchFn() });
  const [items, setItems] = useState<HomeArtItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (q.data) setItems(q.data.items);
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
      await saveFn({ data: { items: list } });
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
        {d.available ? <SaveButton dirty={changed(items, d.items)} busy={busy} onClick={() => void save(items)} /> : null}
      </div>
      {!d.available ? <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p> : null}

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
