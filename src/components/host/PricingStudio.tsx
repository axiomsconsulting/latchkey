import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { OfferSettings } from "@/components/host/OfferSettings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { common, studioCopy as copy } from "@/content/copy";
import {
  calibrateCosts,
  getPricingStudio,
  publishPricingModel,
  rebaseProjection,
  saveCostModel,
  saveProjection,
  unpublishPricingModel,
} from "@/lib/admin.functions";
import {
  FEATURES,
  breakEvenHosts,
  fixedCost,
  monthIndex,
  project,
  recommend,
  recommendApiAddon,
  summariseHosts,
  variableCost,
  type CostModel,
  type FeatureKey,
  type Plan,
  type PricingModel,
  type Projection,
} from "@/lib/pricing-model";
import { money } from "@/lib/pricing";
import { cn } from "@/lib/utils";

const pounds = (p: number) => (p / 100).toFixed(2);
const toPence = (v: string) => Math.max(0, Math.round(Number(v || 0) * 100));
const num = (v: string) => Math.max(0, Number(v || 0));

/** "2026-10" plus n months, as "Oct 2026" and its key. */
function monthAt(startedOn: string, plus: number) {
  const [y, m] = startedOn.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + plus, 1));
  return { key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) };
}

/** Super admin: plans and features, costs, recommendations, projections against actuals. */
export function PricingStudio() {
  const fetchStudio = useServerFn(getPricingStudio);
  const q = useQuery({ queryKey: ["pricing-studio"], queryFn: () => fetchStudio() });
  const [model, setModel] = useState<PricingModel | null>(null);
  const [costs, setCosts] = useState<CostModel | null>(null);
  const [proj, setProj] = useState<Projection | null>(null);

  useEffect(() => {
    if (!q.data) return;
    setModel(q.data.model);
    setCosts(q.data.costs);
    setProj(q.data.projection);
  }, [q.data]);

  if (q.isLoading || !q.data || !model || !costs || !proj) return <Skeleton className="h-96 rounded-2xl" />;
  const d = q.data;

  return (
    <div className="space-y-6">
      <p className={cn("rounded-2xl p-4", d.published ? "bg-success/10" : "bg-muted")}>{d.published ? copy.published : copy.notPublished}</p>
      {d.migrationPending ? <p className="rounded-2xl bg-destructive/10 p-4">{copy.migration}</p> : null}
      <OfferSettings />
      <Now model={model} costs={costs} proj={proj} hosts={d.hosts} usage30={d.usage30} />
      <Plans model={model} setModel={setModel} costs={costs} proj={proj} published={d.published} payers={summariseHosts(model, d.hosts).payers} />
      <Costs costs={costs} setCosts={setCosts} hosts={d.hosts} model={model} usage30={d.usage30} />
      <ProjectionView model={model} costs={costs} proj={proj} setProj={setProj} today={d.today} />
    </div>
  );
}

type Hosts = Parameters<typeof summariseHosts>[1];

function Now({ model, costs, proj, hosts, usage30 }: { model: PricingModel; costs: CostModel; proj: Projection; hosts: Hosts; usage30: Record<string, number> }) {
  const s = summariseHosts(model, hosts);
  const cost =
    fixedCost(costs) +
    variableCost(costs, { rooms: s.activeRooms, apiRequests: usage30["api:request"] ?? 0, aiReads: usage30["ai:id_read"] ?? 0 }) +
    s.revenuePence * costs.stripePct +
    s.payers * costs.stripeFixedPence;
  const profit = s.revenuePence - cost;
  const be = breakEvenHosts(model, costs, proj);
  const pct = Math.round(costs.margin * 100);
  const tiles: Array<[string, string]> = [
    [copy.payers, String(s.payers)],
    [copy.trials, String(s.trials)],
    [copy.revenue, money(s.revenuePence, model.currency)],
    [copy.cost, money(Math.round(cost), model.currency)],
    [copy.profit, `${money(Math.round(profit), model.currency)}${s.revenuePence ? ` · ${Math.round((profit / s.revenuePence) * 100)}%` : ""}`],
  ];
  return (
    <section className="space-y-3">
      <h2 className="text-xl">{copy.nowTitle}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map(([label, value]) => (
          <div key={label} className="card-soft p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn("mt-1 text-2xl font-semibold tabular-nums", label === copy.profit && profit < 0 && "text-destructive")}>{value}</p>
          </div>
        ))}
      </div>
      <p className={cn("rounded-xl p-3", be ? "bg-secondary" : "bg-destructive/10")}>
        {be ? copy.breakEven(be.breakEven, Number.isFinite(be.withMargin) ? be.withMargin : null, pct) : copy.losing}
      </p>
    </section>
  );
}

function Plans({
  model,
  setModel,
  costs,
  proj,
  published,
  payers,
}: {
  model: PricingModel;
  setModel: (m: PricingModel) => void;
  costs: CostModel;
  proj: Projection;
  published: boolean;
  payers: number;
}) {
  const publish = useServerFn(publishPricingModel);
  const unpublish = useServerFn(unpublishPricingModel);
  const qc = useQueryClient();
  const projected = Math.round(Object.values(proj.start).reduce((a, b) => a + b, 0));
  const [expected, setExpected] = useState(Math.max(payers, projected, 1));
  const [move, setMove] = useState(false);
  const [busy, setBusy] = useState(false);
  const recs = useMemo(
    () => recommend(model, costs, expected, Object.fromEntries(model.plans.map((p) => [p.key, { rooms: proj.rooms[p.key] ?? p.includedRooms, apiRequests: proj.apiRequests }]))),
    [model, costs, expected, proj],
  );
  const addonRec = recommendApiAddon(model, costs);
  const setPlan = (i: number, patch: Partial<Plan>) => setModel({ ...model, plans: model.plans.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  async function go(fn: () => Promise<string>) {
    setBusy(true);
    try {
      toast.success(await fn());
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-5 p-5">
      <div className="space-y-1">
        <h2 className="text-xl">{copy.plansTitle}</h2>
        <p className="text-muted-foreground">{copy.plansBody}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="expected">{copy.expected}</Label>
          <Input id="expected" type="number" min={1} className="w-32" value={expected} onChange={(e) => setExpected(Math.max(1, Number(e.target.value || 1)))} />
        </div>
        <Button
          variant="outline"
          onClick={() =>
            setModel({
              ...model,
              plans: model.plans.map((p) => {
                const r = recs.find((x) => x.key === p.key);
                return r ? { ...p, basePence: r.recommendedBasePence, extraRoomPence: r.recommendedExtraRoomPence } : p;
              }),
              apiAddon: { ...model.apiAddon, pricePence: addonRec },
            })
          }
        >
          <Sparkles className="size-4" /> {copy.applyAll}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {model.plans.map((p, i) => {
          const r = recs.find((x) => x.key === p.key);
          return (
            <article key={p.key} className={cn("space-y-3 rounded-2xl border border-border p-4", p.highlight && "ring-2 ring-primary")}>
              <div className="flex items-center justify-between gap-2">
                <Input aria-label={copy.name} value={p.name} onChange={(e) => setPlan(i, { name: e.target.value })} className="text-lg font-medium" />
                {p.highlight ? <Badge>{copy.recommended}</Badge> : null}
              </div>
              <Input aria-label={copy.tagline} placeholder={copy.tagline} value={p.tagline} onChange={(e) => setPlan(i, { tagline: e.target.value })} />
              <Field label={copy.base} value={pounds(p.basePence)} step="0.5" onChange={(v) => setPlan(i, { basePence: toPence(v) })} />
              {r ? (
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {copy.breakEvenPrice(money(r.breakEvenBasePence, model.currency), money(r.recommendedBasePence, model.currency))}
                  <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setPlan(i, { basePence: r.recommendedBasePence })}>
                    {copy.use}
                  </Button>
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Field label={copy.included} value={String(p.includedRooms)} onChange={(v) => setPlan(i, { includedRooms: Math.round(num(v)) })} />
                <Field label={copy.extraRoom} value={pounds(p.extraRoomPence)} step="0.1" onChange={(v) => setPlan(i, { extraRoomPence: toPence(v) })} />
              </div>
              <Field
                label={copy.maxProps}
                value={p.maxProperties === null ? "" : String(p.maxProperties)}
                onChange={(v) => setPlan(i, { maxProperties: v.trim() === "" ? null : Math.max(1, Math.round(num(v))) })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Field label={copy.apiReq} value={String(p.apiRequests)} step="1000" onChange={(v) => setPlan(i, { apiRequests: Math.round(num(v)) })} />
                <Field label={copy.aiReads} value={String(p.aiReads)} onChange={(v) => setPlan(i, { aiReads: Math.round(num(v)) })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={p.highlight}
                  onCheckedChange={(on) => setModel({ ...model, plans: model.plans.map((x, j) => ({ ...x, highlight: on ? j === i : j === i ? false : x.highlight })) })}
                />
                {copy.recommended}
              </label>
              <ul className="space-y-1.5 border-t border-border pt-3">
                {(Object.keys(FEATURES) as FeatureKey[]).map((f) => (
                  <li key={f}>
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox
                        className="mt-0.5"
                        checked={p.features.includes(f)}
                        onCheckedChange={(on) => setPlan(i, { features: on ? [...p.features, f] : p.features.filter((x) => x !== f) })}
                      />
                      {FEATURES[f]}
                    </label>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      <div className="space-y-2 rounded-2xl border border-border p-4">
        <h3 className="font-medium">{copy.addonTitle}</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label={copy.addonPrice} value={pounds(model.apiAddon.pricePence)} step="0.5" onChange={(v) => setModel({ ...model, apiAddon: { ...model.apiAddon, pricePence: toPence(v) } })} />
          <Field
            label={copy.addonRequests}
            value={String(model.apiAddon.includedRequests)}
            step="1000"
            onChange={(v) => setModel({ ...model, apiAddon: { ...model.apiAddon, includedRequests: Math.round(num(v)) } })}
          />
        </div>
        <p className="text-xs text-muted-foreground">{copy.addonRec(money(addonRec, model.currency))}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={move} onCheckedChange={setMove} /> {copy.moveSubs}
        </label>
        <Button
          disabled={busy}
          onClick={() =>
            void go(async () => {
              const r = await publish({ data: { model, moveSubscribers: move } });
              return copy.publishedToast(r.moved, r.failed);
            })
          }
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {copy.publish}
        </Button>
        {published ? (
          <Button variant="ghost" disabled={busy} onClick={() => void go(async () => (await unpublish(), copy.saved))}>
            {copy.unpublish}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function Field({ label, value, onChange, step }: { label: string; value: string; onChange: (v: string) => void; step?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="block space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <Input
        type="number"
        min={0}
        step={step ?? "1"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(text)}
        className="text-sm text-foreground"
      />
    </label>
  );
}

function Costs({
  costs,
  setCosts,
  hosts,
  model,
  usage30,
}: {
  costs: CostModel;
  setCosts: (c: CostModel) => void;
  hosts: Hosts;
  model: PricingModel;
  usage30: Record<string, number>;
}) {
  const save = useServerFn(saveCostModel);
  const cal = useServerFn(calibrateCosts);
  const qc = useQueryClient();
  const [total, setTotal] = useState("");
  const [ai, setAi] = useState("");
  const [busy, setBusy] = useState(false);
  const s = summariseHosts(model, hosts);

  async function go(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["pricing-studio"] });
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-5 p-5">
      <div className="space-y-1">
        <h2 className="text-xl">{copy.costsTitle}</h2>
        <p className="text-muted-foreground">{copy.costsBody}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(Object.keys(copy.costFields) as Array<keyof CostModel>).map((k) => {
          const [label, help] = copy.costFields[k]!;
          return (
            <div key={k}>
              <Field label={label} value={String(costs[k])} step="0.001" onChange={(v) => setCosts({ ...costs, [k]: num(v) })} />
              {help ? <p className="mt-0.5 text-xs text-muted-foreground">{help}</p> : null}
            </div>
          );
        })}
      </div>
      <Button variant="outline" disabled={busy} onClick={() => void go(() => save({ data: { costs } }), copy.saved)}>
        {copy.saveCosts}
      </Button>

      <div className="space-y-3 rounded-2xl border border-border p-4">
        <h3 className="font-medium">{copy.calibrateTitle}</h3>
        <p className="text-sm text-muted-foreground">{copy.counted(s.activeRooms, usage30["ai:id_read"] ?? 0, usage30["api:request"] ?? 0)}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>{copy.totalCredits}</span>
            <Input type="number" min={0} className="w-40" value={total} onChange={(e) => setTotal(e.target.value)} />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>{copy.aiCredits}</span>
            <Input type="number" min={0} className="w-40" value={ai} onChange={(e) => setAi(e.target.value)} />
          </label>
          <Button disabled={busy || total === ""} onClick={() => void go(() => cal({ data: { totalCredits: num(total), aiCredits: num(ai) } }), copy.calibrated)}>
            {copy.calibrate}
          </Button>
        </div>
      </div>
    </section>
  );
}

function ProjectionView({
  model,
  costs,
  proj,
  setProj,
  today,
}: {
  model: PricingModel;
  costs: CostModel;
  proj: Projection;
  setProj: (p: Projection) => void;
  today: string;
}) {
  const save = useServerFn(saveProjection);
  const rebase = useServerFn(rebaseProjection);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const rows = project(model, costs, proj);
  const startedOn = proj.startedOn ?? today;
  const current = monthIndex(proj.startedOn, today);
  const actual = new Map((proj.history ?? []).map((h) => [h.month, h]));
  const setMap = (field: "start" | "newPerMonth" | "rooms", key: string, v: string) => setProj({ ...proj, [field]: { ...proj[field], [key]: num(v) } });
  const cur = (p: number) => money(p, model.currency);

  async function go(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["pricing-studio"] });
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-5 p-5">
      <div className="space-y-1">
        <h2 className="text-xl">{copy.projTitle}</h2>
        <p className="text-muted-foreground">{copy.projBody}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {model.plans.map((p) => (
          <div key={p.key} className="space-y-2 rounded-2xl border border-border p-3">
            <h3 className="font-medium">{p.name}</h3>
            <div className="grid grid-cols-3 gap-2">
              <Field label={copy.projStart} value={String(proj.start[p.key] ?? 0)} onChange={(v) => setMap("start", p.key, v)} />
              <Field label={copy.projNew} value={String(proj.newPerMonth[p.key] ?? 0)} step="0.5" onChange={(v) => setMap("newPerMonth", p.key, v)} />
              <Field label={copy.projRooms} value={String(proj.rooms[p.key] ?? p.includedRooms)} onChange={(v) => setMap("rooms", p.key, v)} />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={copy.churn} value={String(proj.churnPct)} step="0.5" onChange={(v) => setProj({ ...proj, churnPct: Math.min(100, num(v)) })} />
        <Field label={copy.attach} value={String(proj.apiAttachPct)} onChange={(v) => setProj({ ...proj, apiAttachPct: Math.min(100, num(v)) })} />
        <Field label={copy.apiTypical} value={String(proj.apiRequests)} step="500" onChange={(v) => setProj({ ...proj, apiRequests: num(v) })} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void go(() => save({ data: { projection: proj as unknown as Record<string, unknown> } }), copy.saved)}>
          {copy.saveProj}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void go(() => rebase(), copy.rebased)}>
          {copy.rebase}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm tabular-nums">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">{copy.colMonth}</th>
              <th className="py-2 pr-3 font-medium">{copy.colHosts}</th>
              <th className="py-2 pr-3 font-medium">{copy.colRevenue}</th>
              <th className="py-2 pr-3 font-medium">{copy.colCost}</th>
              <th className="py-2 pr-3 font-medium">{copy.colProfit}</th>
              <th className="py-2 pr-3 font-medium">{copy.colMargin}</th>
              <th className="py-2 font-medium">{copy.colActual}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const m = monthAt(startedOn, r.month - 1);
              const a = actual.get(m.key);
              const aProfit = a ? a.revenuePence - a.costPence : 0;
              return (
                <tr key={r.month} className={cn(r.month === current && "bg-secondary/50")}>
                  <td className="py-2 pr-3">{m.label}</td>
                  <td className="py-2 pr-3">{r.hosts}</td>
                  <td className="py-2 pr-3">{cur(r.revenuePence)}</td>
                  <td className="py-2 pr-3">{cur(r.costPence)}</td>
                  <td className={cn("py-2 pr-3", r.profitPence < 0 && "text-destructive")}>{cur(r.profitPence)}</td>
                  <td className="py-2 pr-3">{r.marginPct}%</td>
                  <td className="py-2 text-xs">
                    {a ? (
                      <span className={cn(aProfit < 0 && "text-destructive")}>
                        {a.hosts} hosts · {cur(a.revenuePence)} − {cur(a.costPence)} = {cur(aProfit)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
