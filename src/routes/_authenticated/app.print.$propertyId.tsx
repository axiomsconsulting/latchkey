import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import QRCode from "qrcode";
import { ArrowLeft, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { checkinSettings as copy } from "@/content/copy";
import { usePropertyBoard } from "@/hooks/use-host-data";
import { rebrand } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/app/print/$propertyId")({
  head: () => ({ meta: [{ title: rebrand("Print check-in card — Latchkey") }] }),
  component: PrintCard,
});

function PrintCard() {
  const { propertyId } = Route.useParams();
  const board = usePropertyBoard(propertyId);
  const property = board.data?.property as
    { name: string; short_code: string; check_in_pin: string | null } | null | undefined;
  const [qr, setQr] = useState<string | null>(null);
  const url = property ? `${window.location.origin}/kiosk/${property.short_code}?guest=1` : "";

  useEffect(() => {
    if (!url) return;
    void QRCode.toDataURL(url, { width: 640, margin: 1, errorCorrectionLevel: "M" }).then(setQr);
  }, [url]);

  if (board.isLoading || !property) {
    return <Skeleton className="mx-auto h-[600px] w-full max-w-md rounded-2xl" />;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 print:max-w-none print:space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost">
          <Link to="/app/properties">
            <ArrowLeft className="size-4" /> {copy.back}
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> {copy.print}
        </Button>
      </div>

      {/* White on screen and paper; on paper it fills one A4 page (print-sheet in styles.css). */}
      <article className="print-sheet mx-auto flex aspect-[148/210] w-full max-w-md flex-col items-center justify-between rounded-2xl border border-neutral-200 bg-white p-8 text-center text-neutral-900 shadow-sm print:p-16">
        <div>
          <h1 className="text-3xl text-neutral-900 print:text-5xl">{property.name}</h1>
          <p className="mt-2 text-lg text-neutral-600 print:text-2xl">{copy.cardHeadline}</p>
        </div>
        {qr ? (
          <img src={qr} alt={copy.qrAlt} className="w-3/4 print:w-[60%]" />
        ) : (
          <Skeleton className="aspect-square w-3/4" />
        )}
        <div className="space-y-1 print:space-y-2">
          <p className="text-sm text-neutral-600 print:text-lg">{copy.cardOrVisit}</p>
          <p className="font-medium text-neutral-900 print:text-xl">
            {url.replace(/^https?:\/\//, "")}
          </p>
          {property.check_in_pin ? (
            <p className="text-sm text-neutral-600 print:text-lg">
              {copy.cardPin}{" "}
              <span className="font-mono text-base font-semibold text-neutral-900 print:text-2xl">
                {property.check_in_pin}
              </span>
            </p>
          ) : null}
        </div>
      </article>
    </div>
  );
}
