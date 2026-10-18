import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Globe, Loader2, Palette } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { brandAdminCopy as copy, common } from "@/content/copy";
import { DEFAULT_BRAND, setBrand } from "@/lib/brand";
import { listAllDomains, setDomainLive } from "@/lib/domains.functions";
import { getBrandSettings, saveBrandSettings } from "@/lib/site.functions";
import { forgetSite } from "@/lib/site-client";

/** Super admin: the white label. One name drives every mention of the product. */
export function BrandAdmin() {
  const fetchFn = useServerFn(getBrandSettings);
  const saveFn = useServerFn(saveBrandSettings);
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery({ queryKey: ["brand-settings"], queryFn: () => fetchFn() });
  const [form, setForm] = useState({ name: DEFAULT_BRAND.name, tagline: DEFAULT_BRAND.tagline, footer: "" });
  const [busy, setBusy] = useState(false);
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
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg">
          <Palette className="size-5 text-primary" /> {copy.title}
        </h2>
        <p className="text-sm text-muted-foreground">{copy.help}</p>
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
      <div className="space-y-1">
        <Label htmlFor="b-foot">{copy.footer}</Label>
        <Textarea id="b-foot" rows={2} maxLength={300} value={form.footer} onChange={(e) => setForm((f) => ({ ...f, footer: e.target.value }))} />
        <p className="text-xs text-muted-foreground">{copy.footerHint}</p>
      </div>
      <Button onClick={() => void save()} disabled={busy || !q.data?.available}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null} {common.save}
      </Button>
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
