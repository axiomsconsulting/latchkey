import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BedDouble, CalendarClock, DoorOpen, Loader2, Sparkles, Sun } from "lucide-react";
import { toast } from "sonner";

import { ChannelBadge, type Channel } from "@/components/ChannelBadge";
import { EmptyState } from "@/components/host/EmptyState";
import { PageHeader } from "@/components/host/PageHeader";
import { PropertyPicker } from "@/components/host/PropertyPicker";
import { StatusBadge } from "@/components/host/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { common, today as copy } from "@/content/copy";
import { usePropertyBoard, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { dayOfWeek, formatUkDate, formatUkTime, nightsBetween, stayState } from "@/lib/dates";
import { saveBooking } from "@/lib/host.functions";

export const Route = createFileRoute("/_authenticated/app/today")({
  head: () => ({
    meta: [
      { title: "Today · Latchkey host dashboard" },
      {
        name: "description",
        content: "Arrivals, departures and anything waiting on you across all your channels.",
      },
    ],
  }),
  component: TodayPage,
});

type Booking = {
  id: string;
  property_id: string;
  room_id: string | null;
  channel: string;
  guest_full_name: string | null;
  guest_count: number;
  reservation_code: string | null;
  phone_last4: string | null;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: string;
  notes: string | null;
};

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Sun;
  label: string;
  value: number;
}) {
  return (
    <div className="card-soft flex items-center gap-3 p-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-2xl leading-none">{value}</span>
        <span className="block truncate text-xs text-muted-foreground">{label}</span>
      </span>
    </div>
  );
}

function BookingRow({
  booking,
  roomName,
  state,
}: {
  booking: Booking;
  roomName: string;
  state: string;
}) {
  const nights = nightsBetween(booking.check_in_date, booking.check_out_date);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-4 last:border-0">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {booking.guest_full_name ?? copy.actionRequired}
        </span>
        <span className="block text-sm text-muted-foreground">
          {roomName} · {formatUkDate(booking.check_in_date)} → {formatUkDate(booking.check_out_date)}{" "}
          · {nights} {nights === 1 ? "night" : "nights"}
        </span>
      </span>
      <span className="text-sm tabular-nums text-muted-foreground">
        {state === "departing_today"
          ? formatUkTime(booking.check_out_time)
          : formatUkTime(booking.check_in_time)}
      </span>
      <ChannelBadge channel={booking.channel as Channel} />
      <StatusBadge state={state} />
    </li>
  );
}

function NeedsDetailsCard({ booking, roomName }: { booking: Booking; roomName: string }) {
  const save = useServerFn(saveBooking);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [time, setTime] = useState((booking.check_in_time ?? "15:00").slice(0, 5));
  const [guests, setGuests] = useState(booking.guest_count ?? 1);
  const [busy, setBusy] = useState(false);

  async function onSave() {
    setBusy(true);
    try {
      await save({
        data: {
          id: booking.id,
          property_id: booking.property_id,
          room_id: booking.room_id,
          channel: booking.channel as Channel,
          guest_full_name: name.trim() || null,
          reservation_code: booking.reservation_code,
          guest_count: Number(guests) || 1,
          phone_last4: booking.phone_last4,
          check_in_date: booking.check_in_date,
          check_out_date: booking.check_out_date,
          check_in_time: time || null,
          check_out_time: booking.check_out_time,
          status: name.trim() ? "upcoming" : "needs_details",
          notes: booking.notes,
        },
      });
      await qc.invalidateQueries({ queryKey: ["board"] });
      toast.success(copy.saveDetails);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-soft p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ChannelBadge channel={booking.channel as Channel} />
        <StatusBadge state="needs_details" />
        <span className="text-sm text-muted-foreground">
          {roomName} · {formatUkDate(booking.check_in_date)} →{" "}
          {formatUkDate(booking.check_out_date)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`n-${booking.id}`}>Guest name</Label>
          <Input
            id={`n-${booking.id}`}
            className="h-12"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Who is arriving?"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`t-${booking.id}`}>Arrival</Label>
          <Input
            id={`t-${booking.id}`}
            type="time"
            className="h-12"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`g-${booking.id}`}>Guests</Label>
          <Input
            id={`g-${booking.id}`}
            type="number"
            min={1}
            max={12}
            className="h-12"
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
          />
        </div>
        <Button className="h-12" onClick={onSave} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {copy.saveDetails}
        </Button>
      </div>
    </div>
  );
}

function TodayPage() {
  const workspace = useWorkspace();
  const properties = workspace.data?.properties as Array<{ id: string; name: string }> | undefined;
  const { selectedId, select } = useSelectedProperty(properties);
  const board = usePropertyBoard(selectedId);

  if (workspace.isLoading || board.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!properties || properties.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader title={copy.title} subtitle={copy.subtitle} />
        <div className="mt-6">
          <EmptyState
            icon={Sparkles}
            title="No rooms set up yet"
            body="Add your first property in Settings, or load the demo rooms to have a look around."
          />
        </div>
      </div>
    );
  }

  const data = board.data;
  const rooms = (data?.rooms ?? []) as Array<{ id: string; display_name: string }>;
  const roomName = (id: string | null) =>
    rooms.find((r) => r.id === id)?.display_name ?? "No room allocated";
  const todayIso = data?.today ?? new Date().toISOString().slice(0, 10);
  const all = (data?.bookings ?? []) as Booking[];
  const live = all.filter((b) => b.status !== "cancelled");

  const withState = live.map((b) => ({ b, state: stayState(b, todayIso) }));
  const arriving = withState.filter((x) => x.state === "arriving_today");
  const inStay = withState.filter((x) => x.state === "in_stay");
  const departing = withState.filter((x) => x.state === "departing_today");
  const needsDetails = withState.filter((x) => x.state === "needs_details");

  const windowsToday = ((data?.windows ?? []) as Array<{
    id: string;
    day_of_week: number | null;
    start_time: string | null;
    end_time: string | null;
    reason: string | null;
    room_id: string | null;
  }>).filter((w) => w.day_of_week !== null && w.day_of_week === dayOfWeek(todayIso));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title={copy.title}
        subtitle={`${formatUkDate(todayIso, { withYear: true })} · ${copy.subtitle}`}
        actions={
          <PropertyPicker properties={properties} value={selectedId} onChange={select} />
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={DoorOpen} label={copy.arriving} value={arriving.length} />
        <StatCard icon={BedDouble} label={copy.inStay} value={inStay.length} />
        <StatCard icon={CalendarClock} label={copy.departing} value={departing.length} />
        <StatCard icon={Sparkles} label={copy.actionRequired} value={needsDetails.length} />
      </div>

      {windowsToday.length > 0 ? (
        <div className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm">
          <span className="font-medium">{copy.cleaningToday}: </span>
          {windowsToday
            .map(
              (w) =>
                `${formatUkTime(w.start_time)}–${formatUkTime(w.end_time)} ${
                  w.reason ?? "Cleaning"
                }`,
            )
            .join(" · ")}
        </div>
      ) : null}

      {needsDetails.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-xl">{copy.actionRequired}</h2>
            <p className="text-sm text-muted-foreground">{copy.actionBody}</p>
          </div>
          {needsDetails.map(({ b }) => (
            <NeedsDetailsCard key={b.id} booking={b} roomName={roomName(b.room_id)} />
          ))}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xl">{copy.arriving}</h2>
        {arriving.length === 0 ? (
          <EmptyState icon={DoorOpen} title={copy.noArrivals} />
        ) : (
          <ul className="card-soft overflow-hidden p-0">
            {arriving.map(({ b, state }) => (
              <BookingRow key={b.id} booking={b} roomName={roomName(b.room_id)} state={state} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl">{copy.inStay}</h2>
        {inStay.length === 0 ? (
          <EmptyState icon={BedDouble} title={copy.noStays} />
        ) : (
          <ul className="card-soft overflow-hidden p-0">
            {inStay.map(({ b, state }) => (
              <BookingRow key={b.id} booking={b} roomName={roomName(b.room_id)} state={state} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl">{copy.departing}</h2>
        {departing.length === 0 ? (
          <EmptyState icon={CalendarClock} title={copy.noDepartures} />
        ) : (
          <ul className="card-soft overflow-hidden p-0">
            {departing.map(({ b, state }) => (
              <BookingRow key={b.id} booking={b} roomName={roomName(b.room_id)} state={state} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
