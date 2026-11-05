import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Loader2, RotateCcw, UserCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { common, testStayCopy as copy } from "@/content/copy";
import { checkInMark } from "@/lib/booking-list";
import { surnameLetter } from "@/lib/test-stay";
import {
  getTestStay,
  resetTestStay,
  startTestStay,
  updateTestStay,
} from "@/lib/test-stay.functions";

const NO_ROOM = "none";

/**
 * Today: try the check-in as a guest, under your own name. It adds a test stay that blocks nothing,
 * and Reset removes it and everything it saved.
 */
export function TestStayCard({
  property,
  rooms,
}: {
  property: { id: string; short_code: string };
  rooms: Array<{ id: string; display_name: string }>;
}) {
  const getFn = useServerFn(getTestStay);
  const startFn = useServerFn(startTestStay);
  const updateFn = useServerFn(updateTestStay);
  const resetFn = useServerFn(resetTestStay);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["test-stay", property.id],
    queryFn: () => getFn({ data: { propertyId: property.id } }),
    refetchInterval: (r) => (r.state.data?.stay ? 20_000 : false),
  });
  const stay = q.data?.stay ?? null;
  const [name, setName] = useState("");
  const [room, setRoom] = useState(NO_ROOM);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    setName(q.data.stay?.guest_full_name ?? q.data.name);
    setRoom(q.data.stay?.test_room_id ?? NO_ROOM);
  }, [q.data]);

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["test-stay", property.id] }),
      qc.invalidateQueries({ queryKey: ["board"] }),
      qc.invalidateQueries({ queryKey: ["alerts"] }),
    ]);
  async function act(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await fn();
      await refresh();
      if (done) toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
      setSure(false);
    }
  }
  const data = { propertyId: property.id, name, roomId: room === NO_ROOM ? null : room };
  const changed =
    !!stay &&
    (name.trim() !== stay.guest_full_name ||
      (room === NO_ROOM ? null : room) !== stay.test_room_id);

  if (q.data && !q.data.available) return <p className="text-sm">{copy.needsUpdate}</p>;
  const verdict = checkInMark(stay?.id_check_status);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{copy.body}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ts-name">{copy.name}</Label>
          <Input
            id="ts-name"
            value={name}
            maxLength={120}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ts-room">{copy.room}</Label>
          <Select value={room} onValueChange={setRoom}>
            <SelectTrigger id="ts-room">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ROOM}>{copy.noRoom}</SelectItem>
              {rooms.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!stay ? (
        <Button
          disabled={busy || name.trim().length < 3}
          onClick={() => void act(() => startFn({ data }), copy.started)}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
          {copy.start}
        </Button>
      ) : (
        <>
          <div className="rounded-xl bg-muted p-3 text-sm">
            <p className="font-medium">
              {stay.checked_in_at ? copy.checkedIn : copy.waiting}
              {verdict ? ` ${verdict.word}.` : ""}
            </p>
            {!stay.checked_in_at ? (
              <p className="mt-1">
                {copy.howTo(surnameLetter(stay.guest_full_name), stay.check_out_date)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={`/kiosk/${property.short_code}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" /> {copy.open}
              </a>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/app/bookings" search={{ guest: stay.id }}>
                {copy.see}
              </Link>
            </Button>
            {changed ? (
              <Button
                variant="outline"
                disabled={busy || name.trim().length < 3}
                onClick={() => void act(() => updateFn({ data }), copy.saved)}
              >
                {copy.save}
              </Button>
            ) : null}
            <Button
              variant={sure ? "destructive" : "outline"}
              disabled={busy}
              onClick={() =>
                sure
                  ? void act(() => resetFn({ data: { propertyId: property.id } }), copy.wasReset)
                  : setSure(true)
              }
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              {sure ? copy.resetSure : copy.reset}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
