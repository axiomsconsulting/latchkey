import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SaveButton, changed } from "@/components/host/SaveButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { extrasCopy as copy, priceListUi as ui } from "@/content/copy";
import type { ExtraItem } from "@/lib/extras";
import {
  addPriceItem,
  deletePriceItem,
  getPriceList,
  saveMoneySettings,
  savePriceItem,
  setPriceOrder,
  setPropertyCurrency,
} from "@/lib/extras.functions";
import { BreakfastMenuEditor } from "@/components/host/BreakfastMenuEditor";
import { BankDetailsFields } from "@/components/host/BankDetailsFields";
import { normaliseBankAccount, type BankAccount } from "@/lib/bank-details";
import { standardTaxRate, taxTerms } from "@/lib/invoice";
import { CurrencyPicker } from "@/components/WorldPickers";
import { moveItem } from "@/lib/reorder";
import { currencySymbol } from "@/lib/world";
import { cn } from "@/lib/utils";
import { GripVertical, Trash2 } from "lucide-react";

/** One line per item: grab bar, name, price, max, auto-approve, offered, delete. */
// A table from medium screens up; below that each item is a two-line card (name, then its settings, labelled).
const ROW =
  "grid grid-cols-[1.75rem_minmax(0,1fr)_2.25rem] items-center gap-2 px-2 md:grid-cols-[1.75rem_minmax(8rem,1fr)_6.5rem_3.75rem_3.25rem_3.25rem_2.25rem]";

const UNITS = ["item", "hour", "pack", "bag_day"] as const;

const BLANK = {
  name: "",
  price: "3.00",
  unit: "item" as (typeof UNITS)[number],
  maxQty: 4,
  isFree: false,
  isLoan: false,
  autoApprove: false,
};

export function ExtrasPriceList({
  propertyId,
  hostId,
  parts = "all",
}: {
  propertyId: string;
  hostId: string;
  /** "items": the price list and breakfast (Properties → Extras); "money": tax, bank details and away (Settings → Payments). */
  parts?: "all" | "items" | "money";
}) {
  const showItems = parts !== "money";
  const showMoney = parts !== "items";
  const qc = useQueryClient();
  const fn = useServerFn(getPriceList);
  const saveItem = useServerFn(savePriceItem);
  const saveMoney = useServerFn(saveMoneySettings);
  const addItem = useServerFn(addPriceItem);
  const removeItem = useServerFn(deletePriceItem);
  const saveOrderFn = useServerFn(setPriceOrder);
  const q = useQuery({
    queryKey: ["price-list", propertyId],
    queryFn: () => fn({ data: { propertyId } }),
  });
  const [money, setMoney] = useState({
    registered: false,
    label: "VAT",
    rate: "20",
    pricesInclude: true,
    bank: "",
    outUntil: "",
    bankAccount: normaliseBankAccount(null) as BankAccount | null,
  });
  const [draft, setDraft] = useState<typeof BLANK | null>(null);
  // The running order, changed live while dragging and saved on drop.
  const [order, setOrder] = useState<string[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    // Breakfast dishes have their own menu below.
    // Early check-in and late check-out have their own card (StayTimesSettings).
    if (q.data && !dragging)
      setOrder(
        q.data.items
          .filter((i) => !i.breakfast && i.key !== "late_checkout" && i.key !== "early_checkin")
          .map((i) => i.key),
      );
  }, [q.data, dragging]);
  const setCurrencyFn = useServerFn(setPropertyCurrency);
  const symbol = currencySymbol(q.data?.currency ?? "GBP");

  async function saveOrder(keys: string[]) {
    await run(() => saveOrderFn({ data: { propertyId, keys } }));
  }

  /** Drag by the grab bar with a mouse, pen or finger; the list reorders as you move. */
  function startDrag(e: React.PointerEvent<HTMLButtonElement>, key: string) {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    setDragging(key);
    let current = order;
    const move = (ev: PointerEvent) => {
      const rows = [...(listRef.current?.querySelectorAll<HTMLLIElement>("li[data-key]") ?? [])];
      const over = rows.findIndex((r) => {
        const b = r.getBoundingClientRect();
        return ev.clientY >= b.top && ev.clientY <= b.bottom;
      });
      const from = current.indexOf(key);
      if (over >= 0 && over !== from) {
        current = moveItem(current, from, over);
        setOrder(current);
      }
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setDragging(null);
      if (current.join() !== order.join()) void saveOrder(current);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  async function run(work: () => Promise<unknown>, done?: string) {
    try {
      await work();
      await qc.invalidateQueries({ queryKey: ["price-list", propertyId] });
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    }
  }

  // The money settings as saved: Save stays grey until one differs.
  const savedMoney = q.data
    ? {
        registered: q.data.tax.registered,
        label: q.data.tax.label,
        rate: String(q.data.tax.rateBp / 100),
        pricesInclude: q.data.tax.pricesInclude,
        bank: q.data.bankDetails,
        outUntil: q.data.outUntil ? q.data.outUntil.slice(0, 16) : "",
        bankAccount: q.data.bankAccount,
      }
    : null;
  useEffect(() => {
    if (savedMoney) setMoney(savedMoney);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);
  const [moneyBusy, setMoneyBusy] = useState(false);

  async function update(item: ExtraItem, patch: Partial<ExtraItem>) {
    const next = { ...item, ...patch };
    try {
      await saveItem({
        data: {
          propertyId,
          item: {
            key: next.key,
            name: next.name,
            pricePence: next.pricePence,
            unit: next.unit,
            maxQty: next.maxQty,
            isFree: next.isFree,
            autoApprove: next.autoApprove,
            active: next.active,
            isLoan: next.isLoan,
            ...(next.description !== undefined ? { description: next.description } : {}),
          },
        },
      });
      await qc.invalidateQueries({ queryKey: ["price-list", propertyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    }
  }

  async function submitMoney() {
    setMoneyBusy(true);
    try {
      await saveMoney({
        data: {
          hostId,
          registered: money.registered,
          label: money.label,
          rateBp: Math.round(Number(money.rate || 0) * 100),
          pricesInclude: money.pricesInclude,
          bankDetails: money.bank,
          outUntil: money.outUntil ? new Date(money.outUntil).toISOString() : null,
          ...(money.bankAccount ? { bankAccount: money.bankAccount } : {}),
        },
      });
      toast.success(copy.saved);
      await qc.invalidateQueries({ queryKey: ["price-list", propertyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setMoneyBusy(false);
    }
  }

  if (q.isLoading || !q.data) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <div className="space-y-6">
      {showItems ? (
        <>
          <section className="card-soft p-5" data-tour="extras-price-list">
            <h2 className="text-lg">{copy.priceList}</h2>
            <p className="text-sm text-muted-foreground">{copy.priceListSub}</p>
            {/* Regional pricing: a property abroad can charge in its own currency. */}
            {q.data.propertyCurrency !== undefined ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-muted p-3 text-sm">
                <span className="min-w-0 flex-1 basis-56">
                  {ui.currencyLine(q.data.currency, q.data.hostCurrency)}
                </span>
                <div className="w-64 max-w-full">
                  <CurrencyPicker
                    value={q.data.propertyCurrency ?? q.data.hostCurrency}
                    onChange={(v) =>
                      void run(
                        () =>
                          setCurrencyFn({
                            data: { propertyId, currency: v === q.data!.hostCurrency ? null : v },
                          }),
                        ui.currencySaved,
                      )
                    }
                  />
                </div>
              </div>
            ) : null}
            <div className="mt-4 rounded-2xl border border-border bg-surface">
              <div
                className={cn(
                  ROW,
                  "hidden border-b border-border py-2 text-xs font-medium text-muted-foreground md:grid",
                )}
              >
                <span aria-hidden />
                <span>{ui.name}</span>
                <span>{ui.price}</span>
                <span>{copy.max}</span>
                <span title={copy.autoApprove}>{ui.auto}</span>
                <span>{ui.offered}</span>
                <span aria-hidden />
              </div>
              <ul ref={listRef} className="divide-y divide-border">
                {order.map((key, index) => {
                  const it = q.data.items.find((x) => x.key === key);
                  if (!it) return null;
                  return (
                    <li
                      key={it.key}
                      data-key={it.key}
                      className={cn(
                        ROW,
                        "py-1.5",
                        dragging === it.key && "relative z-10 bg-secondary shadow-soft",
                      )}
                    >
                      <button
                        type="button"
                        className="grid h-8 w-6 cursor-grab touch-none place-items-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
                        aria-label={ui.dragHint(it.name)}
                        onPointerDown={(e) => startDrag(e, it.key)}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                            e.preventDefault();
                            const next = moveItem(
                              order,
                              index,
                              index + (e.key === "ArrowUp" ? -1 : 1),
                            );
                            if (next !== order) {
                              setOrder(next);
                              void saveOrder(next);
                            }
                          }
                        }}
                      >
                        <GripVertical className="size-4" />
                      </button>
                      <span
                        className="min-w-0 truncate text-sm font-medium"
                        title={`${it.name} · ${copy.units[it.unit]}`}
                      >
                        {it.name}{" "}
                        <span className="font-normal text-muted-foreground">
                          · {copy.units[it.unit]}
                        </span>
                      </span>
                      <div className="order-last col-span-3 flex flex-wrap items-center gap-x-4 gap-y-2 pb-1 pl-8 md:contents">
                        <label className="flex items-center gap-1 text-sm">
                          <span className="text-muted-foreground">{symbol}</span>
                          <Input
                            type="number"
                            step="0.5"
                            min="0"
                            disabled={it.isFree}
                            defaultValue={(it.pricePence / 100).toFixed(2)}
                            className="h-8 w-20 px-2"
                            aria-label={`${it.name} price`}
                            onBlur={(e) => {
                              const v = Math.round(Number(e.target.value) * 100);
                              if (v !== it.pricePence) update(it, { pricePence: v });
                            }}
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-sm">
                          <span className="text-muted-foreground md:hidden">{copy.max}</span>
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            defaultValue={it.maxQty}
                            className="h-8 w-14 px-2"
                            aria-label={`${it.name} max`}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v !== it.maxQty && v >= 1) update(it, { maxQty: v });
                            }}
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-sm">
                          <Switch
                            checked={it.autoApprove}
                            onCheckedChange={(v) => update(it, { autoApprove: v })}
                            aria-label={`${it.name}: ${copy.autoApprove}`}
                          />
                          <span className="text-muted-foreground md:hidden">{ui.auto}</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-sm">
                          <Switch
                            checked={it.active}
                            onCheckedChange={(v) => update(it, { active: v })}
                            aria-label={`${it.name}: ${it.isFree ? copy.free : copy.active}`}
                          />
                          <span className="text-muted-foreground md:hidden">{ui.offered}</span>
                        </label>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive"
                        aria-label={`${it.name}: ${ui.remove}`}
                        onClick={() => {
                          if (confirm(ui.removeConfirm))
                            void run(
                              () => removeItem({ data: { propertyId, key: it.key } }),
                              ui.removed,
                            );
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {draft ? (
              <div className="mt-4 grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>{ui.name}</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{ui.price}</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    disabled={draft.isFree}
                    value={draft.price}
                    onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{ui.unit}</Label>
                  <select
                    className="h-10 w-full rounded-xl border border-border bg-surface px-3"
                    value={draft.unit}
                    onChange={(e) =>
                      setDraft({ ...draft, unit: e.target.value as (typeof UNITS)[number] })
                    }
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {copy.units[u]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>{ui.maxQty}</Label>
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    value={draft.maxQty}
                    onChange={(e) => setDraft({ ...draft, maxQty: Number(e.target.value) })}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-4 pt-6">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={draft.isFree}
                      onCheckedChange={(v) => setDraft({ ...draft, isFree: v })}
                    />
                    {ui.isFree}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={draft.isLoan}
                      onCheckedChange={(v) => setDraft({ ...draft, isLoan: v })}
                    />
                    {ui.isLoan}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={draft.autoApprove}
                      onCheckedChange={(v) => setDraft({ ...draft, autoApprove: v })}
                    />
                    {copy.autoApprove}
                  </label>
                </div>
                <div className="flex gap-2 sm:col-span-2">
                  <Button
                    disabled={!draft.name.trim()}
                    onClick={() =>
                      run(async () => {
                        await addItem({
                          data: {
                            propertyId,
                            item: {
                              name: draft.name.trim(),
                              pricePence: draft.isFree
                                ? 0
                                : Math.round(Number(draft.price || 0) * 100),
                              unit: draft.unit,
                              maxQty: draft.maxQty,
                              isFree: draft.isFree,
                              autoApprove: draft.autoApprove,
                              active: true,
                              isLoan: draft.isLoan,
                            },
                          },
                        });
                        setDraft(null);
                      }, ui.added)
                    }
                  >
                    {ui.addItem}
                  </Button>
                  <Button variant="ghost" onClick={() => setDraft(null)}>
                    {copy.cancel}
                  </Button>
                </div>
              </div>
            ) : (
              <Button className="mt-4" variant="outline" onClick={() => setDraft({ ...BLANK })}>
                {ui.addItem}
              </Button>
            )}
          </section>

          <BreakfastMenuEditor
            propertyId={propertyId}
            items={q.data.items.filter((i) => i.breakfast)}
            currency={q.data.currency}
          />
        </>
      ) : null}

      {showMoney ? (
        <section id="settings-money" className="card-soft scroll-mt-24 space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg">{copy.money}</h2>
            <SaveButton
              dirty={!!savedMoney && changed(money, savedMoney)}
              busy={moneyBusy}
              label={copy.save}
              onClick={() => void submitMoney()}
            />
          </div>
          {/* Sales tax, with the country's usual name and rate as a starting point. */}
          <div className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-sm font-medium">{copy.taxTitle}</p>
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={money.registered}
                onCheckedChange={(v) => setMoney({ ...money, registered: v })}
              />
              {copy.taxRegistered}
            </label>
            {money.registered ? (
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{copy.taxLabel}</Label>
                  <Input
                    value={money.label}
                    onChange={(e) => setMoney({ ...money, label: e.target.value })}
                    className="h-10 w-28"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{copy.taxRate}</Label>
                  <Input
                    inputMode="decimal"
                    value={money.rate}
                    onChange={(e) => setMoney({ ...money, rate: e.target.value })}
                    className="h-10 w-24"
                  />
                </div>
                {standardTaxRate(q.data.country) !== null &&
                (money.label !== taxTerms(q.data.country).name ||
                  Number(money.rate) * 100 !== standardTaxRate(q.data.country)) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setMoney({
                        ...money,
                        label: taxTerms(q.data!.country).name,
                        rate: String(standardTaxRate(q.data!.country)! / 100),
                      })
                    }
                  >
                    {copy.taxStandard(
                      taxTerms(q.data.country).name,
                      String(standardTaxRate(q.data.country)! / 100),
                    )}
                  </Button>
                ) : null}
                <label className="flex items-center gap-3 pb-2 text-sm">
                  <Switch
                    checked={money.pricesInclude}
                    onCheckedChange={(v) => setMoney({ ...money, pricesInclude: v })}
                  />
                  {copy.pricesInclude}
                </label>
              </div>
            ) : null}
          </div>

          {/* Bank details in the shape the bank's country uses, checked as typed. */}
          <div className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-sm font-medium">{copy.bankTitle}</p>
            {money.bankAccount ? (
              <BankDetailsFields
                value={money.bankAccount}
                onChange={(bankAccount) => setMoney({ ...money, bankAccount })}
              />
            ) : null}
            <div className="space-y-1">
              <Label className="text-xs">{copy.bank}</Label>
              <Textarea
                rows={2}
                value={money.bank}
                onChange={(e) => setMoney({ ...money, bank: e.target.value })}
                placeholder={copy.bankNotesPlaceholder}
              />
            </div>
          </div>

          {/* Away: a date and time, not a free-form box. */}
          <div className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-sm font-medium">{copy.awayTitle}</p>
            <p className="text-xs text-muted-foreground">{copy.outUntil}</p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{copy.awayDate}</Label>
                <Input
                  type="date"
                  className="h-10 w-44"
                  value={money.outUntil.slice(0, 10)}
                  onChange={(e) =>
                    setMoney({
                      ...money,
                      outUntil: e.target.value
                        ? `${e.target.value}T${money.outUntil.slice(11, 16) || "09:00"}`
                        : "",
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{copy.awayTime}</Label>
                <Input
                  type="time"
                  className="h-10 w-32"
                  disabled={!money.outUntil}
                  value={money.outUntil.slice(11, 16)}
                  onChange={(e) =>
                    setMoney({
                      ...money,
                      outUntil: `${money.outUntil.slice(0, 10)}T${e.target.value || "09:00"}`,
                    })
                  }
                />
              </div>
              {money.outUntil ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setMoney({ ...money, outUntil: "" })}
                >
                  {copy.awayClear}
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
