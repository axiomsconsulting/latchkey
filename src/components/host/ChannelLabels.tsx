import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ChannelIcon } from "@/components/ChannelIcon";
import { Button } from "@/components/ui/button";
import { SaveButton, changed } from "@/components/host/SaveButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { channels, common, settings as copy } from "@/content/copy";
import { BUILT_IN_SITES, isBuiltIn, newSiteKey, normaliseStoredSites, type StoredSite } from "@/lib/booking-sites";
import { saveBookingSites } from "@/lib/host.functions";

const ICON_PX = 64;

/** Shrinks any image to a small square PNG so it sits neatly on one line. */
async function toIcon(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(copy.channelsIconBad));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = ICON_PX;
    canvas.height = ICON_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(copy.channelsIconBad);
    // Some SVGs report no size of their own; draw those to fill the square.
    const iw = img.naturalWidth || ICON_PX;
    const ih = img.naturalHeight || ICON_PX;
    const scale = Math.min(ICON_PX / iw, ICON_PX / ih);
    const w = iw * scale;
    const h = ih * scale;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (ICON_PX - w) / 2, (ICON_PX - h) / 2, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Row = StoredSite & { builtIn: boolean };

function initialRows(labels: Record<string, string>, stored: unknown): Row[] {
  const list = normaliseStoredSites(stored);
  const byKey = new Map(list.map((s) => [s.key, s]));
  return [
    ...BUILT_IN_SITES.map((key) => ({
      key,
      label: byKey.get(key)?.label || labels[key] || "",
      icon_url: byKey.get(key)?.icon_url ?? null,
      builtIn: true,
    })),
    ...list.filter((s) => !isBuiltIn(s.key)).map((s) => ({ ...s, builtIn: false })),
  ];
}

/**
 * The booking sites guests choose from. Hosts rename any of them, give each
 * its own icon, and add new sites as they start using them. Built-in ids
 * never change, so calendar matching and reports keep working.
 */
export function ChannelLabels({
  hostId,
  labels,
  sites,
}: {
  hostId: string;
  labels: Record<string, string>;
  sites?: unknown;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveBookingSites);
  const [rows, setRows] = useState<Row[]>(() => initialRows(labels, sites));
  const [busy, setBusy] = useState(false);
  const fileFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setRows(initialRows(labels, sites)), [labels, sites]);
  const dirty = changed(rows, initialRows(labels, sites));

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function onFile(file: File | undefined) {
    const key = fileFor.current;
    if (!file || !key) return;
    try {
      update(key, { icon_url: await toIcon(file) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : copy.channelsIconBad);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function submit() {
    if (rows.some((r) => !r.builtIn && !r.label.trim())) {
      toast.error(copy.channelsNeedName);
      return;
    }
    setBusy(true);
    try {
      await save({
        data: { hostId, sites: rows.map((r) => ({ key: r.key, label: r.label.trim(), icon_url: r.icon_url })) },
      });
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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg">{copy.channelsTitle}</h2>
          <p className="text-sm text-muted-foreground">{copy.channelsBody}</p>
          <p className="mt-1 text-sm text-muted-foreground">{copy.channelsIconHelp}</p>
        </div>
        <SaveButton dirty={dirty} busy={busy} label={copy.save} onClick={() => void submit()} />
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,.ico"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => {
          const standard = r.builtIn ? (channels as Record<string, string>)[r.key] ?? r.key : "";
          const name = r.label.trim() || standard || copy.channelsNewName;
          return (
            <div key={r.key} className="flex items-end gap-3">
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  className="rounded-[22%] outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                  aria-label={copy.channelsUploadIcon(name)}
                  title={copy.channelsUploadIcon(name)}
                  onClick={() => {
                    fileFor.current = r.key;
                    fileInput.current?.click();
                  }}
                >
                  <span className="relative block">
                    <ChannelIcon channel={r.key} iconUrl={r.icon_url} label={name} size={44} />
                    <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border border-border bg-background">
                      <ImagePlus className="size-3 text-muted-foreground" />
                    </span>
                  </span>
                </button>
                {r.icon_url ? (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={copy.channelsRemoveIcon}
                    title={copy.channelsRemoveIcon}
                    onClick={() => update(r.key, { icon_url: null })}
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor={`ch-${r.key}`} className="text-sm text-muted-foreground">
                  {r.builtIn ? standard : copy.channelsNewName}
                </Label>
                <Input
                  id={`ch-${r.key}`}
                  className="h-11"
                  maxLength={40}
                  placeholder={r.builtIn ? standard : copy.channelsNewPlaceholder}
                  value={r.label}
                  onChange={(e) => update(r.key, { label: e.target.value })}
                />
              </div>
              {!r.builtIn ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mb-0.5 text-destructive"
                  aria-label={copy.channelsRemove(name)}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={rows.length >= BUILT_IN_SITES.length + 20}
          onClick={() => setRows((rs) => [...rs, { key: newSiteKey(), label: "", icon_url: null, builtIn: false }])}
        >
          <Plus className="size-4" /> {copy.channelsAdd}
        </Button>
      </div>
    </section>
  );
}
