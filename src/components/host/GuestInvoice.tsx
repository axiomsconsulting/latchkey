import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, FileText, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { common, invoiceCopy as copy } from "@/content/copy";
import { formatUkDate } from "@/lib/dates";
import { formatMoney, invoiceTotals } from "@/lib/invoice";
import { getBookingInvoice, saveBookingInvoice } from "@/lib/invoice.functions";

/**
 * The guest card's invoice: open or edit the one the guest made, or make one
 * now. Hosts can change everything on it; the guest only ever chose their
 * email and postal address.
 */
export function GuestInvoice({
  bookingId,
  channel,
  canWrite,
}: {
  bookingId: string;
  channel: string;
  canWrite: boolean;
}) {
  const fetchInvoice = useServerFn(getBookingInvoice);
  const q = useQuery({
    queryKey: ["booking-invoice", bookingId],
    queryFn: () => fetchInvoice({ data: { bookingId } }),
  });
  const [editing, setEditing] = useState(false);

  const d = q.data;
  if (!d?.available) return null;
  const inv = d.invoice;
  const open = inv ? `/invoice/${inv.access_token}` : null;

  return (
    <div className="space-y-3 text-sm">
      {inv ? (
        <div className="rounded-xl border border-border p-3">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <FileText className="size-4 text-primary" /> {inv.number} ·{" "}
            {formatMoney(inv.total_pence, inv.currency)}
          </p>
          <p className="text-xs text-muted-foreground">
            {copy.hostMadeBy(inv.created_by)} · {formatUkDate(inv.issued_on, { withYear: true })}
            {inv.amended_at
              ? ` · ${copy.amended(formatUkDate(inv.amended_at.slice(0, 10), { withYear: true }))}`
              : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={open!} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" /> {copy.hostOpen}
              </a>
            </Button>
            {canWrite ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> {copy.hostEdit}
              </Button>
            ) : null}
          </div>
        </div>
      ) : channel !== "direct" ? (
        <p className="text-muted-foreground">{copy.hostNotDirect}</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            {d.draft.offered
              ? copy.hostNone
              : d.draft.amountPence > 0
                ? copy.hostOff
                : copy.hostNeedsAmount}
          </p>
          {canWrite ? (
            <Button size="sm" onClick={() => setEditing(true)}>
              <FileText className="size-4" /> {copy.hostMake}
            </Button>
          ) : null}
        </>
      )}

      {editing ? (
        <InvoiceDialog bookingId={bookingId} data={d} onClose={() => setEditing(false)} />
      ) : null}
    </div>
  );
}

type Loaded = Extract<Awaited<ReturnType<typeof getBookingInvoice>>, { available: true }>;

function InvoiceDialog({
  bookingId,
  data,
  onClose,
}: {
  bookingId: string;
  data: Loaded;
  onClose: () => void;
}) {
  const save = useServerFn(saveBookingInvoice);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { invoice: inv, draft: d } = data;
  // An existing invoice keeps what it says; a new one starts from the stay.
  const startAmount = inv
    ? d.includesTax || !d.registered
      ? inv.total_pence
      : inv.net_pence
    : d.amountPence;
  const [form, setForm] = useState({
    sellerName: inv?.seller_name ?? d.sellerName,
    sellerRoom: inv?.seller_room ?? d.sellerRoom ?? "",
    sellerAddress: inv?.seller_address ?? d.sellerAddress ?? "",
    buyerName: inv?.buyer_name ?? d.buyerName,
    buyerEmail: inv?.buyer_email ?? d.buyerEmail ?? "",
    buyerAddress: inv?.buyer_address ?? "",
    description: inv?.description ?? d.description,
    amount: (startAmount / 100).toFixed(2),
    includesTax: d.includesTax,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const amountPence = Math.round(Number(form.amount.replace(/[^0-9.]/g, "")) * 100) || 0;
  const totals = invoiceTotals({
    amountPence,
    includesTax: form.includesTax,
    registered: d.registered,
    rateBp: d.rateBp,
  });
  const money = (p: number) => formatMoney(p, d.currency);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await save({
        data: {
          bookingId,
          edits: {
            sellerName: form.sellerName,
            sellerRoom: form.sellerRoom.trim() || null,
            sellerAddress: form.sellerAddress.trim() || null,
            buyerName: form.buyerName,
            buyerEmail: form.buyerEmail.trim() || null,
            buyerAddress: form.buyerAddress.trim() || null,
            description: form.description,
            amountPence,
            includesTax: form.includesTax,
          },
        },
      });
      await qc.invalidateQueries({ queryKey: ["booking-invoice", bookingId] });
      toast.success(copy.saved);
      onClose();
      window.open(`/invoice/${res.token}`, "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {inv ? copy.dialogTitleEdit(inv.number) : copy.dialogTitleNew}
          </DialogTitle>
          <DialogDescription>{d.registered ? null : copy.notRegistered}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="i-seller"
              label={copy.sellerName}
              value={form.sellerName}
              onChange={(v) => set("sellerName", v)}
              required
            />
            <Field
              id="i-room"
              label={copy.sellerRoom}
              value={form.sellerRoom}
              onChange={(v) => set("sellerRoom", v)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="i-saddr">{copy.sellerAddress}</Label>
            <Textarea
              id="i-saddr"
              rows={2}
              value={form.sellerAddress}
              onChange={(e) => set("sellerAddress", e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="i-buyer"
              label={copy.buyerName}
              value={form.buyerName}
              onChange={(v) => set("buyerName", v)}
              required
            />
            <Field
              id="i-email"
              label={copy.buyerEmail}
              type="email"
              value={form.buyerEmail}
              onChange={(v) => set("buyerEmail", v)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="i-baddr">{copy.buyerAddress}</Label>
            <Textarea
              id="i-baddr"
              rows={3}
              value={form.buyerAddress}
              onChange={(e) => set("buyerAddress", e.target.value)}
            />
          </div>
          <Field
            id="i-desc"
            label={copy.description}
            value={form.description}
            onChange={(v) => set("description", v)}
            required
          />
          <div className="space-y-1">
            <Label htmlFor="i-amount">{copy.amountLabel(d.currency)}</Label>
            <div className="flex items-center gap-3">
              <Input
                id="i-amount"
                inputMode="decimal"
                className="h-11"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
              />
              {d.registered ? (
                <label className="flex shrink-0 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5 rounded border-input"
                    checked={form.includesTax}
                    onChange={(e) => set("includesTax", e.target.checked)}
                  />
                  {copy.includesTax(d.taxName)}
                </label>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {totals.tax > 0
                ? copy.totalsPreview(
                    money(totals.net),
                    money(totals.tax),
                    money(totals.total),
                    d.taxName,
                  )
                : money(totals.total)}
            </p>
            {/* The stay's price changed since this invoice was made. */}
            {inv && d.amountPence > 0 && d.amountPence !== amountPence ? (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-sm"
                onClick={() => set("amount", (d.amountPence / 100).toFixed(2))}
              >
                {copy.useBookingAmount(money(d.amountPence))}
              </Button>
            ) : null}
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {inv ? common.save : copy.hostMake}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        className="h-11"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
