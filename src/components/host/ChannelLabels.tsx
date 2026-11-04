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
import { common, settings as copy } from "@/content/copy";
import { useBookingSites } from "@/hooks/use-host-data";
import { isBuiltIn, newSiteKey, normaliseStoredSites, type StoredSite } from "@/lib/booking-sites";
import { saveBookingSites } from "@/lib/host.functions";
import { toIcon } from "@/lib/site-icon";

function initialRows(stored: unknown): StoredSite[] {
  return normaliseStoredSites(stored).filter((s) => !isBuiltIn(s.key));
}

/**
 * Booking sites on Connections: the built-in ones as Latchkey sets them, to read
 * only, and any other sites this host adds, with a name, website and icon.
 */
export function ChannelLabels({ hostId, sites }: { hostId: string; sites?: unknown }) {
  const qc = useQueryClient();
  const save = useServerFn(saveBookingSites);
  const all = useBookingSites();
  const [rows, setRows] = useState<StoredSite[]>(() => initialRows(sites));
  const [busy, setBusy] = useState(false);
  const fileFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setRows(initialRows(sites)), [sites]);
  const dirty = changed(rows, initialRows(sites));

  const update = (key: string, patch: Partial<StoredSite>) =>
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
    if (rows.some((r) => !r.label.trim())) {
      toast.error(copy.channelsNeedName);
      return;
    }
    setBusy(true);
    try {
      await save({
        data: {
          hostId,
          sites: rows.map((r) => ({
            key: r.key,
            label: r.label.trim(),
            icon_url: r.icon_url,
            url: r.url?.trim() || null,
          })),
        },
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
        </div>
        <SaveButton dirty={dirty} busy={busy} label={copy.save} onClick={() => void submit()} />
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label={copy.channelsBuiltIn}>
        {all
          .filter((x) => x.builtIn && x.key !== "other")
          .map((x) => (
            <li key={x.key} className="flex items-center gap-1.5 text-sm">
              <ChannelIcon channel={x.key} iconUrl={x.iconUrl} label={x.label} size="1.25rem" />
              {x.label}
            </li>
          ))}
      </ul>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,.ico"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {rows.length ? (
        <div className="space-y-3 border-t border-border pt-3">
          {rows.map((r) => {
            const name = r.label.trim() || copy.channelsNewName;
            return (
              <div key={r.key} className="flex flex-wrap items-end gap-3">
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
                <div className="min-w-0 flex-1 basis-40 space-y-1">
                  <Label htmlFor={`ch-${r.key}`} className="text-sm text-muted-foreground">
                    {copy.channelsNewName}
                  </Label>
                  <Input
                    id={`ch-${r.key}`}
                    className="h-11"
                    maxLength={40}
                    placeholder={copy.channelsNewPlaceholder}
                    value={r.label}
                    onChange={(e) => update(r.key, { label: e.target.value })}
                  />
                </div>
                <div className="min-w-0 flex-1 basis-48 space-y-1">
                  <Label htmlFor={`url-${r.key}`} className="text-sm text-muted-foreground">
                    {copy.channelsWebsite}
                  </Label>
                  <Input
                    id={`url-${r.key}`}
                    className="h-11"
                    type="url"
                    maxLength={300}
                    placeholder="https://www.expedia.co.uk"
                    value={r.url ?? ""}
                    onChange={(e) => update(r.key, { url: e.target.value })}
                  />
                </div>
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
              </div>
            );
          })}
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={rows.length >= 20}
        onClick={() =>
          setRows((rs) => [...rs, { key: newSiteKey(), label: "", icon_url: null, url: null }])
        }
      >
        <Plus className="size-4" /> {copy.channelsAdd}
      </Button>
    </section>
  );
}
