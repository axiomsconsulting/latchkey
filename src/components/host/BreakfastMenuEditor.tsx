import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Coffee, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { breakfastCopy as copy, common } from "@/content/copy";
import { BREAKFAST_STYLES, type BreakfastStyle, type ExtraItem } from "@/lib/extras";
import { addPriceItem, deletePriceItem, savePriceItem } from "@/lib/extras.functions";
import { formatPence } from "@/lib/services";

const BLANK = { name: "", description: "", section: "", price: "" };

/**
 * Extras → Breakfast menu: the host's own à la carte dishes for each way
 * breakfast is served (light or packed, delivered to the room, in the dining
 * room), in menu sections, priced in the property's currency. Guests order
 * them for a morning and time from their stay guide; they're charged like
 * any extra.
 */
export function BreakfastMenuEditor({ propertyId, items, currency }: { propertyId: string; items: ExtraItem[]; currency: string }) {
  const qc = useQueryClient();
  const add = useServerFn(addPriceItem);
  const save = useServerFn(savePriceItem);
  const remove = useServerFn(deletePriceItem);
  const [draft, setDraft] = useState<Record<BreakfastStyle, typeof BLANK>>({ packed: { ...BLANK }, delivered: { ...BLANK }, dining: { ...BLANK } });
  const refresh = () => qc.invalidateQueries({ queryKey: ["price-list", propertyId] });

  async function run(work: () => Promise<unknown>, done?: string) {
    try {
      await work();
      await refresh();
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    }
  }

  const update = (it: ExtraItem, patch: Partial<ExtraItem>) => {
    const n = { ...it, ...patch };
    return run(() =>
      save({
        data: {
          propertyId,
          item: { key: n.key, name: n.name, pricePence: n.pricePence, unit: n.unit, maxQty: n.maxQty, isFree: n.isFree, autoApprove: n.autoApprove, active: n.active, isLoan: n.isLoan, description: n.description ?? "", breakfast: n.breakfast ?? null },
        },
      }),
    );
  };

  return (
    <section className="card-soft space-y-4 p-5" id="breakfast-menu">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary"><Coffee className="size-5" /></span>
        <div className="min-w-0">
          <h2 className="text-lg">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
      </div>
      <Tabs defaultValue="dining">
        <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-2xl p-1">
          {BREAKFAST_STYLES.map((st) => (
            <TabsTrigger key={st} value={st} className="h-10 rounded-xl px-4">
              {copy.styles[st]} <span className="ml-1.5 text-xs text-muted-foreground">({items.filter((i) => i.breakfast?.style === st).length})</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {BREAKFAST_STYLES.map((st) => {
          const list = items.filter((i) => i.breakfast?.style === st);
          const sections = [...new Set(list.map((i) => i.breakfast?.section ?? "").filter(Boolean))];
          const d = draft[st];
          const setD = (patch: Partial<typeof BLANK>) => setDraft((x) => ({ ...x, [st]: { ...x[st], ...patch } }));
          return (
            <TabsContent key={st} value={st} className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">{copy.styleHelp[st]}</p>
              {list.length === 0 ? <p className="rounded-xl bg-muted p-3 text-sm">{copy.empty}</p> : null}
              <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
                {list.map((it) => (
                  <li key={it.key} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_auto_auto] sm:items-center">
                    <div className="min-w-0 space-y-1">
                      <Input defaultValue={it.name} className="h-9" aria-label={copy.name} maxLength={80} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== it.name && void update(it, { name: e.target.value.trim() })} />
                      <Input defaultValue={it.description ?? ""} className="h-8 text-xs" placeholder={copy.descriptionPlaceholder} aria-label={copy.description} maxLength={200} onBlur={(e) => e.target.value.trim() !== (it.description ?? "") && void update(it, { description: e.target.value.trim() })} />
                    </div>
                    <Input
                      list={`bf-sections-${st}`}
                      defaultValue={it.breakfast?.section ?? ""}
                      className="h-9"
                      placeholder={copy.sectionPlaceholder}
                      aria-label={copy.section}
                      maxLength={40}
                      onBlur={(e) => e.target.value.trim() !== (it.breakfast?.section ?? "") && void update(it, { breakfast: { style: st, ...(e.target.value.trim() ? { section: e.target.value.trim() } : {}) } })}
                    />
                    <label className="flex items-center gap-1 text-sm">
                      <span className="sr-only">{copy.price}</span>
                      <Input type="number" step="0.5" min="0" defaultValue={(it.pricePence / 100).toFixed(2)} className="h-9" aria-label={copy.priceOf(it.name)}
                        onBlur={(e) => { const v = Math.round(Number(e.target.value) * 100); if (v !== it.pricePence) void update(it, { pricePence: v, isFree: v === 0 }); }} />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={it.active} onCheckedChange={(v) => void update(it, { active: v })} aria-label={copy.offeredOf(it.name)} />
                      <span className="text-muted-foreground sm:sr-only">{copy.offered}</span>
                    </label>
                    <Button size="icon" variant="ghost" className="size-9 text-destructive" aria-label={copy.removeOf(it.name)} onClick={() => confirm(copy.removeConfirm) && void run(() => remove({ data: { propertyId, key: it.key } }), copy.removed)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
              <datalist id={`bf-sections-${st}`}>{[...sections, ...copy.sectionIdeas].map((x) => <option key={x} value={x} />)}</datalist>

              {/* Add a dish: à la carte, priced in the property's currency. */}
              <div className="grid gap-3 rounded-2xl border border-dashed border-border p-4 sm:grid-cols-[minmax(0,1fr)_10rem_8rem]">
                <div className="space-y-1 sm:col-span-3">
                  <Label htmlFor={`bf-name-${st}`}>{copy.addTitle(copy.styles[st] ?? st)}</Label>
                  <Input id={`bf-name-${st}`} value={d.name} maxLength={80} placeholder={copy.namePlaceholder} onChange={(e) => setD({ name: e.target.value })} />
                </div>
                <Input value={d.description} maxLength={200} placeholder={copy.descriptionPlaceholder} aria-label={copy.description} onChange={(e) => setD({ description: e.target.value })} />
                <Input list={`bf-sections-${st}`} value={d.section} maxLength={40} placeholder={copy.sectionPlaceholder} aria-label={copy.section} onChange={(e) => setD({ section: e.target.value })} />
                <Input type="number" step="0.5" min="0" value={d.price} placeholder={formatPence(0, currency)} aria-label={copy.price} onChange={(e) => setD({ price: e.target.value })} />
                <Button
                  className="sm:col-span-3 sm:w-fit"
                  disabled={!d.name.trim()}
                  onClick={() =>
                    void run(async () => {
                      const pence = Math.round(Number(d.price || 0) * 100);
                      await add({
                        data: {
                          propertyId,
                          item: {
                            name: d.name.trim(), pricePence: pence, unit: "item", maxQty: 6, isFree: pence === 0, autoApprove: false, active: true, isLoan: false,
                            description: d.description.trim(), breakfast: { style: st, ...(d.section.trim() ? { section: d.section.trim() } : {}) },
                          },
                        },
                      });
                      setD({ ...BLANK });
                    }, copy.added)
                  }
                >
                  <Plus className="size-4" /> {copy.add}
                </Button>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </section>
  );
}
