import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import QRCode from "qrcode";
import { ArrowLeft, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { checkinSettings as copy } from "@/content/copy";
import { usePropertyBoard } from "@/hooks/use-host-data";

export const Route = createFileRoute("/_authenticated/app/print/$propertyId")({
  head: () => ({ meta: [{ title: "Print check-in card — Latchkey" }] }),
  component: PrintCard,
});

function PrintCard() {
  const { propertyId } = Route.useParams();
  const board = usePropertyBoard(propertyId);
  const property = board.data?.property as
    | { name: string; short_code: string; check_in_pin: string | null }
    | null
    | undefined;
  const [qr, setQr] = useState<string | null>(null);
  const url = property ? `${window.location.origin}/p/${property.short_code}` : "";

  useEffect(() => {
    if (!url) return;
    void QRCode.toDataURL(url, { width: 640, margin: 1, errorCorrectionLevel: "M" }).then(setQr);
  }, [url]);

  if (board.isLoading || !property) {
    return <Skeleton className="mx-auto h-[600px] w-full max-w-md rounded-2xl" />;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
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

      <article className="card-soft mx-auto flex aspect-[148/210] w-full max-w-md flex-col items-center justify-between p-8 text-center print:shadow-none">
        <div>
          <h1 className="text-3xl">{property.name}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{copy.cardHeadline}</p>
        </div>
        {qr ? <img src={qr} alt={copy.qrAlt} className="w-3/4" /> : <Skeleton className="aspect-square w-3/4" />}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{copy.cardOrVisit}</p>
          <p className="font-medium">{url.replace(/^https?:\/\//, "")}</p>
          {property.check_in_pin ? (
            <p className="text-sm text-muted-foreground">
              {copy.cardPin} <span className="font-mono text-base font-semibold text-foreground">{property.check_in_pin}</span>
            </p>
          ) : null}
        </div>
      </article>
    </div>
  );
}
