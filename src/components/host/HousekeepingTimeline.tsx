import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Ban,
  BadgeCheck,
  Clock,
  LogIn,
  LogOut,
  SprayCan,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { RoomTimeline, type TimelineItem } from "@/components/host/RoomTimeline";
import { WINDOW_STRIPES, useStartView } from "@/components/host/BookingsTimeline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { common, housekeepingCopy as copy } from "@/content/copy";
import { useRole } from "@/hooks/use-host-data";
import { formatUkDate } from "@/lib/dates";
import {
  HK_SAVES,
  HK_STATES,
  buildBoard,
  hkFilterRooms,
  hkState,
  orderRooms,
  roomAction,
  turnsFor,
  windowsForDay,
  type BoardCard,
  type HkState,
  type Readiness,
} from "@/lib/housekeeping";
import { getHousekeepingRange, setRoomReadiness } from "@/lib/housekeeping.functions";
import { at, centreDay, daysIn, loadRange, nowOn, viewFor, type View } from "@/lib/timeline";
import { cn } from "@/lib/utils";
import { useHkWords } from "@/hooks/use-site";
import {
  jobLines,
  jobRooms,
  jobWhen,
  serviceColours,
  windowGroups,
  type ServiceWindow,
  type WindowGroup,
} from "@/lib/job-lines";

/** The extra row at the top for jobs that aren't in any one room. */
const PROPERTY_ROW = "__property";

type Range = Awaited<ReturnType<typeof getHousekeepingRange>>;

/**
 * Housekeeping's look: see-through patterned blocks, so the cleaning between stays never looks
 * like a booking (bookings are solid, in the room's colour). rgba, not colour mixes, so every
 * browser draws them the same.
 */
const HK_LOOK: Record<HkState, { background: string; borderColor: string }> = {
  dirty: {
    background:
      "repeating-linear-gradient(135deg, rgba(217, 119, 6, 0.24) 0 6px, rgba(217, 119, 6, 0.08) 6px 12px)",
    borderColor: "rgba(217, 119, 6, 0.6)",
  },
  ready: {
    background:
      "radial-gradient(rgba(22, 163, 74, 0.4) 1.3px, transparent 1.8px) 0 0 / 8px 8px, rgba(22, 163, 74, 0.08)",
    borderColor: "rgba(22, 163, 74, 0.55)",
  },
  unavailable: {
    background:
      "repeating-linear-gradient(45deg, rgba(100, 116, 139, 0.28) 0 2px, transparent 2px 9px), repeating-linear-gradient(-45deg, rgba(100, 116, 139, 0.28) 0 2px, transparent 2px 9px), rgba(100, 116, 139, 0.08)",
    borderColor: "rgba(100, 116, 139, 0.6)",
  },
};
const HK_ICON = { dirty: SprayCan, ready: BadgeCheck, unavailable: Ban } as const;
const HK_TONE: Record<HkState, string> = {
  dirty: "text-amber-600",
  ready: "text-emerald-600",
  unavailable: "text-slate-500",
};

/** The room's state as one icon (with its word for screen readers and on hover). */
export function HkIcon({ state, className }: { state: HkState; className?: string }) {
  const Icon = HK_ICON[state];
  const words = useHkWords();
  return (
    <Icon
      className={cn("size-4 shrink-0", HK_TONE[state], className)}
      aria-label={words[state]}
      role="img"
    >
      <title>{words[state]}</title>
    </Icon>
  );
}

/** Minutes from now until a time today, in the property's wall clock (null when not today or unknown). */
const minutesTo = (day: string, today: string, time: string, now: number | null) =>
  now === null || day !== today ? null : Math.round(at(day, time) - now);

/** Today's housekeeping for the list view: each room's state and anything to act on. */
export function useHousekeepingToday(propertyId: string | null, today: string | null) {
  const fn = useServerFn(getHousekeepingRange);
  const q = useQuery({
    queryKey: ["housekeeping-range", propertyId, today, today],
    enabled: !!propertyId && !!today,
    refetchInterval: 60_000,
    queryFn: () => fn({ data: { propertyId: propertyId!, from: today!, to: today! } }),
  });
  const b = q.data;
  const words = useHkWords();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!b) return;
    const tick = () => setNow(nowOn(b.timezone));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [b]);
  return useMemo(() => {
    if (!b) return null;
    const cards = buildBoard({
      day: b.today,
      rooms: b.rooms,
      stays: b.stays,
      readiness: b.readiness.filter((r) => r.day === b.today),
      openJobs: b.openJobs,
      defaultCheckIn: b.defaultCheckIn,
    });
    const out = new Map<string, { state: HkState | null; action: string | null }>();
    for (const c of cards) {
      const a = roomAction(c, c.dueBy ? minutesTo(b.today, b.today, c.dueBy, now) : null);
      out.set(c.roomId, {
        state: hkState(c.status),
        action: a ? copy.action(a.state, a.arrival, a.minutes, words.unavailable) : null,
      });
    }
    return out;
  }, [b, now, words]);
}

/** A room's state in the bookings list: its icon, and what to do when someone's arriving. */
export function HkRoomBadge({
  info,
  arriving = false,
}: {
  info: { state: HkState | null; action: string | null } | undefined;
  /** This row is the guest arriving: say what needs doing (only here, once). */
  arriving?: boolean;
}) {
  const words = useHkWords();
  if (!info?.state) return null;
  const action = arriving ? info.action : null;
  return (
    <span
      className="ml-1.5 inline-flex items-center gap-1 align-middle"
      title={action ?? words[info.state]}
    >
      <HkIcon state={info.state} className="size-3.5" />
      {action ? <span className="text-[11px] font-medium text-amber-700">{action}</span> : null}
    </span>
  );
}

/**
 * Bookings' Housekeeping view: the stays (as on the bookings timeline, tap to open the guest),
 * each day's cleaning between them in see-through patterns by state (Dirty, Ready, Unavailable),
 * the cleaning windows, and each room's state and next action by its name. A room's name or its
 * cleaning opens the room's panel. Repeating services (the weekly cleaning and other visits) are
 * listed under Maintenance below and drawn here as lines too. Open jobs with a
 * time are coloured lines under the rooms they cover (src/lib/job-lines.ts), with a "Whole
 * property" row for jobs without a room; tapping one lands on it in the services below.
 */
export function HousekeepingTimeline({
  propertyId,
  stayItems,
  today,
  day: dayParam,
  room: roomParam,
  onOpenJob,
}: {
  propertyId: string;
  /** The stays, drawn as on the bookings timeline (front layer). */
  stayItems: TimelineItem[];
  today: string;
  day?: string | undefined;
  room?: string | undefined;
  /** A job's line was tapped. */
  onOpenJob?: (jobId: string) => void;
}) {
  const { role, canWrite } = useRole();
  const words = useHkWords();
  const fn = useServerFn(getHousekeepingRange);
  const [startView, setStartView] = useStartView(today);
  const [dayView, setDayView] = useState<View | null>(() =>
    dayParam ? viewFor("day", dayParam) : null,
  );
  const view = dayView ?? startView;
  const changeView = (v: View) => {
    setDayView(null);
    setStartView(v);
  };
  const [filter, setFilter] = useState<HkState | "all">("all");
  const [order, setOrder] = useState<"property" | "state">("property");
  const [panel, setPanel] = useState<{ roomId: string; day: string } | null>(null);

  const range = loadRange(view);
  const q = useQuery({
    queryKey: ["housekeeping-range", propertyId, range.from, range.to],
    placeholderData: keepPreviousData,
    queryFn: () => fn({ data: { propertyId, from: range.from, to: range.to } }),
    refetchInterval: 60_000,
  });
  const b = q.data;
  useEffect(() => {
    if (b && roomParam) setPanel({ roomId: roomParam, day: dayParam ?? b.today });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomParam, !!b]);

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!b) return;
    const tick = () => setNow(nowOn(b.timezone));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [b]);

  // The day the room states and actions are for: today when it's in view, else the middle day.
  const days = daysIn(view);
  const day = b && days.includes(b.today) ? b.today : centreDay(view);
  const cards = useMemo(
    () =>
      b
        ? buildBoard({
            day,
            rooms: b.rooms,
            stays: b.stays,
            readiness: b.readiness.filter((r) => r.day === day),
            openJobs: b.openJobs,
            defaultCheckIn: b.defaultCheckIn,
          })
        : [],
    [b, day],
  );
  const jobs = useMemo(() => {
    if (!b) return null;
    const open = b.jobs ?? [];
    const groups = windowGroups(b.windows as ServiceWindow[]);
    const colours = serviceColours(open, groups);
    return {
      colours,
      groups,
      ...jobLines(open, b.timezone, colours),
      byId: new Map(open.map((j) => [j.id, j])),
    };
  }, [b]);
  const propertyRow =
    !!jobs?.lines.some((l) => l.roomId === null) ||
    !!jobs?.groups.some((g) => g.rooms.length === 0);
  const rooms = b
    ? [
        ...(propertyRow ? [{ id: PROPERTY_ROW, display_name: copy.wholeProperty }] : []),
        ...hkFilterRooms(orderRooms(b.rooms, cards, order), cards, filter),
      ]
    : [];
  const late = cards.filter((c) => roomAction(c, null)).length;

  const items = useMemo(() => {
    if (!b) return [] as TimelineItem[];
    const out: TimelineItem[] = [];
    // Repeating services and closures: the room is closed behind (stripes), and the service is a
    // line in its colour like any job (a whole-property one on the top row).
    const groupOf = new Map<string, WindowGroup>();
    for (const g of jobs?.groups ?? []) for (const id of g.ids) groupOf.set(id, g);
    for (const d of daysIn(view)) {
      for (const w of windowsForDay(b.windows, d, b.timezone)) {
        const g = groupOf.get(w.id);
        if (g)
          out.push({
            id: `wl-${w.id}-${d}`,
            roomId: w.roomId ?? PROPERTY_ROW,
            start: at(d, w.start),
            end: at(d, w.end),
            layer: "line",
            title: `${w.reason ?? copy.windowDefault} · ${w.start}–${w.end}`,
            style: { background: jobs!.colours[g.key] },
            className: "before:absolute before:-inset-y-2 before:inset-x-0 before:content-['']",
            ...(onOpenJob ? { onClick: () => onOpenJob(g.key) } : {}),
          });
        for (const r of b.rooms) {
          if (w.roomId && w.roomId !== r.id) continue;
          out.push({
            id: `w-${w.id}-${d}-${r.id}`,
            roomId: r.id,
            start: at(d, w.start),
            end: at(d, w.end),
            layer: "back",
            title: `${w.reason ?? copy.windowDefault} ${w.start}–${w.end}`,
            style: { backgroundImage: WINDOW_STRIPES },
          });
        }
      }
    }
    // Each day's cleaning between stays, in its state's pattern, with the ready-by time.
    for (const t of turnsFor({
      days: daysIn(view),
      rooms: b.rooms,
      stays: b.stays,
      readiness: b.readiness,
      checkIn: b.defaultCheckIn,
      checkOut: b.defaultCheckOut,
    })) {
      const state = hkState(t.status) ?? "ready";
      const overdue =
        t.day === b.today &&
        t.dueBy &&
        state !== "ready" &&
        now !== null &&
        at(t.day, t.dueBy) <= now;
      out.push({
        id: `t-${t.roomId}-${t.day}`,
        roomId: t.roomId,
        start: at(t.day, t.from),
        end: at(t.day, t.to),
        layer: "band",
        title: `${words[state]}${t.dueBy ? ` · ${copy.dueBy(t.dueBy)}` : ""}${t.assignee ? ` · ${copy.assignedTo(t.assignee)}` : ""} · ${formatUkDate(t.day)}`,
        className: cn(
          "rounded-md border px-1.5 text-[11px] font-medium text-foreground",
          overdue && "ring-2 ring-destructive",
          !t.saved && "border-dashed",
        ),
        style: HK_LOOK[state],
        label: (
          <span className="flex min-w-0 items-center gap-1">
            <HkIcon state={state} className="size-3.5" />
            <span className="truncate">
              {words[state]}
              {t.dueBy && state !== "ready" ? ` · ${t.dueBy}` : ""}
            </span>
          </span>
        ),
        onClick: () => setPanel({ roomId: t.roomId, day: t.day }),
      });
    }
    // Jobs: a coloured line under the stays and cleaning, for their window or whole day.
    for (const l of jobs?.lines ?? []) {
      const j = jobs!.byId.get(l.jobId);
      if (!j) continue;
      out.push({
        id: `j-${l.id}`,
        roomId: l.roomId ?? PROPERTY_ROW,
        start: l.start,
        end: l.end,
        layer: "line",
        title: `${j.title} · ${jobWhen(j, b.timezone) ?? ""}`,
        style: { background: l.colour },
        // A thin line, but a finger-sized place to tap.
        className: "before:absolute before:-inset-y-2 before:inset-x-0 before:content-['']",
        ...(onOpenJob ? { onClick: () => onOpenJob(l.jobId) } : {}),
      });
    }
    return [...out, ...stayItems];
  }, [b, view, now, stayItems, words, jobs, onOpenJob]);

  if (!b) return <Skeleton className="h-96 rounded-2xl" />;
  // Owners, managers and cleaners work the board; viewers can look.
  const canEdit =
    role === "owner" || role === "manager" || role === "co_host" || role === "cleaner";

  const chip = (key: HkState) => {
    const n = cards.filter((c) => hkState(c.status) === key).length;
    if (key === "unavailable" && !n) return null;
    return (
      <button
        key={key}
        type="button"
        aria-pressed={filter === key}
        onClick={() => setFilter((f) => (f === key ? "all" : key))}
        className={cn(
          "flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium text-foreground transition-opacity",
          filter === key ? "ring-2 ring-foreground" : filter !== "all" && "opacity-60",
        )}
        style={HK_LOOK[key]}
      >
        <HkIcon state={key} className="size-3.5" /> {copy.stateCount(words[key], n)}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {!b.available ? <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p> : null}
      <RoomTimeline
        tourName="housekeeping-timeline"
        rooms={rooms}
        view={view}
        onView={changeView}
        today={b.today}
        now={now}
        items={items}
        maxHeight="calc(100dvh - 19rem)"
        toolbar={
          <>
            <span className="text-xs text-muted-foreground">
              {day === b.today ? copy.todayShort : formatUkDate(day)}:
            </span>
            {HK_STATES.map(chip)}
            {late ? (
              <span className="flex items-center gap-1 rounded-full bg-destructive px-2.5 py-1 text-xs font-medium text-destructive-foreground">
                <AlertTriangle className="size-3.5" /> {copy.totals.notReady(late)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setOrder((o) => (o === "property" ? "state" : "property"))}
              className="ml-auto whitespace-nowrap rounded-full border border-border px-2.5 py-1 text-xs font-medium hover:bg-secondary"
            >
              {order === "property" ? copy.orderProperty : copy.orderState}
            </button>
          </>
        }
        roomLabel={(r) => {
          if (r.id === PROPERTY_ROW)
            return (
              <span className="flex min-w-0 items-center gap-1.5">
                <Wrench className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">{r.display_name}</span>
              </span>
            );
          const c = cards.find((x) => x.roomId === r.id);
          const state = hkState(c?.status);
          const a = c
            ? roomAction(c, c.dueBy ? minutesTo(day, b.today, c.dueBy, now) : null)
            : null;
          return (
            <button
              type="button"
              onClick={() => setPanel({ roomId: r.id, day })}
              className="flex w-full min-w-0 items-center gap-1.5 rounded-md text-left hover:underline"
            >
              {state ? <HkIcon state={state} /> : <span className="size-4 shrink-0" />}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{r.display_name}</span>
                <span
                  className={cn(
                    "block truncate text-[11px]",
                    a ? "font-medium text-amber-700" : "hidden text-muted-foreground sm:block",
                  )}
                >
                  {a
                    ? copy.action(a.state, a.arrival, a.minutes, words.unavailable)
                    : `${state ? words[state] : copy.occupancy[c?.occupancy ?? "empty"]}${c?.assignee ? ` · ${c.assignee}` : ""}${c?.openJobs ? ` · ${copy.jobsShort(c.openJobs)}` : ""}`}
                </span>
              </span>
            </button>
          );
        }}
      />

      {panel ? (
        <RoomPanel
          board={b}
          roomId={panel.roomId}
          day={panel.day}
          propertyId={propertyId}
          canEdit={canEdit && b.available}
          colours={jobs?.colours ?? {}}
          onOpenJob={
            onOpenJob
              ? (id) => {
                  setPanel(null);
                  onOpenJob(id);
                }
              : undefined
          }
          onClose={() => setPanel(null)}
        />
      ) : null}
      <datalist id="housekeeping-people">
        {(b.people ?? []).map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </div>
  );
}

function shortName(name: string | null) {
  if (!name) return copy.guest;
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]}.` : parts[0]!;
}

/** One room on one day: who's leaving and arriving, where cleaning has got to, who's on it, and a note. */
function RoomPanel({
  board,
  roomId,
  day,
  propertyId,
  canEdit,
  colours,
  onOpenJob,
  onClose,
}: {
  board: Range;
  roomId: string;
  day: string;
  propertyId: string;
  canEdit: boolean;
  colours: Record<string, string>;
  onOpenJob?: ((jobId: string) => void) | undefined;
  onClose: () => void;
}) {
  const words = useHkWords();
  const roomJobs = (board.jobs ?? []).filter((j) => jobRooms(j).includes(roomId));
  const save = useServerFn(setRoomReadiness);
  const qc = useQueryClient();
  const card: BoardCard | undefined = buildBoard({
    day,
    rooms: board.rooms.filter((r) => r.id === roomId),
    stays: board.stays,
    readiness: board.readiness.filter((r) => r.day === day),
    openJobs: board.openJobs,
    defaultCheckIn: board.defaultCheckIn,
  })[0];
  const [assignee, setAssignee] = useState(card?.assignee ?? "");
  const [note, setNote] = useState(card?.note ?? "");
  if (!card) return null;
  const c = card;

  async function update(patch: {
    status?: Readiness;
    assignee?: string | null;
    note?: string | null;
  }) {
    const status = patch.status ?? c.status ?? "to_clean";
    // Shown at once in every range that holds this day; put right if the save fails.
    qc.setQueriesData<Range>({ queryKey: ["housekeeping-range", propertyId] }, (old) => {
      if (!old) return old;
      const prev = old.readiness.find((r) => r.room_id === roomId && r.day === day);
      const rest = old.readiness.filter((r) => !(r.room_id === roomId && r.day === day));
      return {
        ...old,
        readiness: [
          ...rest,
          {
            room_id: roomId,
            day,
            status,
            assignee:
              patch.assignee !== undefined ? patch.assignee : (prev?.assignee ?? c.assignee),
            due_time: prev?.due_time ?? null,
            note: patch.note !== undefined ? patch.note : (prev?.note ?? c.note),
            updated_at: new Date().toISOString(),
            updated_by_name: copy.you,
          },
        ],
      };
    });
    try {
      await save({
        data: {
          propertyId,
          roomId,
          day,
          status,
          ...(patch.assignee !== undefined ? { assignee: patch.assignee } : {}),
          ...(patch.note !== undefined ? { note: patch.note } : {}),
        },
      });
      if (patch.status === "ready") toast.success(copy.readyToast(c.roomName));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      await qc.invalidateQueries({ queryKey: ["housekeeping-range", propertyId] });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{c.roomName}</DialogTitle>
          <DialogDescription>
            {day === board.today ? copy.todayShort : formatUkDate(day)} ·{" "}
            {copy.occupancy[c.occupancy]}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 text-sm">
          {c.leaving ? (
            <li className="flex items-center gap-2">
              <LogOut className="size-4 text-muted-foreground" />{" "}
              {copy.out(
                shortName(c.leaving.guest_full_name),
                (c.leaving.check_out_time ?? board.defaultCheckOut).slice(0, 5),
              )}
            </li>
          ) : null}
          {c.arriving ? (
            <li className="flex items-center gap-2">
              <LogIn className="size-4 text-muted-foreground" />{" "}
              {copy.in(shortName(c.arriving.guest_full_name), c.arriving.guest_count ?? null)}
            </li>
          ) : null}
          {c.dueBy ? (
            <li className="flex items-center gap-2 font-medium">
              <Clock className="size-4" /> {copy.dueBy(c.dueBy)}
            </li>
          ) : null}
          {roomJobs.map((j) => (
            <li key={j.id}>
              <button
                type="button"
                disabled={!onOpenJob}
                onClick={() => onOpenJob?.(j.id)}
                className="flex w-full items-center gap-2 text-left font-medium hover:underline"
              >
                <span
                  aria-hidden
                  className="h-1.5 w-4 shrink-0 rounded-full"
                  style={{ background: colours[j.id] }}
                />
                <Wrench className="size-4 shrink-0" />
                <span className="min-w-0 truncate">
                  {j.title}
                  {jobWhen(j, board.timezone) ? ` · ${jobWhen(j, board.timezone)}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {/* Where the room is: three big buttons, big enough for gloves. */}
        <div
          role="radiogroup"
          aria-label={copy.stateLabel(c.roomName)}
          className="grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1"
        >
          {HK_STATES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={hkState(c.status) === s}
              disabled={!canEdit}
              onClick={() => void update({ status: HK_SAVES[s] })}
              className={cn(
                "flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-transparent px-1 text-sm font-medium leading-tight transition-colors disabled:opacity-60",
                hkState(c.status) === s
                  ? "text-foreground shadow-soft"
                  : "text-muted-foreground hover:bg-background",
              )}
              style={hkState(c.status) === s ? HK_LOOK[s] : undefined}
            >
              <HkIcon state={s} /> {words[s]}
            </button>
          ))}
        </div>

        {canEdit ? (
          <div className="space-y-2">
            <Input
              list="housekeeping-people"
              className="h-11"
              placeholder={copy.assignPlaceholder}
              aria-label={copy.assign}
              maxLength={80}
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              onBlur={() =>
                assignee.trim() !== (c.assignee ?? "") &&
                void update({ assignee: assignee.trim() || null })
              }
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            <Textarea
              rows={2}
              maxLength={500}
              placeholder={copy.notePlaceholder}
              aria-label={copy.note}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() =>
                note.trim() !== (c.note ?? "") && void update({ note: note.trim() || null })
              }
            />
          </div>
        ) : c.assignee ? (
          <p className="text-sm">{copy.assignedTo(c.assignee)}</p>
        ) : null}
        {!c.saved && c.status ? (
          <p className="text-xs text-muted-foreground">{copy.suggested}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
