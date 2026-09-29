import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { extrasCopy as copy } from "@/content/copy";
import { emailReceipt } from "@/lib/extras.functions";
import { formatPence } from "@/lib/services";

export type ReceiptRequest = {
  id: string;
  items: { name: string; qty: number; totalPence?: number }[];
  totalPence: number;
  receiptNumber: string | null;
  paidAt: string | null;
  createdAt: string;
  paymentMethod: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  token: string;
  request: ReceiptRequest;
  propertyName: string;
  hostName: string;
  guestName: string | null;
  currency: string;
  timezone: string;
  tax: { registered: boolean; label: string; rateBp: number; pricesInclude: boolean };
};

/** Itemised receipt a guest can read, print, save as PDF, or have emailed. */
export function ReceiptCard(p: Props) {
  const send = useServerFn(emailReceipt);
  const [busy, setBusy] = useState(false);
  const r = p.request;

  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: p.timezone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(r.paidAt ?? r.createdAt));

  const taxPence = p.tax.registered && p.tax.pricesInclude
    ? Math.round(r.totalPence - r.totalPence / (1 + p.tax.rateBp / 10000))
    : p.tax.registered
      ? Math.round(r.totalPence * (p.tax.rateBp / 10000))
      : 0;

  const rows = r.items.map((i) => ({
    name: i.name,
    qty: i.qty ?? 1,
    total: i.totalPence ?? 0,
  }));

  function print() {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${copy.receiptNo(r.receiptNumber ?? "")}</title>
      <style>body{font-family:system-ui,sans-serif;margin:32px;color:#2c2a26}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}
      td,th{text-align:left;padding:8px 0;border-bottom:1px solid #e6e0d6}tfoot td{font-weight:600;border:0}</style></head><body>
      <h1>${p.propertyName}</h1><p>${p.hostName}</p>
      <p>${copy.receiptNo(r.receiptNumber ?? "")}<br>${when}${p.guestName ? `<br>${p.guestName}` : ""}</p>
      <table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>
      ${rows.map((x) => `<tr><td>${x.name}</td><td>${x.qty}</td><td>${x.total ? formatPence(x.total, p.currency) : copy.free}</td></tr>`).join("")}
      </tbody><tfoot>
      ${taxPence ? `<tr><td colspan="2">${p.tax.label}</td><td>${formatPence(taxPence, p.currency)}</td></tr>` : ""}
      <tr><td colspan="2">${copy.receiptTotal}</td><td>${formatPence(r.totalPence, p.currency)}</td></tr>
      <tr><td colspan="2">Paid by</td><td>${copy.receiptPaidBy[r.paymentMethod ?? "card"] ?? "Card"}</td></tr>
      </tfoot></table></body></html>`;
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  async function email() {
    setBusy(true);
    try {
      const res = await send({ data: { token: p.token, id: r.id, to: null } });
      if (res.sent) toast.success(copy.receiptEmailed);
      else if (res.reason === "no_address") toast.info(copy.receiptNoAddress);
      else toast.info(copy.receiptEmailOff);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : copy.receiptEmailOff);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={p.open} onOpenChange={(o) => { if (!o) p.onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.receiptTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 text-sm">
          <p className="font-medium text-base">{p.propertyName}</p>
          <p className="text-muted-foreground">{p.hostName}</p>
          <p className="text-muted-foreground">{copy.receiptNo(r.receiptNumber ?? "—")} · {when}</p>
          {p.guestName ? <p className="text-muted-foreground">{p.guestName}</p> : null}
        </div>
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {rows.map((x, i) => (
            <li key={i} className="flex items-center gap-3 p-3">
              <span className="flex-1">{x.qty} × {x.name}</span>
              <span>{x.total ? formatPence(x.total, p.currency) : copy.free}</span>
            </li>
          ))}
        </ul>
        {taxPence ? (
          <p className="flex justify-between text-sm text-muted-foreground"><span>{p.tax.label}</span><span>{formatPence(taxPence, p.currency)}</span></p>
        ) : null}
        <p className="flex justify-between text-lg font-medium"><span>{copy.receiptTotal}</span><span>{formatPence(r.totalPence, p.currency)}</span></p>
        <p className="text-sm text-muted-foreground">{copy.receiptPaidBy[r.paymentMethod ?? "card"] ?? "Card"}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="touch" onClick={print}><Printer className="size-4" />{copy.receiptPrint}</Button>
          <Button size="touch" variant="outline" onClick={email} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            {copy.receiptEmail}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
