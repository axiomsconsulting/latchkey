import { useEffect, useMemo, useState } from "react";
import { Check, MessageCircle, Sparkles } from "lucide-react";

import { ChannelIcon } from "@/components/ChannelIcon";
import type { Channel } from "@/components/ChannelBadge";
import { RoomTimeline, type TimelineItem } from "@/components/host/RoomTimeline";
import { bookings as copy, channels, stayCalendar as calCopy } from "@/content/copy";
import { useBookingSites } from "@/hooks/use-host-data";
import { platformKey } from "@/lib/booking-sites";
import { roomHue, stayColours } from "@/lib/calendar-layout";
import { formatUkDate, nightsBetween } from "@/lib/dates";
import { windowsForDay, type ScheduleWindow } from "@/lib/housekeeping";
import { at, daysIn, nowOn, stayTimes, viewFor, type View } from "@/lib/timeline";

export type TimelineStay = {
  id: string;
  room_id: string | null;
  channel: string;
  site_key?: string | null;
  status: string;
  guest_full_name: string | null;
  check_in_date: string;
  check_out_date: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  mirror_of?: string | null;
};
export type Activity = Record<string, { messages: number; requests: number }>;

// Cleaning and unavailable windows: striped behind the stays.
export const WINDOW_STRIPES = "repeating-linear-gradient(135deg, color-mix(in srgb, var(--accent) 30%, transparent) 0 5px, transparent 5px 10px)";

/** Starts on a week on wide screens, three days on a phone. */
export function useStartView(today: string): [View, (v: View) => void] {
  const [view, setView] = useState<View>(() => viewFor("week", today));
  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) setView(viewFor("3days", today));
  }, [today]);
  return [view, setView];
}

/**
 * Bookings as a timeline: each stay from its check-in time to its check-out
 * time in its room's colour (a different shade per guest), with the booking
 * site's icon, checked in, unread messages and open requests; closed nights
 * hatched, and the cleaning and unavailable windows striped behind.
 */
export function BookingsTimeline({
  rooms,
  stays,
  allStays,
  windows,
  times,
  timezone,
  today,
  activity,
  onOpen,
}: {
  rooms: Array<{ id: string; display_name: string }>;
  stays: TimelineStay[];
  allStays: TimelineStay[];
  windows: ScheduleWindow[];
  times: { checkIn: string; checkOut: string };
  timezone: string;
  today: string;
  activity: Activity;
  onOpen: (id: string) => void;
}) {
  const sites = useBookingSites();
  const [view, setView] = useStartView(today);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(nowOn(timezone));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [timezone]);

  const items = useMemo(() => {
    const out: TimelineItem[] = [];
    rooms.forEach((room, roomIndex) => {
      const hue = roomHue(roomIndex);
      const mine = stays.filter((b) => b.room_id === room.id && b.status !== "cancelled");
      const guests = mine.filter((b) => b.status !== "blocked" && !b.mirror_of).sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
      guests.forEach((b, shade) => {
        const t = stayTimes(b, times);
        const site = sites.find((s) => s.key === platformKey(b)) ?? null;
        const label = site?.label ?? channels[b.channel as Channel] ?? b.channel;
        const name = b.guest_full_name ?? copy.guestUnknown;
        const a = activity[b.id];
        const echoes = allStays.filter((x) => x.mirror_of === b.id && x.status !== "cancelled");
        const c = stayColours(hue, shade);
        out.push({
          id: b.id,
          roomId: room.id,
          start: t.start,
          end: t.end,
          layer: "front",
          title: `${name}. ${calCopy.stayDates(formatUkDate(b.check_in_date), formatUkDate(b.check_out_date))} · ${calCopy.nights(nightsBetween(b.check_in_date, b.check_out_date))} · ${label}${echoes.length ? ` · ${copy.alsoClosedOn} ${echoes.map((e) => channels[e.channel as Channel]).join(", ")}` : ""}`,
          className: [
            "border-l-4 text-foreground",
            b.status === "needs_details" ? "outline-2 outline-dashed outline-offset-[-2px] outline-accent" : "",
            b.status === "flagged" ? "outline-2 outline-offset-[-2px] outline-destructive" : "",
          ].join(" "),
          style: { background: `linear-gradient(${c.background}, ${c.background}), var(--surface)`, borderLeftColor: c.borderColor },
          label: (
            <>
              <ChannelIcon channel={b.channel} iconUrl={site?.iconUrl ?? null} label={label} size="1rem" />
              {b.status === "checked_in" ? <Check className="size-3.5 shrink-0" aria-label={calCopy.checkedIn} /> : null}
              <span className="min-w-0 flex-1 truncate">{name}</span>
              {a?.messages ? (
                <span className="flex shrink-0 items-center rounded bg-background/80 px-1 text-[10px]">
                  <MessageCircle className="size-3" />
                  {a.messages}
                </span>
              ) : null}
              {a?.requests ? (
                <span className="flex shrink-0 items-center rounded bg-background/80 px-1 text-[10px]">
                  <Sparkles className="size-3" />
                  {a.requests}
                </span>
              ) : null}
              {echoes.length ? <span className="shrink-0 rounded bg-background/70 px-1 text-[10px]">+{echoes.length}</span> : null}
            </>
          ),
          onClick: () => onOpen(b.id),
          tour: "booking-row",
        });
      });
      // Closed nights, only where no guest is staying.
      for (const b of mine.filter((x) => x.status === "blocked" || !!x.mirror_of)) {
        const t = stayTimes(b, times);
        if (guests.some((g) => {
          const gt = stayTimes(g, times);
          return gt.start < t.end && t.start < gt.end;
        })) continue;
        out.push({
          id: b.id,
          roomId: room.id,
          start: t.start,
          end: t.end,
          layer: "front",
          title: `${copy.blockedCell} · ${channels[b.channel as Channel] ?? b.channel}`,
          className: "hatched border border-border text-muted-foreground",
          label: <span className="truncate">{copy.blockedCell}</span>,
          onClick: () => onOpen(b.id),
        });
      }
    });
    // The windows on every day in view (weekly and one-off), behind the stays.
    for (const d of daysIn(view)) {
      for (const w of windowsForDay(windows, d, timezone)) {
        for (const room of rooms) {
          if (w.roomId && w.roomId !== room.id) continue;
          out.push({ id: `${w.id}-${d}-${room.id}`, roomId: room.id, start: at(d, w.start), end: at(d, w.end), layer: "back", title: `${w.reason ?? calCopy.cleaning} ${w.start}–${w.end}`, style: { backgroundImage: WINDOW_STRIPES } });
        }
      }
    }
    return out;
  }, [rooms, stays, allStays, windows, times, timezone, activity, sites, view, onOpen]);

  return <RoomTimeline rooms={rooms} view={view} onView={setView} today={today} now={now} items={items} />;
}
