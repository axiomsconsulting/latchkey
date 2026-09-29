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
import { extrasCopy as copy, priceListUi as ui } from "@/content/copy";
import type { ExtraItem } from "@/lib/extras";
import { addPriceItem, deletePriceItem, getPriceList, reorderPriceItem, saveMoneySettings, savePriceItem } from "@/lib/extras.functions";

const UNITS = ["item", "hour", "pack", "bag_day"] as const;

const BLANK = { name: "", price: "3.00", unit: "item" as (typeof UNITS)[number], maxQty: 4, isFree: false, isLoan: false, autoApprove: false };

export function ExtrasPriceList({ propertyId, hostId }: { propertyId: string; hostId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(getPriceList);
  const saveItem = useServerFn(savePriceItem);
  const saveMoney = useServerFn(saveMoneySettings);
  const addItem = useServerFn(addPriceItem);
  const removeItem = useServerFn(deletePriceItem);
  const moveItem = useServerFn(reorderPriceItem);
  const q = useQuery({ queryKey: ["price-list", propertyId], queryFn: () => fn({ data: { propertyId } }) });
  const [money, setMoney] = useState({ registered: false, label: "VAT", rate: "20", pricesInclude: true, bank: "", outUntil: "" });
  const [draft, setDraft] = useState<typeof BLANK | null>(null);

  async function run(work: () => Promise<unknown>, done?: string) {
    try {
      await work();
      await qc.invalidateQueries({ queryKey: ["price-list", propertyId] });
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    }
  }

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
              <div className="flex items-center gap-1 sm:col-span-5">
                <Button size="sm" variant="ghost" aria-label={`${it.name}: ${ui.moveUp}`} onClick={() => run(() => moveItem({ data: { propertyId, key: it.key, direction: "up" } }))}>↑</Button>
                <Button size="sm" variant="ghost" aria-label={`${it.name}: ${ui.moveDown}`} onClick={() => run(() => moveItem({ data: { propertyId, key: it.key, direction: "down" } }))}>↓</Button>
                <Button size="sm" variant="ghost" className="text-destructive"
                  onClick={() => { if (confirm(ui.removeConfirm)) void run(() => removeItem({ data: { propertyId, key: it.key } }), ui.removed); }}>
                  {ui.remove}
                </Button>
              </div>
            </li>
          ))}
        </ul>

        {draft ? (
          <div className="mt-4 grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>{ui.name}</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div>
              <Label>{ui.price}</Label>
              <Input type="number" step="0.5" min="0" disabled={draft.isFree} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
            </div>
            <div>
              <Label>{ui.unit}</Label>
              <select className="h-10 w-full rounded-xl border border-border bg-surface px-3" value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value as (typeof UNITS)[number] })}>
                {UNITS.map((u) => <option key={u} value={u}>{copy.units[u]}</option>)}
              </select>
            </div>
            <div><Label>{ui.maxQty}</Label><Input type="number" min="1" max="20" value={draft.maxQty} onChange={(e) => setDraft({ ...draft, maxQty: Number(e.target.value) })} /></div>
            <div className="flex flex-wrap items-center gap-4 pt-6">
              <label className="flex items-center gap-2 text-sm"><Switch checked={draft.isFree} onCheckedChange={(v) => setDraft({ ...draft, isFree: v })} />{ui.isFree}</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={draft.isLoan} onCheckedChange={(v) => setDraft({ ...draft, isLoan: v })} />{ui.isLoan}</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={draft.autoApprove} onCheckedChange={(v) => setDraft({ ...draft, autoApprove: v })} />{copy.autoApprove}</label>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button
                disabled={!draft.name.trim()}
                onClick={() => run(async () => {
                  await addItem({ data: { propertyId, item: {
                    name: draft.name.trim(), pricePence: draft.isFree ? 0 : Math.round(Number(draft.price || 0) * 100),
                    unit: draft.unit, maxQty: draft.maxQty, isFree: draft.isFree, autoApprove: draft.autoApprove, active: true, isLoan: draft.isLoan,
                  } } });
                  setDraft(null);
                }, ui.added)}
              >
                {ui.addItem}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>{copy.cancel}</Button>
            </div>
          </div>
        ) : (
          <Button className="mt-4" variant="outline" onClick={() => setDraft({ ...BLANK })}>{ui.addItem}</Button>
        )}
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
