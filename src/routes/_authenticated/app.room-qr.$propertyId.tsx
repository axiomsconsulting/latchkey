import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { ArrowLeft, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { roomQrCopy as copy } from "@/content/copy";
import { usePropertyBoard } from "@/hooks/use-host-data";
import { getRoomGuideCodes } from "@/lib/guide.functions";

/**
 * A card for each room, with the QR code for that room's own guide, to
 * print and put by the bed or on the back of the door. ?room=<id> prints one.
 */
export const Route = createFileRoute("/_authenticated/app/room-qr/$propertyId")({
  validateSearch: (s: Record<string, unknown>): { room?: string } => (typeof s["room"] === "string" ? { room: s["room"] } : {}),
  head: () => ({ meta: [{ title: "Print room QR codes — Latchkey" }] }),
  component: RoomQrCards,
});

function RoomQrCards() {
  const { propertyId } = Route.useParams();
  const { room } = Route.useSearch();
  const board = usePropertyBoard(propertyId);
  const codesFn = useServerFn(getRoomGuideCodes);
  const q = useQuery({ queryKey: ["room-guide-codes", propertyId], queryFn: () => codesFn({ data: { propertyId } }) });
  const property = board.data?.property as { name: string } | null | undefined;
  const rooms = (q.data?.rooms ?? []).filter((r) => r.code && (!room || r.id === room));

  if (board.isLoading || q.isLoading) return <Skeleton className="mx-auto h-[600px] w-full max-w-md rounded-2xl" />;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost">
          <Link to="/app/guides">
            <ArrowLeft className="size-4" /> {copy.back}
          </Link>
        </Button>
        <Button onClick={() => window.print()} disabled={!rooms.length}>
          <Printer className="size-4" /> {rooms.length > 1 ? copy.printAll(rooms.length) : copy.print}
        </Button>
      </div>
      {!q.data?.available ? <p className="card-soft p-5">{copy.notReady}</p> : null}
      {q.data?.available && !rooms.length ? <p className="card-soft p-5">{copy.none}</p> : null}
      {rooms.map((r) => (
        <RoomCard key={r.id} place={property?.name ?? ""} name={r.name} code={r.code!} />
      ))}
    </div>
  );
}

function RoomCard({ place, name, code }: { place: string; name: string; code: string }) {
  const url = `${window.location.origin}/room/${code}`;
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    void QRCode.toDataURL(url, { width: 640, margin: 1, errorCorrectionLevel: "M" }).then(setQr);
  }, [url]);
  return (
    <article className="card-soft mx-auto flex aspect-[148/210] w-full max-w-md break-after-page flex-col items-center justify-between p-8 text-center print:shadow-none">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">{place}</p>
        <h1 className="mt-2 text-3xl">{name}</h1>
        <p className="mt-2 text-lg text-muted-foreground">{copy.headline}</p>
      </div>
      {qr ? <img src={qr} alt={copy.qrAlt(name)} className="w-3/4" /> : <Skeleton className="aspect-square w-3/4" />}
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{copy.covers}</p>
        <p className="text-xs text-muted-foreground">{url.replace(/^https?:\/\//, "")}</p>
      </div>
    </article>
  );
}
