import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, ArchiveRestore, CalendarDays, ChevronLeft, ChevronRight, ListChecks, Loader2, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { BookingDialog, type BookingRow } from "@/components/host/BookingDialog";
import { EmptyState } from "@/components/host/EmptyState";
import { ImportDialog } from "@/components/host/ImportDialog";
import { PageHeader } from "@/components/host/PageHeader";
import { PropertyPicker } from "@/components/host/PropertyPicker";
import { GuestSheet } from "@/components/host/GuestSheet";
import { StayCalendar, type Activity } from "@/components/host/StayCalendar";
import { BookingFilters, BookingsTable, Tip } from "@/components/host/BookingsTable";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { bookingTools as tools, bookings as copy, channels, common, statuses } from "@/content/copy";
import { useBookingSites, usePropertyBoard, useRole, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { DEFAULT_FILTERS, filterBookings, readFilters, sortBookings, stayGroup, type ListBooking, type ListFilters, type SortKey } from "@/lib/booking-list";
import { platformKey } from "@/lib/booking-sites";
import { addDays, formatUkDate } from "@/lib/dates";
import { archiveBookings, deleteBookings, setBookingStatus, syncPropertyNow } from "@/lib/guests.functions";
import { cn } from "@/lib/utils";
import { todayBoard, type TodayBooking } from "@/lib/today";
import { useLandOn } from "@/hooks/use-land-on";
import { NeedsDetailsCard, type NeedsDetailsBooking } from "@/components/host/NeedsDetailsCard";
import { ChannelBadge, type Channel } from "@/components/ChannelBadge";
import { AlertTriangle, ArrowUpRight, Ban, Eye, EyeOff, LockOpen, PencilLine, X } from "lucide-react";
import { today as todayCopy } from "@/content/copy";
import { rebrand } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/app/bookings")({
  // ?guest=<booking id> opens that guest's card, e.g. from Today.
  // ?edit=1 also opens the edit form, e.g. from the Edit button on Today.
  // ?show=arriving|staying|leaving|needs_details|double_booked lists just those
  // stays, worked out exactly as Today does, e.g. from a number on Today.
  validateSearch: (search: Record<string, unknown>): { guest?: string; edit?: boolean; show?: ShowKey } => ({
    ...(typeof search["guest"] === "string" ? { guest: search["guest"] } : {}),
    ...(search["edit"] === true || search["edit"] === "1" || search["edit"] === 1 ? { edit: true } : {}),
    ...(typeof search["show"] === "string" && (SHOW_KEYS as readonly string[]).includes(search["show"]) ? { show: search["show"] as ShowKey } : {}),
  }),
  head: () => ({
    meta: [
      { title: rebrand("Bookings · Latchkey host dashboard") },
      {
        name: "description",
        content:
          "Every stay across Airbnb, Booking.com, Homestay.com and direct bookings in one calendar.",
      },
    ],
  }),
  component: BookingsPage,
});

const SHOW_KEYS = ["arriving", "staying", "leaving", "needs_details", "double_booked"] as const;
type ShowKey = (typeof SHOW_KEYS)[number];

const FILTERS_KEY = "latchkey.bookingFilters";
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
  const { guest, edit, show } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { canWrite } = useRole();
  const qc = useQueryClient();
  const archiveFn = useServerFn(archiveBookings);
  const deleteFn = useServerFn(deleteBookings);
  const syncFn = useServerFn(syncPropertyNow);
  const statusFn = useServerFn(setBookingStatus);

  const [scope, setScope] = useState<"active" | "archive">("active");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "timeline">("list");
  const sites = useBookingSites();
  // Filters are remembered in this browser; past stays start hidden.
  const [filters, setFiltersState] = useState<ListFilters>(DEFAULT_FILTERS);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FILTERS_KEY);
      if (saved) setFiltersState(readFilters(saved));
    } catch {
      // Private browsing: start from the defaults.
    }
  }, []);
  function setFilters(f: ListFilters) {
    setFiltersState(f);
    try {
      window.localStorage.setItem(FILTERS_KEY, JSON.stringify({ ...f, search: "" }));
    } catch {
      // Not remembered this time.
    }
  }
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "smart", dir: "asc" });
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

  // Arrived from Edit on Today: open the form once the stay has loaded.
  useEffect(() => {
    if (!edit || !guest) return;
    const b = everything.find((x) => x.id === guest);
    if (!b) return;
    setEditing(b);
    setDialogOpen(true);
    void navigate({ to: "/app/bookings", search: { guest, ...(show ? { show } : {}) }, replace: true });
  }, [edit, guest, everything, navigate, show]);
  const todayIso = data?.today ?? new Date().toISOString().slice(0, 10);
  const windows = (data?.windows ?? []) as Array<{
    id: string;
    room_id: string | null;
    day_of_week: number | null;
    start_time: string | null;
    end_time: string | null;
    reason: string | null;
  }>;

  const platformOf = (b: ListBooking) => platformKey(b);
  // The same lists Today shows, so a number there opens exactly those stays here.
  const lists = useMemo(() => todayBoard(everything as unknown as TodayBooking[], todayIso), [everything, todayIso]);
  const focus = show
    ? new Set(
        {
          arriving: lists.arriving,
          staying: lists.staying,
          leaving: lists.leaving,
          needs_details: lists.needsDetails,
          double_booked: lists.doubleBooked,
        }[show].map((b) => b.id),
      )
    : null;
  const visible = useMemo(
    () =>
      sortBookings(focus ? all.filter((b) => focus.has(b.id)) : filterBookings(all, filters, todayIso, platformOf), sort.key, sort.dir, todayIso, {
        room: (id) => rooms.find((r) => r.id === id)?.display_name ?? "",
        platform: (b) => sites.find((x) => x.key === platformKey(b))?.label ?? b.channel,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, filters, sort, todayIso, rooms, sites, show, lists],
  );
  // The timeline shows its own fortnight, so only room, platform and search apply.
  const filtered = useMemo(
    () => filterBookings(all, { ...filters, hideGroups: [] }, todayIso, platformOf),
    [all, filters, todayIso],
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
    void navigate({ to: "/app/bookings", search: { ...(id ? { guest: id } : {}), ...(show ? { show } : {}) }, replace: true });
  }
  useLandOn(show ? "bookings-list" : guest ? `stay-${guest}` : null, everything.length > 0);

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

  /** The icons each kind of stay needs, at the end of its row. */
  function rowActions(b: ListBooking) {
    if (!canWrite) return null;
    const full = everything.find((x) => x.id === b.id);
    const icon = (key: string, label: string, Icon: typeof Eye, onClick: () => void, tone?: string) => (
      <Tip key={key} label={label}>
        <Button
          size="icon"
          variant="ghost"
          className={cn("size-8", tone)}
          aria-label={`${label}: ${b.guest_full_name ?? formatUkDate(b.check_in_date)}`}
          disabled={busy !== null}
          onClick={onClick}
        >
          <Icon className="size-4" />
        </Button>
      </Tip>
    );
    const hide = (on: boolean) =>
      icon(on ? "hide" : "show", on ? tools.rowHide : tools.rowShow, on ? EyeOff : Eye, () =>
        void run(`row-${b.id}`, async () => {
          const res = await archiveFn({ data: { ids: [b.id], archived: on } });
          return on ? tools.archivedToast(res.count) : tools.restoredToast(res.count);
        }),
      );
    if (scope === "archive") return hide(false);
    const group = stayGroup(b, todayIso);
    if (group === "closed") {
      if (b.mirror_of) return [icon("orig", tools.rowOpenOriginal, ArrowUpRight, () => openGuest(b.mirror_of!)), hide(true)];
      return [
        icon("unblock", tools.rowUnblock, LockOpen, () =>
          void run(`row-${b.id}`, async () => (await statusFn({ data: { id: b.id, status: "needs_details" } }), tools.reopenedToast)),
        ),
        hide(true),
      ];
    }
    if (group === "cancelled" || group === "past") return hide(true);
    if (!b.guest_full_name?.trim()) {
      return [
        icon("name", tools.rowAddName, PencilLine, () => (full ? openEdit(full) : openGuest(b.id)), "text-primary"),
        icon("block", tools.rowNotBooking, Ban, () =>
          void run(`row-${b.id}`, async () => (await statusFn({ data: { id: b.id, status: "blocked" } }), tools.closedToast)),
        ),
        hide(true),
      ];
    }
    return null;
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

      {/* Two switches that fill the width on a phone (under 440px wide the first takes its own row), then Select. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 rounded-xl border border-border bg-surface p-1 max-[440px]:basis-full sm:flex-none">
          {(["active", "archive"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setScope(v);
                setPicked(new Set());
              }}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-sm font-medium sm:px-4",
                scope === v ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {v === "active" ? tools.active : tools.archive}
            </button>
          ))}
        </div>
        <div className="flex flex-1 rounded-xl border border-border bg-surface p-1 sm:flex-none">
          {(["list", "timeline"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-sm font-medium sm:px-4",
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {v === "list" ? copy.listView : copy.timelineView}
            </button>
          ))}
        </div>

        {canWrite && view === "list" ? (
          <Button
            variant={selecting ? "default" : "outline"}
            className="h-11 sm:ml-auto"
            aria-label={selecting ? tools.done : tools.select}
            onClick={() => {
              setSelecting((v) => !v);
              setPicked(new Set());
            }}
          >
            <ListChecks className="size-4" />
            <span className="max-sm:sr-only">{selecting ? tools.done : tools.select}</span>
          </Button>
        ) : null}
      </div>

      {scope === "active" && lists.doubleBooked.length > 0 ? (
        <div id="double-booked" role="alert" className="flex scroll-mt-24 gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
          <AlertTriangle className="size-5 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium">{todayCopy.doubleBookedTitle}</p>
            <p className="text-muted-foreground">{todayCopy.doubleBookedBody}</p>
            <ul className="mt-2 space-y-1">
              {lists.doubleBooked.map((b) => (
                <li key={b.id}>
                  <button type="button" className="flex flex-wrap items-center gap-2 text-left hover:underline" onClick={() => openGuest(b.id)}>
                    <ChannelBadge channel={b.channel as Channel} />
                    <span>
                      {b.guest_full_name ?? b.reservation_code} · {rooms.find((r) => r.id === b.room_id)?.display_name ?? "No room"} ·{" "}
                      {formatUkDate(b.check_in_date)} → {formatUkDate(b.check_out_date)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {scope === "active" && lists.needsDetails.length > 0 && canWrite ? (
        <section id="needs-details" className="scroll-mt-24 space-y-3">
          <div>
            <h2 className="text-xl">{todayCopy.actionRequired}</h2>
            <p className="text-sm text-muted-foreground">{todayCopy.actionBody}</p>
          </div>
          {lists.needsDetails.map((b) => (
            <NeedsDetailsCard
              key={b.id}
              id={`needs-${b.id}`}
              booking={b as unknown as NeedsDetailsBooking}
              roomName={rooms.find((r) => r.id === b.room_id)?.display_name ?? "No room allocated"}
            />
          ))}
        </section>
      ) : null}

      {show ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm">
          <span className="font-medium">{tools.showing(tools.showLabels[show] ?? show, visible.length)}</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void navigate({ to: "/app/bookings", search: {}, replace: true })}>
            <X className="size-4" /> {tools.showEverything}
          </Button>
        </div>
      ) : null}

      <BookingFilters
        filters={filters}
        onChange={setFilters}
        rooms={rooms}
        sites={sites}
        shown={view === "list" ? visible.length : filtered.length}
        total={all.length}
      />

      {scope === "archive" ? <p className="text-sm text-muted-foreground">{tools.archiveHint}</p> : null}

      {selecting && view === "list" ? (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3 shadow-soft">
          <span className="mr-auto text-sm font-medium">{tools.selected(picked.size)}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPicked(picked.size === visible.length ? new Set() : new Set(visible.map((b) => b.id)))}
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

      {all.length === 0 ? (
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
        <div id="bookings-list" className="scroll-mt-24 rounded-2xl">
        <BookingsTable
          rows={visible}
          allRows={everything}
          today={todayIso}
          rooms={rooms}
          sites={sites}
          currency={((workspace.data?.host as { currency?: string } | null | undefined)?.currency) ?? "GBP"}
          sort={sort}
          onSort={setSort}
          selecting={selecting}
          picked={picked}
          onToggle={toggle}
          onOpen={(id) => openGuest(id)}
          rowActions={rowActions}
        />
        </div>
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
