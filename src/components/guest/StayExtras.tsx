import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Minus, Plus, Receipt, ShoppingBasket, X } from "lucide-react";
import { toast } from "sonner";

import { ReceiptCard } from "@/components/guest/ReceiptCard";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { extrasCopy as copy, payments as paymentsCopy, responseNotes } from "@/content/copy";
import { formatPence } from "@/lib/services";
import { acceptSuggestion, cancelExtrasRequest, chooseOfflinePayment, createExtrasRequest, getStayExtras } from "@/lib/extras.functions";
import { confirmExtrasPayment, startExtrasCheckout } from "@/lib/payments.functions";
import { cn } from "@/lib/utils";

type Line = { key: string; qty: number; size: string | null };

export function StayExtras({ token }: { token: string }) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getStayExtras);
  const create = useServerFn(createExtrasRequest);
  const cancel = useServerFn(cancelExtrasRequest);
  const accept = useServerFn(acceptSuggestion);
  const offline = useServerFn(chooseOfflinePayment);
  const checkout = useServerFn(startExtrasCheckout);
  const confirmPay = useServerFn(confirmExtrasPayment);
  const [payingId, setPayingId] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["stay-extras", token], queryFn: () => fetchFn({ data: { token } }), refetchInterval: 20_000 });
  const [lines, setLines] = useState<Line[]>([]);
  const [win, setWin] = useState<string>("asap");
  const [busy, setBusy] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [troubleId, setTroubleId] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const d = q.data;
  const cur = d?.currency ?? "GBP";
  const fmtT = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: d?.timezone ?? "Europe/London", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  const priceOf = (l: Line) => {
    const it = d?.items.find((i) => i.key === l.key);
    if (!it || it.isFree) return 0;
    const size = it.sizes?.find((x) => x.key === l.size);
    return (size?.pricePence ?? it.pricePence) * l.qty;
  };

  const total = useMemo(() => lines.reduce((s, l) => s + priceOf(l), 0), [d, lines]);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  function setQty(key: string, qty: number, size: string | null = null) {
    setLines((ls) => {
      const rest = ls.filter((l) => l.key !== key);
      return qty > 0 ? [...rest, { key, qty, size }] : rest;
    });
  }

  async function send() {
    if (lines.length === 0) return;
    setBusy(true);
    try {
      const res = await create({ data: { token, lines, window: win as "asap", note: null } });
      setLines([]);
      setCartOpen(false);
      await qc.invalidateQueries({ queryKey: ["stay-extras", token] });
      // Nothing to pay means nothing to do — free items just go to the host.
      if (res.status === "awaiting_payment") await pay(res.id);
      else toast.success(copy.sent);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function pay(id: string) {
    setPayingId(id);
    try {
      const r = await checkout({ data: { token, requestId: id, origin: window.location.origin } });
      if (r.url) window.location.href = r.url;
      else throw new Error(paymentsCopy.payFailed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : paymentsCopy.payFailed);
      setTroubleId(id);
      setPayingId(null);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    try { await fn(); await qc.invalidateQueries({ queryKey: ["stay-extras", token] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Please try again."); }
  }

  // Coming back from the card page: say thank you, or offer the other ways to pay.
  useEffect(() => {
    const url = new URL(window.location.href);
    const paid = url.searchParams.get("paid");
    if (!paid) return;
    url.searchParams.delete("paid");
    window.history.replaceState(null, "", url.toString());
    if (paid === "1") {
      void confirmPay({ data: { token } })
        .then((r) => (r.confirmed ? toast.success(paymentsCopy.paidToast) : toast.info(copy.payTrouble)))
        .catch(() => toast.info(copy.payTrouble))
        .finally(() => qc.invalidateQueries({ queryKey: ["stay-extras", token] }));
      void qc.invalidateQueries({ queryKey: ["stay-extras", token] });
    } else {
      const pending = q.data?.requests.find((r) => r.status === "awaiting_payment");
      if (pending) setTroubleId(pending.id);
      toast.info(copy.payTrouble);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  if (q.isLoading) return <div className="card-soft h-40 animate-pulse" />;
  if (!d) return null;

  const regular = d.items.filter((i) => i.key !== "late_checkout" && i.key !== "early_checkin");
  const lineOf = (k: string) => lines.find((l) => l.key === k);
  const nameOf = (k: string) => d.items.find((i) => i.key === k)?.name ?? k;
  const receiptReq = d.requests.find((r) => r.id === receiptId) ?? null;

  const hourPicker = (key: string, title: string, opts: { hours: number; label: string }[], none: string) => {
    const it = d.items.find((i) => i.key === key);
    if (!it) return null;
    return (
      <div className="card-soft p-4">
        <p className="font-medium">{title} · {formatPence(it.pricePence, cur)} {copy.units[it.unit]}</p>
        {opts.length === 0 ? <p className="mt-1 text-muted-foreground">{none}</p> : (
          <div className="mt-3 flex flex-wrap gap-2">
            {opts.map((o) => {
              const on = lineOf(key)?.qty === o.hours;
              return (
                <button key={o.hours} type="button" onClick={() => setQty(key, on ? 0 : o.hours)}
                  className={cn("spring min-h-14 rounded-2xl border-2 px-5 text-lg font-medium", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface")}>
                  {o.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="space-y-4 pt-4">
      <div>
        <h2 className="text-2xl sm:text-3xl">{copy.guestTitle}</h2>
        <p className="text-muted-foreground">{copy.guestSubtitle}</p>
      </div>

      {d.requests.length > 0 ? (
        <div className="card-soft divide-y divide-border">
          <h3 className="p-4 text-lg">{copy.yours}</h3>
          {d.requests.map((r) => {
            const left = r.payBy ? Math.max(0, Math.round((Date.parse(r.payBy) - Date.now()) / 60000)) : null;
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-2 p-4">
                <span className="flex-1 font-medium">{r.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</span>
                {r.totalPence > 0 ? <span>{formatPence(r.totalPence, cur)}</span> : null}
                <span className="rounded-full bg-secondary px-3 py-1 text-sm">{copy.statuses[r.status] ?? r.status}</span>
                {r.lateUntil ? <span className="text-sm text-muted-foreground">{copy.until(r.lateUntil.slice(0, 5))}</span> : null}
                {r.earlyFrom ? <span className="text-sm text-muted-foreground">{copy.from(r.earlyFrom.slice(0, 5))}</span> : null}
                {r.status === "awaiting_payment" && left !== null ? <span className="text-sm text-accent">{copy.payLeft(left)}</span> : null}
                {r.status === "awaiting_payment" && !r.paymentMethod ? (
                  <Button size="touch" onClick={() => pay(r.id)} disabled={payingId === r.id}>
                    {payingId === r.id ? <Loader2 className="size-4 animate-spin" /> : null}
                    {paymentsCopy.payNow}
                  </Button>
                ) : null}
                {r.status === "awaiting_payment" ? (
                  <Button size="touch" variant="ghost" onClick={() => setTroubleId(troubleId === r.id ? null : r.id)}>
                    {copy.payTrouble}
                  </Button>
                ) : null}
                {r.status === "confirmed" ? (
                  <Button size="touch" variant="outline" onClick={() => setReceiptId(r.id)}>
                    <Receipt className="size-4" />{copy.receipt}
                  </Button>
                ) : null}
                {r.hostNote ? <p className="w-full text-sm text-primary">{responseNotes.fromHost(r.hostNote)}</p> : null}
                {r.paymentMethod === "bank" ? <p className="w-full text-sm text-muted-foreground">{copy.payChosenBank} {copy.payNotGuaranteed}</p> : null}
                {r.paymentMethod === "cash" ? <p className="w-full text-sm text-muted-foreground">{copy.payChosenCash} {copy.payNotGuaranteed}</p> : null}

                {troubleId === r.id && r.status === "awaiting_payment" ? (
                  <div className="w-full space-y-3 rounded-2xl bg-secondary/60 p-4">
                    <p className="text-sm">{copy.payTroubleBody}</p>
                    <div>
                      <p className="font-medium">{copy.payBankTitle}</p>
                      {d.bankDetails ? (
                        <>
                          <p className="whitespace-pre-line text-sm">{d.bankDetails}</p>
                          <p className="text-sm text-muted-foreground">{copy.payRefNote(r.receiptNumber ?? r.id.slice(0, 8).toUpperCase())}</p>
                          <Button className="mt-2" size="touch" variant="outline" onClick={() => act(() => offline({ data: { token, id: r.id, method: "bank" } }))}>
                            {copy.payBank}
                          </Button>
                        </>
                      ) : <p className="text-sm text-muted-foreground">{copy.noBankDetails}</p>}
                    </div>
                    <div>
                      <p className="font-medium">{copy.payCashTitle}</p>
                      <p className="text-sm">{copy.payCashBody}</p>
                      <Button className="mt-2" size="touch" variant="outline" onClick={() => act(() => offline({ data: { token, id: r.id, method: "cash" } }))}>
                        {copy.payCash}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {r.status === "suggested" && r.suggested ? (
                  <>
                    <span className="w-full text-sm">{copy.suggested(copy.windows[r.suggested] ?? r.suggested)}</span>
                    <Button size="touch" onClick={() => act(() => accept({ data: { token, id: r.id } }))}>{copy.accept}</Button>
                  </>
                ) : null}
                {["requested", "approved", "awaiting_payment", "suggested", "confirmed"].includes(r.status) ? (
                  <Button size="touch" variant="outline" onClick={() => act(() => cancel({ data: { token, id: r.id } }))}>{copy.cancel}</Button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {hourPicker("late_checkout", copy.lateTitle, d.lateOptions.map((o) => ({ hours: o.hours, label: copy.until(o.until) })), copy.lateNone)}
      {hourPicker("early_checkin", copy.earlyTitle, d.earlyOptions.map((o) => ({ hours: o.hours, label: copy.from(o.from) })), copy.earlyNone)}

      <div className="grid gap-3 pb-24 sm:grid-cols-2">
        {regular.map((it) => {
          const l = lineOf(it.key);
          const qty = l?.qty ?? 0;
          const size = l?.size ?? it.sizes?.[1]?.key ?? it.sizes?.[0]?.key ?? null;
          const price = it.isFree ? copy.free : `${formatPence(it.sizes?.find((s) => s.key === size)?.pricePence ?? it.pricePence, cur)} ${copy.units[it.unit]}`;
          return (
            <div key={it.key} className={cn("card-soft p-4", qty > 0 && "ring-2 ring-primary")}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{it.name}</p>
                  <p className="text-sm text-muted-foreground">{price}</p>
                </div>
                <Button size="icon" variant="outline" className="size-12 rounded-full" aria-label={`Fewer ${it.name}`} disabled={qty === 0} onClick={() => setQty(it.key, qty - 1, size)}><Minus /></Button>
                <span className="w-6 text-center text-lg font-semibold" aria-live="polite">{qty}</span>
                <Button size="icon" className="size-12 rounded-full" aria-label={`More ${it.name}`} disabled={qty >= it.maxQty} onClick={() => setQty(it.key, qty + 1, size)}><Plus /></Button>
              </div>
              {it.sizes && qty > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={copy.bagSize}>
                  {it.sizes.map((s) => (
                    <button key={s.key} type="button" role="radio" aria-checked={size === s.key} onClick={() => setQty(it.key, qty, s.key)}
                      className={cn("min-h-11 rounded-full border px-3 text-sm", size === s.key ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                      {s.label} · {formatPence(s.pricePence, cur)}
                    </button>
                  ))}
                </div>
              ) : null}
              {it.isLoan && qty > 0 ? <p className="mt-2 text-sm text-muted-foreground">{copy.loanNote}</p> : null}
            </div>
          );
        })}
      </div>

      {/* Basket bar: never blocks the page, so guests can keep adding items. */}
      {count > 0 ? (
        <div className="fixed inset-x-0 bottom-20 z-40 px-4 sm:bottom-6">
          <Button size="touch-xl" className="mx-auto flex w-full max-w-xl shadow-lg" onClick={() => setCartOpen(true)}>
            <ShoppingBasket className="size-6" />
            {copy.cartButton(count, total > 0 ? formatPence(total, cur) : "")}
          </Button>
        </div>
      ) : null}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>{copy.cartTitle}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 p-4 pt-0">
            {lines.length === 0 ? <p className="text-muted-foreground">{copy.cartEmpty}</p> : (
              <ul className="divide-y divide-border rounded-2xl border border-border">
                {lines.map((l) => (
                  <li key={l.key} className="flex items-center gap-3 p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{nameOf(l.key)}</span>
                      <span className="text-sm text-muted-foreground">{priceOf(l) > 0 ? formatPence(priceOf(l), cur) : copy.free}</span>
                    </span>
                    <Button size="icon" variant="outline" className="size-11 rounded-full" aria-label={`${copy.cartRemove} ${nameOf(l.key)}`} onClick={() => setQty(l.key, l.qty - 1, l.size)}><Minus /></Button>
                    <span className="w-6 text-center text-lg font-semibold">{l.qty}</span>
                    <Button size="icon" className="size-11 rounded-full" aria-label={nameOf(l.key)} onClick={() => setQty(l.key, l.qty + 1, l.size)}><Plus /></Button>
                  </li>
                ))}
              </ul>
            )}

            <p className="font-medium">{copy.when}</p>
            <div className="flex flex-wrap gap-2">
              {d.windows.map((w) => (
                <button key={w} type="button" onClick={() => setWin(w)}
                  className={cn("spring min-h-14 rounded-2xl border-2 px-4 text-left", win === w ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface")}>
                  {copy.windows[w]}
                  {w === "asap" && d.outUntil ? <span className="block text-sm opacity-80">{copy.hostOut(fmtT(d.outUntil))}</span> : null}
                </button>
              ))}
            </div>

            <p className="flex justify-between text-lg font-medium">
              <span>{copy.total}</span>
              <span>{total > 0 ? formatPence(total, cur) : copy.free}</span>
            </p>
            {total === 0 && lines.length > 0 ? <p className="text-sm text-muted-foreground">{copy.cartFreeNote}</p> : null}

            <Button size="touch-xl" className="w-full" onClick={send} disabled={busy || lines.length === 0}>
              {busy ? <Loader2 className="size-6 animate-spin" /> : null}
              {total > 0 ? `${copy.payAndSend} · ${formatPence(total, cur)}` : copy.sendFree}
            </Button>
            <Button size="touch" variant="ghost" className="w-full" onClick={() => setCartOpen(false)}>
              <X className="size-4" />{copy.cartClose}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {receiptReq ? (
        <ReceiptCard
          open
          onClose={() => setReceiptId(null)}
          token={token}
          request={receiptReq}
          propertyName={d.propertyName}
          hostName={d.hostName}
          guestName={d.guestName}
          currency={cur}
          timezone={d.timezone}
          tax={d.tax}
        />
      ) : null}
    </section>
  );
}
