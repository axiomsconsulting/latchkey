import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { common, housekeepingCopy } from "@/content/copy";
import { deleteUnavailability, saveUnavailability } from "@/lib/host.functions";
import { toMinutes, weekGrid, type ScheduleWindow } from "@/lib/housekeeping";
import { cn } from "@/lib/utils";

const copy = housekeepingCopy;

/**
 * The schedule behind the board: the property's standard times, the weekly
 * cleaning and unavailable windows day by day (the board's day highlighted;
 * a day takes the board to it), one-off windows, and adding new ones.
 */
export function WeekSchedule({
  propertyId,
  rooms,
  windows,
  times,
  boardDay,
  timezone,
  canEdit,
  onGoTo,
  embedded = false,
}: {
  /** Inside the Housekeeping page's folding Schedule section: no card or title of its own. */
  embedded?: boolean;
  propertyId: string;
  rooms: Array<{ id: string; display_name: string }>;
  windows: ScheduleWindow[];
  times: { checkOut: string; checkIn: string; quietStart: string; quietEnd: string };
  boardDay: string;
  timezone: string;
  canEdit: boolean;
  onGoTo: (dow: number) => void;
}) {
  const s = copy.schedule;
  const save = useServerFn(saveUnavailability);
  const remove = useServerFn(deleteUnavailability);
  const qc = useQueryClient();
  const [day, setDay] = useState(String(new Date(`${boardDay}T12:00:00Z`).getUTCDay()));
  const [roomId, setRoomId] = useState("all");
  const [start, setStart] = useState(times.checkOut);
  const [end, setEnd] = useState(times.checkIn);
  const [reason, setReason] = useState(s.reasons[0]!);
  const [busy, setBusy] = useState(false);
  const boardDow = new Date(`${boardDay}T12:00:00Z`).getUTCDay();
  const roomName = (id: string | null) => (id ? (rooms.find((r) => r.id === id)?.display_name ?? s.wholeHouse) : s.wholeHouse);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["housekeeping"] }), qc.invalidateQueries({ queryKey: ["board"] })]);
  const oneOff = windows.filter((w) => w.day_of_week === null && w.starts_at && w.ends_at && Date.parse(w.ends_at) > Date.now());
  const zoned = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  async function add() {
    if (toMinutes(end) <= toMinutes(start)) return void toast.error(s.badTimes);
    setBusy(true);
    try {
      const days = day === "every" ? [1, 2, 3, 4, 5, 6, 0] : [Number(day)];
      for (const d of days) {
        await save({
          data: { property_id: propertyId, room_id: roomId === "all" ? null : roomId, reason: reason.trim() || null, day_of_week: d, start_time: start, end_time: end, starts_at: null, ends_at: null },
        });
      }
      await refresh();
      toast.success(s.added);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  async function drop(id: string) {
    try {
      await remove({ data: { id } });
      await refresh();
      toast.success(s.removed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    }
  }

  const chip = (w: ScheduleWindow, label: string) => (
    <li key={w.id} className="flex items-start gap-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs">
      <span className="min-w-0 flex-1">
        <span className="block whitespace-nowrap font-medium tabular-nums">{label}</span>
        <span className="block truncate text-muted-foreground">{[w.reason, roomName(w.room_id)].filter(Boolean).join(" · ")}</span>
      </span>
      {canEdit ? (
        <button type="button" onClick={() => void drop(w.id)} aria-label={s.remove(`${label} ${w.reason ?? ""}`)} className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X className="size-3.5" />
        </button>
      ) : null}
    </li>
  );

  return (
    <section id="housekeeping-schedule" className={cn("scroll-mt-24 space-y-5 p-4 sm:p-5", !embedded && "card-soft")}>
      <div className={cn("flex items-start gap-3", embedded && "hidden")}>
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <CalendarClock className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg">{s.title}</h2>
          <p className="text-sm text-muted-foreground">{s.body}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 rounded-xl bg-muted/50 p-3 text-sm">
        <p className="w-full text-xs font-medium uppercase tracking-wide text-muted-foreground sm:w-auto">{s.times}</p>
        <p><span className="text-muted-foreground">{s.checkOut}</span> <span className="font-medium tabular-nums">{times.checkOut}</span></p>
        <p><span className="text-muted-foreground">{s.checkIn}</span> <span className="font-medium tabular-nums">{times.checkIn}</span></p>
        <p><span className="text-muted-foreground">{s.quiet}</span> <span className="font-medium tabular-nums">{times.quietStart}–{times.quietEnd}</span></p>
        {canEdit ? (
          <Link to="/app/properties" search={{ focus: "property" }} className="ml-auto text-sm font-medium text-primary hover:underline">
            {s.editTimes}
          </Link>
        ) : null}
      </div>

      <div>
        <h3 className="text-sm font-medium">{s.week}</h3>
        <ol className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {weekGrid(windows).map(({ dow, windows: list }) => (
            <li key={dow} className={cn("rounded-xl border p-2", dow === boardDow ? "border-primary bg-primary/5" : "border-border")}>
              <button type="button" onClick={() => onGoTo(dow)} title={s.goTo(s.days[dow]!)} className="w-full rounded-md px-1 text-left text-sm font-medium hover:underline">
                <span className="xl:hidden">{s.days[dow]}</span>
                <span className="hidden xl:inline">{s.short[dow]}</span>
              </button>
              {list.length ? (
                <ul className="mt-1.5 space-y-1">{list.map((w) => chip(w, `${w.start_time!.slice(0, 5)}–${w.end_time!.slice(0, 5)}`))}</ul>
              ) : (
                <p className="mt-1.5 px-1 text-xs text-muted-foreground">{s.none}</p>
              )}
            </li>
          ))}
        </ol>
      </div>

      {oneOff.length ? (
        <div>
          <h3 className="text-sm font-medium">{s.oneOff}</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">{oneOff.map((w) => chip(w, `${zoned(w.starts_at!)} – ${zoned(w.ends_at!)}`))}</ul>
        </div>
      ) : null}

      {canEdit ? (
        <div className="space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-medium">{s.add}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label>{s.day}</Label>
              <Select value={day} onValueChange={setDay}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="every">{s.everyDay}</SelectItem>
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => <SelectItem key={d} value={String(d)}>{s.days[d]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{s.room}</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{s.wholeHouse}</SelectItem>
                  {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hk-from">{s.from}</Label>
              <Input id="hk-from" type="time" className="h-11" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hk-until">{s.until}</Label>
              <Input id="hk-until" type="time" className="h-11" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <Button className="h-11" onClick={() => void add()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {s.addCta}
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hk-why">{s.reason}</Label>
            <div className="flex flex-wrap gap-1.5">
              {s.reasons.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)} className={cn("rounded-full border px-3 py-1 text-xs", reason === r ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-secondary")}>
                  {r}
                </button>
              ))}
            </div>
            <Input id="hk-why" className="h-11" maxLength={80} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{s.viewOnly}</p>
      )}
    </section>
  );
}
