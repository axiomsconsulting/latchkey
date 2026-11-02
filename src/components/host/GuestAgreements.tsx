import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, FileSignature, FileText, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { common, guestAgreementsCopy as copy } from "@/content/copy";
import { PURPOSE_LABELS, addressLine } from "@/lib/stay-terms";
import { createAgreementLink, listStayAgreements } from "@/lib/stay-terms.functions";

/**
 * The guest card: what this guest accepted (booking terms) and signed (the
 * longer-stay licence), each with the PDF kept for the host; and for a stay
 * booked another way, a link that asks the guest to read and sign.
 */
export function GuestAgreements({ bookingId, canWrite }: { bookingId: string; canWrite: boolean }) {
  const listFn = useServerFn(listStayAgreements);
  const linkFn = useServerFn(createAgreementLink);
  const q = useQuery({
    queryKey: ["stay-agreements", bookingId],
    queryFn: () => listFn({ data: { bookingId } }),
  });
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (q.isLoading) return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  if (!q.data?.available) return <p className="text-sm text-muted-foreground">{copy.notYet}</p>;
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

  async function makeLink() {
    setBusy(true);
    try {
      const r = await linkFn({ data: { bookingId } });
      setLink(r.url);
      await navigator.clipboard.writeText(r.url).then(
        () => toast.success(copy.copied),
        () => undefined,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {q.data.items.length ? (
        <ul className="space-y-2">
          {q.data.items.map((a) => (
            <li key={a.id} className="rounded-xl border border-border p-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                {a.kind === "licence" ? (
                  <FileSignature className="size-4 text-primary" aria-hidden />
                ) : (
                  <FileText className="size-4 text-primary" aria-hidden />
                )}
                {a.kind === "licence" ? copy.licence : copy.terms}
              </p>
              <p className="text-muted-foreground">
                {copy.by(a.typedName ?? a.guestName, when(a.signedAt), a.version)}
              </p>
              {a.homeAddress ? <p>{copy.home(addressLine(a.homeAddress))}</p> : null}
              {a.purpose ? <p>{copy.purpose(PURPOSE_LABELS[a.purpose])}</p> : null}
              <p className="break-all text-xs text-muted-foreground">{copy.fingerprint(a.sha)}</p>
              {a.pdf ? (
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <a href={a.pdf} target="_blank" rel="noopener noreferrer">
                    {copy.openPdf}
                  </a>
                </Button>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">{copy.pdfPending}</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{copy.none}</p>
      )}
      {canWrite ? (
        <div className="space-y-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void makeLink()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            {copy.ask}
          </Button>
          {link ? (
            <p className="flex items-center gap-2 break-all text-xs">
              <Copy className="size-3.5 shrink-0" aria-hidden /> {link}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{copy.askHelp}</p>
        </div>
      ) : null}
    </div>
  );
}
