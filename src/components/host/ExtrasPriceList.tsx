import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { extrasCopy as copy } from "@/content/copy";
import type { ExtraItem } from "@/lib/extras";
import { getPriceList, saveMoneySettings, savePriceItem } from "@/lib/extras.functions";

export function ExtrasPriceList({ propertyId, hostId }: { propertyId: string; hostId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(getPriceList);
  const saveItem = useServerFn(savePriceItem);
  const saveMoney = useServerFn(saveMoneySettings);
  const q = useQuery({ queryKey: ["price-list", propertyId], queryFn: () => fn({ data: { propertyId } }) });
  const [money, setMoney] = useState({ registered: false, label: "VAT", rate: "20", pricesInclude: true, bank: "", outUntil: "" });

  useEffect(() => {
    if (!q.data) return;
    const t = q.data.tax;
    setMoney({ registered: t.registered, label: t.label, rate: String(t.rateBp / 100), pricesInclude: t.pricesInclude, bank: q.data.bankDetails, outUntil: q.data.outUntil ? q.data.outUntil.slice(0, 16) : "" });
  }, [q.data]);

  async function update(item: ExtraItem, patch: Partial<ExtraItem>) {
    const next = { ...item, ...patch };
    try {
      await saveItem({ data: { propertyId, item: { key: next.key, name: next.name, pricePence: next.pricePence, unit: next.unit, maxQty: next.maxQty, isFree: next.isFree, autoApprove: next.autoApprove, active: next.active, isLoan: next.isLoan } } });
      await qc.invalidateQueries({ queryKey: ["price-list", propertyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    }
  }

  async function submitMoney() {
    try {
      await saveMoney({ data: {
        hostId, registered: money.registered, label: money.label, rateBp: Math.round(Number(money.rate || 0) * 100),
        pricesInclude: money.pricesInclude, bankDetails: money.bank, outUntil: money.outUntil ? new Date(money.outUntil).toISOString() : null,
      } });
      toast.success(copy.saved);
      await qc.invalidateQueries({ queryKey: ["price-list", propertyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    }
  }

  if (q.isLoading || !q.data) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <div className="space-y-6">
      <section className="card-soft p-5">
        <h2 className="text-lg">{copy.priceList}</h2>
        <p className="text-sm text-muted-foreground">{copy.priceListSub}</p>
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {q.data.items.map((it) => (
            <li key={it.key} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center">
              <div>
                <p className="font-medium">{it.name}</p>
                <p className="text-xs text-muted-foreground">{copy.units[it.unit]}</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                {q.data.currency}
                <Input
                  type="number" step="0.5" min="0" disabled={it.isFree} defaultValue={(it.pricePence / 100).toFixed(2)} className="w-24"
                  aria-label={`${it.name} price`}
                  onBlur={(e) => { const v = Math.round(Number(e.target.value) * 100); if (v !== it.pricePence) update(it, { pricePence: v }); }}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                {copy.max}
                <Input type="number" min="1" max="20" defaultValue={it.maxQty} className="w-16" aria-label={`${it.name} max`}
                  onBlur={(e) => { const v = Number(e.target.value); if (v !== it.maxQty && v >= 1) update(it, { maxQty: v }); }} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={it.autoApprove} onCheckedChange={(v) => update(it, { autoApprove: v })} aria-label={`${it.name} auto-approve`} />
                {copy.autoApprove}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={it.active} onCheckedChange={(v) => update(it, { active: v })} aria-label={`${it.name} offered`} />
                {it.isFree ? copy.free : copy.active}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="card-soft space-y-4 p-5">
        <h2 className="text-lg">{copy.money}</h2>
        <label className="flex items-center gap-3"><Switch checked={money.registered} onCheckedChange={(v) => setMoney({ ...money, registered: v })} />{copy.taxRegistered}</label>
        {money.registered ? (
          <div className="flex flex-wrap gap-4">
            <div><Label>{copy.taxLabel}</Label><Input value={money.label} onChange={(e) => setMoney({ ...money, label: e.target.value })} className="w-28" /></div>
            <div><Label>{copy.taxRate}</Label><Input type="number" value={money.rate} onChange={(e) => setMoney({ ...money, rate: e.target.value })} className="w-24" /></div>
            <label className="flex items-center gap-3 self-end pb-2"><Switch checked={money.pricesInclude} onCheckedChange={(v) => setMoney({ ...money, pricesInclude: v })} />{copy.pricesInclude}</label>
          </div>
        ) : null}
        <div><Label>{copy.bank}</Label><Textarea value={money.bank} onChange={(e) => setMoney({ ...money, bank: e.target.value })} placeholder="Name, sort code, account number" /></div>
        <div><Label>{copy.outUntil}</Label><Input type="datetime-local" value={money.outUntil} onChange={(e) => setMoney({ ...money, outUntil: e.target.value })} className="w-64" /></div>
        <Button onClick={submitMoney}>{copy.save}</Button>
      </section>
    </div>
  );
}
