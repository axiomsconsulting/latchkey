import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Image as ImageIcon, RotateCcw, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { common, guideArtCopy as copy } from "@/content/copy";
import { guideArtFor } from "@/lib/guide-art";
import { saveGuideArt, uploadGuideArt } from "@/lib/guide-art.functions";
import { shrinkPhoto } from "@/lib/photo-file";
import { normaliseTheme } from "@/lib/theme";

/** Stay guides → Card pictures (guide-art.ts): on or off, and each section's picture. */
export function GuideArtEditor({
  propertyId,
  sections,
  themeConfig,
}: {
  propertyId: string;
  sections: Array<{ key: string; title: string }>;
  themeConfig: unknown;
}) {
  const saveFn = useServerFn(saveGuideArt);
  const uploadFn = useServerFn(uploadGuideArt);
  const qc = useQueryClient();
  const [theme, setTheme] = useState(() => normaliseTheme(themeConfig));
  const [busy, setBusy] = useState<string | null>(null);
  const rows = [
    ...sections,
    ...Object.entries(copy.extras).map(([key, title]) => ({ key, title })),
  ];

  async function run(key: string, f: () => Promise<void>) {
    setBusy(key);
    try {
      await f();
      await qc.invalidateQueries();
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }
  const set = (key: string, value: string | null) =>
    run(key, async () => {
      const r = await saveFn({ data: { propertyId, key, value } });
      setTheme((t) => ({ ...t, guideArt: r.art, guideArtOn: r.on }));
    });

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg">
            <ImageIcon className="size-5 text-primary" /> {copy.title}
          </h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <Switch
          checked={theme.guideArtOn}
          disabled={busy !== null}
          onCheckedChange={(on) =>
            void run("on", async () => {
              const r = await saveFn({ data: { propertyId, on } });
              setTheme((t) => ({ ...t, guideArt: r.art, guideArtOn: r.on }));
            })
          }
        />
        {copy.on}
      </label>
      {theme.guideArtOn ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((r) => {
            const own = theme.guideArt[r.key];
            const src = guideArtFor(r.key, theme);
            return (
              <div key={r.key} className="overflow-hidden rounded-xl border border-border">
                <div className="relative aspect-[4/3] bg-muted">
                  {src ? (
                    <img src={src} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <span className="grid size-full place-items-center text-xs text-muted-foreground">
                      {copy.noPicture}
                    </span>
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 text-[10px] text-white">
                    {own === "none" ? copy.noPicture : own ? copy.own : copy.starting}
                  </span>
                </div>
                <div className="space-y-1.5 p-2">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <div className="flex flex-wrap gap-1" data-keep-size>
                    <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-border px-2 text-xs hover:bg-muted">
                      <Upload className="size-3.5" /> {copy.change}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={busy !== null}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f)
                            void run(r.key, async () => {
                              const { url } = await uploadFn({
                                data: {
                                  propertyId,
                                  key: r.key,
                                  dataUrl: await shrinkPhoto(f, 1600, 0.82),
                                },
                              });
                              setTheme((t) => ({
                                ...t,
                                guideArt: { ...t.guideArt, [r.key]: url },
                              }));
                            });
                        }}
                      />
                    </label>
                    {own ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-xs"
                        aria-label={copy.reset}
                        title={copy.reset}
                        disabled={busy !== null}
                        onClick={() => void set(r.key, null)}
                      >
                        <RotateCcw className="size-3.5" />
                      </Button>
                    ) : null}
                    {own !== "none" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-xs"
                        aria-label={copy.none}
                        title={copy.none}
                        disabled={busy !== null}
                        onClick={() => void set(r.key, "none")}
                      >
                        <X className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
