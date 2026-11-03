import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { DashSection } from "@/components/host/DashboardSections";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { common, doorCodesCopy as copy } from "@/content/copy";
import { useRole } from "@/hooks/use-host-data";
import { formatUkDate } from "@/lib/dates";
import { spacedCode, type DoorKey } from "@/lib/door-codes";
import {
  getStayDoorCodes,
  listDoorCodeJobs,
  markDoorCode,
  newStayDoorCode,
  setStayDoorHidden,
} from "@/lib/door-codes.functions";

const refreshKeys = [["door-code-jobs"], ["stay-door-codes"], ["board"]];

/** Today: new codes to put on the lock, and those of guests who've left to take off. Only for a new code per stay. */
export function DoorCodeJobs({ propertyId }: { propertyId: string | null }) {
  const fn = useServerFn(listDoorCodeJobs);
  const mark = useServerFn(markDoorCode);
  const qc = useQueryClient();
  const { canWrite } = useRole();
  const q = useQuery({
    queryKey: ["door-code-jobs", propertyId],
    enabled: !!propertyId,
    queryFn: () => fn({ data: { propertyId: propertyId! } }),
  });
  const d = q.data;
  if (!d?.on) return null;

  async function tick(bookingId: string, door: DoorKey, what: "set" | "removed") {
    try {
      await mark({ data: { bookingId, door, what } });
      await Promise.all(refreshKeys.map((queryKey) => qc.invalidateQueries({ queryKey })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    }
  }

  const row = (
    b: (typeof d.toSet)[number],
    label: string,
    when: string,
    what: "set" | "removed",
  ): ReactNode => (
    <li key={`${b.id}-${b.door}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className="font-mono text-lg tracking-wider">{spacedCode(b.code)}</span>
      <Link
        to="/app/bookings"
        search={{ guest: b.id }}
        className="min-w-0 flex-1 basis-40 text-sm hover:underline"
      >
        {[copy.doors[b.door], b.room, b.name ?? copy.noName].filter(Boolean).join(" · ")}
        <span className="block text-muted-foreground">{when}</span>
      </Link>
      {canWrite ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox onCheckedChange={(c) => c === true && void tick(b.id, b.door, what)} />
          {label}
        </label>
      ) : null}
    </li>
  );

  const quiet = !d.toSet.length && !d.toRemove.length ? copy.nothingToDo : null;
  return (
    <DashSection id="doorCodes" icon={KeyRound} title={copy.jobsTitle} quiet={quiet}>
      {d.toRemove.length ? (
        <div>
          <h3 className="text-sm font-medium">{copy.takeOff}</h3>
          <ul className="divide-y divide-border">
            {d.toRemove.map((b) =>
              row(b, copy.takenOff, copy.left(formatUkDate(b.checkOut)), "removed"),
            )}
          </ul>
        </div>
      ) : null}
      {d.toSet.length ? (
        <div className={d.toRemove.length ? "mt-3" : ""}>
          <h3 className="text-sm font-medium">{copy.putOn}</h3>
          <ul className="divide-y divide-border">
            {d.toSet.map((b) => row(b, copy.onLock, copy.arrives(formatUkDate(b.checkIn)), "set"))}
          </ul>
        </div>
      ) : null}
      {!quiet ? <p className="mt-2 text-xs text-muted-foreground">{copy.jobsNote}</p> : null}
    </DashSection>
  );
}

/** On a guest's card: each door's code, a new one if needed, whether it's on the lock, and not giving one at all. */
export function GuestDoorCode({ bookingId }: { bookingId: string }) {
  const fn = useServerFn(getStayDoorCodes);
  const renew = useServerFn(newStayDoorCode);
  const mark = useServerFn(markDoorCode);
  const hide = useServerFn(setStayDoorHidden);
  const qc = useQueryClient();
  const { canWrite } = useRole();
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["stay-door-codes", bookingId],
    queryFn: () => fn({ data: { bookingId } }),
  });
  const d = q.data;
  if (!d) return null;
  const withCode = d.doors.filter((x) => x.code || x.perStay);
  if (!withCode.length && !d.doors.some((x) => x.keyNote)) return null;

  async function act(f: () => Promise<unknown>) {
    setBusy(true);
    try {
      const r = (await f()) as { wasOnLock?: boolean } | undefined;
      if (r?.wasOnLock) toast.info(copy.takeOffNow);
      await Promise.all(refreshKeys.map((queryKey) => qc.invalidateQueries({ queryKey })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="size-4 shrink-0 text-accent" aria-hidden /> {copy.guestCard}
      </h3>
      {d.hidden ? (
        <p className="text-sm text-muted-foreground">{copy.notGivenBody}</p>
      ) : (
        d.doors.map((x) =>
          x.code || x.perStay ? (
            <div key={x.door} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-24 shrink-0 text-sm text-muted-foreground">
                {copy.doors[x.door]}
              </span>
              <span className="font-mono text-lg tracking-wider">
                {x.code ? spacedCode(x.code) : copy.noCodeFree}
              </span>
              {canWrite && x.perStay ? (
                <span className="ml-auto flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={x.onLock}
                      disabled={busy || !x.code}
                      onCheckedChange={(c) =>
                        void act(() =>
                          mark({
                            data: { bookingId, door: x.door, what: c === true ? "set" : "unset" },
                          }),
                        )
                      }
                    />
                    {copy.onLock}
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void act(() => renew({ data: { bookingId, door: x.door } }))}
                  >
                    {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} {copy.newCode}
                  </Button>
                </span>
              ) : null}
            </div>
          ) : x.keyNote ? (
            <div key={x.door} className="flex flex-wrap gap-x-3 text-sm">
              <span className="w-24 shrink-0 text-muted-foreground">{copy.doors[x.door]}</span>
              <span className="min-w-0 flex-1">{x.keyNote}</span>
            </div>
          ) : null,
        )
      )}
      {canWrite ? (
        <label className="flex items-start gap-3 border-t border-border pt-2 text-sm">
          <Switch
            checked={!d.hidden}
            disabled={busy}
            onCheckedChange={(on) => void act(() => hide({ data: { bookingId, hidden: !on } }))}
          />
          <span>
            {copy.giveThisGuest}
            <span className="block text-xs text-muted-foreground">
              {d.shown && !d.hidden ? copy.alreadySeen : copy.giveThisGuestHelp}
            </span>
          </span>
        </label>
      ) : null}
    </div>
  );
}
