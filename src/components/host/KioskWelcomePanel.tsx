import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Hand, Loader2, MonitorUp, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { common, kioskWelcomeCopy as copy } from "@/content/copy";
import { clearKioskWelcome, getKioskWelcome, setKioskWelcome } from "@/lib/kiosk.functions";
import { pingKiosk } from "@/lib/kiosk-ping";
import { cn } from "@/lib/utils";

const firstName = (full: string | null) => (full ?? "").trim().split(/\s+/)[0] ?? "";
const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * Put a welcome for an arriving guest on the front-door kiosk, full screen,
 * and change or remove it while it shows.
 */
export function KioskWelcomePanel({
  propertyId,
  shortCode,
  arriving,
  bare = false,
  forBooking,
  onDone,
}: {
  propertyId: string;
  shortCode: string;
  arriving: Array<{ id: string; guest_full_name: string | null }>;
  /** In its own card: no divider or heading of its own. */
  bare?: boolean;
  /** For one guest (the guest's card): no guest picker, the welcome written for them. */
  forBooking?: { id: string; guest_full_name: string | null };
  onDone?: () => void;
}) {
  const fetchFn = useServerFn(getKioskWelcome);
  const setFn = useServerFn(setKioskWelcome);
  const clearFn = useServerFn(clearKioskWelcome);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["kiosk-welcome", propertyId], queryFn: () => fetchFn({ data: { propertyId } }), refetchInterval: 20_000 });
  const current = q.data?.message ?? null;
  const named = forBooking ? [forBooking] : arriving.filter((b) => b.guest_full_name?.trim());
  const [bookingId, setBookingId] = useState<string>(named[0]?.id ?? "none");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState<string>(copy.defaultBody);
  const [minutes, setMinutes] = useState("120");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // The guest picked fills in their first name; the host can change every word.
  useEffect(() => {
    const b = named.find((x) => x.id === bookingId);
    if (b) setHeadline(copy.defaultHeadline(firstName(b.guest_full_name)));
    else if (!headline) setHeadline(copy.defaultHeadline(""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);
  useEffect(() => {
    if (current && editing) {
      setHeadline(current.headline);
      setBody(current.body ?? "");
    }
  }, [current, editing]);

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await fn();
      await pingKiosk(shortCode);
      await qc.invalidateQueries({ queryKey: ["kiosk-welcome", propertyId] });
      setEditing(false);
      toast.success(done);
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }
  const show = () =>
    run(
      "show",
      () =>
        setFn({
          data: {
            propertyId,
            headline: headline.trim() || copy.defaultHeadline(""),
            body: body.trim() || null,
            bookingId: bookingId === "none" ? null : bookingId,
            minutes: Number(minutes),
          },
        }),
      current ? copy.updated : copy.shown,
    );

  if (q.data && !q.data.available) return <p className="text-sm text-muted-foreground">{copy.notReady}</p>;

  return (
    <div className={bare ? "space-y-3" : "space-y-3 border-t border-border pt-3"}>
      {bare ? null : (
        <p className="flex items-center gap-2 text-sm font-medium">
          <Hand className="size-4 text-primary" /> {copy.title}
        </p>
      )}

      {current && !editing ? (
        <div className="space-y-2">
          <div className="rounded-xl bg-primary p-4 text-center text-primary-foreground">
            <p className="font-display text-xl">{current.headline}</p>
            {current.body ? <p className="mt-1 text-sm opacity-90">{current.body}</p> : null}
          </div>
          <p className={cn("text-xs", current.dismissed ? "text-success" : "text-muted-foreground")}>
            {current.dismissed && current.dismissedAt ? copy.tapped(time(current.dismissedAt)) : copy.showing(time(current.updatedAt), time(current.expiresAt))}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setEditing(true)}>
              {copy.edit}
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" disabled={busy !== null} onClick={() => void run("clear", () => clearFn({ data: { propertyId } }), copy.removed)}>
              {busy === "clear" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />} {copy.remove}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {named.length && !editing && !forBooking ? (
            <div className="space-y-1">
              <Label className="text-xs">{copy.forGuest}</Label>
              <Select value={bookingId} onValueChange={setBookingId}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {named.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.guest_full_name}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">{copy.anyone}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="kw-head" className="text-xs">
              {copy.headline}
            </Label>
            <Input id="kw-head" className="h-10" maxLength={80} value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="kw-body" className="text-xs">
              {copy.body}
            </Label>
            <Textarea id="kw-body" rows={2} maxLength={300} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{copy.for}</Label>
              <Select value={minutes} onValueChange={setMinutes}>
                <SelectTrigger className="h-10 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(copy.durations).map(([m, label]) => (
                    <SelectItem key={m} value={m}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button disabled={busy !== null || !headline.trim()} onClick={() => void show()}>
              {busy === "show" ? <Loader2 className="size-4 animate-spin" /> : <MonitorUp className="size-4" />} {current ? copy.update : copy.show}
            </Button>
            {editing ? (
              <Button variant="ghost" onClick={() => setEditing(false)}>
                {common.cancel}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
