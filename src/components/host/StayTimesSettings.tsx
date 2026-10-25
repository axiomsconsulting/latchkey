import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock } from "lucide-react";
import { toast } from "sonner";

import { SaveButton, changed } from "@/components/host/SaveButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { common, stayTimesCopy as copy } from "@/content/copy";
import { formatPence } from "@/lib/services";
import { getPriceList, getStayBuffer, saveStayTimes } from "@/lib/extras.functions";
import { BUFFER_CHOICES, DEFAULT_SLOT, earlyChoices, lateChoices, SLOT_STEPS } from "@/lib/stay-times";
import { currencySymbol } from "@/lib/world";

type Rule = { active: boolean; price: string; stepHours: number; limit: string; maxSteps: number; autoApprove: boolean };

/**
 * Properties → Extras → Early check-in and late check-out: sold in blocks of
 * hours at a price a block, up to the latest check-out / back to the
 * earliest check-in, never closer than the buffer to the guests either side
 * in the room. A preview shows what a guest would be offered on a quiet day.
 * Times the host sets on a stay by hand (Bookings) override these.
 */
export function StayTimesSettings({ propertyId }: { propertyId: string }) {
  const priceFn = useServerFn(getPriceList);
  const bufferFn = useServerFn(getStayBuffer);
  const saveFn = useServerFn(saveStayTimes);
  const qc = useQueryClient();
  const prices = useQuery({ queryKey: ["price-list", propertyId], queryFn: () => priceFn({ data: { propertyId } }) });
  const buffer = useQuery({ queryKey: ["stay-buffer", propertyId], queryFn: () => bufferFn({ data: { propertyId } }) });
  const [form, setForm] = useState<{ late: Rule; early: Rule; buffer: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const saved = (() => {
    if (!prices.data || !buffer.data) return null;
    const rule = (key: string, kind: "late" | "early"): Rule => {
      const it = prices.data.items.find((i) => i.key === key);
      const slot = it?.slot ?? DEFAULT_SLOT[kind];
      return { active: it?.active ?? false, price: ((it?.isFree ? 0 : (it?.pricePence ?? 1000)) / 100).toFixed(2), stepHours: slot.stepHours, limit: slot.limit, maxSteps: it?.maxQty ?? 3, autoApprove: it?.autoApprove ?? false };
    };
    return { late: rule("late_checkout", "late"), early: rule("early_checkin", "early"), buffer: buffer.data.bufferMinutes };
  })();
  useEffect(() => {
    if (saved) setForm(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices.data, buffer.data]);

  if (!form || !saved || !prices.data) return <Skeleton className="h-64 rounded-2xl" />;
  const cur = prices.data.currency;
  const pence = (v: string) => Math.max(0, Math.round(Number(v || 0) * 100));

  async function save() {
    setBusy(true);
    try {
      const out = (r: Rule) => ({ active: r.active, pricePence: pence(r.price), stepHours: r.stepHours, limit: r.limit, maxSteps: r.maxSteps, autoApprove: r.autoApprove });
      await saveFn({ data: { propertyId, late: out(form!.late), early: out(form!.early), bufferMinutes: form!.buffer } });
      await Promise.all([qc.invalidateQueries({ queryKey: ["price-list", propertyId] }), qc.invalidateQueries({ queryKey: ["stay-buffer", propertyId] })]);
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  const set = (kind: "late" | "early", patch: Partial<Rule>) => setForm((f) => f && { ...f, [kind]: { ...f[kind], ...patch } });
  const preview = (kind: "late" | "early") => {
    const r = form[kind];
    const opts = kind === "late"
      ? lateChoices({ checkOut: "11:00", slot: { stepHours: r.stepHours, limit: r.limit }, pricePence: pence(r.price), maxSteps: r.maxSteps, nextArrival: null, bufferMinutes: form.buffer })
      : earlyChoices({ checkIn: "15:00", slot: { stepHours: r.stepHours, limit: r.limit }, pricePence: pence(r.price), maxSteps: r.maxSteps, prevDeparture: null, bufferMinutes: form.buffer });
    return opts.length ? opts.map((o) => `${o.time} (${o.pricePence ? formatPence(o.pricePence, cur) : copy.free})`).join(" · ") : copy.noneOffered;
  };

  const block = (kind: "late" | "early") => {
    const r = form[kind];
    return (
      <div className="space-y-3 rounded-xl border border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`st-${kind}`} className="text-base">{kind === "late" ? copy.lateTitle : copy.earlyTitle}</Label>
          <Switch id={`st-${kind}`} checked={r.active} onCheckedChange={(v) => set(kind, { active: v })} />
        </div>
        {r.active ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="block text-xs text-muted-foreground">{copy.block}</span>
                <select className="h-10 w-full rounded-xl border border-input bg-surface px-3" value={r.stepHours} onChange={(e) => set(kind, { stepHours: Number(e.target.value) })}>
                  {SLOT_STEPS.map((h) => <option key={h} value={h}>{copy.hours(h)}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="block text-xs text-muted-foreground">{copy.pricePerBlock(currencySymbol(cur))}</span>
                <Input className="h-10" inputMode="decimal" value={r.price} onChange={(e) => set(kind, { price: e.target.value })} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="block text-xs text-muted-foreground">{kind === "late" ? copy.latest : copy.earliest}</span>
                <Input className="h-10" type="time" value={r.limit} onChange={(e) => set(kind, { limit: e.target.value || r.limit })} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="block text-xs text-muted-foreground">{copy.maxBlocks}</span>
                <Input className="h-10" inputMode="numeric" value={String(r.maxSteps)} onChange={(e) => set(kind, { maxSteps: Math.min(12, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)) })} />
              </label>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={r.autoApprove} onCheckedChange={(v) => set(kind, { autoApprove: v })} />
              {copy.autoApprove}
            </label>
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              {kind === "late" ? copy.previewLate : copy.previewEarly} <span className="font-medium text-foreground">{preview(kind)}</span>
            </p>
          </>
        ) : null}
      </div>
    );
  };

  return (
    <section id="property-times" data-tour="property-times" className="card-soft scroll-mt-24 space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg"><Clock className="size-5 text-primary" /> {copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <SaveButton dirty={changed(form, saved)} busy={busy} onClick={() => void save()} />
      </div>
      <label className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 text-sm">
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium">{copy.buffer}</span>
          <span className="block text-muted-foreground">{copy.bufferHelp}</span>
        </span>
        <select className="h-10 rounded-xl border border-input bg-surface px-3" value={form.buffer} onChange={(e) => setForm({ ...form, buffer: Number(e.target.value) })} aria-label={copy.buffer}>
          {BUFFER_CHOICES.map((m) => <option key={m} value={m}>{copy.minutes(m)}</option>)}
        </select>
      </label>
      <div className="grid gap-3 lg:grid-cols-2">
        {block("early")}
        {block("late")}
      </div>
      <p className="text-xs text-muted-foreground">{copy.override}</p>
    </section>
  );
}
