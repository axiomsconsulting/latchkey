import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, FileText, Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { invoiceCopy as copy } from "@/content/copy";
import { formatMoney } from "@/lib/invoice";
import { createStayInvoice, getStayInvoice } from "@/lib/invoice.functions";

/**
 * "Your invoice" in the guest guide, for direct stays when the host offers
 * invoices. The guest confirms who it's made out to, can correct their email
 * and postal address once, and then gets a private link to view, download
 * or email it.
 */
export function StayInvoice({ token, place }: { token: string; place: string }) {
  const fetchInvoice = useServerFn(getStayInvoice);
  const create = useServerFn(createStayInvoice);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["stay-invoice", token],
    queryFn: () => fetchInvoice({ data: { token } }),
  });
  const [changing, setChanging] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const d = q.data;
  if (!d || !d.offered) return null;
  const draftEmail = d.draft.buyerEmail;

  async function make(withChanges: boolean) {
    setBusy(true);
    setError(null);
    try {
      await create({
        data: {
          token,
          ...(withChanges ? { email: email ?? draftEmail, address } : {}),
        },
      });
      await qc.invalidateQueries({ queryKey: ["stay-invoice", token] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const inv = d.invoice;
  if (inv) {
    const url =
      typeof window === "undefined"
        ? `/invoice/${inv.token}`
        : `${window.location.origin}/invoice/${inv.token}`;
    const mail = `mailto:${encodeURIComponent(inv.email ?? "")}?subject=${encodeURIComponent(copy.emailSubject(inv.number, place))}&body=${encodeURIComponent(copy.emailBody(url))}`;
    return (
      <section aria-labelledby="invoice" className="card-soft p-5">
        <h2 id="invoice" className="flex items-center gap-2 text-xl">
          <FileText className="size-5 text-primary" /> {copy.cardTitle}
        </h2>
        <p className="mt-1 text-muted-foreground">
          {copy.ready(inv.number)} {formatMoney(inv.total, inv.currency)}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Button asChild size="lg">
            <a href={url} target="_blank" rel="noreferrer">
              <FileText className="size-5" /> {copy.open}
            </a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href={mail}>
              <Mail className="size-5" /> {copy.emailIt}
            </a>
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() =>
              void navigator.clipboard?.writeText(url).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              })
            }
          >
            {copied ? <Check className="size-5" /> : <Copy className="size-5" />}{" "}
            {copied ? copy.copied : copy.copyLink}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="invoice" className="card-soft p-5">
      <h2 id="invoice" className="flex items-center gap-2 text-xl">
        <FileText className="size-5 text-primary" /> {copy.cardTitle}
      </h2>
      <p className="mt-1 text-muted-foreground">{copy.cardBody}</p>

      <div className="mt-4 rounded-2xl bg-secondary p-4 text-secondary-foreground">
        <p className="text-sm">{copy.issuedTo}</p>
        <p className="font-medium">{d.draft.buyerName}</p>
        {d.draft.buyerEmail ? <p className="text-sm">{d.draft.buyerEmail}</p> : null}
      </div>

      {!changing ? (
        <>
          <p className="mt-4 text-lg">{copy.changeQuestion}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button size="lg" disabled={busy} onClick={() => void make(false)}>
              {busy ? <Loader2 className="size-5 animate-spin" /> : null}
              {busy ? copy.creating : copy.changeNo}
            </Button>
            <Button size="lg" variant="outline" disabled={busy} onClick={() => setChanging(true)}>
              {copy.changeYes}
            </Button>
          </div>
        </>
      ) : (
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void make(true);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="inv-email">{copy.email}</Label>
            <Input
              id="inv-email"
              type="email"
              autoComplete="email"
              className="h-12"
              value={email ?? d.draft.buyerEmail ?? ""}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inv-address">{copy.address}</Label>
            <Textarea
              id="inv-address"
              rows={4}
              autoComplete="street-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">{copy.addressHint}</p>
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : null}
            {busy ? copy.creating : copy.create}
          </Button>
        </form>
      )}
      <p className="mt-3 text-sm text-muted-foreground">{copy.lockNote}</p>
      {error ? (
        <p role="alert" className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm">
          {error}
        </p>
      ) : null}
    </section>
  );
}
