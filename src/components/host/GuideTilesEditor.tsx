import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, FileText, ImagePlus, LayoutGrid, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { NavIcon } from "@/components/NavIcon";
import { GuideTiles } from "@/components/guest/StayHero";
import { ThemeScope } from "@/components/theme/ThemeScope";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/host/SaveButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { common, guideTilesCopy as copy } from "@/content/copy";
import { MAX_TILES, TILE_ICONS, autoTiles, shownTiles, type ContentType, type GuideTile, type TileKind } from "@/lib/guide-tiles";
import { getGuideTiles, saveGuideTiles, uploadTileFile } from "@/lib/guide-tiles.functions";
import { normaliseTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ADDABLE: TileKind[] = ["wifi", "section", "extras", "messages", "times", "checkin", "custom"];

const newId = () => `t-${Math.random().toString(36).slice(2, 9)}`;

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error(common.errorBody));
    r.readAsDataURL(file);
  });
}

/**
 * Stay guides → Quick tiles: up to eight tiles at the top of every guest
 * guide. Automatic until the host chooses; each tile opens a section, Wi-Fi,
 * extras, messages, the stay's times, check-in (room guides), or the host's
 * own text, link, photo or PDF, shown in place.
 */
export function GuideTilesEditor({
  propertyId,
  sections,
  hasWifi,
  themeConfig,
}: {
  propertyId: string;
  sections: Array<{ key: string; title: string }>;
  hasWifi: boolean;
  themeConfig: unknown;
}) {
  const fetchFn = useServerFn(getGuideTiles);
  const saveFn = useServerFn(saveGuideTiles);
  const uploadFn = useServerFn(uploadTileFile);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["guide-tiles", propertyId], queryFn: () => fetchFn({ data: { propertyId } }) });
  const [tiles, setTiles] = useState<GuideTile[] | null>(null);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    setTiles(q.data.tiles);
    setFiles(q.data.files);
    setDirty(false);
  }, [q.data]);

  const theme = normaliseTheme(themeConfig);
  const ctx = { page: "stay" as const, sections, hasWifi, canOrder: true };
  const change = (next: GuideTile[] | null) => {
    setTiles(next);
    setDirty(true);
  };
  const update = (id: string, patch: Partial<GuideTile>) => change((tiles ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const move = (i: number, by: number) => {
    const list = [...(tiles ?? [])];
    const [t] = list.splice(i, 1);
    list.splice(Math.max(0, Math.min(list.length, i + by)), 0, t!);
    change(list);
  };
  const add = (kind: TileKind) => {
    const list = tiles ?? [];
    if (list.length >= MAX_TILES) return;
    const tile: GuideTile =
      kind === "section"
        ? { id: newId(), kind, section: sections.find((s) => !list.some((t) => t.section === s.key))?.key ?? sections[0]?.key ?? "" }
        : kind === "custom"
          ? { id: newId(), kind, title: "", content: { type: "text", body: "" } }
          : { id: newId(), kind };
    change([...list, tile]);
  };

  async function upload(tile: GuideTile, file: File) {
    setUploading(tile.id);
    try {
      const dataUrl = await readFile(file);
      const r = await uploadFn({ data: { propertyId, filename: file.name, dataUrl } });
      update(tile.id, { content: { type: r.type, path: r.path, name: r.name } });
      if (r.url) setFiles((f) => ({ ...f, [r.path]: r.url! }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    setBusy(true);
    try {
      // Own tiles still being written are left out rather than refused.
      const ready = tiles?.filter((t) => t.kind !== "custom" || (t.title?.trim() && t.content && (t.content.body?.trim() || t.content.url || t.content.path))) ?? null;
      await saveFn({ data: { propertyId, tiles: ready } });
      await qc.invalidateQueries({ queryKey: ["guide-tiles", propertyId] });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  // Preview: the tiles as a guest sees them, with files shown by tile id.
  const previewFiles = Object.fromEntries((tiles ?? []).flatMap((t) => (t.content?.path && files[t.content.path] ? [[t.id, files[t.content.path]!]] : [])));
  const preview = shownTiles(tiles, ctx, copy.kindLabels);

  return (
    <section id="guide-tiles" className="card-soft scroll-mt-24 space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <LayoutGrid className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        {q.data?.available ? <SaveButton dirty={dirty} busy={busy} onClick={() => void save()} /> : null}
      </div>

      {q.isLoading ? <Skeleton className="h-32 rounded-2xl" /> : null}
      {q.data && !q.data.available ? <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p> : null}

      {q.data?.available ? (
        <>
          <div role="radiogroup" aria-label={copy.title} className="flex w-fit rounded-full bg-muted p-1">
            {([null, "own"] as const).map((m) => {
              const on = m === null ? tiles === null : tiles !== null;
              return (
                <button
                  key={m ?? "auto"}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => change(m === null ? null : (tiles ?? autoTiles(ctx).map((t) => ({ ...t, id: newId() }))))}
                  className={cn("spring min-h-10 rounded-full px-4 text-sm font-medium", on ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground")}
                >
                  {m === null ? copy.automatic : copy.own}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-dashed border-border p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{copy.preview}</p>
            <ThemeScope theme={theme} className="bg-transparent">
              {preview.length > 1 ? (
                <GuideTiles theme={theme} label={copy.preview} tiles={preview} stored={tiles} files={previewFiles} onAction={() => {}} />
              ) : (
                <p className="text-sm text-muted-foreground">{copy.tooFew}</p>
              )}
            </ThemeScope>
          </div>

          {tiles ? (
            <ol className="space-y-3">
              {tiles.map((t, i) => (
                <li key={t.id} className="rounded-2xl border border-border bg-surface p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={t.icon ?? "default"} onValueChange={(v) => {
                      if (v !== "default") return update(t.id, { icon: v });
                      const { icon: _drop, ...rest } = t;
                      change(tiles.map((x) => (x.id === t.id ? rest : x)));
                    }}>
                      <SelectTrigger className="h-11 w-20" aria-label={copy.icon}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">{copy.defaultIcon}</SelectItem>
                        {TILE_ICONS.map((ic) => (
                          <SelectItem key={ic} value={ic}>
                            <NavIcon icon={ic} className="size-4" />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="min-w-0 flex-1 basis-32 text-sm font-medium">{copy.kinds[t.kind]}</span>
                    <Button size="icon" variant="ghost" aria-label={copy.up} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={copy.down} disabled={i === tiles.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={copy.remove} onClick={() => change(tiles.filter((x) => x.id !== t.id))}><Trash2 className="size-4" /></Button>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {t.kind === "section" ? (
                      <Select value={t.section ?? ""} onValueChange={(v) => update(t.id, { section: v })}>
                        <SelectTrigger className="h-11" aria-label={copy.section}><SelectValue placeholder={copy.section} /></SelectTrigger>
                        <SelectContent>
                          {sections.map((s) => <SelectItem key={s.key} value={s.key}>{s.title}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : null}
                    <Input
                      className="h-11"
                      maxLength={40}
                      value={t.title ?? ""}
                      aria-label={copy.label}
                      placeholder={t.kind === "custom" ? copy.ownTitle : copy.labelPlaceholder(t.kind === "section" ? (sections.find((s) => s.key === t.section)?.title ?? "") : (copy.kindLabels[t.kind as keyof typeof copy.kindLabels] ?? ""))}
                      onChange={(e) => update(t.id, { title: e.target.value })}
                    />
                  </div>
                  {t.kind === "custom" ? (
                    <div className="mt-2 space-y-2">
                      <div role="radiogroup" aria-label={copy.contentType} className="flex flex-wrap gap-1">
                        {(["text", "link", "image", "doc"] as ContentType[]).map((ct) => (
                          <button
                            key={ct}
                            type="button"
                            role="radio"
                            aria-checked={t.content?.type === ct}
                            onClick={() => update(t.id, { content: { type: ct } })}
                            className={cn("min-h-9 rounded-full border px-3 text-xs font-medium", t.content?.type === ct ? "border-primary bg-primary text-primary-foreground" : "border-border")}
                          >
                            {copy.contentTypes[ct]}
                          </button>
                        ))}
                      </div>
                      {t.content?.type === "text" ? (
                        <Textarea rows={4} maxLength={4000} value={t.content.body ?? ""} placeholder={copy.textPlaceholder} onChange={(e) => update(t.id, { content: { type: "text", body: e.target.value } })} />
                      ) : null}
                      {t.content?.type === "link" ? (
                        <Input className="h-11" inputMode="url" value={t.content.url ?? ""} placeholder="https://" onChange={(e) => update(t.id, { content: { type: "link", url: e.target.value.trim() } })} />
                      ) : null}
                      {t.content?.type === "image" || t.content?.type === "doc" ? (
                        <div className="flex flex-wrap items-center gap-3">
                          {t.content.path && t.content.type === "image" && files[t.content.path] ? <img src={files[t.content.path]} alt="" className="h-14 w-20 rounded-lg object-cover" /> : null}
                          {t.content.path && t.content.type === "doc" ? <span className="flex items-center gap-1 text-sm"><FileText className="size-4" /> {t.content.name ?? "PDF"}</span> : null}
                          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-sm hover:bg-secondary">
                            {uploading === t.id ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                            {t.content.path ? copy.replaceFile : t.content.type === "doc" ? copy.uploadDoc : copy.uploadImage}
                            <input
                              type="file"
                              accept={t.content.type === "doc" ? "application/pdf" : "image/jpeg,image/png,image/webp"}
                              className="sr-only"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = "";
                                if (f) void upload(t, f);
                              }}
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {t.kind === "checkin" ? <p className="mt-2 text-xs text-muted-foreground">{copy.checkinHint}</p> : null}
                  {t.kind === "extras" || t.kind === "messages" ? <p className="mt-2 text-xs text-muted-foreground">{copy.stayOnlyHint}</p> : null}
                </li>
              ))}
            </ol>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {tiles ? (
              <Select value="" onValueChange={(v) => add(v as TileKind)} disabled={tiles.length >= MAX_TILES}>
                <SelectTrigger className="h-11 w-56" aria-label={copy.add}>
                  <span className="flex items-center gap-2"><Plus className="size-4" /> {tiles.length >= MAX_TILES ? copy.full : copy.add}</span>
                </SelectTrigger>
                <SelectContent>
                  {ADDABLE.map((k) => <SelectItem key={k} value={k}>{copy.kinds[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : null}
            {tiles ? <span className="text-xs text-muted-foreground">{copy.count(tiles.length)}</span> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
