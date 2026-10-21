import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeftRight, BedDouble, Ban, ChevronLeft, ChevronRight, Clock, DoorClosed, DoorOpen, LogIn, LogOut, SprayCan, Wrench } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/host/EmptyState";
import { PageHeader } from "@/components/host/PageHeader";
import { PropertyPicker } from "@/components/host/PropertyPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { common, housekeepingCopy as copy } from "@/content/copy";
import { useLandOn } from "@/hooks/use-land-on";
import { useRole, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { rebrand } from "@/lib/brand";
import { formatUkDate } from "@/lib/dates";
import { FLOW, boardOrder, boardTotals, buildBoard, type BoardCard, type Occupancy, type Readiness } from "@/lib/housekeeping";
import { getHousekeepingBoard, setRoomReadiness } from "@/lib/housekeeping.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/housekeeping")({
  // ?day=2026-10-21 opens that day; ?room= lands on a room's card.
  validateSearch: (s: Record<string, unknown>): { day?: string; room?: string } => ({
    ...(typeof s["day"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["day"]) ? { day: s["day"] } : {}),
    ...(typeof s["room"] === "string" ? { room: s["room"] } : {}),
  }),
  head: () => ({ meta: [{ title: rebrand("Housekeeping · Latchkey host dashboard") }] }),
  component: HousekeepingPage,
});

const OCCUPANCY_ICONS: Record<Occupancy, typeof BedDouble> = {
  turnover: ArrowLeftRight,
  leaving: LogOut,
  arriving: LogIn,
  staying: BedDouble,
  empty: DoorOpen,
  closed: DoorClosed,
};

const STATUS_TONE: Record<Readiness, string> = {
  to_clean: "bg-destructive/10 text-destructive",
  cleaning: "bg-accent/15 text-accent-foreground",
  clean: "bg-secondary text-secondary-foreground",
  ready: "bg-primary text-primary-foreground",
  out_of_service: "bg-muted text-muted-foreground",
};

type Board = Awaited<ReturnType<typeof getHousekeepingBoard>>;

function HousekeepingPage() {
  const ws = useWorkspace();
  const { role, loading } = useRole();
  const properties = (ws.data?.properties ?? []) as Array<{ id: string; name: string }>;
  const { selectedId, select } = useSelectedProperty(properties);
  const { day: dayParam, room } = Route.useSearch();
  const [day, setDay] = useState<string | undefined>(dayParam);
  useEffect(() => setDay(dayParam), [dayParam]);
  const fn = useServerFn(getHousekeepingBoard);
  const q = useQuery({
    queryKey: ["housekeeping", selectedId, day ?? "today"],
    enabled: !!selectedId,
    queryFn: () => fn({ data: { propertyId: selectedId!, ...(day ? { day } : {}) } }),
    refetchInterval: 60_000,
  });
  useLandOn(room ? `room-${room}` : null, !!q.data);

  if (ws.isLoading || loading) return <Skeleton className="mx-auto h-64 max-w-6xl rounded-2xl" />;
  if (!selectedId) return <EmptyState icon={SprayCan} title={copy.title} body={copy.noProperty} />;
  // Owners, managers and cleaners work the board; viewers can look.
  const canEdit = role === "owner" || role === "manager" || role === "co_host" || role === "cleaner";

  const b = q.data;
  const cards = b ? boardOrder(buildBoard({ day: b.day, rooms: b.rooms, stays: b.stays, readiness: b.readiness, openJobs: b.openJobs, defaultCheckIn: b.defaultCheckIn })) : [];
  const totals = boardTotals(cards);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <PageHeader title={copy.title} subtitle={copy.subtitle} actions={<PropertyPicker properties={properties} value={selectedId} onChange={select} />} />

      {/* The day, and moving between days. */}
      <div className="card-soft flex flex-wrap items-center gap-2 p-2">
        <Button variant="ghost" size="icon" aria-label={copy.prevDay} disabled={!b} onClick={() => b && setDay(b.prevDay)}>
          <ChevronLeft className="size-5" />
        </Button>
        <p className="min-w-0 flex-1 text-center font-display text-lg">
          {b ? (b.day === b.today ? copy.todayLabel(formatUkDate(b.day)) : formatUkDate(b.day)) : "…"}
        </p>
        <Button variant="ghost" size="icon" aria-label={copy.nextDay} disabled={!b} onClick={() => b && setDay(b.nextDay)}>
          <ChevronRight className="size-5" />
        </Button>
        {b && b.day !== b.today ? (
          <Button variant="outline" size="sm" className="basis-full sm:basis-auto" onClick={() => setDay(undefined)}>
            {copy.backToToday}
          </Button>
        ) : null}
      </div>

      {b && !b.available ? <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p> : null}

      {b ? (
        <ul className="flex flex-wrap gap-2 text-sm" aria-label={copy.summary}>
          <li className="rounded-full bg-destructive/10 px-3 py-1.5 font-medium text-destructive">{copy.totals.toClean(totals.toClean)}</li>
          <li className="rounded-full bg-secondary px-3 py-1.5 font-medium">{copy.totals.inProgress(totals.inProgress)}</li>
          <li className="rounded-full bg-primary px-3 py-1.5 font-medium text-primary-foreground">{copy.totals.ready(totals.ready)}</li>
          {totals.arrivingNotReady ? (
            <li className="flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5 font-medium text-destructive-foreground">
              <AlertTriangle className="size-4" /> {copy.totals.notReady(totals.arrivingNotReady)}
            </li>
          ) : null}
          {totals.outOfService ? <li className="rounded-full bg-muted px-3 py-1.5 font-medium">{copy.totals.outOfService(totals.outOfService)}</li> : null}
        </ul>
      ) : null}

      {q.isLoading ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : q.error ? (
        <p className="card-soft p-6 text-muted-foreground">{q.error instanceof Error ? q.error.message : common.errorBody}</p>
      ) : b && cards.length === 0 ? (
        <EmptyState icon={SprayCan} title={copy.noRooms} body={copy.noRoomsBody} />
      ) : b ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => (
            <RoomCard key={c.roomId} card={c} board={b} propertyId={selectedId} canEdit={canEdit && b.available} />
          ))}
        </div>
      ) : null}
      <datalist id="housekeeping-people">{(b?.people ?? []).map((p) => <option key={p} value={p} />)}</datalist>
    </div>
  );
}

function shortName(name: string | null) {
  if (!name) return copy.guest;
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]}.` : parts[0]!;
}

function RoomCard({ card: c, board, propertyId, canEdit }: { card: BoardCard; board: Board; propertyId: string; canEdit: boolean }) {
  const save = useServerFn(setRoomReadiness);
  const qc = useQueryClient();
  const key = ["housekeeping", propertyId, board.day === board.today ? "today" : board.day];
  const [assignee, setAssignee] = useState(c.assignee ?? "");
  const [note, setNote] = useState(c.note ?? "");
  const [noteOpen, setNoteOpen] = useState(!!c.note);
  useEffect(() => {
    setAssignee(c.assignee ?? "");
    setNote(c.note ?? "");
  }, [c.assignee, c.note]);

  async function update(patch: { status?: Readiness; assignee?: string | null; note?: string | null }) {
    const status = patch.status ?? c.status ?? "to_clean";
    // Shown at once; put right if the save fails.
    qc.setQueryData<Board>(key, (old) => {
      if (!old) return old;
      const rest = old.readiness.filter((r) => r.room_id !== c.roomId);
      const prev = old.readiness.find((r) => r.room_id === c.roomId);
      return {
        ...old,
        readiness: [
          ...rest,
          {
            room_id: c.roomId,
            status,
            assignee: patch.assignee !== undefined ? patch.assignee : (prev?.assignee ?? c.assignee),
            due_time: prev?.due_time ?? null,
            note: patch.note !== undefined ? patch.note : (prev?.note ?? c.note),
            updated_at: new Date().toISOString(),
            updated_by_name: copy.you,
          },
        ],
      };
    });
    try {
      await save({ data: { propertyId, roomId: c.roomId, day: board.day, status, ...(patch.assignee !== undefined ? { assignee: patch.assignee } : {}), ...(patch.note !== undefined ? { note: patch.note } : {}) } });
      if (patch.status === "ready") toast.success(copy.readyToast(c.roomName));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      await qc.invalidateQueries({ queryKey: key });
    }
  }

  const Icon = OCCUPANCY_ICONS[c.occupancy];
  const late = board.day === board.today && c.arriving && c.status !== "ready" && c.dueBy && c.dueBy <= new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const updatedBy = board.readiness.find((r) => r.room_id === c.roomId)?.updated_by_name ?? null;

  return (
    <article id={`room-${c.roomId}`} className={cn("card-soft flex scroll-mt-24 flex-col gap-3 p-4", c.arriving && c.status !== "ready" && "ring-2 ring-destructive/40")}>
      <header className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg leading-tight">{c.roomName}</h2>
          <p className="text-sm text-muted-foreground">{copy.occupancy[c.occupancy]}</p>
        </div>
        {c.status ? <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", STATUS_TONE[c.status])}>{copy.status[c.status]}</span> : null}
      </header>

      <ul className="space-y-1 text-sm">
        {c.leaving ? (
          <li className="flex items-center gap-2"><LogOut className="size-4 text-muted-foreground" /> {copy.out(shortName(c.leaving.guest_full_name), (c.leaving.check_out_time ?? "").slice(0, 5))}</li>
        ) : null}
        {c.arriving ? (
          <li className="flex items-center gap-2"><LogIn className="size-4 text-muted-foreground" /> {copy.in(shortName(c.arriving.guest_full_name), c.arriving.guest_count ?? null)}</li>
        ) : null}
        {c.staying ? <li className="flex items-center gap-2"><BedDouble className="size-4 text-muted-foreground" /> {copy.staying(shortName(c.staying.guest_full_name), formatUkDate(c.staying.check_out_date))}</li> : null}
        {c.dueBy ? (
          <li className={cn("flex items-center gap-2 font-medium", late ? "text-destructive" : "")}>
            <Clock className="size-4" /> {late ? copy.overdue(c.dueBy) : copy.dueBy(c.dueBy)}
          </li>
        ) : null}
        {c.openJobs ? (
          <li>
            <Link to="/app/services" className="flex items-center gap-2 font-medium text-primary hover:underline">
              <Wrench className="size-4" /> {copy.openJobs(c.openJobs)}
            </Link>
          </li>
        ) : null}
      </ul>

      {/* Where the work has got to: one tap per step, big enough for gloves. */}
      <div role="radiogroup" aria-label={copy.statusLabel(c.roomName)} className="grid grid-cols-4 gap-1 rounded-2xl bg-muted p-1">
        {FLOW.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={c.status === s}
            disabled={!canEdit}
            onClick={() => void update({ status: s })}
            className={cn(
              "min-h-12 rounded-xl px-1 text-xs font-medium leading-tight transition-colors disabled:opacity-60",
              c.status === s ? STATUS_TONE[s] + " shadow-soft" : "text-muted-foreground hover:bg-background",
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
            onBlur={() => assignee.trim() !== (c.assignee ?? "") && void update({ assignee: assignee.trim() || null })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
          {noteOpen ? (
            <Textarea
              rows={2}
              maxLength={500}
              placeholder={copy.notePlaceholder}
              aria-label={copy.note}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note.trim() !== (c.note ?? "") && void update({ note: note.trim() || null })}
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {!noteOpen ? (
              <Button variant="ghost" size="sm" onClick={() => setNoteOpen(true)}>{copy.addNote}</Button>
            ) : null}
            {c.status === "out_of_service" ? (
              <Button variant="ghost" size="sm" onClick={() => void update({ status: "to_clean" })}>{copy.backInService}</Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => void update({ status: "out_of_service" })}>
                <Ban className="size-4" /> {copy.outOfService}
              </Button>
            )}
          </div>
        </div>
      ) : c.assignee ? (
        <p className="text-sm">{copy.assignedTo(c.assignee)}</p>
      ) : null}

      {c.saved && c.updatedAt ? (
        <p className="mt-auto text-xs text-muted-foreground">
          {copy.lastChange(c.status ? (copy.status[c.status] ?? "") : "", updatedBy, new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(c.updatedAt)))}
        </p>
      ) : !c.saved && c.status ? (
        <Badge variant="outline" className="mt-auto w-fit text-xs font-normal">{copy.suggested}</Badge>
      ) : null}
    </article>
  );
}
