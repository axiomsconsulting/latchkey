import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLandOn } from "@/hooks/use-land-on";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CalendarSync,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { ChannelBadge, type Channel } from "@/components/ChannelBadge";
import { ChannelIcon } from "@/components/ChannelIcon";
import { EmptyState } from "@/components/host/EmptyState";
import { PageHeader } from "@/components/host/PageHeader";
import { RoomFeedNote, RoomFeedPanel } from "@/components/host/RoomFeedPanel";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { calendarGuides, calendarUi, channels, common, connections as copy, feedCopy, linkTools } from "@/content/copy";
import { useBookingSites, useConnections, usePropertyBoard, useRole, useWorkspace } from "@/hooks/use-host-data";
import { platformKey, toChannel } from "@/lib/booking-sites";
import { formatUkDate, formatUkTime } from "@/lib/dates";
import { syncPropertyNow } from "@/lib/guests.functions";
import {
  deleteConnection,
  saveConnection,
  syncConnectionNow,
  testFeed,
} from "@/lib/host.functions";
import { explainSyncError, linkState } from "@/lib/sync-status";
import { rebrand } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/app/connections")({
  // ?link=<connection id> lands on that calendar link.
  validateSearch: (s: Record<string, unknown>): { link?: string } => (typeof s["link"] === "string" ? { link: s["link"] } : {}),
  head: () => ({
    meta: [
      { title: rebrand("Connections · Latchkey host dashboard") },
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
  site_key?: string | null;
  listing_name: string | null;
  masked_url: string | null;
  room_id: string | null;
  last_synced_at: string | null;
  sync_status: string;
  sync_started_at?: string | null;
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

/** Add a calendar link, or edit one: its link, room, platform or name. */
function ConnectionDialog({
  open,
  onOpenChange,
  propertyId,
  rooms,
  existing,
  roomIdDefault,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propertyId: string;
  rooms: Array<{ id: string; display_name: string }>;
  existing?: Connection | null;
  roomIdDefault?: string | null;
}) {
  const test = useServerFn(testFeed);
  const save = useServerFn(saveConnection);
  const qc = useQueryClient();
  const editing = !!existing;
  const [url, setUrl] = useState("");
  const sites = useBookingSites();
  // A built-in id or a site the host added; saved as channel plus site_key.
  const [siteKey, setSiteKey] = useState<string>(existing ? platformKey(existing) : "airbnb");
  const channel = toChannel(siteKey).channel;
  const [roomId, setRoomId] = useState(existing ? (existing.room_id ?? "none") : (roomIdDefault ?? rooms[0]?.id ?? "none"));
  const [listing, setListing] = useState(existing?.listing_name ?? "");
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
          ...(existing ? { id: existing.id } : {}),
          property_id: propertyId,
          room_id: roomId === "none" ? null : roomId,
          ...toChannel(siteKey),
          listing_name: listing.trim() || null,
          // When editing, an empty box keeps the saved link.
          ...(url.trim() ? { ical_url: url.trim() } : {}),
        },
      });
      await qc.invalidateQueries({ queryKey: ["connections"] });
      toast.success(editing ? linkTools.saved : "Calendar link added", editing ? undefined : { description: calendarUi.howItWorks });
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
          <DialogTitle className="font-display text-xl">{editing ? linkTools.editTitle : copy.add}</DialogTitle>
          <DialogDescription>{editing ? linkTools.editBody(existing?.masked_url ?? "") : copy.linkHelp}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="ical">{copy.linkLabel}</Label>
            <Input
              id="ical"
              className="h-12"
              required={!editing}
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
              <Select value={siteKey} onValueChange={setSiteKey}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site) => (
                    <SelectItem key={site.key} value={site.key}>
                      <span className="flex items-center gap-2">
                        <ChannelIcon channel={site.key} iconUrl={site.iconUrl} label={site.label} size="1.25em" />
                        {site.label}
                      </span>
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
              title={editing && !url.trim() ? linkTools.testNeedsLink : undefined}
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
  const { link } = Route.useSearch();
  useLandOn(link ? `link-${link}` : null, !workspace.isLoading);

  if (workspace.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!properties || properties.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader title={copy.title} subtitle={copy.subtitle} />
        <div className="mt-6">
          <EmptyState icon={Plug} title="No rooms set up yet" body="Add a property first, then connect your channel calendars." />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <PageHeader title={copy.title} subtitle={linkTools.subtitle} />

      {properties.map((p) => (
        <PropertyLinks key={p.id} property={p} />
      ))}

      <section className="card-soft flex flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg">{calendarUi.managerTitle}</h2>
          <p className="text-sm text-muted-foreground">{calendarUi.managerBody}</p>
        </div>
        <Badge variant="outline">{copy.comingSoon}</Badge>
      </section>

      <section className="card-soft p-5">
        <h2 className="text-lg">{calendarUi.helpTitle}</h2>
        <p className="text-sm text-muted-foreground">{calendarUi.helpSubtitle}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {CHANNEL_KEYS.filter((c) => calendarGuides[c]?.steps.length).map((c) => (
            <details key={c} className="rounded-2xl border border-border p-3">
              <summary className="cursor-pointer font-medium">{channels[c]}</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                {calendarGuides[c]!.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              {calendarGuides[c]?.helpUrl ? (
                <a
                  className="mt-1 inline-block text-sm underline"
                  href={calendarGuides[c]!.helpUrl!}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {calendarGuides[c]?.helpLabel ?? calendarUi.openHelp}
                </a>
              ) : null}
            </details>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{calendarUi.stepsChecked}</p>
      </section>
    </div>
  );
}

/** One property: a card per room with every calendar link feeding it. */
function PropertyLinks({ property }: { property: { id: string; name: string } }) {
  const board = usePropertyBoard(property.id);
  const list = useConnections(property.id);
  const syncAll = useServerFn(syncPropertyNow);
  const qc = useQueryClient();
  const { canWrite } = useRole();
  const [dialog, setDialog] = useState<{ existing: Connection | null; roomId: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const rooms = (board.data?.rooms ?? []) as Array<{ id: string; display_name: string }>;
  const items = (list.data?.connections ?? []) as Connection[];
  const runs = (list.data?.runs ?? []) as Run[];
  const unlinked = items.filter((c) => !c.room_id || !rooms.some((r) => r.id === c.room_id));

  async function runAll() {
    setBusy(true);
    try {
      const res = await syncAll({ data: { propertyId: property.id } });
      if (res.failed.length) toast.error(res.failed.join("\n"));
      else toast.success(linkTools.syncedAll(res.links));
      await Promise.all([qc.invalidateQueries({ queryKey: ["connections"] }), qc.invalidateQueries({ queryKey: ["board"] })]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-xl">{property.name}</h2>
        {canWrite && items.length > 0 ? (
          <Button variant="outline" size="sm" onClick={() => void runAll()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {copy.syncAll}
          </Button>
        ) : null}
      </div>

      {board.isLoading || list.isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : rooms.length === 0 ? (
        <p className="text-sm text-muted-foreground">{linkTools.noRooms}</p>
      ) : (
        <>
        {/* What sharing a room's Latchkey calendar does, said once for every room below. */}
        <RoomFeedNote />
        <div className="grid gap-4 lg:grid-cols-2">
          {rooms.map((r) => (
            <RoomCard
              key={r.id}
              title={r.display_name}
              roomId={r.id}
              links={items.filter((c) => c.room_id === r.id)}
              runs={runs}
              canWrite={canWrite}
              onAdd={() => setDialog({ existing: null, roomId: r.id })}
              onEdit={(c) => setDialog({ existing: c, roomId: c.room_id })}
            />
          ))}
          {unlinked.length > 0 ? (
            <RoomCard
              title={linkTools.unlinked}
              roomId={null}
              links={unlinked}
              runs={runs}
              canWrite={canWrite}
              onAdd={() => setDialog({ existing: null, roomId: null })}
              onEdit={(c) => setDialog({ existing: c, roomId: c.room_id })}
            />
          ) : null}
        </div>
        </>
      )}

      {dialog ? (
        <ConnectionDialog
          key={dialog.existing?.id ?? `new-${dialog.roomId}`}
          open
          onOpenChange={(o) => (o ? null : setDialog(null))}
          propertyId={property.id}
          rooms={rooms}
          existing={dialog.existing}
          roomIdDefault={dialog.roomId}
        />
      ) : null}
    </section>
  );
}

function RoomCard({
  title,
  roomId,
  links,
  runs,
  canWrite,
  onAdd,
  onEdit,
}: {
  title: string;
  roomId: string | null;
  links: Connection[];
  runs: Run[];
  canWrite: boolean;
  onAdd: () => void;
  onEdit: (c: Connection) => void;
}) {
  return (
    <article className="card-soft flex flex-col p-4">
      <div className="flex items-center gap-2">
        <h3 className="mr-auto text-lg">{title}</h3>
        {canWrite ? (
          <Button variant="ghost" size="sm" onClick={onAdd}>
            <Plus className="size-4" /> {linkTools.addLink}
          </Button>
        ) : null}
      </div>
      {links.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{copy.noLinks}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {links.map((c) => (
            <LinkRow key={c.id} link={c} runs={runs.filter((r) => r.connection_id === c.id)} canWrite={canWrite} onEdit={() => onEdit(c)} />
          ))}
        </ul>
      )}
      {roomId ? (
        <details className="mt-3 rounded-2xl border border-border p-3">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <CalendarSync className="size-4 text-primary" /> {feedCopy.title}
          </summary>
          <RoomFeedPanel roomId={roomId} roomName={title} />
        </details>
      ) : null}
    </article>
  );
}

function LinkRow({ link, runs, canWrite, onEdit }: { link: Connection; runs: Run[]; canWrite: boolean; onEdit: () => void }) {
  const sync = useServerFn(syncConnectionNow);
  const remove = useServerFn(deleteConnection);
  const site = useBookingSites().find((x) => x.key === platformKey(link));
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [withStays, setWithStays] = useState(false);
  const [history, setHistory] = useState(false);
  const state = busy ? "syncing" : linkState(link);

  async function syncNow() {
    setBusy(true);
    try {
      const res = await sync({ data: { id: link.id } });
      if (res.ok) toast.success(linkTools.syncResult(res.created, res.updated, res.cancelled));
      else toast.error(explainSyncError(res.message));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
      await Promise.all([qc.invalidateQueries({ queryKey: ["connections"] }), qc.invalidateQueries({ queryKey: ["board"] })]);
    }
  }

  async function drop() {
    try {
      const res = await remove({ data: { id: link.id, withBookings: withStays } });
      toast.success(withStays ? linkTools.removedWithStays(res.removed ?? 0, res.archived ?? 0) : linkTools.removed);
      await Promise.all([qc.invalidateQueries({ queryKey: ["connections"] }), qc.invalidateQueries({ queryKey: ["board"] })]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    }
  }

  const checked = link.last_synced_at
    ? `${formatUkDate(link.last_synced_at.slice(0, 10))}, ${formatUkTime(
        new Date(link.last_synced_at).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }),
      )}`
    : copy.never;

  return (
    <li id={`link-${link.id}`} className="scroll-mt-24 rounded-xl py-3">
      <div className="flex flex-wrap items-center gap-2">
        <ChannelBadge channel={link.channel as Channel} label={site?.label} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{link.listing_name ?? site?.label ?? channels[link.channel as Channel]}</span>
          <span className="block truncate text-xs text-muted-foreground">{link.masked_url ?? linkTools.noLink}</span>
        </span>
        <StatePill state={state} />
      </div>

      {state === "error" || state === "warning" ? (
        <p className={state === "error" ? "mt-2 rounded-xl bg-destructive/10 p-2 text-sm" : "mt-2 rounded-xl bg-accent/10 p-2 text-sm"}>
          {explainSyncError(link.last_error)}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="mr-auto text-xs text-muted-foreground">
          {copy.lastSynced}: {checked}
        </span>
        {canWrite ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => void syncNow()} disabled={state === "syncing"}>
              {state === "syncing" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {copy.syncNow}
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="size-4" /> {common.edit}
            </Button>
          </>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => setHistory((h) => !h)}>
          {copy.history}
        </Button>
        {canWrite ? (
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirm(true)} aria-label={common.remove}>
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>

      {history ? (
        <div className="mt-2 rounded-xl border border-border bg-surface p-3 text-sm">
          {runs.length === 0 ? (
            <p className="text-muted-foreground">{copy.noHistory}</p>
          ) : (
            <ul className="space-y-1 text-muted-foreground">
              {runs.map((r) => (
                <li key={r.id}>
                  {formatUkDate(r.started_at.slice(0, 10))}, {formatUkTime(r.started_at.slice(11, 16))} —{" "}
                  {r.error_message ? explainSyncError(r.error_message) : `${r.created_count} new, ${r.updated_count} updated, ${r.cancelled_count} cancelled`}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{linkTools.removeTitle}</AlertDialogTitle>
            <AlertDialogDescription>{linkTools.removeBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-3 rounded-2xl border border-border p-3 text-sm">
            <Checkbox checked={withStays} onCheckedChange={(v) => setWithStays(v === true)} className="mt-0.5" />
            <span>
              <span className="block font-medium">{linkTools.withStays}</span>
              <span className="block text-muted-foreground">{linkTools.withStaysHint}</span>
            </span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>{common.cancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void drop()}>
              {common.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function StatePill({ state }: { state: ReturnType<typeof linkState> }) {
  if (state === "syncing")
    return (
      <Badge variant="outline">
        <Loader2 className="size-3.5 animate-spin" /> {linkTools.states.syncing}
      </Badge>
    );
  if (state === "ok")
    return (
      <Badge variant="success">
        <CheckCircle2 className="size-3.5" /> {linkTools.states.ok}
      </Badge>
    );
  if (state === "warning")
    return (
      <Badge variant="accent">
        <AlertTriangle className="size-3.5" /> {linkTools.states.warning}
      </Badge>
    );
  if (state === "error")
    return (
      <Badge variant="destructive">
        <XCircle className="size-3.5" /> {linkTools.states.error}
      </Badge>
    );
  return (
    <Badge variant="outline">
      <Clock className="size-3.5" /> {linkTools.states.never}
    </Badge>
  );
}
