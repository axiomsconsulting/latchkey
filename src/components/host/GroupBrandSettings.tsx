import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { LogoMark } from "@/components/theme/LogoMark";
import { ThemeScope } from "@/components/theme/ThemeScope";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { common, groupBrandCopy as copy, themeStudio } from "@/content/copy";
import { DEFAULT_GROUP_BRAND, type GroupBrand } from "@/lib/group-brand";
import { getGroupBrand, saveGroupBrand, uploadGroupLogo } from "@/lib/group-brand.functions";
import { LOGO_PRESETS, normaliseTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Settings → Business → Group brand: the business's own logo, and where it shows instead of (or beside) each property's. */
export function GroupBrandSettings({
  hostId,
  isOwner,
  themeConfig,
}: {
  hostId: string;
  isOwner: boolean;
  themeConfig: unknown;
}) {
  const fetchFn = useServerFn(getGroupBrand);
  const saveFn = useServerFn(saveGroupBrand);
  const uploadFn = useServerFn(uploadGroupLogo);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["group-brand", hostId],
    queryFn: () => fetchFn({ data: { hostId } }),
  });
  const [form, setForm] = useState<GroupBrand>(DEFAULT_GROUP_BRAND);
  const [busy, setBusy] = useState<"save" | "upload" | null>(null);
  useEffect(() => {
    if (q.data) setForm(q.data.brand);
  }, [q.data]);
  const theme = normaliseTheme(themeConfig);
  const editable = isOwner && !!q.data?.available;
  // Which way of choosing is open: what's saved, until they pick another.
  const [picking, setPicking] = useState<"none" | "preset" | "own" | null>(null);
  const logoMode = picking ?? (form.logoUrl ? "own" : form.logoPreset ? "preset" : "none");

  async function save(next: GroupBrand) {
    setForm(next);
    setBusy("save");
    try {
      await saveFn({ data: { hostId, brand: next } });
      await qc.invalidateQueries({ queryKey: ["group-brand", hostId] });
      await qc.invalidateQueries({ queryKey: ["workspace"] });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    setBusy("upload");
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error(common.errorBody));
        r.readAsDataURL(file);
      });
      const { url } = await uploadFn({ data: { hostId, filename: file.name, dataUrl } });
      await save({ ...form, logoUrl: url, logoPreset: null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
      setBusy(null);
    }
  }

  return (
    <section id="settings-group" className="card-soft scroll-mt-24 space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <Building className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
      </div>
      {q.data && !q.data.available ? (
        <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p>
      ) : null}

      <fieldset disabled={!editable || busy !== null} className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">{copy.logo}</p>
          <div className="flex flex-wrap items-start gap-3">
            {/* What it looks like now. */}
            <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="" className="size-full object-contain" />
              ) : form.logoPreset ? (
                <ThemeScope theme={theme} className="rounded-xl bg-transparent">
                  <LogoMark
                    theme={{ logoPreset: form.logoPreset, logoUrl: null }}
                    name={q.data?.name || "Group"}
                    className="size-14"
                  />
                </ThemeScope>
              ) : (
                <Building className="size-6 text-muted-foreground" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1 basis-52 space-y-2">
              <div role="radiogroup" aria-label={copy.logo} className="flex flex-wrap gap-2">
                {(["none", "preset", "own"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={logoMode === m}
                    onClick={() => {
                      setPicking(m);
                      if (m === "none") void save({ ...form, logoUrl: null, logoPreset: null });
                    }}
                    className={cn(
                      "min-h-9 rounded-full border px-3 text-sm",
                      logoMode === m
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background",
                    )}
                  >
                    {copy.logoModes[m]}
                  </button>
                ))}
              </div>
              {logoMode === "preset" ? (
                <div className="flex flex-wrap gap-2 rounded-2xl border border-border p-2">
                  {LOGO_PRESETS.filter((l) => l !== "site").map((l) => (
                    <button
                      key={l}
                      type="button"
                      title={themeStudio.logoNames[l] ?? l}
                      aria-label={themeStudio.logoNames[l] ?? l}
                      aria-pressed={!form.logoUrl && form.logoPreset === l}
                      onClick={() => void save({ ...form, logoUrl: null, logoPreset: l })}
                      className={cn(
                        "rounded-2xl p-1",
                        !form.logoUrl && form.logoPreset === l ? "ring-2 ring-primary" : "",
                      )}
                    >
                      <ThemeScope theme={theme} className="rounded-xl bg-transparent">
                        <LogoMark
                          theme={{ logoPreset: l, logoUrl: null }}
                          name={q.data?.name || "Group"}
                          className="size-12"
                        />
                      </ThemeScope>
                    </button>
                  ))}
                </div>
              ) : null}
              {logoMode === "own" ? (
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 text-sm">
                  {busy === "upload" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ImagePlus className="size-4" />
                  )}
                  {copy.upload}
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.svg"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void upload(f);
                    }}
                  />
                </label>
              ) : null}
            </div>
          </div>
        </div>

        <div role="radiogroup" aria-label={copy.propertyLogos} className="space-y-2">
          <p className="text-sm font-medium">{copy.propertyLogos}</p>
          {(["own", "group"] as const).map((v) => (
            <label
              key={v}
              className="flex items-start gap-3 rounded-2xl border border-border p-3 text-sm"
            >
              <input
                type="radio"
                name="property-logos"
                className="mt-1"
                checked={form.propertyLogos === v}
                onChange={() => void save({ ...form, propertyLogos: v })}
              />
              <span>{copy[v]}</span>
            </label>
          ))}
        </div>

        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">
              {copy.guestPages.replace("{group}", q.data?.name || "your group")}
            </span>
            <span className="block text-xs text-muted-foreground">{copy.guestPagesHelp}</span>
          </span>
          <Switch
            checked={form.showOnGuestPages}
            onCheckedChange={(v) => void save({ ...form, showOnGuestPages: v })}
          />
        </label>
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">{copy.invoices}</span>
            <span className="block text-xs text-muted-foreground">{copy.invoicesHelp}</span>
          </span>
          <Switch
            checked={form.showOnInvoices}
            onCheckedChange={(v) => void save({ ...form, showOnInvoices: v })}
          />
        </label>
      </fieldset>
      {!isOwner ? <p className="text-xs text-muted-foreground">{copy.ownerOnly}</p> : null}
    </section>
  );
}
