import { useEffect, useState } from "react";
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
import { dayAxis, roomLane, roomWindows, toMinutes, weekGrid, type BoardCard, type DayWindow, type LaneSegment, type Readiness, type ScheduleWindow } from "@/lib/housekeeping";
import { cn } from "@/lib/utils";

const copy = housekeepingCopy;
const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const SEGMENT_TONE: Record<LaneSegment["kind"], string> = {
  guest_out: "bg-foreground/25",
  free: "bg-success/15",
  guest_in: "bg-primary/75",
  staying: "bg-foreground/15",
  closed: "bg-muted-foreground/25",
  window: "",
};
// Cleaning and unavailable windows: striped, over whatever else the room is doing.
const STRIPES = { backgroundImage: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--accent) 75%, transparent) 0 6px, color-mix(in srgb, var(--accent) 35%, transparent) 6px 12px)" };

const STATUS_DOT: Record<Readiness, string> = {
  to_clean: "bg-destructive",
  cleaning: "bg-accent",
  clean: "bg-secondary-foreground/50",
  ready: "bg-primary",
  out_of_service: "bg-muted-foreground",
};

/** Minutes from midnight now at the property. */
function nowMinutes(tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return Number(p["hour"]) * 60 + Number(p["minute"]);
}

/**
 * The day at a glance: one lane per room on a shared timeline, from the guest
 * leaving to the next one arriving, with the day's cleaning and unavailable
 * windows over it and a line at the time now. A room's lane takes you to its
 * card below.
 */
export function DayPlan({
  cards,
  windows,
  checkOut,
  checkIn,
  isToday,
  timezone,
  onPick,
}: {
  cards: BoardCard[];
  windows: DayWindow[];
  checkOut: string;
  checkIn: string;
  isToday: boolean;
  timezone: string;
  onPick: (roomId: string) => void;
}) {
  const axis = dayAxis({ cards, windows, checkOut, checkIn });
  const span = axis.to - axis.from;
  const at = (m: number) => `${((m - axis.from) / span) * 100}%`;
  const width = (s: { from: number; to: number }) => `${((s.to - s.from) / span) * 100}%`;
  const hours: number[] = [];
  const step = span > 14 * 60 ? 120 : 60;
  for (let m = axis.from; m <= axis.to; m += step) hours.push(m);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!isToday) return setNow(null);
    const tick = () => setNow(nowMinutes(timezone));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [isToday, timezone]);
  const house = windows.filter((w) => w.roomId === null);

  const lane = (segments: LaneSegment[], label: string) => (
    <div className="relative h-9 overflow-hidden rounded-lg bg-muted/60" aria-label={label}>
      {segments.map((s, i) => (
        <span
          key={i}
          title={`${copy.plan.legend[s.kind]}${s.label ? ` · ${s.label}` : ""} · ${clock(s.from)}–${clock(s.to)}`}
          className={cn("absolute inset-y-0", SEGMENT_TONE[s.kind], s.kind === "window" && "inset-y-1.5 rounded-md")}
          style={{ left: at(s.from), width: width(s), ...(s.kind === "window" ? STRIPES : {}) }}
        />
      ))}
    </div>
  );

  return (
    <section className="card-soft p-4 sm:p-5" aria-labelledby="day-plan">
      <h2 id="day-plan" className="text-lg">{copy.plan.title}</h2>
      <p className="text-sm text-muted-foreground">{copy.plan.body}</p>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(["guest_out", "free", "window", "guest_in", "staying"] as const).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className={cn("inline-block h-3 w-5 rounded", SEGMENT_TONE[k])} style={k === "window" ? STRIPES : undefined} /> {copy.plan.legend[k]}
          </li>
        ))}
      </ul>

      {/* Scrolls sideways inside the card on a narrow phone; the page itself never does. */}
      <div className="no-scrollbar mt-4 overflow-x-auto">
        <div className="relative min-w-[34rem]">
          <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3">
            <span />
            <div className="relative h-5 text-[11px] tabular-nums text-muted-foreground">
              {/* Every other hour on a phone; the first and last sit inside the edges. */}
              {hours.map((m, i) => (
                <span
                  key={m}
                  className={cn("absolute", i === 0 ? "" : i === hours.length - 1 ? "-translate-x-full" : "-translate-x-1/2", i % 2 === 1 && i !== hours.length - 1 && "max-sm:hidden")}
                  style={{ left: at(m) }}
                >
                  {clock(m)}
                </span>
              ))}
            </div>
          </div>

          <ol className="mt-1 space-y-1.5">
            {house.length ? (
              <li className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-3">
                <span className="truncate text-sm font-medium">{copy.plan.wholeHouse}</span>
                {lane(house.map((w) => ({ kind: "window" as const, from: Math.max(axis.from, toMinutes(w.start)), to: Math.min(axis.to, toMinutes(w.end)), label: w.reason })), copy.plan.wholeHouse)}
              </li>
            ) : null}
            {cards.map((c) => {
              const l = roomLane(c, roomWindows(windows, c.roomId), { checkOut, checkIn, axis });
              return (
                <li key={c.roomId}>
                  <button
                    type="button"
                    onClick={() => onPick(c.roomId)}
                    className="grid w-full grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-3 rounded-lg text-left hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {c.status ? <span className={cn("size-2.5 shrink-0 rounded-full", STATUS_DOT[c.status])} aria-hidden /> : <span className="size-2.5 shrink-0" />}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{c.roomName}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {[l.out !== null ? copy.plan.outAt(clock(l.out)) : null, l.due !== null ? copy.plan.dueAt(clock(l.due)) : null].filter(Boolean).join(" · ") ||
                            (c.status ? copy.status[c.status] : copy.occupancy[c.occupancy])}
                        </span>
                      </span>
                    </span>
                    {lane(l.segments, c.roomName)}
                  </button>
                </li>
              );
            })}
          </ol>

          {now !== null && now >= axis.from && now <= axis.to ? (
            <div className="pointer-events-none absolute inset-y-0 grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3" style={{ left: 0, right: 0 }} aria-hidden>
              <span />
              <span className="relative">
                <span className="absolute inset-y-0 w-0.5 bg-destructive" style={{ left: at(now) }}>
                  <span className="absolute -top-0.5 left-1 rounded bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">{copy.plan.now}</span>
                </span>
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

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
}: {
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
    <section id="housekeeping-schedule" className="card-soft scroll-mt-24 space-y-5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
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
