import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLandOn } from "@/hooks/use-land-on";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BedDouble, Home, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/host/EmptyState";
import { PageHeader } from "@/components/host/PageHeader";
import { ListingImportButton } from "@/components/host/ListingImport";
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
import { common, listingLinksCopy as linksCopy, properties as copy, roomWifiCopy } from "@/content/copy";
import { COUNTRY_CHOICES, region } from "@/lib/regions";
import { usePropertyBoard, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { formatUkTime } from "@/lib/dates";
import { DoorPinField, GuestLinkField } from "@/components/host/PropertyCodeFields";
import { deleteRoom, saveListingLinks, saveProperty, saveRoom, saveRoomWifi } from "@/lib/host.functions";
import { ListingLinkIcons, ListingLinksField, linksText } from "@/components/host/ListingLinks";
import { normaliseListingLinks } from "@/lib/listing-links";
import { rebrand } from "@/lib/brand";

// "checkin", "records" and "cleaning" moved (Settings, Housekeeping); old links still open the page.
const FOCUS = ["property", "checkin", "records", "rooms", "cleaning"] as const;

export const Route = createFileRoute("/_authenticated/app/properties")({
  // ?focus=<section> lands on that part of the property (e.g. cleaning times).
  validateSearch: (s: Record<string, unknown>): { focus?: (typeof FOCUS)[number] } =>
    typeof s["focus"] === "string" && (FOCUS as readonly string[]).includes(s["focus"]) ? { focus: s["focus"] as (typeof FOCUS)[number] } : {},
  head: () => ({
    meta: [
      { title: rebrand("Properties · Latchkey host dashboard") },
      {
        name: "description",
        content: "Manage your property, rooms, door details and check-in.",
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
  children_allowed?: boolean;
  has_ensuite: boolean;
  sort_order: number;
  active: boolean;
  listing_links?: unknown;
  wifi_name?: string | null;
  wifi_password?: string | null;
};

type Property = {
  id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  country_code: string | null;
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
  listing_links?: unknown;
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
  const saveLinks = useServerFn(saveListingLinks);
  const saveWifi = useServerFn(saveRoomWifi);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState(() => linksText(room?.listing_links));
  // The room's own network; empty uses the property's.
  const [wifi, setWifi] = useState({ name: room?.wifi_name ?? "", password: room?.wifi_password ?? "" });
  const [form, setForm] = useState({
    display_name: room?.display_name ?? "",
    room_number: room?.room_number ?? "",
    public_title: room?.public_title ?? "",
    description: room?.description ?? "",
    max_guests: room?.max_guests ?? 2,
    children_allowed: room?.children_allowed ?? true,
    has_ensuite: room?.has_ensuite ?? false,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await save({
        data: {
          ...(room ? { id: room.id } : {}),
          property_id: propertyId,
          display_name: form.display_name.trim(),
          room_number: form.room_number.trim() || null,
          public_title: form.public_title.trim() || null,
          description: form.description.trim() || null,
          max_guests: Math.min(30, Math.max(1, Number(form.max_guests) || 2)),
          children_allowed: form.children_allowed,
          has_ensuite: form.has_ensuite,
          sort_order: room?.sort_order ?? nextOrder,
          active: room?.active ?? true,
        },
      });
      if (links !== linksText(room?.listing_links)) {
        const roomId = room?.id ?? (saved as { id?: string } | null)?.id;
        if (roomId) await saveLinks({ data: { propertyId, roomId, urls: normaliseListingLinks(links).map((l) => l.url) } });
      }
      if (wifi.name !== (room?.wifi_name ?? "") || wifi.password !== (room?.wifi_password ?? "")) {
        const roomId = room?.id ?? (saved as { id?: string } | null)?.id;
        if (roomId) await saveWifi({ data: { roomId, name: wifi.name, password: wifi.password } });
      }
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
              <Label htmlFor="mg">Sleeps (total people)</Label>
              <Input
                id="mg"
                type="number"
                inputMode="numeric"
                required
                min={1}
                max={30}
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
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5 rounded border-input"
              checked={form.children_allowed}
              onChange={(e) => setForm((f) => ({ ...f, children_allowed: e.target.checked }))}
            />
            Children welcome (they give their age at check-in, no ID)
          </label>
          <fieldset className="space-y-2 rounded-xl border border-border p-3">
            <legend className="px-1 text-sm font-medium">{roomWifiCopy.title}</legend>
            <p className="text-xs text-muted-foreground">{roomWifiCopy.hint}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="rw-name" className="text-xs">{roomWifiCopy.name}</Label>
                <Input id="rw-name" className="h-11" maxLength={64} autoComplete="off" value={wifi.name} onChange={(e) => setWifi((w) => ({ ...w, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rw-pass" className="text-xs">{roomWifiCopy.password}</Label>
                <Input id="rw-pass" className="h-11" maxLength={128} autoComplete="off" disabled={!wifi.name.trim()} value={wifi.password} onChange={(e) => setWifi((w) => ({ ...w, password: e.target.value }))} />
              </div>
            </div>
          </fieldset>
          <ListingLinksField id="room-links" value={links} onChange={setLinks} hint={linksCopy.roomHint} />
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
  const saveLinks = useServerFn(saveListingLinks);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState(() => linksText(property.listing_links));
  const [form, setForm] = useState({
    name: property.name,
    address: property.address ?? "",
    postcode: property.postcode ?? "",
    country_code: (property.country_code ?? "GB").toUpperCase(),
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
  const [linkOk, setLinkOk] = useState(true);
  const [pinOk, setPinOk] = useState(true);

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
          country_code: form.country_code,
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
      if (links !== linksText(property.listing_links)) await saveLinks({ data: { propertyId: property.id, roomId: null, urls: normaliseListingLinks(links).map((l) => l.url) } });
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
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="cn">Country</Label>
            <Select
              value={form.country_code}
              onValueChange={(v) => setForm((f) => ({ ...f, country_code: v }))}
            >
              <SelectTrigger id="cn" className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRY_CHOICES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.country}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ad">{region(form.country_code).addressLabel}</Label>
            <Input
              id="ad"
              className="h-12"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pc">{region(form.country_code).postcodeLabel}</Label>
            <Input
              id="pc"
              className="h-12"
              value={form.postcode}
              onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))}
            />
          </div>
          <GuestLinkField
            id="sc"
            label={copy.guestLink}
            value={form.short_code}
            onChange={(v) => setForm((f) => ({ ...f, short_code: v }))}
            propertyId={property.id}
            context={{ name: form.name, address: form.address, postcode: form.postcode }}
            onValid={setLinkOk}
          />
          <DoorPinField
            id="pin"
            label={copy.doorPin}
            value={form.check_in_pin}
            onChange={(v) => setForm((f) => ({ ...f, check_in_pin: v }))}
            propertyId={property.id}
            onValid={setPinOk}
          />
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
          <div className="sm:col-span-2">
            <ListingLinksField id="property-links" value={links} onChange={setLinks} hint={linksCopy.propertyHint} />
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
            <Button type="submit" disabled={busy || !linkOk || !pinOk}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PropertiesPage() {
  const workspace = useWorkspace();
  const propertyList = workspace.data?.properties as Array<{ id: string; name: string }> | undefined;
  const { selectedId, select } = useSelectedProperty(propertyList);
  const board = usePropertyBoard(selectedId);
  const { focus } = Route.useSearch();
  useLandOn(focus ? `property-${focus}` : null, !board.isLoading && !!board.data);
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
            {/* Experimental (Latchkey admin switches it on): fill this property in from the host's own listings. */}
            {property ? <ListingImportButton property={property} rooms={rooms} /> : null}
            <Button variant="outline" onClick={() => setPropDialog(true)}>
              {common.edit}
            </Button>
          </>
        }
      />

      {property ? (
        <section id="property-property" className="card-soft scroll-mt-24 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl">{property.name}</h2>
              <p className="text-sm text-muted-foreground">
                {[property.address, property.postcode].filter(Boolean).join(", ") ||
                  "No address yet"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* The property's own pages on the booking sites, one tap away. */}
              <ListingLinkIcons links={property.listing_links} />
              <Badge variant="secondary">/kiosk/{property.short_code}</Badge>
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

      {/* Moved: guest records and the kiosk at rest to Settings, cleaning times to Housekeeping. */}
      <nav aria-label={copy.elsewhereTitle} className="card-soft p-5">
        <h2 className="text-lg">{copy.elsewhereTitle}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ["checkin", "/app/settings", { focus: "checkin" }],
            ["records", "/app/settings", { focus: "records" }],
            ["stayAccess", "/app/settings", { focus: "stayAccess" }],
            ["kioskRest", "/app/settings", { focus: "kioskRest" }],
            ["schedule", "/app/housekeeping", { focus: "schedule" }],
            ["calendars", "/app/connections", {}],
          ] as const).map(([key, to, search]) => (
            <li key={key}>
              <Link to={to} search={search} className="flex h-full flex-col rounded-xl border border-border p-3 text-sm hover:bg-secondary">
                <span className="font-medium">{copy.elsewhere[key]![0]}</span>
                <span className="text-muted-foreground">{copy.elsewhere[key]![1]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section id="property-rooms" className="scroll-mt-24 space-y-3 rounded-2xl">
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
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate font-medium">{r.display_name}</span>
                    <ListingLinkIcons links={r.listing_links} className="inline-flex shrink-0 items-center" />
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    Sleeps {r.max_guests}
                    {r.children_allowed === false ? " · Adults only" : ""}
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
              </li>
            ))}
          </ul>
        )}
      </section>


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
