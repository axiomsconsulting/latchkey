import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdminStatus, getPricing, savePricing } from "@/lib/pricing.functions";
import { DEFAULT_PRICING } from "@/lib/pricing";
import { pricingCopy as c } from "@/content/copy";

const FIELDS = [
  ["base_pence", "First property and room (p / month)"],
  ["extra_room_pence", "Each extra room (p / month)"],
  ["extra_property_pence", "Each extra property (p / month)"],
  ["trial_days", "Free trial (days)"],
] as const;

/** Only rendered for super admins. */
export function PricingAdmin() {
  const status = useServerFn(getAdminStatus);
  const fetchPricing = useServerFn(getPricing);
  const save = useServerFn(savePricing);
  const qc = useQueryClient();
  const admin = useQuery({ queryKey: ["admin-status"], queryFn: () => status() });
  const pricing = useQuery({ queryKey: ["pricing"], queryFn: () => fetchPricing(), enabled: !!admin.data?.isAdmin });
  const [form, setForm] = useState<Record<string, number>>({ ...DEFAULT_PRICING } as any);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (pricing.data) setForm({ ...pricing.data } as any); }, [pricing.data]);
  if (!admin.data?.isAdmin) return null;

  async function submit() {
    setBusy(true);
    try {
      await save({ data: { base_pence: form["base_pence"] ?? 0, extra_room_pence: form["extra_room_pence"] ?? 0, extra_property_pence: form["extra_property_pence"] ?? 0, trial_days: form["trial_days"] ?? 0 } });
      await qc.invalidateQueries({ queryKey: ["pricing"] });
      toast.success(c.saved);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <section className="card-soft p-5">
      <h2 className="text-lg">{c.adminTitle}</h2>
      <p className="text-sm text-muted-foreground">{c.adminBody}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([k, label]) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={k}>{label}</Label>
            <Input id={k} type="number" min={0} value={form[k] ?? 0} onChange={(e) => setForm({ ...form, [k]: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
          </div>
        ))}
      </div>
      <Button className="mt-4" onClick={submit} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}Save pricing</Button>
    </section>
  );
}
