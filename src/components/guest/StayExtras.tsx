import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { extrasCopy as copy, responseNotes } from "@/content/copy";
import { formatPence } from "@/lib/services";
import { acceptSuggestion, cancelExtrasRequest, createExtrasRequest, getStayExtras } from "@/lib/extras.functions";
import { cn } from "@/lib/utils";

type Line = { key: string; qty: number; size: string | null };

export function StayExtras({ token }: { token: string }) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getStayExtras);
  const create = useServerFn(createExtrasRequest);
  const cancel = useServerFn(cancelExtrasRequest);
  const accept = useServerFn(acceptSuggestion);
  const q = useQuery({ queryKey: ["stay-extras", token], queryFn: () => fetchFn({ data: { token } }), refetchInterval: 20_000 });
  const [lines, setLines] = useState<Line[]>([]);
  const [win, setWin] = useState<string>("asap");
  const [busy, setBusy] = useState(false);

  const d = q.data;
  const cur = d?.currency ?? "GBP";
  const fmtT = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: d?.timezone ?? "Europe/London", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  const total = useMemo(() => {
    if (!d) return 0;
    return lines.reduce((s, l) => {
      const it = d.items.find((i) => i.key === l.key);
      if (!it || it.isFree) return s;
      const size = it.sizes?.find((x) => x.key === l.size);
      return s + (size?.pricePence ?? it.pricePence) * l.qty;
    }, 0);
  }, [d, lines]);

  function setQty(key: string, qty: number, size: string | null = null) {
    setLines((ls) => {
      const rest = ls.filter((l) => l.key !== key);
      return qty > 0 ? [...rest, { key, qty, size }] : rest;
    });
  }

  async function send() {
    setBusy(true);
    try {
      await create({ data: { token, lines, window: win as "asap", note: null } });
      toast.success(copy.sent);
      setLines([]);
      await qc.invalidateQueries({ queryKey: ["stay-extras", token] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    try { await fn(); await qc.invalidateQueries({ queryKey: ["stay-extras", token] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Please try again."); }
  }

  if (q.isLoading) return <div className="card-soft h-40 animate-pulse" />;
  if (!d) return null;

  const regular = d.items.filter((i) => i.key !== "late_checkout" && i.key !== "early_checkin");
  const lineOf = (k: string) => lines.find((l) => l.key === k);

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
                {r.hostNote ? <p className="w-full text-sm text-primary">{responseNotes.fromHost(r.hostNote)}</p> : null}
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

      <div className="grid gap-3 sm:grid-cols-2">
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

      {lines.length > 0 ? (
        <div className="card-soft sticky bottom-24 space-y-3 p-4">
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
          <Button size="touch-xl" className="w-full" onClick={send} disabled={busy}>
            {busy ? <Loader2 className="size-6 animate-spin" /> : null}
            {copy.send}{total > 0 ? ` · ${formatPence(total, cur)}` : ""}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
