import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { ArrowLeft, Loader2, Printer, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { common, roomQrCopy as copy } from "@/content/copy";
import { usePropertyBoard } from "@/hooks/use-host-data";
import { getRoomGuideCodes, resetRoomWords } from "@/lib/guide.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getStayAccess, saveStayAccess } from "@/lib/stay-access.functions";
import { DEFAULT_ROOM_CARD_TEXT } from "@/lib/stay-access";
import { SaveButton } from "@/components/host/SaveButton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { rebrand } from "@/lib/brand";

/**
 * A card for each room, with the QR code for that room's own guide, to
 * print and put by the bed or on the back of the door. ?room=<id> prints one.
 */
export const Route = createFileRoute("/_authenticated/app/room-qr/$propertyId")({
  validateSearch: (s: Record<string, unknown>): { room?: string } =>
    typeof s["room"] === "string" ? { room: s["room"] } : {},
  head: () => ({ meta: [{ title: rebrand("Print room QR codes — Latchkey") }] }),
  component: RoomQrCards,
});

function RoomQrCards() {
  const { propertyId } = Route.useParams();
  const { room } = Route.useSearch();
  const board = usePropertyBoard(propertyId);
  const codesFn = useServerFn(getRoomGuideCodes);
  const q = useQuery({
    queryKey: ["room-guide-codes", propertyId],
    queryFn: () => codesFn({ data: { propertyId } }),
  });
  const property = board.data?.property as { name: string } | null | undefined;
  const rooms = (q.data?.rooms ?? []).filter((r) => r.code && (!room || r.id === room));
  // The line under each QR code: the host's own words, saved with the property (stay_access.roomCardText).
  const accessFn = useServerFn(getStayAccess);
  const saveFn = useServerFn(saveStayAccess);
  const qc = useQueryClient();
  const access = useQuery({
    queryKey: ["stay-access", propertyId],
    queryFn: () => accessFn({ data: { propertyId } }),
  });
  const savedText = access.data?.settings.roomCardText ?? DEFAULT_ROOM_CARD_TEXT;
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = text ?? savedText;
  async function saveText() {
    setBusy(true);
    try {
      await saveFn({ data: { propertyId, settings: { roomCardText: shown } } });
      await qc.invalidateQueries({ queryKey: ["stay-access", propertyId] });
      setText(null);
      toast.success(copy.textSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  if (board.isLoading || q.isLoading)
    return <Skeleton className="mx-auto h-[600px] w-full max-w-md rounded-2xl" />;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 print:max-w-none print:space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost">
          <Link to="/app/guides">
            <ArrowLeft className="size-4" /> {copy.back}
          </Link>
        </Button>
        <Button onClick={() => window.print()} disabled={!rooms.length}>
          <Printer className="size-4" />{" "}
          {rooms.length > 1 ? copy.printAll(rooms.length) : copy.print}
        </Button>
      </div>
      {/* What the cards say under the code: edited here, saved for every room's card. */}
      <section className="card-soft space-y-2 p-4 print:hidden">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="card-text">{copy.textLabel}</Label>
          {access.data?.available ? (
            <SaveButton
              dirty={shown.trim() !== savedText}
              busy={busy}
              onClick={() => void saveText()}
            />
          ) : null}
        </div>
        <Textarea
          id="card-text"
          rows={2}
          maxLength={160}
          value={shown}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{copy.textHint}</p>
      </section>
      {!q.data?.available ? <p className="card-soft p-5">{copy.notReady}</p> : null}
      {q.data?.available && !rooms.length ? <p className="card-soft p-5">{copy.none}</p> : null}
      {rooms.map((r) => (
        <div key={r.id} className="print-sheet-wrap space-y-2 print:space-y-0">
          <RoomCard place={property?.name ?? ""} name={r.name} code={r.code!} text={shown} />
          <NewWords roomId={r.id} name={r.name} propertyId={propertyId} />
        </div>
      ))}
    </div>
  );
}

function RoomCard({
  place,
  name,
  code,
  text,
}: {
  place: string;
  name: string;
  code: string;
  text: string;
}) {
  const url = `${window.location.origin}/room/${code}`;
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    void QRCode.toDataURL(url, { width: 640, margin: 1, errorCorrectionLevel: "M" }).then(setQr);
  }, [url]);
  return (
    // Always on white paper, whatever the dashboard's theme.
    <article className="print-sheet mx-auto flex aspect-[148/210] w-full max-w-md flex-col items-center justify-between rounded-2xl border border-neutral-200 bg-white p-8 text-center text-neutral-900 shadow-sm print:p-16">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-700 print:text-lg">
          {place}
        </p>
        <h1 className="mt-2 text-3xl text-neutral-900 print:text-5xl">{name}</h1>
        <p className="mt-2 text-lg text-neutral-600 print:text-2xl">{copy.headline}</p>
      </div>
      {qr ? (
        <img src={qr} alt={copy.qrAlt(name)} className="w-3/4 print:w-[60%]" />
      ) : (
        <Skeleton className="aspect-square w-3/4" />
      )}
      <div className="space-y-1">
        <p className="text-sm text-neutral-600 print:text-lg">{text}</p>
        {/* Three words anyone can type if the camera won't scan. */}
        <p className="text-sm font-medium text-neutral-800 print:text-xl">
          {url.replace(/^https?:\/\//, "")}
        </p>
      </div>
    </article>
  );
}

/**
 * New words for one room's code (Latchkey makes them): the card's previous
 * words, and any older code, stop working straight away, so it needs printing again.
 */
function NewWords({
  roomId,
  name,
  propertyId,
}: {
  roomId: string;
  name: string;
  propertyId: string;
}) {
  const reset = useServerFn(resetRoomWords);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto flex max-w-md justify-end print:hidden">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{" "}
            {copy.newWords}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.newWordsTitle(name)}</AlertDialogTitle>
            <AlertDialogDescription>{copy.newWordsBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await reset({ data: { roomId } });
                  await qc.invalidateQueries({ queryKey: ["room-guide-codes", propertyId] });
                  toast.success(copy.newWordsDone(r.code));
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : common.errorBody);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {copy.newWordsConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
