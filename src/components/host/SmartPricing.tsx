import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, ChevronDown, Plus, RefreshCw, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { InfoTip } from "@/components/host/InfoTip";
import { SaveButton, changed } from "@/components/host/SaveButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { common, smartPricingCopy as copy } from "@/content/copy";
import { money } from "@/lib/direct-rates";
import {
  PRICE_SITES,
  SITE_FEES,
  SITE_OFFERS,
  defaultFee,
  directNet,
  feeFor,
  MAX_READS,
  normaliseSmartPricing,
  paymentFee,
  priceSiteForUrl,
  type PayWay,
  type PriceSite,
  type Schedule,
  type SmartPricing as Settings,
} from "@/lib/smart-pricing";
import {
  acceptPriceSuggestions,
  checkPricesNow,
  getSmartPricing,
  saveSmartPricing,
} from "@/lib/smart-pricing.functions";
import { cn } from "@/lib/utils";

const PAY_WAYS: PayWay[] = [
  "card_standard",
  "card_premium",
  "card_eea",
  "card_intl",
  "pay_by_bank",
  "bank_transfer",
];

const toUnits = (pence: number | undefined) =>
  pence === undefined ? "" : (pence / 100).toFixed(pence % 100 === 0 ? 0 : 2);
const fromUnits = (v: string) => {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return v.trim() && Number.isFinite(n) ? Math.round(n * 100) : null;
};
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const dateText = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

/**
 * Direct stays → Set-up → Smart pricing (rules in src/lib/smart-pricing.ts): what guests pay on
 * the booking sites, the suggested direct rate and site prices per room with one-tap accept, and
 * the settings behind them, folded underneath.
 */
export function SmartPricing({ propertyId }: { propertyId: string }) {
  const getFn = useServerFn(getSmartPricing);
  const saveFn = useServerFn(saveSmartPricing);
  const checkFn = useServerFn(checkPricesNow);
  const acceptFn = useServerFn(acceptPriceSuggestions);
  const qc = useQueryClient();
  const key = ["smart-pricing", propertyId];
  const q = useQuery({ queryKey: key, queryFn: () => getFn({ data: { propertyId } }) });
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState<"save" | "check" | "accept" | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (q.data) setS(q.data.settings);
  }, [q.data]);

  const d = q.data;
  const currency = d?.currency ?? "GBP";
  const m = (p: number) => money(p, currency);
  const dirty = !!d && !!s && changed(s, d.settings);
  const set = (patch: Partial<Settings>) => setS((x) => (x ? { ...x, ...patch } : x));

  // The sites shown in settings: where any room or the property is listed, or a watched property is.
  const sites = useMemo(() => {
    if (!d || !s) return [] as PriceSite[];
    const used = new Set<string>([
      ...d.rooms.flatMap((r) => r.listed),
      ...s.market.map((x) => x.site),
      ...d.picture.flatMap((p) => p.sites.map((x) => x.site)),
    ]);
    const list = PRICE_SITES.filter((x) => used.has(x));
    return list.length ? list : (["booking_com", "airbnb"] as PriceSite[]);
  }, [d, s]);

  if (q.isLoading || !d || !s) return <Skeleton className="h-48 rounded-2xl" />;
  if (!d.available)
    return (
      <section className="card-soft p-5">
        <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p>
      </section>
    );

  async function save() {
    setBusy("save");
    try {
      await saveFn({ data: { propertyId, settings: s as unknown as Record<string, unknown> } });
      await qc.invalidateQueries({ queryKey: key });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    setBusy("check");
    const t = toast.loading(copy.checking);
    try {
      const r = await checkFn({ data: { propertyId } });
      toast.success(copy.checked(r.found, r.pages), { id: t });
      for (const p of r.problems) toast.error(p);
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody, { id: t });
    } finally {
      setBusy(null);
    }
  }

  const acceptable = d.picture.filter(
    (p) => p.direct.suggested !== null && p.direct.suggested !== p.room.rate,
  );
  async function accept(list: typeof acceptable) {
    setBusy("accept");
    try {
      await acceptFn({
        data: {
          propertyId,
          rates: list.map((p) => ({ roomId: p.room.id, ratePence: p.direct.suggested! })),
        },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: key }),
        qc.invalidateQueries({ queryKey: ["direct-rates", propertyId] }),
      ]);
      toast.success(copy.accepted);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  const haveTargets = d.rooms.some((r) => r.listed.length) || d.ownLinks > 0 || s.market.length > 0;

  return (
    <section className="card-soft space-y-5 p-5" data-tour="smart-pricing">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1 text-lg">
            {copy.title}
            <InfoTip label={copy.title}>
              <p>{copy.reading}</p>
              <p className="mt-2">{copy.parity}</p>
            </InfoTip>
          </h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <SaveButton dirty={dirty} busy={busy === "save"} onClick={() => void save()} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={s.on} onCheckedChange={(on) => set({ on })} />
          <span>
            <span className="font-medium">{copy.on}</span>
            <span className="block text-xs text-muted-foreground">{copy.onHelp}</span>
          </span>
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {d.lastRead ? copy.lastRead(when(d.lastRead)) : copy.neverRead}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={!d.canRead || !haveTargets || busy !== null}
            onClick={() => void check()}
          >
            <RefreshCw className={cn("size-4", busy === "check" && "animate-spin")} />
            {copy.checkNow}
          </Button>
        </div>
      </div>
      {!d.canRead ? <p className="rounded-xl bg-muted p-3 text-sm">{copy.readingOff}</p> : null}
      {!haveTargets ? <p className="rounded-xl bg-muted p-3 text-sm">{copy.noLinks}</p> : null}
      {d.notes.length ? (
        <p className="text-xs text-muted-foreground">{d.notes.join(" · ")}</p>
      ) : null}

      {/* Suggestions, room by room. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1 text-sm font-medium">
            {copy.suggestions}
            <InfoTip label={copy.suggestions}>{copy.siteHelp}</InfoTip>
          </h3>
          {acceptable.length > 1 ? (
            <Button size="sm" disabled={busy !== null} onClick={() => void accept(acceptable)}>
              <Check className="size-4" />
              {copy.acceptAll(acceptable.length)}
            </Button>
          ) : null}
        </div>
        <ul className="space-y-2">
          {d.picture.map((p) => {
            const sug = p.direct;
            const diff = sug.suggested !== null && sug.suggested !== p.room.rate;
            return (
              <li key={p.room.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1 truncate font-medium">{p.room.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {copy.now}: {p.room.rate !== null ? m(p.room.rate) : copy.noRate}
                  </span>
                  {sug.suggested !== null ? (
                    <>
                      <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                      <span className="font-semibold tabular-nums">{m(sug.suggested)}</span>
                      {diff ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy !== null}
                          onClick={() => void accept([p])}
                        >
                          {copy.accept}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{copy.same}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">{copy.noSuggestion}</span>
                  )}
                </div>
                {sug.suggested !== null ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      sug.basis === "own" ? copy.basisOwn : copy.basisMarket,
                      sug.keepDirect !== null ? copy.keep(m(sug.keepDirect)) : null,
                      sug.floored ? copy.floored : null,
                      sug.stepped ? copy.stepped(s.maxStepPct) : null,
                      sug.ignored ? copy.ignored(sug.ignored) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
                {sug.offerWarnings.map((w) => (
                  <p key={w.offer} className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    {copy.offerWarning(w.offer, m(w.price))}
                  </p>
                ))}
                {p.sites.length && (sug.suggested ?? p.room.rate) ? (
                  <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {p.sites.map((x) => (
                      <li key={x.site} className="rounded-lg bg-muted/60 p-2 text-xs">
                        <span className="font-medium">{copy.onSite(SITE_FEES[x.site].label)}</span>
                        {x.now !== null ? <> · {copy.seenThere(m(x.now))}</> : null}
                        {x.pausedUntil && x.changedOn ? (
                          <p className="mt-0.5 text-muted-foreground">
                            {copy.paused(dateText(x.changedOn), dateText(x.pausedUntil))}
                          </p>
                        ) : (
                          <p className="mt-0.5">
                            <span className="font-semibold">{copy.setThere(m(x.suggested))}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              · {copy.siteKeep(m(x.guestPays), m(x.keep))}
                            </span>
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <FeesTable s={s} country={d.country} m={m} />

      {/* Everything behind the suggestions, folded away. */}
      <div className="rounded-xl border border-border">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 p-3 text-left font-medium"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="flex items-center gap-2">
            <TrendingUp className="size-4" aria-hidden />
            {copy.settings}
          </span>
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
        {open ? (
          <div className="space-y-6 border-t border-border p-3">
            <ScheduleField value={s.schedule} onChange={(schedule) => set({ schedule })} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Choice
                label={copy.compareWith}
                value={s.reference}
                options={copy.references}
                onChange={(v) => set({ reference: v as Settings["reference"] })}
              />
              <Choice
                label={copy.compareTo}
                value={s.compareTo}
                options={copy.compareTos}
                onChange={(v) => set({ compareTo: v as Settings["compareTo"] })}
              />
            </div>

            <div className="space-y-2">
              <Label>{copy.position}</Label>
              <div
                role="radiogroup"
                aria-label={copy.position}
                className="grid gap-2 sm:grid-cols-4"
              >
                {(["below", "match", "above", "same_earnings"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={s.position.mode === mode}
                    onClick={() => set({ position: { ...s.position, mode } })}
                    className={cn(
                      "rounded-xl border p-2.5 text-left text-sm transition-colors",
                      s.position.mode === mode
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {copy.modes[mode]}
                  </button>
                ))}
              </div>
              {s.position.mode === "below" || s.position.mode === "above" ? (
                <div className="flex items-center gap-2">
                  <Input
                    inputMode="decimal"
                    className="h-10 w-24 text-right"
                    aria-label={copy.position}
                    value={
                      s.position.by === "percent"
                        ? String(s.position.value)
                        : toUnits(s.position.value)
                    }
                    onChange={(e) => {
                      const v =
                        s.position.by === "percent"
                          ? Number(e.target.value.replace(/[^0-9.]/g, "")) || 0
                          : (fromUnits(e.target.value) ?? 0);
                      set({ position: { ...s.position, value: v } });
                    }}
                  />
                  <Select
                    value={s.position.by}
                    onValueChange={(by) =>
                      set({ position: { ...s.position, by: by as "percent" | "amount", value: 0 } })
                    }
                  >
                    <SelectTrigger className="h-10 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">{copy.byPercent}</SelectItem>
                      <SelectItem value="amount">{copy.byAmount(currency)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                {copy.floors}
                <InfoTip label={copy.floors}>{copy.floorsHelp}</InfoTip>
              </Label>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {d.rooms.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 rounded-xl border border-border p-2.5"
                  >
                    <Label htmlFor={`floor-${r.id}`} className="min-w-0 flex-1 truncate">
                      {r.name}
                    </Label>
                    <Input
                      id={`floor-${r.id}`}
                      inputMode="decimal"
                      className="h-10 w-24 text-right"
                      placeholder="–"
                      value={toUnits(s.floors[r.id])}
                      onChange={(e) => {
                        const v = fromUnits(e.target.value);
                        const floors = { ...s.floors };
                        if (v && v > 0) floors[r.id] = v;
                        else delete floors[r.id];
                        set({ floors });
                      }}
                    />
                  </li>
                ))}
              </ul>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  label={copy.maxDiscount}
                  value={s.maxDiscountPct}
                  min={0}
                  max={90}
                  onChange={(maxDiscountPct) => set({ maxDiscountPct })}
                />
                <NumberField
                  label={copy.maxStep}
                  value={s.maxStepPct}
                  min={5}
                  max={50}
                  onChange={(maxStepPct) => set({ maxStepPct })}
                />
              </div>
            </div>

            <Choice
              label={copy.payWay}
              value={s.payWay}
              options={copy.payWays}
              onChange={(v) => set({ payWay: v as PayWay })}
            />

            <div className="space-y-3">
              <h4 className="flex items-center gap-1 text-sm font-medium">
                {copy.sites}
                <InfoTip label={copy.sites}>
                  <p>{copy.sitesHelp}</p>
                  <p className="mt-2">{copy.offersHelp}</p>
                </InfoTip>
              </h4>
              {sites.map((site) => (
                <SiteSettings key={site} site={site} s={s} onChange={(patch) => set(patch)} />
              ))}
              <NumberField
                label={copy.markup}
                value={s.siteMarkupPct}
                min={0}
                max={30}
                onChange={(siteMarkupPct) => set({ siteMarkupPct })}
              />
            </div>

            <MarketLinks s={s} rooms={d.rooms} onChange={(market) => set({ market })} />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField
                label={copy.samples}
                hint={copy.samplesHelp(MAX_READS)}
                value={s.samples}
                min={1}
                max={6}
                onChange={(samples) => set({ samples })}
              />
              <NumberField
                label={copy.horizon}
                value={s.horizonDays}
                min={7}
                max={365}
                onChange={(horizonDays) => set({ horizonDays })}
              />
              <NumberField
                label={copy.nights}
                value={s.nights}
                min={1}
                max={7}
                onChange={(nights) => set({ nights })}
              />
              <NumberField
                label={copy.cooldown}
                value={s.cooldownDays}
                min={0}
                max={60}
                onChange={(cooldownDays) => set({ cooldownDays })}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** What the host keeps from a sample amount for each way a direct guest can pay. */
function FeesTable({ s, country, m }: { s: Settings; country: string; m: (p: number) => string }) {
  const amount = 10000;
  return (
    <div className="space-y-1.5">
      <h3 className="flex items-center gap-1 text-sm font-medium">
        {copy.feesTitle(m(amount))}
        <InfoTip label={copy.feesTitle(m(amount))}>{copy.feesHelp}</InfoTip>
      </h3>
      <ul className="grid gap-1.5 sm:grid-cols-3">
        {PAY_WAYS.map((way) => {
          const fee = paymentFee(amount, way, { country });
          return (
            <li
              key={way}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg border p-2 text-xs",
                s.payWay === way ? "border-primary" : "border-border",
              )}
            >
              <span>{copy.payWays[way]}</span>
              <span className="font-medium tabular-nums">
                {fee === null ? copy.feeUnknown : m(directNet(amount, way, country))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SiteSettings({
  site,
  s,
  onChange,
}: {
  site: PriceSite;
  s: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const info = SITE_FEES[site];
  const fee = feeFor(s, site);
  const running = s.offers[site] ?? {};
  const setFee = (f: Partial<typeof fee>) =>
    onChange({ fees: { ...s.fees, [site]: { ...fee, ...f } } });
  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{info.label}</span>
        {info.presets.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={fee.host === p.fee.host && fee.guest === p.fee.guest ? "default" : "outline"}
            onClick={() => setFee(p.fee)}
          >
            {p.label} {p.fee.host}%
          </Button>
        ))}
      </div>
      <div className="space-y-1">
        <Label className="flex justify-between text-sm">
          <span>{copy.commission}</span>
          <span className="tabular-nums">{fee.host}%</span>
        </Label>
        <Slider
          min={0}
          max={info.max}
          step={0.5}
          value={[fee.host]}
          onValueChange={(v) => setFee({ host: v[0] ?? defaultFee(site).host })}
          aria-label={`${info.label} ${copy.commission}`}
        />
      </div>
      {site === "airbnb" || fee.guest > 0 ? (
        <div className="space-y-1">
          <Label className="flex justify-between text-sm">
            <span>{copy.guestFee}</span>
            <span className="tabular-nums">{fee.guest}%</span>
          </Label>
          <Slider
            min={0}
            max={25}
            step={0.5}
            value={[fee.guest]}
            onValueChange={(v) => setFee({ guest: v[0] ?? 0 })}
            aria-label={`${info.label} ${copy.guestFee}`}
          />
        </div>
      ) : null}
      <div className="space-y-1">
        <span className="text-sm">{copy.offersRunning}</span>
        <ul className="grid gap-2 sm:grid-cols-2">
          {SITE_OFFERS[site].map((o) => (
            <li key={o.key} className="flex items-center gap-2">
              <Label htmlFor={`${site}-${o.key}`} className="min-w-0 flex-1 text-sm font-normal">
                {o.label}
              </Label>
              <Input
                id={`${site}-${o.key}`}
                inputMode="numeric"
                className="h-10 w-20 text-right"
                placeholder="0"
                value={running[o.key] ? String(running[o.key]) : ""}
                onChange={(e) => {
                  const v = Math.min(
                    90,
                    Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0),
                  );
                  const next = { ...running };
                  if (v) next[o.key] = v;
                  else delete next[o.key];
                  onChange({ offers: { ...s.offers, [site]: next } });
                }}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MarketLinks({
  s,
  rooms,
  onChange,
}: {
  s: Settings;
  rooms: Array<{ id: string; name: string }>;
  onChange: (m: Settings["market"]) => void;
}) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [roomId, setRoomId] = useState<string>("any");
  function add() {
    const site = priceSiteForUrl(url.trim());
    if (!site || !/^https:\/\//.test(url.trim())) return void toast.error(copy.marketBad);
    const next = normaliseSmartPricing({
      market: [
        ...s.market,
        { url: url.trim(), site, label, roomId: roomId === "any" ? null : roomId },
      ],
    }).market;
    onChange(next);
    setUrl("");
    setLabel("");
  }
  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1 text-sm font-medium">
        {copy.market}
        <InfoTip label={copy.market}>{copy.marketHelp}</InfoTip>
      </h4>
      {s.market.length ? (
        <ul className="space-y-1.5">
          {s.market.map((x) => (
            <li
              key={x.url}
              className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{x.label || SITE_FEES[x.site].label}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {rooms.find((r) => r.id === x.roomId)?.name ?? copy.anyRoom}
                </span>
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={copy.remove}
                onClick={() => onChange(s.market.filter((y) => y.url !== x.url))}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem_10rem_auto]">
        <Input
          placeholder="https://www.booking.com/hotel/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label={copy.market}
        />
        <Input
          placeholder={copy.marketLabel}
          value={label}
          maxLength={60}
          onChange={(e) => setLabel(e.target.value)}
          aria-label={copy.marketLabel}
        />
        <Select value={roomId} onValueChange={setRoomId}>
          <SelectTrigger aria-label={copy.marketRoom}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{copy.anyRoom}</SelectItem>
            {rooms.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {copy.marketRoom} {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" disabled={!url.trim()} onClick={add}>
          <Plus className="size-4" />
          {copy.marketAdd}
        </Button>
      </div>
    </div>
  );
}

function ScheduleField({ value, onChange }: { value: Schedule; onChange: (s: Schedule) => void }) {
  const pick = (kind: string) => {
    if (kind === "weekly") onChange({ kind: "weekly", days: [1] });
    else if (kind === "every") onChange({ kind: "every", days: 3 });
    else if (kind === "monthly") onChange({ kind: "monthly", day: 1 });
    else onChange({ kind } as Schedule);
  };
  return (
    <div className="space-y-2">
      <Choice
        label={copy.schedule}
        value={value.kind}
        options={copy.scheduleKinds}
        onChange={pick}
      />
      {value.kind === "weekly" ? (
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={copy.scheduleKinds["weekly"]}
        >
          {copy.days.map((name, i) => {
            const on = value.days.includes(i);
            return (
              <Button
                key={name}
                size="sm"
                variant={on ? "default" : "outline"}
                aria-pressed={on}
                onClick={() => {
                  const days = on ? value.days.filter((x) => x !== i) : [...value.days, i];
                  if (days.length) onChange({ kind: "weekly", days: days.sort() });
                }}
              >
                {name}
              </Button>
            );
          })}
        </div>
      ) : null}
      {value.kind === "every" ? (
        <NumberField
          label={copy.everyDays}
          value={value.days}
          min={2}
          max={30}
          onChange={(days) => onChange({ kind: "every", days })}
        />
      ) : null}
      {value.kind === "monthly" ? (
        <NumberField
          label={copy.monthDay}
          value={value.day}
          min={1}
          max={28}
          onChange={(day) => onChange({ kind: "monthly", day })}
        />
      ) : null}
    </div>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([k, v]) => (
            <SelectItem key={k} value={k}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      <Input
        inputMode="numeric"
        className="h-10 w-28"
        value={text}
        aria-label={label}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={() => {
          const n = Math.min(max, Math.max(min, Number(text) || min));
          setText(String(n));
          onChange(n);
        }}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
