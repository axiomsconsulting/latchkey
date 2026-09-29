import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ChannelBadge, type Channel } from "@/components/ChannelBadge";
import { EmptyState } from "@/components/host/EmptyState";
import { PageHeader } from "@/components/host/PageHeader";
import { PropertyPicker } from "@/components/host/PropertyPicker";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { calendarGuides, calendarUi, channels, common, connections as copy } from "@/content/copy";
import {
  useConnections,
  usePropertyBoard,
  useSelectedProperty,
  useWorkspace,
} from "@/hooks/use-host-data";
import { formatUkDate, formatUkTime } from "@/lib/dates";
import {
  deleteConnection,
  saveConnection,
  syncConnectionNow,
  testFeed,
} from "@/lib/host.functions";

export const Route = createFileRoute("/_authenticated/app/connections")({
  head: () => ({
    meta: [
      { title: "Connections · Latchkey host dashboard" },
      {
        name: "description",
        content: "Connect channel calendars so every booking lands in one place automatically.",
      },
    ],
  }),
  component: ConnectionsPage,
});

const CHANNEL_KEYS = ["airbnb", "booking_com", "vrbo", "homestay", "agoda", "direct", "other"] as const;

/** Friendly checks before we bother the platform with a request. */
function urlIssue(raw: string): string | null {
  const u = raw.trim();
  if (!u) return null;
  if (!u.startsWith("https://")) return calendarUi.errors.https;
  if (!/\.ics|\/calendar|\/ical/i.test(u)) return calendarUi.errors.notCalendar;
  return null;
}

type Connection = {
  id: string;
  channel: string;
  listing_name: string | null;
  masked_url: string | null;
  room_id: string | null;
  last_synced_at: string | null;
  sync_status: string;
  last_error: string | null;
  rooms?: { display_name: string } | null;
};

type Run = {
  id: string;
  connection_id: string;
  status: string;
  created_count: number;
  updated_count: number;
  cancelled_count: number;
  skipped_count: number;
  warnings: string[];
  error_message: string | null;
  started_at: string;
};

function AddConnectionDialog({
  open,
  onOpenChange,
  propertyId,
  rooms,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propertyId: string;
  rooms: Array<{ id: string; display_name: string }>;
}) {
  const test = useServerFn(testFeed);
  const save = useServerFn(saveConnection);
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [channel, setChannel] = useState<(typeof CHANNEL_KEYS)[number]>("airbnb");
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "none");
  const [listing, setListing] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<
    | null
    | {
        ok: boolean;
        message?: string;
        total?: number;
        preview?: Array<{
          guest: string | null;
          checkIn: string;
          checkOut: string;
          reference: string | null;
        }>;
      }
  >(null);

  async function runTest() {
    setTesting(true);
    try {
      const res = await test({ data: { url: url.trim(), channel } });
      setPreview(res.ok && !res.total ? { ok: false, message: calendarUi.errors.noEvents } : res);
    } catch (err) {
      setPreview({ ok: false, message: err instanceof Error ? err.message : common.errorBody });
    } finally {
      setTesting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await save({
        data: {
          property_id: propertyId,
          room_id: roomId === "none" ? null : roomId,
          channel,
          listing_name: listing.trim() || null,
          ical_url: url.trim(),
        },
      });
      await qc.invalidateQueries({ queryKey: ["connections"] });
      toast.success("Calendar link added", { description: calendarUi.howItWorks });
      setUrl("");
      setPreview(null);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{copy.add}</DialogTitle>
          <DialogDescription>{copy.linkHelp}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="ical">{copy.linkLabel}</Label>
            <Input
              id="ical"
              className="h-12"
              required
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setPreview(null);
              }}
              placeholder="https://www.airbnb.co.uk/calendar/ical/…"
            />
            {urlIssue(url) ? (
              <p className="text-sm text-destructive">{urlIssue(url)}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select
                value={channel}
                onValueChange={(v) => setChannel(v as (typeof CHANNEL_KEYS)[number])}
              >
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
              <Label>{copy.roomLabel}</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked to a room</SelectItem>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <aside className="rounded-2xl border border-border bg-secondary/40 p-4">
            <p className="font-medium">{calendarGuides[channel]?.title ?? calendarUi.helpTitle}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
              {(calendarGuides[channel]?.steps ?? []).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            {calendarGuides[channel]?.note ? (
              <p className="mt-2 text-sm text-muted-foreground">{calendarGuides[channel]?.note}</p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">{calendarUi.stepsChecked}</p>
            {calendarGuides[channel]?.helpUrl ? (
              <a
                className="mt-1 inline-block text-sm underline"
                href={calendarGuides[channel]!.helpUrl!}
                target="_blank"
                rel="noreferrer noopener"
              >
                {calendarGuides[channel]?.helpLabel ?? calendarUi.openHelp}
              </a>
            ) : null}
          </aside>



          <div className="space-y-2">
            <Label htmlFor="ln">{copy.listingLabel}</Label>
            <Input
              id="ln"
              className="h-12"
              value={listing}
              onChange={(e) => setListing(e.target.value)}
              placeholder="Garden Room, quiet double"
            />
          </div>

          {preview ? (
            <div
              className={
                preview.ok
                  ? "rounded-xl border border-border bg-muted p-4 text-sm"
                  : "rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
              }
            >
              {preview.ok ? (
                <>
                  <p className="font-medium">
                    {copy.testOk} {preview.total} stays found.
                  </p>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {(preview.preview ?? []).map((p, i) => (
                      <li key={i}>
                        {p.guest ?? "Guest name to confirm"} · {formatUkDate(p.checkIn)} →{" "}
                        {formatUkDate(p.checkOut)}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>{preview.message}</p>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={runTest}
              disabled={testing || url.trim().length < 8}
            >
              {testing ? <Loader2 className="size-4 animate-spin" /> : null}
              {copy.test}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConnectionsPage() {
  const workspace = useWorkspace();
  const properties = workspace.data?.properties as Array<{ id: string; name: string }> | undefined;
  const { selectedId, select } = useSelectedProperty(properties);
  const board = usePropertyBoard(selectedId);
  const list = useConnections(selectedId);
  const sync = useServerFn(syncConnectionNow);
  const remove = useServerFn(deleteConnection);
  const qc = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const rooms = (board.data?.rooms ?? []) as Array<{ id: string; display_name: string }>;
  const items = (list.data?.connections ?? []) as Connection[];
  const runs = (list.data?.runs ?? []) as Run[];

  async function syncOne(id: string) {
    setBusyId(id);
    try {
      const res = await sync({ data: { id } });
      if (res.ok) toast.success(copy.syncedToast);
      else toast.error(res.message);
      await qc.invalidateQueries({ queryKey: ["connections"] });
      await qc.invalidateQueries({ queryKey: ["board"] });
    } finally {
      setBusyId(null);
    }
  }

  async function dropOne(id: string) {
    if (!window.confirm(copy.removeConfirm)) return;
    await remove({ data: { id } });
    await qc.invalidateQueries({ queryKey: ["connections"] });
  }

  if (workspace.isLoading || list.isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!properties || properties.length === 0 || !selectedId) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader title={copy.title} subtitle={copy.subtitle} />
        <div className="mt-6">
          <EmptyState
            icon={Plug}
            title="No rooms set up yet"
            body="Add a property first, then connect your channel calendars."
          />
        </div>
      </div>
    );
  }

  const warnings = items.filter((c) => c.sync_status === "warning" || c.sync_status === "error");

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <>
            <PropertyPicker properties={properties} value={selectedId} onChange={select} />
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              {copy.add}
            </Button>
          </>
        }
      />

      {warnings.length > 0 ? (
        <div className="flex gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4">
          <AlertTriangle className="size-5 shrink-0 text-accent" />
          <div className="text-sm">
            <p className="font-medium">{copy.conflictTitle}</p>
            <ul className="mt-1 space-y-1 text-muted-foreground">
              {warnings.map((c) => (
                <li key={c.id}>
                  {channels[c.channel as Channel]}
                  {c.listing_name ? ` · ${c.listing_name}` : ""} —{" "}
                  {c.last_error ?? "Check this calendar."}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {rooms.length > 0 && items.length > 0 ? (
        <section className="card-soft p-4">
          <h2 className="text-lg">{copy.byRoomTitle}</h2>
          <p className="text-sm text-muted-foreground">{copy.byRoomBody}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((r) => {
              const linked = items.filter((c) => c.room_id === r.id);
              return (
                <div key={r.id} className="rounded-xl border border-border p-3">
                  <p className="font-medium">{r.display_name}</p>
                  {linked.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">{copy.noLinks}</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {linked.map((c) => (
                        <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                          <ChannelBadge channel={c.channel as Channel} />
                          <span className="text-muted-foreground">
                            {c.last_synced_at
                              ? `${formatUkDate(c.last_synced_at.slice(0, 10))}, ${formatUkTime(
                                  new Date(c.last_synced_at).toLocaleTimeString("en-GB", {
                                    timeZone: "Europe/London",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }),
                                )}`
                              : copy.never}
                          </span>
                          {c.sync_status === "warning" || c.sync_status === "error" ? (
                            <AlertTriangle className="size-4 text-accent" aria-label="Needs a look" />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon={Plug}
          title={copy.empty}
          action={
            <Button className="mt-2" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              {copy.add}
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="card-soft p-4">
              <div className="flex flex-wrap items-center gap-3">
                <ChannelBadge channel={c.channel as Channel} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {c.listing_name ?? channels[c.channel as Channel]}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {c.rooms?.display_name ?? "No room linked"} · {c.masked_url ?? "No link"}
                  </span>
                </span>
                {c.sync_status === "ok" ? (
                  <Badge variant="success">
                    <CheckCircle2 className="size-3.5" /> Working
                  </Badge>
                ) : c.sync_status === "never" ? (
                  <Badge variant="outline">{copy.never}</Badge>
                ) : (
                  <Badge variant="accent">
                    <AlertTriangle className="size-3.5" /> Needs a look
                  </Badge>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="mr-auto text-xs text-muted-foreground">
                  {copy.lastSynced}:{" "}
                  {c.last_synced_at
                    ? `${formatUkDate(c.last_synced_at.slice(0, 10))}, ${formatUkTime(
                        c.last_synced_at.slice(11, 16),
                      )}`
                    : copy.never}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncOne(c.id)}
                  disabled={busyId === c.id}
                >
                  {busyId === c.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {copy.syncNow}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setHistoryFor(historyFor === c.id ? null : c.id)}
                >
                  {copy.history}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dropOne(c.id)}
                  aria-label={common.remove}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {historyFor === c.id ? (
                <div className="mt-3 rounded-xl border border-border bg-surface p-3 text-sm">
                  {runs.filter((r) => r.connection_id === c.id).length === 0 ? (
                    <p className="text-muted-foreground">{copy.noHistory}</p>
                  ) : (
                    <ul className="space-y-2">
                      {runs
                        .filter((r) => r.connection_id === c.id)
                        .map((r) => (
                          <li key={r.id} className="text-muted-foreground">
                            {formatUkDate(r.started_at.slice(0, 10))},{" "}
                            {formatUkTime(r.started_at.slice(11, 16))} — {r.created_count} new,{" "}
                            {r.updated_count} updated, {r.cancelled_count} cancelled
                            {r.error_message ? ` · ${r.error_message}` : ""}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <section className="card-soft flex flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg">{copy.managerTitle}</h2>
          <p className="text-sm text-muted-foreground">{copy.managerBody}</p>
        </div>
        <Badge variant="outline">{copy.comingSoon}</Badge>
      </section>

      <section className="card-soft p-5">
        <p className="font-medium">{calendarUi.managerTitle}</p>
        <p className="text-sm text-muted-foreground">{calendarUi.managerBody}</p>
        <Badge className="mt-2" variant="secondary">Coming soon</Badge>
      </section>

      <AddConnectionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        propertyId={selectedId}
        rooms={rooms}
      />
    </div>
  );
}
