import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ChannelBadge, type Channel } from "@/components/ChannelBadge";
import { StatusBadge } from "@/components/host/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { common, today as copy } from "@/content/copy";
import { formatUkDate } from "@/lib/dates";
import { saveBooking } from "@/lib/host.functions";

export type NeedsDetailsBooking = {
  id: string;
  property_id: string;
  room_id: string | null;
  channel: string;
  guest_full_name: string | null;
  guest_count: number | null;
  reservation_code: string | null;
  phone_last4: string | null;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  notes: string | null;
};

/** A stay from a calendar feed without a guest name: add it here, or mark the nights closed. */
export function NeedsDetailsCard({
  booking,
  roomName,
  id,
  defaultCheckIn = "15:00",
}: {
  booking: NeedsDetailsBooking;
  roomName: string;
  id?: string;
  /** The property's check-in time, for a stay without one. */
  defaultCheckIn?: string;
}) {
  const save = useServerFn(saveBooking);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [time, setTime] = useState((booking.check_in_time ?? defaultCheckIn).slice(0, 5));
  const [guests, setGuests] = useState(booking.guest_count ?? 1);
  const [busy, setBusy] = useState(false);

  async function onSave(markBlocked = false) {
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
          status: markBlocked ? "blocked" : name.trim() ? "upcoming" : "needs_details",
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
    <div id={id} className="card-soft scroll-mt-24 p-4">
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
        <Button className="h-12" onClick={() => onSave()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {copy.saveDetails}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{copy.maybeBlock}</span>
        <Button variant="ghost" size="sm" onClick={() => onSave(true)} disabled={busy}>
          {copy.markBlocked}
        </Button>
      </div>
    </div>
  );
}
