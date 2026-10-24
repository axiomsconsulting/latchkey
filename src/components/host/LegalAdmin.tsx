import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { SaveButton, changed } from "@/components/host/SaveButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { common, legalPageCopy as copy } from "@/content/copy";
import { DEFAULT_LEGAL, missingLegal, normaliseLegal, type LegalDetails } from "@/lib/legal";
import { getLegalSettings, saveLegalSettings } from "@/lib/site.functions";

const FIELDS: Array<keyof LegalDetails> = ["companyName", "companyNumber", "registeredAddress", "contactEmail", "privacyEmail", "icoNumber", "vatNumber", "governingLaw"];

/** Latchkey admin → Site settings: who runs the service, for /terms and /privacy. */
export function LegalAdmin() {
  const fetchFn = useServerFn(getLegalSettings);
  const saveFn = useServerFn(saveLegalSettings);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["legal-settings"], queryFn: () => fetchFn() });
  const [form, setForm] = useState<LegalDetails>(DEFAULT_LEGAL);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setForm(q.data.legal);
  }, [q.data]);

  if (q.isLoading || !q.data) return <Skeleton className="h-64 rounded-2xl" />;
  const saved = q.data.legal;
  const missing = missingLegal(normaliseLegal(form));

  async function save() {
    setBusy(true);
    try {
      await saveFn({ data: form });
      await qc.invalidateQueries({ queryKey: ["legal-settings"] });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg">{copy.adminTitle}</h3>
          <p className="text-sm text-muted-foreground">{copy.adminBody}</p>
          <p className="mt-1 flex gap-3 text-sm">
            <Link to="/terms" target="_blank" className="text-primary hover:underline">{copy.view}: {copy.terms}</Link>
            <Link to="/privacy" target="_blank" className="text-primary hover:underline">{copy.view}: {copy.privacy}</Link>
          </p>
        </div>
        {q.data.available ? <SaveButton dirty={changed(form, saved)} busy={busy} onClick={() => void save()} /> : null}
      </div>
      {!q.data.available ? <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p> : null}
      {missing.length ? <p className="rounded-xl bg-accent/15 p-3 text-sm">{copy.missing(missing.map((k) => copy.fields[k]!.toLowerCase()).join(", "))}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((k) => (
          <div key={k} className={k === "registeredAddress" ? "space-y-1 sm:col-span-2" : "space-y-1"}>
            <Label htmlFor={`legal-${k}`} className="text-xs">{copy.fields[k]}</Label>
            {k === "registeredAddress" ? (
              <Textarea id={`legal-${k}`} rows={2} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            ) : (
              <Input id={`legal-${k}`} type={k.endsWith("Email") ? "email" : "text"} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
