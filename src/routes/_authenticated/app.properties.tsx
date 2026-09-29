import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BedDouble, Home, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/host/EmptyState";
import { PageHeader } from "@/components/host/PageHeader";
import { CheckinSettings } from "@/components/host/CheckinSettings";
import { PropertyPicker } from "@/components/host/PropertyPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { common, properties as copy } from "@/content/copy";
import { usePropertyBoard, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { formatUkTime } from "@/lib/dates";
import {
  deleteRoom,
  deleteUnavailability,
  saveProperty,
  saveRoom,
  saveUnavailability,
} from "@/lib/host.functions";

export const Route = createFileRoute("/_authenticated/app/properties")({
  head: () => ({
    meta: [
      { title: "Properties · Latchkey host dashboard" },
      {
        name: "description",
        content: "Manage your rooms, door details, house rules and cleaning windows.",
      },
    ],
  }),
  component: PropertiesPage,
});

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Room = {
  id: string;
  room_number: string | null;
  display_name: string;
  public_title: string | null;
  description: string | null;
  max_guests: number;
  has_ensuite: boolean;
  sort_order: number;
  active: boolean;
};

type Property = {
  id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  short_code: string;
  check_in_pin: string | null;
  timezone: string | null;
  default_check_in_time: string;
  default_check_out_time: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
  parking_notes: string | null;
  wifi_name: string | null;
  wifi_password: string | null;
  host_contact_name: string | null;
  host_contact_phone: string | null;
};

function RoomDialog({
  open,
  onOpenChange,
  propertyId,
  room,
  nextOrder,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propertyId: string;
  room: Room | null;
  nextOrder: number;
}) {
  const save = useServerFn(saveRoom);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    display_name: room?.display_name ?? "",
    room_number: room?.room_number ?? "",
    public_title: room?.public_title ?? "",
    description: room?.description ?? "",
    max_guests: room?.max_guests ?? 2,
    has_ensuite: room?.has_ensuite ?? false,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save({
        data: {
          ...(room ? { id: room.id } : {}),
          property_id: propertyId,
          display_name: form.display_name.trim(),
          room_number: form.room_number.trim() || null,
          public_title: form.public_title.trim() || null,
          description: form.description.trim() || null,
          max_guests: Number(form.max_guests) || 2,
          has_ensuite: form.has_ensuite,
          sort_order: room?.sort_order ?? nextOrder,
          active: room?.active ?? true,
        },
      });
      await qc.invalidateQueries({ queryKey: ["board"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {room ? "Edit room" : copy.addRoom}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="rn">Room name</Label>
            <Input
              id="rn"
              className="h-12"
              required
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              placeholder="Garden Room"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rnum">Room number</Label>
              <Input
                id="rnum"
                className="h-12"
                value={form.room_number}
                onChange={(e) => setForm((f) => ({ ...f, room_number: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mg">Sleeps</Label>
              <Input
                id="mg"
                type="number"
                min={1}
                max={12}
                className="h-12"
                value={form.max_guests}
                onChange={(e) => setForm((f) => ({ ...f, max_guests: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pt">Title guests see</Label>
            <Input
              id="pt"
              className="h-12"
              value={form.public_title}
              onChange={(e) => setForm((f) => ({ ...f, public_title: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rd">Description</Label>
            <Textarea
              id="rd"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5 rounded border-input"
              checked={form.has_ensuite}
              onChange={(e) => setForm((f) => ({ ...f, has_ensuite: e.target.checked }))}
            />
            Has an en-suite bathroom
          </label>
          <DialogFooter>
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

function PropertyDialog({
  open,
  onOpenChange,
  property,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  property: Property;
}) {
  const save = useServerFn(saveProperty);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: property.name,
    address: property.address ?? "",
    postcode: property.postcode ?? "",
    short_code: property.short_code,
    check_in_pin: property.check_in_pin ?? "",
    default_check_in_time: property.default_check_in_time.slice(0, 5),
    default_check_out_time: property.default_check_out_time.slice(0, 5),
    quiet_hours_start: property.quiet_hours_start.slice(0, 5),
    quiet_hours_end: property.quiet_hours_end.slice(0, 5),
    parking_notes: property.parking_notes ?? "",
    wifi_name: property.wifi_name ?? "",
    wifi_password: property.wifi_password ?? "",
    host_contact_name: property.host_contact_name ?? "",
    host_contact_phone: property.host_contact_phone ?? "",
  });

  const workspace = useWorkspace();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save({
        data: {
          id: property.id,
          hostId: workspace.data!.hostId,
          name: form.name.trim(),
          address: form.address.trim() || null,
          postcode: form.postcode.trim() || null,
          short_code: form.short_code.trim().toLowerCase(),
          check_in_pin: /^\d{6}$/.test(form.check_in_pin) ? form.check_in_pin : null,
          timezone: property.timezone,
          default_check_in_time: form.default_check_in_time,
          default_check_out_time: form.default_check_out_time,
          quiet_hours_start: form.quiet_hours_start,
          quiet_hours_end: form.quiet_hours_end,
          parking_notes: form.parking_notes.trim() || null,
          wifi_name: form.wifi_name.trim() || null,
          wifi_password: form.wifi_password.trim() || null,
          host_contact_name: form.host_contact_name.trim() || null,
          host_contact_phone: form.host_contact_phone.trim() || null,
        },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["board"] }),
        qc.invalidateQueries({ queryKey: ["workspace"] }),
      ]);
      toast.success("Property saved");
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
          <DialogTitle className="font-display text-xl">Edit property</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pn">Property name</Label>
            <Input
              id="pn"
              className="h-12"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ad">Address</Label>
            <Input
              id="ad"
              className="h-12"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pc">Postcode</Label>
            <Input
              id="pc"
              className="h-12"
              value={form.postcode}
              onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sc">{copy.guestLink}</Label>
            <Input
              id="sc"
              className="h-12"
              value={form.short_code}
              onChange={(e) => setForm((f) => ({ ...f, short_code: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pin">{copy.doorPin}</Label>
            <Input
              id="pin"
              inputMode="numeric"
              maxLength={6}
              className="h-12"
              value={form.check_in_pin}
              onChange={(e) =>
                setForm((f) => ({ ...f, check_in_pin: e.target.value.replace(/\D/g, "") }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ci">Check-in from</Label>
            <Input
              id="ci"
              type="time"
              className="h-12"
              value={form.default_check_in_time}
              onChange={(e) => setForm((f) => ({ ...f, default_check_in_time: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co">Check-out by</Label>
            <Input
              id="co"
              type="time"
              className="h-12"
              value={form.default_check_out_time}
              onChange={(e) => setForm((f) => ({ ...f, default_check_out_time: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qs">Quiet hours from</Label>
            <Input
              id="qs"
              type="time"
              className="h-12"
              value={form.quiet_hours_start}
              onChange={(e) => setForm((f) => ({ ...f, quiet_hours_start: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qe">Quiet hours until</Label>
            <Input
              id="qe"
              type="time"
              className="h-12"
              value={form.quiet_hours_end}
              onChange={(e) => setForm((f) => ({ ...f, quiet_hours_end: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wn">Wi-Fi name</Label>
            <Input
              id="wn"
              className="h-12"
              value={form.wifi_name}
              onChange={(e) => setForm((f) => ({ ...f, wifi_name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wp">Wi-Fi password</Label>
            <Input
              id="wp"
              className="h-12"
              value={form.wifi_password}
              onChange={(e) => setForm((f) => ({ ...f, wifi_password: e.target.value }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pk">Parking notes</Label>
            <Textarea
              id="pk"
              rows={2}
              value={form.parking_notes}
              onChange={(e) => setForm((f) => ({ ...f, parking_notes: e.target.value }))}
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

function WindowEditor({
  propertyId,
  rooms,
  windows,
}: {
  propertyId: string;
  rooms: Room[];
  windows: Array<{
    id: string;
    room_id: string | null;
    day_of_week: number | null;
    start_time: string | null;
    end_time: string | null;
    reason: string | null;
  }>;
}) {
  const save = useServerFn(saveUnavailability);
  const remove = useServerFn(deleteUnavailability);
  const qc = useQueryClient();
  const [day, setDay] = useState("2");
  const [roomId, setRoomId] = useState("all");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("15:00");
  const [reason, setReason] = useState("Cleaning");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      await save({
        data: {
          property_id: propertyId,
          room_id: roomId === "all" ? null : roomId,
          reason: reason.trim() || null,
          day_of_week: Number(day),
          start_time: start,
          end_time: end,
          starts_at: null,
          ends_at: null,
        },
      });
      await qc.invalidateQueries({ queryKey: ["board"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  async function drop(id: string) {
    await remove({ data: { id } });
    await qc.invalidateQueries({ queryKey: ["board"] });
  }

  return (
    <section className="card-soft p-5">
      <h2 className="text-lg">{copy.cleaning}</h2>

      {windows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{copy.noWindows}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {windows.map((w) => (
            <li key={w.id} className="flex items-center gap-3 py-3 text-sm">
              <span className="min-w-0 flex-1">
                {copy.weekly} {DAYS[w.day_of_week ?? 0]} · {formatUkTime(w.start_time)}–
                {formatUkTime(w.end_time)} ·{" "}
                {w.room_id
                  ? (rooms.find((r) => r.id === w.room_id)?.display_name ?? copy.wholeHouse)
                  : copy.wholeHouse}
                {w.reason ? ` · ${w.reason}` : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => drop(w.id)}
                aria-label={`${common.remove} window`}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label>Day</Label>
          <Select value={day} onValueChange={setDay}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS.map((d, i) => (
                <SelectItem key={d} value={String(i)}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Room</Label>
          <Select value={roomId} onValueChange={setRoomId}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{copy.wholeHouse}</SelectItem>
              {rooms.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ws">From</Label>
          <Input
            id="ws"
            type="time"
            className="h-11"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="we">Until</Label>
          <Input
            id="we"
            type="time"
            className="h-11"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <Button className="h-11" onClick={add} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {copy.addWindow}
        </Button>
      </div>

      <div className="mt-3">
        <Label htmlFor="wr" className="sr-only">
          Reason
        </Label>
        <Input
          id="wr"
          className="h-11"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What is this window for?"
        />
      </div>
    </section>
  );
}

function PropertiesPage() {
  const workspace = useWorkspace();
  const propertyList = workspace.data?.properties as Array<{ id: string; name: string }> | undefined;
  const { selectedId, select } = useSelectedProperty(propertyList);
  const board = usePropertyBoard(selectedId);
  const removeRoom = useServerFn(deleteRoom);
  const qc = useQueryClient();

  const [roomDialog, setRoomDialog] = useState<{ open: boolean; room: Room | null }>({
    open: false,
    room: null,
  });
  const [propDialog, setPropDialog] = useState(false);

  if (workspace.isLoading || board.isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!propertyList || propertyList.length === 0 || !selectedId) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader title={copy.title} subtitle={copy.subtitle} />
        <div className="mt-6">
          <EmptyState icon={Home} title={copy.noProperties} />
        </div>
      </div>
    );
  }

  const property = board.data?.property as Property | null;
  const rooms = (board.data?.rooms ?? []) as Room[];
  const windows = (board.data?.windows ?? []) as Array<{
    id: string;
    room_id: string | null;
    day_of_week: number | null;
    start_time: string | null;
    end_time: string | null;
    reason: string | null;
  }>;

  async function dropRoom(id: string) {
    try {
      await removeRoom({ data: { id } });
      await qc.invalidateQueries({ queryKey: ["board"] });
    } catch {
      toast.error("That room still has bookings, so it cannot be removed.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <>
            <PropertyPicker properties={propertyList} value={selectedId} onChange={select} />
            <Button variant="outline" onClick={() => setPropDialog(true)}>
              {common.edit}
            </Button>
          </>
        }
      />

      {property ? (
        <section className="card-soft p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl">{property.name}</h2>
              <p className="text-sm text-muted-foreground">
                {[property.address, property.postcode].filter(Boolean).join(", ") ||
                  "No address yet"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">/p/{property.short_code}</Badge>
              {property.check_in_pin ? (
                <Badge variant="outline">
                  {copy.doorPin} {property.check_in_pin}
                </Badge>
              ) : null}
            </div>
          </div>

          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">{copy.checkInWindow}</dt>
              <dd className="font-medium">
                {formatUkTime(property.default_check_in_time)} →{" "}
                {formatUkTime(property.default_check_out_time)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{copy.quietHours}</dt>
              <dd className="font-medium">
                {formatUkTime(property.quiet_hours_start)} –{" "}
                {formatUkTime(property.quiet_hours_end)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{copy.wifi}</dt>
              <dd className="font-medium">{property.wifi_name || "Not set"}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {property ? (
        <CheckinSettings
          property={property as unknown as { id: string; short_code: string; checkin_methods: unknown }}
        />
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl">Rooms</h2>
          <Button onClick={() => setRoomDialog({ open: true, room: null })}>
            <Plus className="size-4" />
            {copy.addRoom}
          </Button>
        </div>

        {rooms.length === 0 ? (
          <EmptyState icon={BedDouble} title={copy.noRooms} />
        ) : (
          <ul className="card-soft overflow-hidden p-0">
            {rooms.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-4 last:border-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.display_name}</span>
                  <span className="block text-sm text-muted-foreground">
                    Sleeps {r.max_guests}
                    {r.has_ensuite ? " · En-suite" : ""}
                    {r.room_number ? ` · Room ${r.room_number}` : ""}
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRoomDialog({ open: true, room: r })}
                >
                  {common.edit}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dropRoom(r.id)}
                  aria-label={`${common.remove} ${r.display_name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
                <RoomFeedPanel roomId={r.id} roomName={r.display_name} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <WindowEditor propertyId={selectedId} rooms={rooms} windows={windows} />

      {roomDialog.open ? (
        <RoomDialog
          open={roomDialog.open}
          onOpenChange={(v) => setRoomDialog({ open: v, room: v ? roomDialog.room : null })}
          propertyId={selectedId}
          room={roomDialog.room}
          nextOrder={rooms.length}
        />
      ) : null}

      {property && propDialog ? (
        <PropertyDialog open={propDialog} onOpenChange={setPropDialog} property={property} />
      ) : null}
    </div>
  );
}
