import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, ArchiveRestore, CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { ChannelBadge, type Channel } from "@/components/ChannelBadge";
import { BookingDialog, type BookingRow } from "@/components/host/BookingDialog";
import { EmptyState } from "@/components/host/EmptyState";
import { ImportDialog } from "@/components/host/ImportDialog";
import { PageHeader } from "@/components/host/PageHeader";
import { PropertyPicker } from "@/components/host/PropertyPicker";
import { GuestSheet } from "@/components/host/GuestSheet";
import { StayCalendar, type Activity } from "@/components/host/StayCalendar";
import { StatusBadge } from "@/components/host/StatusBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { bookingTools as tools, bookings as copy, channels, common, statuses } from "@/content/copy";
import { usePropertyBoard, useRole, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { addDays, formatUkDate, nightsBetween, stayState } from "@/lib/dates";
import { archiveBookings, deleteBookings, syncPropertyNow } from "@/lib/guests.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/bookings")({
  // ?guest=<booking id> opens that guest's card, e.g. from Today.
  validateSearch: (search: Record<string, unknown>): { guest?: string } =>
    typeof search["guest"] === "string" ? { guest: search["guest"] } : {},
  head: () => ({
    meta: [
      { title: "Bookings · Latchkey host dashboard" },
      {
        name: "description",
        content:
          "Every stay across Airbnb, Booking.com, Homestay.com and direct bookings in one calendar.",
      },
    ],
  }),
  component: BookingsPage,
});

const CHANNEL_KEYS = ["airbnb", "booking_com", "homestay", "direct", "other"] as const;
const STATUS_KEYS = [
  "needs_details",
  "upcoming",
  "checked_in",
  "checked_out",
  "cancelled",
  "flagged",
  "blocked",
] as const;


function BookingsPage() {
  const workspace = useWorkspace();
  const properties = workspace.data?.properties as Array<{ id: string; name: string }> | undefined;
  const { selectedId, select } = useSelectedProperty(properties);
  const board = usePropertyBoard(selectedId);
  const { guest } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { canWrite } = useRole();
  const qc = useQueryClient();
  const archiveFn = useServerFn(archiveBookings);
  const deleteFn = useServerFn(deleteBookings);
  const syncFn = useServerFn(syncPropertyNow);

  const [scope, setScope] = useState<"active" | "archive">("active");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "timeline">("list");
  const [room, setRoom] = useState("all");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<BookingRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const data = board.data;
  const rooms = (data?.rooms ?? []) as Array<{ id: string; display_name: string }>;
  const everything = (data?.bookings ?? []) as Array<BookingRow & { archived_at?: string | null }>;
  // Archived stays live only in the Archive view.
  const all = everything.filter((b) => (scope === "archive") === !!b.archived_at);
  const activity = (data as { activity?: Activity } | undefined)?.activity ?? {};
  const todayIso = data?.today ?? new Date().toISOString().slice(0, 10);
  const windows = (data?.windows ?? []) as Array<{
    id: string;
    room_id: string | null;
    day_of_week: number | null;
    start_time: string | null;
    end_time: string | null;
    reason: string | null;
  }>;

  const filtered = useMemo(
    () =>
      all.filter(
        (b) =>
          (room === "all" || b.room_id === room) &&
          (channel === "all" || b.channel === channel) &&
          (status === "all" || b.status === status),
      ),
    [all, room, channel, status],
  );

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(todayIso, offset * 7 + i)),
    [todayIso, offset],
  );

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(b: BookingRow) {
    setEditing(b);
    setDialogOpen(true);
  }

  function openGuest(id: string | null) {
    void navigate({ search: id ? { guest: id } : {}, replace: true });
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    try {
      toast.success(await fn());
      await qc.invalidateQueries({ queryKey: ["board"] });
      setPicked(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  const ids = [...picked];
  const archiveSelected = () =>
    run("archive", async () => {
      const res = await archiveFn({ data: { ids, archived: scope === "active" } });
      return scope === "active" ? tools.archivedToast(res.count) : tools.restoredToast(res.count);
    });
  const deleteSelected = () =>
    run("delete", async () => tools.deletedToast((await deleteFn({ data: { ids } })).count));
  const syncAll = () =>
    run("sync", async () => {
      const res = await syncFn({ data: { propertyId: selectedId! } });
      if (res.links === 0) return tools.noLinks;
      if (res.failed.length) toast.error(res.failed.join("\n"));
      return tools.syncedToast(res.created, res.updated);
    });

  if (workspace.isLoading || board.isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (!properties || properties.length === 0 || !selectedId) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader title={copy.title} subtitle={copy.subtitle} />
        <div className="mt-6">
          <EmptyState
            icon={CalendarDays}
            title="No rooms set up yet"
            body="Add a property in Settings first, then your bookings will live here."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <>
            <PropertyPicker properties={properties} value={selectedId} onChange={select} />
            {canWrite ? (
              <Button variant="outline" onClick={() => void syncAll()} disabled={busy !== null}>
                {busy === "sync" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                {tools.syncAll}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" />
              {copy.importCsv}
            </Button>
            <Button onClick={openNew}>
              <Plus className="size-4" />
              {copy.addBooking}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-border bg-surface p-1">
          {(["active", "archive"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setScope(v);
                setPicked(new Set());
              }}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium",
                scope === v ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {v === "active" ? tools.active : tools.archive}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-xl border border-border bg-surface p-1">
          {(["list", "timeline"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium",
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {v === "list" ? copy.listView : copy.timelineView}
            </button>
          ))}
        </div>

        <Select value={room} onValueChange={setRoom}>
          <SelectTrigger className="h-11 w-40" aria-label={copy.filtersRoom}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{copy.allRooms}</SelectItem>
            {rooms.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="h-11 w-40" aria-label={copy.filtersChannel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{copy.allChannels}</SelectItem>
            {CHANNEL_KEYS.map((c) => (
              <SelectItem key={c} value={c}>
                {channels[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-11 w-40" aria-label={copy.filtersStatus}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{copy.allStatuses}</SelectItem>
            {STATUS_KEYS.map((s) => (
              <SelectItem key={s} value={s}>
                {statuses[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canWrite && view === "list" ? (
          <Button
            variant={selecting ? "default" : "outline"}
            className="ml-auto"
            onClick={() => {
              setSelecting((v) => !v);
              setPicked(new Set());
            }}
          >
            {selecting ? tools.done : tools.select}
          </Button>
        ) : null}
      </div>

      {scope === "archive" ? <p className="text-sm text-muted-foreground">{tools.archiveHint}</p> : null}

      {selecting && view === "list" ? (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3 shadow-soft">
          <span className="mr-auto text-sm font-medium">{tools.selected(picked.size)}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPicked(picked.size === filtered.length ? new Set() : new Set(filtered.map((b) => b.id)))}
          >
            {tools.selectAll}
          </Button>
          <Button variant="outline" size="sm" disabled={!picked.size || busy !== null} onClick={() => void archiveSelected()}>
            {busy === "archive" ? <Loader2 className="size-4 animate-spin" /> : scope === "active" ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}
            {scope === "active" ? tools.archiveSelected : tools.restoreSelected}
          </Button>
          <Button variant="outline" size="sm" className="text-destructive" disabled={!picked.size || busy !== null} onClick={() => setConfirmDelete(true)}>
            {busy === "delete" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {tools.deleteSelected}
          </Button>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={scope === "archive" ? tools.archiveEmpty : copy.empty}
          action={scope === "archive" ? undefined : (
            <Button onClick={openNew} className="mt-2">
              <Plus className="size-4" />
              {copy.addBooking}
            </Button>
          )}
        />
      ) : view === "list" ? (
        <ul className="card-soft overflow-hidden p-0">
          {filtered.map((b) => {
            const nights = nightsBetween(b.check_in_date, b.check_out_date);
            return (
              <li key={b.id} className="flex items-center border-b border-border last:border-0">
                {selecting ? (
                  <Checkbox
                    className="ml-4"
                    checked={picked.has(b.id)}
                    onCheckedChange={() => toggle(b.id)}
                    aria-label={b.guest_full_name ?? copy.guestUnknown}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => (selecting ? toggle(b.id) : openGuest(b.id))}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-4 text-left transition-colors hover:bg-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {b.guest_full_name ?? copy.guestUnknown}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {rooms.find((r) => r.id === b.room_id)?.display_name ?? "No room allocated"} ·{" "}
                      {formatUkDate(b.check_in_date)} → {formatUkDate(b.check_out_date)} · {nights}{" "}
                      {nights === 1 ? copy.night : copy.nights}
                    </span>
                  </span>
                  <ChannelBadge channel={b.channel as Channel} />
                  <StatusBadge state={stayState(b, todayIso)} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="card-soft overflow-x-auto p-0">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <Button variant="ghost" size="sm" onClick={() => setOffset((o) => o - 1)}>
              <ChevronLeft className="size-4" />
              Earlier
            </Button>
            <span className="text-sm font-medium">
              {formatUkDate(days[0]!)} – {formatUkDate(days[6]!)}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setOffset((o) => o + 1)}>
              Later
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <StayCalendar
            rooms={rooms}
            stays={filtered}
            allStays={all}
            windows={windows}
            days={days}
            today={todayIso}
            activity={activity}
            onOpen={(id) => openGuest(id)}
          />
        </div>
      )}

      <GuestSheet
        bookingId={guest ?? null}
        today={todayIso}
        onOpenChange={(o) => (o ? null : openGuest(null))}
        onEdit={(id) => {
          const b = everything.find((x) => x.id === id);
          if (b) openEdit(b);
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tools.deleteTitle(picked.size)}</AlertDialogTitle>
            <AlertDialogDescription>{tools.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void deleteSelected()}
            >
              {tools.deleteSelected}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BookingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        propertyId={selectedId}
        rooms={rooms}
        booking={editing}
        defaults={{
          check_in_time:
            (data?.property as { default_check_in_time?: string } | null)
              ?.default_check_in_time ?? "15:00",
          check_out_time:
            (data?.property as { default_check_out_time?: string } | null)
              ?.default_check_out_time ?? "11:00",
        }}
      />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        propertyId={selectedId}
        rooms={rooms}
      />
    </div>
  );
}
