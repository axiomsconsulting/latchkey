import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  ChevronDown,
  Clock,
  LogIn,
  LogOut,
  SprayCan,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/host/EmptyState";
import { WeekSchedule } from "@/components/host/HousekeepingSchedule";
import { PageHeader } from "@/components/host/PageHeader";
import { PropertyPicker } from "@/components/host/PropertyPicker";
import { RoomTimeline, type TimelineItem } from "@/components/host/RoomTimeline";
import { WINDOW_STRIPES } from "@/components/host/BookingsTimeline";
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
import { useRole, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { rebrand } from "@/lib/brand";
import { formatUkDate } from "@/lib/dates";
import {
  FLOW,
  boardTotals,
  buildBoard,
  filterRooms,
  nextOnWeekday,
  orderRooms,
  turnsFor,
  windowsForDay,
  type BoardCard,
  type Readiness,
  type RoomFilter,
} from "@/lib/housekeeping";
import { getHousekeepingRange, setRoomReadiness } from "@/lib/housekeeping.functions";
import {
  at,
  centreDay,
  daysIn,
  loadRange,
  nowOn,
  stayTimes,
  viewFor,
  type View,
} from "@/lib/timeline";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/housekeeping")({
  // ?day=2026-10-21 opens that day; ?room= opens a room's panel; ?focus=schedule opens the weekly schedule.
  validateSearch: (
    s: Record<string, unknown>,
  ): { day?: string; room?: string; focus?: "schedule" } => ({
    ...(typeof s["day"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["day"])
      ? { day: s["day"] }
      : {}),
    ...(typeof s["room"] === "string" ? { room: s["room"] } : {}),
    ...(s["focus"] === "schedule" ? { focus: "schedule" as const } : {}),
  }),
  head: () => ({ meta: [{ title: rebrand("Housekeeping · Latchkey host dashboard") }] }),
  component: HousekeepingPage,
});

const STATUS_TONE: Record<Readiness, string> = {
  to_clean: "bg-destructive/15 text-destructive border-destructive/40",
  cleaning: "bg-accent/25 text-accent-foreground border-accent/50",
  clean: "bg-secondary text-secondary-foreground border-border",
  ready: "bg-primary/85 text-primary-foreground border-primary",
  out_of_service: "bg-muted text-muted-foreground border-border hatched",
};
const STATUS_DOT: Record<Readiness, string> = {
  to_clean: "bg-destructive",
  cleaning: "bg-accent",
  clean: "bg-secondary-foreground/50",
  ready: "bg-primary",
  out_of_service: "bg-muted-foreground",
};

type Range = Awaited<ReturnType<typeof getHousekeepingRange>>;

/**
 * Housekeeping as an overlay on the same room timeline as Bookings: the stays
 * (quiet), each day's turnover between them coloured by where its cleaning
 * has got to with its ready-by time, and the cleaning windows. A room's name
 * or turnover opens its panel to move it on. Rooms keep the property's order
 * unless "needs attention first" is chosen; a filter shows just one state.
 */
function HousekeepingPage() {
  const ws = useWorkspace();
  const { role, canWrite, loading } = useRole();
  const properties = (ws.data?.properties ?? []) as Array<{ id: string; name: string }>;
  const { selectedId, select } = useSelectedProperty(properties);
  const { day: dayParam, room: roomParam, focus } = Route.useSearch();
  const fn = useServerFn(getHousekeepingRange);

  // Starts on ?day= or this device's date; the property's own today corrects it once it's known.
  const [view, setView] = useState<View>(() =>
    viewFor("day", dayParam ?? new Date().toLocaleDateString("en-CA")),
  );
  const [moved, setMoved] = useState(!!dayParam);
  const changeView = (v: View) => {
    setMoved(true);
    setView(v);
  };
  const [filter, setFilter] = useState<RoomFilter>("all");
  const [order, setOrder] = useState<"property" | "state">("property");
  const [panel, setPanel] = useState<{ roomId: string; day: string } | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(focus === "schedule");
  useEffect(() => setScheduleOpen((o) => o || focus === "schedule"), [focus]);

  const range = loadRange(view);
  const q = useQuery({
    queryKey: ["housekeeping-range", selectedId, range.from, range.to],
    enabled: !!selectedId,
    placeholderData: keepPreviousData,
    queryFn: () => fn({ data: { propertyId: selectedId!, from: range.from, to: range.to } }),
    refetchInterval: 60_000,
  });
  const b = q.data;
  useEffect(() => {
    if (b && !moved && centreDay(view) !== b.today) setView(viewFor("day", b.today));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.today, moved]);
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

  const day = centreDay(view);
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
  const rooms = b ? filterRooms(orderRooms(b.rooms, cards, order), cards, filter) : [];
  const totals = boardTotals(cards);

  const items = useMemo(() => {
    if (!b) return [] as TimelineItem[];
    const out: TimelineItem[] = [];
    const days = daysIn(view);
    // Cleaning and unavailable windows, behind.
    for (const d of days) {
      for (const w of windowsForDay(b.windows, d, b.timezone)) {
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
    // Each day's turnover, coloured by its state, with the ready-by time; tap to move it on.
    for (const t of turnsFor({
      days,
      rooms: b.rooms,
      stays: b.stays,
      readiness: b.readiness,
      checkIn: b.defaultCheckIn,
      checkOut: b.defaultCheckOut,
    })) {
      const status = t.status ?? "clean";
      const late =
        t.day === b.today &&
        t.dueBy &&
        t.status !== "ready" &&
        now !== null &&
        at(t.day, t.dueBy) <= now;
      out.push({
        id: `t-${t.roomId}-${t.day}`,
        roomId: t.roomId,
        start: at(t.day, t.from),
        end: at(t.day, t.to),
        layer: "back",
        title: `${copy.status[status]}${t.dueBy ? ` · ${copy.dueBy(t.dueBy)}` : ""}${t.assignee ? ` · ${copy.assignedTo(t.assignee)}` : ""} · ${formatUkDate(t.day)}`,
        className: cn(
          "inset-y-1 rounded-md border px-1.5 font-medium",
          STATUS_TONE[status],
          late && "ring-2 ring-destructive",
          !t.saved && "border-dashed",
        ),
        label: (
          <span className="truncate">
            {copy.status[status]}
            {t.dueBy && t.status !== "ready" ? ` · ${t.dueBy}` : ""}
          </span>
        ),
        onClick: () => setPanel({ roomId: t.roomId, day: t.day }),
      });
    }
    // The stays, quiet: who's there and when.
    for (const s of b.stays.filter((x) => x.status !== "cancelled" && x.status !== "blocked")) {
      if (!s.room_id) continue;
      const t = stayTimes(s, { checkIn: b.defaultCheckIn, checkOut: b.defaultCheckOut });
      out.push({
        id: `s-${s.id}`,
        roomId: s.room_id,
        start: t.start,
        end: t.end,
        layer: "front",
        title: `${s.guest_full_name ?? copy.guest} · ${formatUkDate(s.check_in_date)} – ${formatUkDate(s.check_out_date)}`,
        className: "border border-border bg-surface/90 text-muted-foreground",
        label: <span className="truncate">{s.guest_full_name ?? copy.guest}</span>,
      });
    }
    return out;
  }, [b, view, now]);

  if (ws.isLoading || loading) return <Skeleton className="mx-auto h-64 max-w-6xl rounded-2xl" />;
  if (!selectedId) return <EmptyState icon={SprayCan} title={copy.title} body={copy.noProperty} />;
  // Owners, managers and cleaners work the board; viewers can look.
  const canEdit =
    role === "owner" || role === "manager" || role === "co_host" || role === "cleaner";

  const chip = (key: RoomFilter, label: string, tone: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={filter === key}
      onClick={() => setFilter((f) => (f === key ? "all" : key))}
      className={cn(
        "whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        tone,
        filter === key ? "ring-2 ring-foreground" : filter !== "all" && "opacity-60",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitleShort}
        actions={<PropertyPicker properties={properties} value={selectedId} onChange={select} />}
      />
      {b && !b.available ? (
        <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p>
      ) : null}

      {!b ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : b.rooms.length === 0 ? (
        <EmptyState icon={SprayCan} title={copy.noRooms} body={copy.noRoomsBody} />
      ) : (
        <RoomTimeline
          tourName="housekeeping-timeline"
          rooms={rooms}
          view={view}
          onView={changeView}
          today={b.today}
          now={now}
          items={items}
          maxHeight="calc(100dvh - 17rem)"
          toolbar={
            <>
              <span className="text-xs text-muted-foreground">
                {day === b.today ? copy.todayShort : formatUkDate(day)}:
              </span>
              {chip(
                "to_clean",
                copy.totals.toClean(totals.toClean),
                "bg-destructive/10 text-destructive",
              )}
              {chip(
                "cleaning",
                copy.totals.cleaning(cards.filter((c) => c.status === "cleaning").length),
                "bg-accent/20",
              )}
              {chip(
                "clean",
                copy.totals.clean(cards.filter((c) => c.status === "clean").length),
                "bg-secondary",
              )}
              {chip("ready", copy.totals.ready(totals.ready), "bg-primary text-primary-foreground")}
              {chip(
                "arriving",
                copy.totals.arriving(cards.filter((c) => c.arriving).length),
                "bg-muted",
              )}
              {totals.outOfService
                ? chip("out_of_service", copy.totals.outOfService(totals.outOfService), "bg-muted")
                : null}
              {totals.arrivingNotReady ? (
                <span className="flex items-center gap-1 rounded-full bg-destructive px-2.5 py-1 text-xs font-medium text-destructive-foreground">
                  <AlertTriangle className="size-3.5" />{" "}
                  {copy.totals.notReady(totals.arrivingNotReady)}
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
            const c = cards.find((x) => x.roomId === r.id);
            return (
              <button
                type="button"
                onClick={() => setPanel({ roomId: r.id, day })}
                className="flex w-full min-w-0 items-center gap-1.5 rounded-md text-left hover:underline"
              >
                {c?.status ? (
                  <span
                    className={cn("size-2.5 shrink-0 rounded-full", STATUS_DOT[c.status])}
                    aria-label={copy.status[c.status]}
                  />
                ) : (
                  <span className="size-2.5 shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.display_name}</span>
                  <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
                    {c?.status ? copy.status[c.status] : copy.occupancy[c?.occupancy ?? "empty"]}
                    {c?.assignee ? ` · ${c.assignee}` : ""}
                    {c?.openJobs ? ` · ${copy.jobsShort(c.openJobs)}` : ""}
                  </span>
                </span>
              </button>
            );
          }}
        />
      )}

      {b ? (
        <section className="card-soft p-0" data-tour="housekeeping-schedule">
          <button
            type="button"
            aria-expanded={scheduleOpen}
            onClick={() => setScheduleOpen((o) => !o)}
            className="flex w-full items-center gap-3 p-4 text-left"
          >
            <CalendarClock className="size-5 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{copy.schedule.title}</span>
              <span className="block truncate text-sm text-muted-foreground">
                {copy.schedule.summary(
                  b.defaultCheckOut,
                  b.defaultCheckIn,
                  b.windows.filter((w) => w.day_of_week !== null).length,
                )}
              </span>
            </span>
            <ChevronDown
              className={cn("size-5 transition-transform", scheduleOpen && "rotate-180")}
            />
          </button>
          {scheduleOpen ? (
            <div className="border-t border-border">
              <WeekSchedule
                embedded
                propertyId={selectedId}
                rooms={b.rooms}
                windows={b.windows}
                times={{
                  checkOut: b.defaultCheckOut,
                  checkIn: b.defaultCheckIn,
                  quietStart: b.quietStart,
                  quietEnd: b.quietEnd,
                }}
                boardDay={day}
                timezone={b.timezone}
                canEdit={canWrite && role !== "cleaner"}
                onGoTo={(dow) => {
                  changeView(viewFor("day", nextOnWeekday(b.today, dow)));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {b && panel ? (
        <RoomPanel
          board={b}
          roomId={panel.roomId}
          day={panel.day}
          propertyId={selectedId}
          canEdit={canEdit && b.available}
          onClose={() => setPanel(null)}
        />
      ) : null}
      <datalist id="housekeeping-people">
        {(b?.people ?? []).map((p) => (
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
  onClose,
}: {
  board: Range;
  roomId: string;
  day: string;
  propertyId: string;
  canEdit: boolean;
  onClose: () => void;
}) {
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
          {c.openJobs ? (
            <li>
              <Link
                to="/app/services"
                className="flex items-center gap-2 font-medium text-primary hover:underline"
              >
                <Wrench className="size-4" /> {copy.openJobs(c.openJobs)}
              </Link>
            </li>
          ) : null}
        </ul>

        {/* Where the work has got to: one tap per step, big enough for gloves. */}
        <div
          role="radiogroup"
          aria-label={copy.statusLabel(c.roomName)}
          className="grid grid-cols-4 gap-1 rounded-2xl bg-muted p-1"
        >
          {FLOW.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={c.status === s}
              disabled={!canEdit}
              onClick={() => void update({ status: s })}
              className={cn(
                "min-h-12 rounded-xl border border-transparent px-1 text-xs font-medium leading-tight transition-colors disabled:opacity-60",
                c.status === s
                  ? `${STATUS_TONE[s]} shadow-soft`
                  : "text-muted-foreground hover:bg-background",
              )}
            >
              {copy.status[s]}
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
            {c.status === "out_of_service" ? (
              <Button variant="ghost" size="sm" onClick={() => void update({ status: "to_clean" })}>
                {copy.backInService}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void update({ status: "out_of_service" })}
              >
                <Ban className="size-4" /> {copy.outOfService}
              </Button>
            )}
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
