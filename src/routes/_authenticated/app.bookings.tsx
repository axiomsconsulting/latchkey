import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Upload } from "lucide-react";

import { ChannelBadge, type Channel } from "@/components/ChannelBadge";
import { BookingDialog, type BookingRow } from "@/components/host/BookingDialog";
import { EmptyState } from "@/components/host/EmptyState";
import { ImportDialog } from "@/components/host/ImportDialog";
import { PageHeader } from "@/components/host/PageHeader";
import { PropertyPicker } from "@/components/host/PropertyPicker";
import { StatusBadge } from "@/components/host/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { bookings as copy, channels, statuses } from "@/content/copy";
import { usePropertyBoard, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { addDays, dayOfWeek, formatUkDate, nightsBetween, stayState } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/bookings")({
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
] as const;

const channelBar: Record<string, string> = {
  airbnb: "bg-channel-airbnb text-channel-airbnb-foreground",
  booking_com: "bg-channel-booking text-channel-booking-foreground",
  homestay: "bg-channel-homestay text-channel-homestay-foreground",
  direct: "bg-channel-direct text-channel-direct-foreground",
  other: "bg-channel-other text-channel-other-foreground",
};

function BookingsPage() {
  const workspace = useWorkspace();
  const properties = workspace.data?.properties as Array<{ id: string; name: string }> | undefined;
  const { selectedId, select } = useSelectedProperty(properties);
  const board = usePropertyBoard(selectedId);

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
  const all = (data?.bookings ?? []) as BookingRow[];
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
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={copy.empty}
          action={
            <Button onClick={openNew} className="mt-2">
              <Plus className="size-4" />
              {copy.addBooking}
            </Button>
          }
        />
      ) : view === "list" ? (
        <ul className="card-soft overflow-hidden p-0">
          {filtered.map((b) => {
            const nights = nightsBetween(b.check_in_date, b.check_out_date);
            return (
              <li key={b.id} className="border-b border-border last:border-0">
                <button
                  type="button"
                  onClick={() => openEdit(b)}
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

          <div className="min-w-[46rem]">
            <div className="grid grid-cols-[10rem_repeat(7,minmax(0,1fr))] border-b border-border bg-muted/40 text-xs font-medium">
              <div className="px-3 py-2">Room</div>
              {days.map((d) => (
                <div
                  key={d}
                  className={cn("px-2 py-2 text-center", d === todayIso && "text-primary")}
                >
                  {formatUkDate(d)}
                </div>
              ))}
            </div>

            {rooms.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[10rem_repeat(7,minmax(0,1fr))] border-b border-border last:border-0"
              >
                <div className="truncate px-3 py-3 text-sm font-medium">{r.display_name}</div>
                {days.map((d) => {
                  const stay = filtered.find(
                    (b) =>
                      b.room_id === r.id &&
                      b.status !== "cancelled" &&
                      b.check_in_date <= d &&
                      b.check_out_date > d,
                  );
                  const cleaning = windows.find(
                    (w) =>
                      (w.room_id === null || w.room_id === r.id) &&
                      w.day_of_week === dayOfWeek(d),
                  );
                  return (
                    <div key={d} className={cn("p-1", cleaning && !stay && "hatched")}>
                      {stay ? (
                        <button
                          type="button"
                          onClick={() => openEdit(stay)}
                          className={cn(
                            "flex h-12 w-full items-center truncate rounded-lg px-2 text-left text-xs font-medium",
                            channelBar[stay.channel] ?? channelBar["other"],
                            stay.status === "needs_details" &&
                              "outline-2 outline-dashed outline-offset-[-2px] outline-accent",
                          )}
                          title={stay.guest_full_name ?? copy.guestUnknown}
                        >
                          <span className="truncate">
                            {stay.guest_full_name ?? copy.guestUnknown}
                          </span>
                        </button>
                      ) : (
                        <div className="h-12" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

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
