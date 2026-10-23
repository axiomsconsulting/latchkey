import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Globe, ImagePlus, Loader2, Palette } from "lucide-react";

import { BrandMark, type BrandMarkVariant } from "@/components/brand/BrandLogo";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SaveButton, changed } from "@/components/host/SaveButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { brandAdminCopy as copy, common } from "@/content/copy";
import { BRAND_LOGO_MARKS, DEFAULT_BRAND, setBrand, type Brand } from "@/lib/brand";
import { listAllDomains, setDomainLive } from "@/lib/domains.functions";
import { getBrandSettings, saveBrandSettings, uploadSiteLogo } from "@/lib/site.functions";
import { cn } from "@/lib/utils";
import { forgetSite } from "@/lib/site-client";

/** Super admin: the white label. One name drives every mention of the product. */
export function BrandAdmin() {
  const fetchFn = useServerFn(getBrandSettings);
  const saveFn = useServerFn(saveBrandSettings);
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery({ queryKey: ["brand-settings"], queryFn: () => fetchFn() });
  const uploadFn = useServerFn(uploadSiteLogo);
  const [form, setForm] = useState<Brand>(DEFAULT_BRAND);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error(common.errorBody));
        r.readAsDataURL(file);
      });
      const { url } = await uploadFn({ data: { filename: file.name, dataUrl } });
      setForm((f) => ({ ...f, logoUrl: url }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setUploading(false);
    }
  }
  useEffect(() => {
    if (q.data) setForm(q.data.brand);
  }, [q.data]);

  async function save() {
    setBusy(true);
    try {
      const res = await saveFn({ data: form });
      setBrand(res.brand);
      forgetSite();
      await qc.invalidateQueries({ queryKey: ["brand-settings"] });
      await router.invalidate();
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-lg">
            <Palette className="size-5 text-primary" /> {copy.title}
          </h2>
          <p className="text-sm text-muted-foreground">{copy.help}</p>
        </div>
        <SaveButton dirty={!!q.data?.available && changed(form, q.data.brand)} busy={busy} onClick={() => void save()} />
      </div>
      {q.data && !q.data.available ? <p className="text-sm text-muted-foreground">{copy.notReady}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="b-name">{copy.name}</Label>
          <Input id="b-name" className="h-11" maxLength={40} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <p className="text-xs text-muted-foreground">{copy.preview(form.name.trim() || DEFAULT_BRAND.name)}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="b-tag">{copy.tagline}</Label>
          <Input id="b-tag" className="h-11" maxLength={120} value={form.tagline} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} />
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{copy.logoTitle}</legend>
        <p className="text-xs text-muted-foreground">{copy.logoHelp}</p>
        <div role="radiogroup" aria-label={copy.logoTitle} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BRAND_LOGO_MARKS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={form.logoMark === m && !form.logoUrl}
              onClick={() => setForm((f) => ({ ...f, logoMark: m, logoUrl: "" }))}
              className={cn(
                "flex flex-col items-center gap-2 rounded-2xl border p-3 text-center text-xs",
                form.logoMark === m && !form.logoUrl ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "border-border hover:bg-secondary",
              )}
            >
              {m === "initial" ? (
                <span className="grid size-12 place-items-center rounded-2xl bg-primary font-display text-xl text-primary-foreground">{(form.name.trim() || DEFAULT_BRAND.name).slice(0, 1).toUpperCase()}</span>
              ) : (
                <BrandMark variant={m as BrandMarkVariant} className="size-12" />
              )}
              {copy.logoMarks[m]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {form.logoUrl ? <img src={form.logoUrl} alt="" className="size-12 rounded-2xl border border-border object-contain" /> : null}
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-sm hover:bg-secondary">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} {copy.uploadLogo}
            <input type="file" accept=".png,.jpg,.jpeg,.webp,.svg" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
          </label>
          {form.logoUrl ? <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, logoUrl: "" }))}>{copy.removeLogo}</Button> : null}
        </div>
        <p className="text-xs text-muted-foreground">{copy.uploadHint} {copy.appIconNote}</p>
      </fieldset>
      <div className="space-y-1">
        <Label htmlFor="b-foot">{copy.footer}</Label>
        <Textarea id="b-foot" rows={2} maxLength={300} value={form.footer} onChange={(e) => setForm((f) => ({ ...f, footer: e.target.value }))} />
        <p className="text-xs text-muted-foreground">{copy.footerHint}</p>
      </div>
    </section>
  );
}

/** Super admin: hosts' own addresses, switched on once connected on the hosting. */
export function DomainsAdmin() {
  const listFn = useServerFn(listAllDomains);
  const liveFn = useServerFn(setDomainLive);
  const q = useQuery({ queryKey: ["all-domains"], queryFn: () => listFn() });
  const rows = q.data?.domains ?? [];
  return (
    <section className="card-soft space-y-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg">
          <Globe className="size-5 text-primary" /> {copy.domainsTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{copy.domainsHelp}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.domainsEmpty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {rows.map((d) => (
            <li key={d.domain} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-sm">{d.domain}</span>
                <span className="block text-xs text-muted-foreground">{d.business}</span>
              </span>
              <Badge variant={d.verified ? "secondary" : "outline"}>{d.verified ? copy.verified : copy.waiting}</Badge>
              <label className="flex items-center gap-2 text-sm">
                {copy.live}
                <Switch
                  checked={d.live}
                  disabled={!d.verified}
                  onCheckedChange={(v) =>
                    void liveFn({ data: { domain: d.domain, live: v } })
                      .then(() => q.refetch())
                      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : common.errorBody))
                  }
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
