import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CreditCard } from "lucide-react";
import { toast } from "sonner";

import { SaveButton, changed } from "@/components/host/SaveButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { common, directBookingCopy as copy } from "@/content/copy";
import { normaliseDirectBooking, type DirectBooking } from "@/lib/direct-booking";
import { getDirectBookingSettings, saveDirectBookingSettings } from "@/lib/direct-booking.functions";
import { cn } from "@/lib/utils";

/**
 * Direct stays → Book and pay here, for one property: whether guests can book
 * a free room straight away on the "Stay with us" page, the refundable and
 * non-refundable rates, and how they may pay (card through the host's Stripe
 * account, bank transfer to the host's bank, at the property when allowed).
 * Warns about rooms whose Latchkey calendar other sites don't have yet.
 */
export function DirectBookingSettings({ propertyId }: { propertyId: string }) {
  const fetchFn = useServerFn(getDirectBookingSettings);
  const saveFn = useServerFn(saveDirectBookingSettings);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["direct-booking", propertyId], queryFn: () => fetchFn({ data: { propertyId } }) });
  const [form, setForm] = useState<DirectBooking | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    setForm(q.data.settings);
    setAmount(q.data.settings.nonRef.kind === "amount" ? (q.data.settings.nonRef.value / 100).toFixed(2) : String(q.data.settings.nonRef.value));
  }, [q.data]);

  if (q.isLoading || !q.data || !form) return <Skeleton className="h-48 rounded-2xl" />;
  const d = q.data;
  const next = normaliseDirectBooking({ ...form, nonRef: { ...form.nonRef, value: form.nonRef.kind === "amount" ? Math.round(Number(amount || 0) * 100) : Number(amount || 0) } });
  const dirty = changed(next, d.settings);
  const set = (patch: Partial<DirectBooking>) => setForm((f) => f && { ...f, ...patch });

  async function save() {
    setBusy(true);
    try {
      await saveFn({ data: { propertyId, settings: next } });
      await qc.invalidateQueries({ queryKey: ["direct-booking", propertyId] });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  const methodRow = (key: "card" | "bank" | "atProperty", ready: boolean, help: string, setupLink?: { to: string; search?: Record<string, string>; label: string }) => (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
      <div className="min-w-0 text-sm">
        <Label htmlFor={`db-${key}`} className="text-base">{copy.methods[key]}</Label>
        <p className="text-muted-foreground">{help}</p>
        {!ready && setupLink ? (
          <Link to={setupLink.to as never} search={setupLink.search as never} className="mt-1 inline-block font-medium text-primary hover:underline">
            {setupLink.label}
          </Link>
        ) : null}
      </div>
      <Switch id={`db-${key}`} checked={form[key]} disabled={!ready && !form[key]} onCheckedChange={(v) => set({ [key]: v } as Partial<DirectBooking>)} />
    </div>
  );

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg"><CreditCard className="size-5 text-primary" /> {copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        {d.available ? <SaveButton dirty={dirty} busy={busy} onClick={() => void save()} /> : null}
      </div>
      {!d.available ? <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p> : null}

      <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
        <div className="text-sm">
          <Label htmlFor="db-instant" className="text-base">{copy.instant}</Label>
          <p className="text-muted-foreground">{copy.instantHelp}</p>
        </div>
        <Switch id="db-instant" checked={form.instant} onCheckedChange={(v) => set({ instant: v })} />
      </div>

      <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
        <div className="text-sm">
          <Label htmlFor="db-children" className="text-base">{copy.children}</Label>
          <p className="text-muted-foreground">{copy.childrenHelp}</p>
        </div>
        <Switch id="db-children" checked={form.children} onCheckedChange={(v) => set({ children: v })} />
      </div>

      {/* Other sites only see a direct booking if they import the room's Latchkey calendar. */}
      {form.instant && d.roomsNotShared.length ? (
        <p className="flex items-start gap-2 rounded-xl bg-accent/15 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>
            {copy.calendarWarning(d.roomsNotShared.join(", "))}{" "}
            <Link to="/app/connections" className="font-medium text-primary hover:underline">{copy.calendarLink}</Link>
          </span>
        </p>
      ) : form.instant ? (
        <p className="rounded-xl bg-muted p-3 text-sm">{copy.calendarReminder}</p>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{copy.ratesTitle}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-border p-3 text-sm">
            <p className="font-medium">{copy.flex}</p>
            <label className="mt-2 flex items-center gap-2">
              {copy.freeCancelBefore}
              <Input className="h-9 w-16" inputMode="numeric" value={String(form.freeCancelDays)} onChange={(e) => set({ freeCancelDays: Number(e.target.value.replace(/\D/g, "") || 0) })} aria-label={copy.freeCancelBefore} />
              {copy.daysBefore}
            </label>
          </div>
          <div className="rounded-xl border border-border p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{copy.nonRef}</p>
              <Switch checked={form.nonRef.enabled} onCheckedChange={(v) => set({ nonRef: { ...form.nonRef, enabled: v } })} aria-label={copy.nonRef} />
            </div>
            {form.nonRef.enabled ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {copy.cheaperBy}
                <Input className="h-9 w-20" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={copy.cheaperBy} />
                <div role="radiogroup" className="flex rounded-lg bg-muted p-0.5">
                  {(["percent", "amount"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={form.nonRef.kind === k}
                      onClick={() => set({ nonRef: { ...form.nonRef, kind: k } })}
                      className={cn("rounded-md px-2 py-1 text-xs font-medium", form.nonRef.kind === k ? "bg-background shadow-sm" : "text-muted-foreground")}
                    >
                      {k === "percent" ? "%" : copy.perNightIn(d.currency)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{copy.payTitle}</legend>
        {methodRow("card", d.ready.card, copy.cardHelp, { to: "/app/settings", search: { focus: "payments" }, label: copy.connectStripe })}
        {methodRow("bank", d.ready.bank, copy.bankHelp(form.bankPayDays), { to: "/app/settings", search: { focus: "money" }, label: copy.addBank })}
        {methodRow("atProperty", true, copy.propertyHelp)}
        {form.bank ? (
          <label className="flex items-center gap-2 text-sm">
            {copy.bankDaysLabel}
            <Input className="h-9 w-16" inputMode="numeric" value={String(form.bankPayDays)} onChange={(e) => set({ bankPayDays: Number(e.target.value.replace(/\D/g, "") || 1) })} aria-label={copy.bankDaysLabel} />
            {copy.days}
          </label>
        ) : null}
      </fieldset>
    </section>
  );
}
