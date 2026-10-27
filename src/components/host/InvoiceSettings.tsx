import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { SaveButton, changed } from "@/components/host/SaveButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { common, invoiceCopy as copy } from "@/content/copy";
import { invoiceNumber } from "@/lib/invoice";
import { getInvoiceSettings, saveInvoiceSettings } from "@/lib/invoice.functions";

/** Settings → Invoices: on or off, the tax number in local terms, and the number prefix. */
export function InvoiceSettings({ hostId, isOwner }: { hostId: string; isOwner: boolean }) {
  const fetchSettings = useServerFn(getInvoiceSettings);
  const save = useServerFn(saveInvoiceSettings);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["invoice-settings", hostId],
    queryFn: () => fetchSettings({ data: { hostId } }),
  });
  const [form, setForm] = useState({ enabled: false, taxNumber: "", prefix: "INV" });
  const [busy, setBusy] = useState(false);

  const s = q.data;
  useEffect(() => {
    if (s?.available) setForm({ enabled: s.enabled, taxNumber: s.taxNumber, prefix: s.prefix });
  }, [s]);

  if (!s?.available) return null;
  const taxName = s.taxLabel || s.terms.name;
  const dirty =
    changed(form, { enabled: s.enabled, taxNumber: s.taxNumber, prefix: s.prefix }) &&
    !!form.prefix;

  async function submit() {
    setBusy(true);
    try {
      await save({ data: { hostId, ...form } });
      await qc.invalidateQueries({ queryKey: ["invoice-settings", hostId] });
      toast.success(copy.settingsSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <FileText className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg">{copy.settingsTitle}</h2>
          <p className="text-sm text-muted-foreground">{copy.settingsBody}</p>
        </div>
        {isOwner ? <SaveButton dirty={dirty} busy={busy} onClick={() => void submit()} /> : null}
      </div>
      <fieldset disabled={!isOwner} className="mt-4 space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
          <Label htmlFor="inv-on" className="text-base">
            {copy.enable}
          </Label>
          <Switch
            id="inv-on"
            checked={form.enabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="inv-tax">{copy.taxNumber(s.terms.numberLabel)}</Label>
            <Input
              id="inv-tax"
              className="h-11"
              maxLength={40}
              value={form.taxNumber}
              onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">{copy.taxNumberHint(taxName)}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="inv-prefix">{copy.prefix}</Label>
            <Input
              id="inv-prefix"
              className="h-11 uppercase"
              maxLength={12}
              value={form.prefix}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""),
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              {copy.prefixHint(invoiceNumber(form.prefix, 1))}
            </p>
          </div>
        </div>
        <p className="rounded-xl bg-muted p-3 text-sm">
          {copy.taxSummary(s.registered, taxName, (s.rateBp / 100).toString(), s.pricesInclude)}
        </p>
      </fieldset>
    </section>
  );
}
