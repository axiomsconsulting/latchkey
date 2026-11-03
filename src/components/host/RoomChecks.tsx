import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BedDouble, Check, Loader2, TriangleAlert } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { common, roomCheckCopy as copy } from "@/content/copy";
import { useRole } from "@/hooks/use-host-data";
import { formatUkDate } from "@/lib/dates";
import {
  confirmRoomCheck,
  listRoomChecks,
  makeStayForHeld,
  moveCheckIn,
  moveCheckInOptions,
} from "@/lib/room-check.functions";
import { deleteBookings } from "@/lib/guests.functions";

/**
 * Above Today's cards, only when there's something to do: guests who've given
 * their ID but whom Latchkey couldn't place for certain. Those with no room come
 * first; the host places them, or confirms or moves the unsure ones.
 */
export function RoomChecks({ propertyId }: { propertyId: string | null }) {
  const fn = useServerFn(listRoomChecks);
  const confirm = useServerFn(confirmRoomCheck);
  const qc = useQueryClient();
  const { canWrite } = useRole();
  const [moving, setMoving] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["room-checks", propertyId],
    enabled: !!propertyId,
    refetchInterval: 30_000,
    queryFn: () => fn({ data: { propertyId: propertyId! } }),
  });
  const items = q.data?.items ?? [];
  if (!items.length) return null;
  const held = items.filter((i) => i.held);
  const unsure = items.filter((i) => !i.held);

  async function looksRight(bookingId: string) {
    try {
      await confirm({ data: { bookingId } });
      toast.success(copy.confirmed);
      await qc.invalidateQueries({ queryKey: ["room-checks"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    }
  }

  const group = (title: string, rows: typeof items) =>
    rows.length ? (
      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-lg">
          <TriangleAlert className="size-5 shrink-0 text-accent" aria-hidden /> {title}
        </h2>
        <ul className="divide-y divide-border">
          {rows.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
              <div className="min-w-0 flex-1 basis-56">
                <p className="font-medium">
                  {i.idName || i.bookingName}
                  <span className="ml-2 inline-flex items-center gap-1 text-sm font-normal text-muted-foreground">
                    <BedDouble className="size-4" aria-hidden /> {i.room ?? copy.noRoom}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {copy.reasons[i.reason] ?? ""}
                  {i.reason === "someone_else" && i.bookingName
                    ? `. ${copy.bookedAs(i.bookingName)}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="ghost" size="sm">
                  <Link to="/app/bookings" search={{ guest: i.id } as never}>
                    {copy.seeId}
                  </Link>
                </Button>
                {canWrite ? (
                  <>
                    {!i.held ? (
                      <Button variant="outline" size="sm" onClick={() => void looksRight(i.id)}>
                        <Check /> {copy.looksRight}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant={i.held ? "default" : "outline"}
                      onClick={() => setMoving(i.id)}
                    >
                      {i.held ? copy.place : copy.move}
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <section className="card-soft mb-4 space-y-4 p-5" data-tour="room-checks">
      {group(copy.needRoomTitle, held)}
      {group(copy.checkTitle, unsure)}
      <p className="text-xs text-muted-foreground">{copy.intro}</p>
      {moving ? <MoveDialog bookingId={moving} onClose={() => setMoving(null)} /> : null}
    </section>
  );
}

/** On a guest's card: the same move, for a room that turned out wrong after check-in. */
export function MoveCheckIn({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" className="mb-3" onClick={() => setOpen(true)}>
        <BedDouble /> {copy.moveFromSheet}
      </Button>
      {open ? <MoveDialog bookingId={bookingId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function MoveDialog({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const options = useServerFn(moveCheckInOptions);
  const move = useServerFn(moveCheckIn);
  const makeStay = useServerFn(makeStayForHeld);
  const remove = useServerFn(deleteBookings);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["move-options", bookingId],
    staleTime: 0,
    queryFn: () => options({ data: { bookingId } }),
  });
  const [busy, setBusy] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [nights, setNights] = useState("1");
  const [sure, setSure] = useState(false);
  const d = q.data;

  async function act(f: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await f();
      toast.success(done);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["room-checks"] }),
        qc.invalidateQueries({ queryKey: ["board"] }),
        qc.invalidateQueries({ queryKey: ["guest"] }),
      ]);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] grid-cols-[minmax(0,1fr)] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{copy.dialogTitle(d?.idName ?? "")}</DialogTitle>
          <DialogDescription>{copy.dialogBody}</DialogDescription>
        </DialogHeader>
        {!d ? (
          <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-4">
            {d.stays.length ? (
              <ul className="space-y-2">
                {d.stays.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () => move({ data: { fromId: bookingId, toId: s.id } }),
                          copy.moved,
                        )
                      }
                      className="w-full rounded-xl border border-border p-3 text-left hover:bg-secondary disabled:opacity-60"
                    >
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {s.room ?? copy.noRoom}
                        {s.likely ? (
                          <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs">
                            {copy.likely}
                          </span>
                        ) : null}
                        {s.checkedIn ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                            {copy.swap}
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        {s.name ?? copy.noName} · {formatUkDate(s.checkIn)} to{" "}
                        {formatUkDate(s.checkOut)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{copy.noStays}</p>
            )}
            {d.held ? (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm font-medium">{copy.newStay}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={roomId} onValueChange={setRoomId}>
                    <SelectTrigger className="h-10 w-44" aria-label={copy.room}>
                      <SelectValue placeholder={copy.room} />
                    </SelectTrigger>
                    <SelectContent>
                      {d.rooms.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    aria-label={copy.nights}
                    value={nights}
                    onChange={(e) => setNights(e.target.value)}
                    className="h-10 w-20"
                  />
                  <span className="text-sm text-muted-foreground">{copy.nights}</span>
                  <Button
                    size="sm"
                    disabled={busy || !roomId || !(Number(nights) >= 1)}
                    onClick={() =>
                      void act(
                        () => makeStay({ data: { bookingId, roomId, nights: Number(nights) } }),
                        copy.made,
                      )
                    }
                  >
                    {copy.makeStay}
                  </Button>
                </div>
                {sure ? (
                  <div className="space-y-2 rounded-xl bg-muted p-3 text-sm">
                    <p>{copy.removeSure}</p>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() =>
                        void act(() => remove({ data: { ids: [bookingId] } }), copy.removed)
                      }
                    >
                      {copy.removeHeld}
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setSure(true)}>
                    {copy.removeHeld}
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
