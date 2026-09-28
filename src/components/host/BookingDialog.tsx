import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { bookings as copy, channels, common, statuses } from "@/content/copy";
import { saveBooking } from "@/lib/host.functions";

export type BookingRow = {
  id: string;
  property_id: string;
  room_id: string | null;
  channel: string;
  guest_full_name: string | null;
  reservation_code: string | null;
  guest_count: number;
  phone_last4: string | null;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: string;
  notes: string | null;
  source?: string;
  manual_fields?: string[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  rooms: Array<{ id: string; display_name: string }>;
  booking?: BookingRow | null;
  defaults?: { check_in_time?: string; check_out_time?: string };
};

const CHANNEL_KEYS = ["airbnb", "booking_com", "homestay", "direct", "other"] as const;
const STATUS_KEYS = [
  "needs_details",
  "upcoming",
  "checked_in",
  "checked_out",
  "cancelled",
  "flagged",
] as const;

function blank(propertyId: string, roomId: string | null, defaults?: Props["defaults"]) {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  return {
    property_id: propertyId,
    room_id: roomId,
    channel: "direct",
    guest_full_name: "",
    reservation_code: "",
    guest_count: 1,
    phone_last4: "",
    check_in_date: today,
    check_out_date: tomorrow,
    check_in_time: defaults?.check_in_time?.slice(0, 5) ?? "15:00",
    check_out_time: defaults?.check_out_time?.slice(0, 5) ?? "11:00",
    status: "upcoming",
    notes: "",
  };
}

export function BookingDialog({
  open,
  onOpenChange,
  propertyId,
  rooms,
  booking,
  defaults,
}: Props) {
  const save = useServerFn(saveBooking);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() =>
    blank(propertyId, rooms[0]?.id ?? null, defaults),
  );

  useEffect(() => {
    if (!open) return;
    if (booking) {
      setForm({
        property_id: booking.property_id,
        room_id: booking.room_id,
        channel: booking.channel,
        guest_full_name: booking.guest_full_name ?? "",
        reservation_code: booking.reservation_code ?? "",
        guest_count: booking.guest_count ?? 1,
        phone_last4: booking.phone_last4 ?? "",
        check_in_date: booking.check_in_date,
        check_out_date: booking.check_out_date,
        check_in_time: (booking.check_in_time ?? "15:00").slice(0, 5),
        check_out_time: (booking.check_out_time ?? "11:00").slice(0, 5),
        status: booking.status,
        notes: booking.notes ?? "",
      });
    } else {
      setForm(blank(propertyId, rooms[0]?.id ?? null, defaults));
    }
  }, [open, booking, propertyId, rooms, defaults]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.check_out_date <= form.check_in_date) {
      toast.error("The check-out date needs to be after the check-in date.");
      return;
    }
    setBusy(true);
    try {
      await save({
        data: {
          ...(booking ? { id: booking.id } : {}),
          property_id: propertyId,
          room_id: form.room_id,
          channel: form.channel as (typeof CHANNEL_KEYS)[number],
          guest_full_name: form.guest_full_name.trim() || null,
          reservation_code: form.reservation_code.trim() || null,
          guest_count: Number(form.guest_count) || 1,
          phone_last4: /^\d{4}$/.test(form.phone_last4) ? form.phone_last4 : null,
          check_in_date: form.check_in_date,
          check_out_date: form.check_out_date,
          check_in_time: form.check_in_time || null,
          check_out_time: form.check_out_time || null,
          status: form.status as (typeof STATUS_KEYS)[number],
          notes: form.notes.trim() || null,
        },
      });
      await qc.invalidateQueries({ queryKey: ["board"] });
      toast.success(common.save === "Save" ? "Booking saved" : common.save);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {booking ? copy.editBooking : copy.addBooking}
          </DialogTitle>
          <DialogDescription>{copy.manualNote}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="guest">Guest name</Label>
            <Input
              id="guest"
              className="h-12"
              value={form.guest_full_name}
              onChange={(e) => set("guest_full_name", e.target.value)}
              placeholder="As given on the booking"
            />
          </div>

          <div className="space-y-2">
            <Label>Room</Label>
            <Select
              value={form.room_id ?? "none"}
              onValueChange={(v) => set("room_id", v === "none" ? null : v)}
            >
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not allocated</SelectItem>
                {rooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Channel</Label>
            <Select value={form.channel} onValueChange={(v) => set("channel", v)}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_KEYS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {channels[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="in">Check-in date</Label>
            <Input
              id="in"
              type="date"
              className="h-12"
              value={form.check_in_date}
              onChange={(e) => set("check_in_date", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="out">Check-out date</Label>
            <Input
              id="out"
              type="date"
              className="h-12"
              value={form.check_out_date}
              onChange={(e) => set("check_out_date", e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="intime">Expected arrival</Label>
            <Input
              id="intime"
              type="time"
              className="h-12"
              value={form.check_in_time}
              onChange={(e) => set("check_in_time", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="outtime">Check-out time</Label>
            <Input
              id="outtime"
              type="time"
              className="h-12"
              value={form.check_out_time}
              onChange={(e) => set("check_out_time", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="guests">Guests</Label>
            <Input
              id="guests"
              type="number"
              min={1}
              max={12}
              className="h-12"
              value={form.guest_count}
              onChange={(e) => set("guest_count", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone, last 4 digits</Label>
            <Input
              id="phone"
              inputMode="numeric"
              maxLength={4}
              className="h-12"
              value={form.phone_last4}
              onChange={(e) => set("phone_last4", e.target.value.replace(/\D/g, ""))}
              placeholder="8842"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ref">Booking reference</Label>
            <Input
              id="ref"
              className="h-12"
              value={form.reservation_code}
              onChange={(e) => set("reservation_code", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_KEYS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statuses[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Anything you want to remember about this stay"
            />
          </div>

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {common.cancel}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
