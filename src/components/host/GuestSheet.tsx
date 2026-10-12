import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, ArchiveRestore, BadgeCheck, BedDouble, Loader2, Pencil, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ChannelBadge, type Channel } from "@/components/ChannelBadge";
import { GuestPeople } from "@/components/host/GuestPeople";
import { GuideLinkButton } from "@/components/host/GuideLinkButton";
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { common, guestCard as copy } from "@/content/copy";
import { useBookingSites, useRole } from "@/hooks/use-host-data";
import { platformKey } from "@/lib/booking-sites";
import { formatUkDate, formatUkTime, nightsBetween, stayState } from "@/lib/dates";
import { archiveBookings, deleteBookings, getGuestDetails } from "@/lib/guests.functions";
import { markHostRead, sendHostMessage } from "@/lib/messages.functions";

const when = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function money(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

/**
 * Everything about one stay in one place: who, where, how long, which
 * platform, the conversation, requests and arrivals, with the actions a
 * host needs. Opened from Today, Bookings and the calendar.
 */
export function GuestSheet({
  bookingId,
  today,
  onOpenChange,
  onEdit,
}: {
  bookingId: string | null;
  today: string;
  onOpenChange: (open: boolean) => void;
  onEdit?: (bookingId: string) => void;
}) {
  const fetchDetails = useServerFn(getGuestDetails);
  const send = useServerFn(sendHostMessage);
  const markRead = useServerFn(markHostRead);
  const archive = useServerFn(archiveBookings);
  const remove = useServerFn(deleteBookings);
  const qc = useQueryClient();
  const { canWrite } = useRole();
  const sites = useBookingSites();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const details = useQuery({
    queryKey: ["guest", bookingId],
    enabled: !!bookingId,
    queryFn: () => fetchDetails({ data: { bookingId: bookingId! } }),
  });

  // Opening the card counts as reading the guest's messages.
  useEffect(() => {
    if (!bookingId || !canWrite) return;
    void markRead({ data: { bookingId } }).then(() => qc.invalidateQueries({ queryKey: ["board"] }));
  }, [bookingId, canWrite, markRead, qc]);

  async function act(key: string, fn: () => Promise<unknown>, done: string, close = false) {
    setBusy(key);
    try {
      await fn();
      if (close) {
        // Close first, and forget the stay rather than reloading it: after a
        // delete it no longer exists, and the panel must not linger on it.
        onOpenChange(false);
        qc.removeQueries({ queryKey: ["guest", bookingId] });
        await qc.invalidateQueries({ queryKey: ["board"] });
      } else {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["board"] }),
          qc.invalidateQueries({ queryKey: ["guest", bookingId] }),
        ]);
      }
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  const d = details.data;
  const b = d?.booking;
  const nights = b ? nightsBetween(b.checkIn, b.checkOut) : 0;
  const site = b ? sites.find((x) => x.key === platformKey({ channel: b.channel, site_key: b.siteKey })) : undefined;

  return (
    <Sheet open={!!bookingId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {!b ? (
          <div className="grid h-full place-items-center">
            {details.error ? (
              <p className="text-muted-foreground">{details.error instanceof Error ? details.error.message : common.errorBody}</p>
            ) : (
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            )}
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 font-display text-2xl">
                {b.guestName ?? copy.noName}
                {b.idCheckStatus === "matched" ? (
                  <BadgeCheck className="size-6 shrink-0 text-success" aria-label={copy.verified} />
                ) : null}
              </SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <ChannelBadge channel={b.channel as Channel} label={site?.label} />
                <StatusBadge state={stayState({ status: b.status, check_in_date: b.checkIn, check_out_date: b.checkOut }, today)} />
                {b.archived ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{copy.archived}</span> : null}
              </SheetDescription>
            </SheetHeader>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 px-4 text-sm">
              <Fact label={copy.room} value={b.roomName ? `${b.roomName}${b.roomTitle ? ` · ${b.roomTitle}` : ""}` : copy.noRoom} wide />
              <Fact label={copy.arrives} value={`${formatUkDate(b.checkIn, { withYear: true })}${b.checkInTime ? `, ${formatUkTime(b.checkInTime)}` : ""}`} />
              <Fact label={copy.leaves} value={`${formatUkDate(b.checkOut, { withYear: true })}${b.checkOutTime ? `, ${formatUkTime(b.checkOutTime)}` : ""}`} />
              <Fact label={copy.nights} value={String(nights)} />
              <Fact label={copy.guests} value={String(b.guestCount ?? 1)} />
              <Fact label={copy.bookedOn} value={b.listingName ?? site?.label ?? b.channel.replace("_", ".")} />
              <Fact label={copy.reference} value={b.reservationCode ?? "—"} />
              {b.email ? <Fact label={copy.email} value={b.email} /> : null}
              {b.phoneLast4 ? <Fact label={copy.phone} value={`•••• ${b.phoneLast4}`} /> : null}
              {b.checkedInAt ? <Fact label={copy.checkedIn} value={when.format(new Date(b.checkedInAt))} /> : null}
              {b.notes ? <Fact label={copy.notes} value={b.notes} wide /> : null}
            </dl>

            {canWrite ? (
              <div className="mt-4 flex flex-wrap gap-2 px-4">
                {onEdit ? (
                  <Button variant="outline" size="sm" onClick={() => onEdit(b.id)}>
                    <Pencil className="size-4" /> {common.edit}
                  </Button>
                ) : null}
                <GuideLinkButton bookingId={b.id} />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() =>
                    void act("archive", () => archive({ data: { ids: [b.id], archived: !b.archived } }), b.archived ? copy.restored : copy.archivedToast, !b.archived)
                  }
                >
                  {b.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                  {b.archived ? copy.restore : copy.archive}
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" disabled={busy !== null} onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" /> {common.remove}
                </Button>
              </div>
            ) : null}

            <Section title={copy.whoStaying} count={d.people.length}>
              <GuestPeople
                people={d.people}
                arrivedAdults={b.arrivedAdults}
                arrivedChildren={b.arrivedChildren}
                bookedCount={b.guestCount ?? 1}
              />
            </Section>

            <Section title={copy.messages} count={d.messages.length}>
              {d.messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">{copy.noMessages}</p>
              ) : (
                <ul className="space-y-2">
                  {d.messages.map((m) => (
                    <li key={m.id} className={m.fromHost ? "ml-8 rounded-2xl bg-primary/10 p-3 text-sm" : "mr-8 rounded-2xl bg-secondary p-3 text-sm"}>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {m.fromHost ? copy.you : (b.guestName?.split(" ")[0] ?? copy.guest)} · {when.format(new Date(m.createdAt))}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {canWrite ? (
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!reply.trim()) return;
                    void act("send", () => send({ data: { bookingId: b.id, body: reply.trim() } }), copy.sent).then(() => setReply(""));
                  }}
                >
                  <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={copy.replyPlaceholder} aria-label={copy.replyPlaceholder} />
                  <Button type="submit" size="icon" disabled={busy === "send" || !reply.trim()} aria-label={copy.send}>
                    {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </Button>
                </form>
              ) : null}
            </Section>

            <Section title={copy.requests} count={d.requests.length + d.jobs.length}>
              {d.requests.length + d.jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">{copy.noRequests}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {d.requests.map((r) => (
                    <li key={r.id} className="rounded-xl border border-border p-3">
                      <p>{r.items.map((i) => `${i.qty} × ${i.name}`).join(", ") || copy.extrasRequest}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.status.replace("_", " ")} · {r.totalPence ? money(r.totalPence) : copy.free} · {when.format(new Date(r.createdAt))}
                      </p>
                    </li>
                  ))}
                  {d.jobs.map((j) => (
                    <li key={j.id} className="rounded-xl border border-border p-3">
                      <p>{j.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {j.status.replace("_", " ")} · {when.format(new Date(j.createdAt))}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/app/services" className="mt-2 inline-block text-sm underline underline-offset-4">
                {copy.openServices}
              </Link>
            </Section>

            {d.presence.length > 0 ? (
              <Section title={copy.activity} count={d.presence.length}>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {d.presence.map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <BedDouble className="size-4" /> {copy.presence[p.event] ?? p.event} · {when.format(new Date(p.createdAt))}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{copy.deleteTitle(b.guestName ?? copy.noName)}</AlertDialogTitle>
                  <AlertDialogDescription>{b.source === "ical" ? `${copy.deleteBody} ${copy.deleteSynced}` : copy.deleteBody}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{common.cancel}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => void act("delete", () => remove({ data: { ids: [b.id] } }), copy.deleted, true)}
                  >
                    {common.remove}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mt-6 border-t border-border px-4 pt-4">
      <h3 className="mb-2 text-lg">
        {title} {count ? <span className="text-sm text-muted-foreground">({count})</span> : null}
      </h3>
      {children}
    </section>
  );
}
