import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SaveButton, changed } from "@/components/host/SaveButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { common, directRatesCopy as copy } from "@/content/copy";
import { getDirectRates, saveDirectRates } from "@/lib/direct.functions";
import type { SeasonalOffer } from "@/lib/direct-rates";
import { cn } from "@/lib/utils";

type OfferDraft = Omit<SeasonalOffer, "percent"> & { percent: string };
const toDraft = (o: SeasonalOffer): OfferDraft => ({ ...o, percent: String(o.percent) });
const pounds = (pence: number | null) => (pence === null ? "" : (pence / 100).toFixed(pence % 100 === 0 ? 0 : 2));

/**
 * Direct stays → Rates and seasonal offers, for one property: each room's
 * base nightly rate on the "Stay with us" page, and offers (a percentage off
 * the nights from one date to another, for every room or chosen ones). The
 * page shows rates and estimated totals; the host confirms each request.
 */
export function DirectRates({ propertyId }: { propertyId: string }) {
  const fetchFn = useServerFn(getDirectRates);
  const saveFn = useServerFn(saveDirectRates);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["direct-rates", propertyId], queryFn: () => fetchFn({ data: { propertyId } }) });
  const [rates, setRates] = useState<Record<string, string>>({});
  const [offers, setOffers] = useState<OfferDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const saved = q.data ? { rates: Object.fromEntries(q.data.rooms.map((r) => [r.id, pounds(r.ratePence)])), offers: q.data.offers.map(toDraft) } : null;
  useEffect(() => {
    if (!saved) return;
    setRates(saved.rates);
    setOffers(saved.offers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  if (q.isLoading || !q.data) return <Skeleton className="h-48 rounded-2xl" />;
  const d = q.data;
  const dirty = !!saved && changed({ rates, offers }, saved);
  const setOffer = (i: number, patch: Partial<OfferDraft>) => setOffers((os) => os.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  async function save() {
    const bad = offers.find((o) => !o.from || !o.to || o.to < o.from || !(Number(o.percent) >= 1 && Number(o.percent) <= 90));
    if (bad) return void toast.error(copy.offerProblem);
    setBusy(true);
    try {
      await saveFn({
        data: {
          propertyId,
          rates: d.rooms.map((r) => {
            const v = (rates[r.id] ?? "").replace(/[^0-9.]/g, "");
            return { roomId: r.id, ratePence: v ? Math.round(Number(v) * 100) : null };
          }),
          offers: offers.map((o) => ({ ...o, percent: Number(o.percent) })),
        },
      });
      await qc.invalidateQueries({ queryKey: ["direct-rates", propertyId] });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        {d.available ? <SaveButton dirty={dirty} busy={busy} onClick={() => void save()} /> : null}
      </div>
      {!d.available ? <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p> : null}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">{copy.ratesTitle(d.currency)}</h3>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {d.rooms.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-xl border border-border p-2.5">
              <Label htmlFor={`rate-${r.id}`} className="min-w-0 flex-1 truncate">{r.name}</Label>
              <Input
                id={`rate-${r.id}`}
                inputMode="decimal"
                className="h-10 w-28 text-right"
                placeholder={copy.noRate}
                value={rates[r.id] ?? ""}
                onChange={(e) => setRates((x) => ({ ...x, [r.id]: e.target.value }))}
                aria-label={copy.rateFor(r.name)}
              />
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{copy.ratesHelp}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium"><Tag className="size-4 text-accent" /> {copy.offersTitle}</h3>
          <Button
            size="sm"
            variant="outline"
            disabled={offers.length >= 20}
            onClick={() => setOffers((os) => [...os, { id: `offer-${Date.now().toString(36)}`, label: "", from: "", to: "", percent: "10", roomIds: null }])}
          >
            <Plus className="size-4" /> {copy.addOffer}
          </Button>
        </div>
        {offers.length === 0 ? <p className="text-sm text-muted-foreground">{copy.noOffers}</p> : null}
        <ul className="space-y-2">
          {offers.map((o, i) => (
            <li key={o.id} className="space-y-2 rounded-xl border border-border p-3">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_6rem_auto] sm:items-end">
                <div className="space-y-1">
                  <Label className="text-xs">{copy.offerName}</Label>
                  <Input className="h-10" maxLength={60} placeholder={copy.offerPlaceholder} value={o.label} onChange={(e) => setOffer(i, { label: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{copy.from}</Label>
                  <Input className="h-10" type="date" value={o.from} onChange={(e) => setOffer(i, { from: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{copy.to}</Label>
                  <Input className="h-10" type="date" min={o.from} value={o.to} onChange={(e) => setOffer(i, { to: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{copy.percent}</Label>
                  <Input className="h-10" inputMode="numeric" value={o.percent} onChange={(e) => setOffer(i, { percent: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
                </div>
                <Button variant="ghost" size="icon" className="text-destructive" aria-label={copy.removeOffer} onClick={() => setOffers((os) => os.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              {/* Every room, or just the ones picked. */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">{copy.appliesTo}</span>
                <button type="button" onClick={() => setOffer(i, { roomIds: null })} className={cn("rounded-full border px-2.5 py-1", o.roomIds === null ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>
                  {copy.allRooms}
                </button>
                {d.rooms.map((r) => {
                  const on = !!o.roomIds?.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const next = on ? (o.roomIds ?? []).filter((x) => x !== r.id) : [...(o.roomIds ?? []), r.id];
                        setOffer(i, { roomIds: next.length ? next : null });
                      }}
                      className={cn("rounded-full border px-2.5 py-1", on ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
