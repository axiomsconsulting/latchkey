import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { DashSection } from "@/components/host/DashboardSections";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { common, doorCodesCopy as copy } from "@/content/copy";
import { useRole } from "@/hooks/use-host-data";
import { formatUkDate } from "@/lib/dates";
import { spacedCode } from "@/lib/door-codes";
import {
  getStayDoorCode,
  listDoorCodeJobs,
  markDoorCode,
  newStayDoorCode,
} from "@/lib/door-codes.functions";

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

  async function tick(bookingId: string, what: "set" | "removed") {
    try {
      await mark({ data: { bookingId, what } });
      await qc.invalidateQueries({ queryKey: ["door-code-jobs"] });
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
    <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className="font-mono text-lg tracking-wider">{spacedCode(b.code)}</span>
      <Link
        to="/app/bookings"
        search={{ guest: b.id }}
        className="min-w-0 flex-1 basis-40 text-sm hover:underline"
      >
        {[b.room, b.name ?? copy.noName].filter(Boolean).join(" · ")}
        <span className="block text-muted-foreground">{when}</span>
      </Link>
      {canWrite ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox onCheckedChange={(c) => c === true && void tick(b.id, what)} />
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

/** On a guest's card: their code, a new one if needed, and whether it's on the lock. */
export function GuestDoorCode({ bookingId }: { bookingId: string }) {
  const fn = useServerFn(getStayDoorCode);
  const renew = useServerFn(newStayDoorCode);
  const mark = useServerFn(markDoorCode);
  const qc = useQueryClient();
  const { canWrite } = useRole();
  const [busy, setBusy] = useState(false);
  const key = ["stay-door-code", bookingId];
  const q = useQuery({ queryKey: key, queryFn: () => fn({ data: { bookingId } }) });
  const d = q.data;
  if (!d?.code) return null;

  async function act(f: () => Promise<unknown>) {
    setBusy(true);
    try {
      await f();
      await Promise.all([
        qc.invalidateQueries({ queryKey: key }),
        qc.invalidateQueries({ queryKey: ["door-code-jobs"] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border p-3">
      <KeyRound className="size-4 shrink-0 text-accent" aria-hidden />
      <span className="text-sm text-muted-foreground">{copy.guestCard}</span>
      <span className="font-mono text-lg tracking-wider">{spacedCode(d.code)}</span>
      {canWrite && d.perStay ? (
        <span className="ml-auto flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={d.onLock}
              disabled={busy}
              onCheckedChange={(c) =>
                void act(() => mark({ data: { bookingId, what: c === true ? "set" : "unset" } }))
              }
            />
            {copy.onLock}
          </label>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void act(() => renew({ data: { bookingId } }))}
          >
            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} {copy.newCode}
          </Button>
        </span>
      ) : null}
    </div>
  );
}
