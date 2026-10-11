import { Check, MessageCircle, Sparkles } from "lucide-react";

import type { Channel } from "@/components/ChannelBadge";
import { bookings as copy, channels, stayCalendar as calCopy } from "@/content/copy";
import { dayOfWeek, formatUkDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type CalendarStay = {
  id: string;
  room_id: string | null;
  channel: string;
  status: string;
  guest_full_name: string | null;
  check_in_date: string;
  check_out_date: string;
  mirror_of?: string | null;
};

export type Activity = Record<string, { messages: number; requests: number }>;

const channelBar: Record<string, string> = {
  airbnb: "bg-channel-airbnb text-channel-airbnb-foreground",
  booking_com: "bg-channel-booking text-channel-booking-foreground",
  homestay: "bg-channel-homestay text-channel-homestay-foreground",
  direct: "bg-channel-direct text-channel-direct-foreground",
  other: "bg-channel-other text-channel-other-foreground",
};

/**
 * Rooms down the side, days across. Stays in platform colours, blocked
 * nights hatched, cleaning windows shaded, and small marks for what each
 * guest is doing: checked in, unread messages, open requests.
 */
export function StayCalendar({
  rooms,
  stays,
  allStays,
  windows,
  days,
  today,
  activity,
  onOpen,
}: {
  rooms: Array<{ id: string; display_name: string }>;
  stays: CalendarStay[];
  /** Unfiltered, to count echoes of a stay on other platforms. */
  allStays?: CalendarStay[];
  windows: Array<{ room_id: string | null; day_of_week: number | null }>;
  days: string[];
  today: string;
  activity?: Activity;
  onOpen: (bookingId: string) => void;
}) {
  const everyone = allStays ?? stays;
  return (
    <div style={{ minWidth: `${10 + days.length * 5.5}rem` }}>
      <div
        className="grid border-b border-border bg-muted/40 text-xs font-medium"
        style={{ gridTemplateColumns: `10rem repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <div className="px-3 py-2">{calCopy.room}</div>
        {days.map((d) => (
          <div key={d} className={cn("px-1 py-2 text-center", d === today && "text-primary")}>
            {formatUkDate(d)}
          </div>
        ))}
      </div>

      {rooms.map((r) => (
        <div
          key={r.id}
          className="grid border-b border-border last:border-0"
          style={{ gridTemplateColumns: `10rem repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div className="truncate px-3 py-3 text-sm font-medium">{r.display_name}</div>
          {days.map((d) => {
            const onNight = (b: CalendarStay) => b.room_id === r.id && b.check_in_date <= d && b.check_out_date > d;
            const stay = stays.find((b) => onNight(b) && b.status !== "cancelled" && b.status !== "blocked" && !b.mirror_of);
            const closed = stay ? undefined : stays.find((b) => onNight(b) && (b.status === "blocked" || !!b.mirror_of) && b.status !== "cancelled");
            const echoes = stay ? everyone.filter((b) => b.mirror_of === stay.id && b.status !== "cancelled") : [];
            const cleaning = windows.find((w) => (w.room_id === null || w.room_id === r.id) && w.day_of_week === dayOfWeek(d));
            const act = stay ? activity?.[stay.id] : undefined;
            const firstNight = stay && (stay.check_in_date === d || d === days[0]);
            const name = stay?.guest_full_name ?? copy.guestUnknown;
            return (
              <div key={d} className={cn("p-1", cleaning && !stay && "hatched")}>
                {stay ? (
                  <button
                    type="button"
                    onClick={() => onOpen(stay.id)}
                    className={cn(
                      "flex h-12 w-full items-center gap-1 truncate rounded-lg px-2 text-left text-xs font-medium",
                      channelBar[stay.channel] ?? channelBar["other"],
                      stay.status === "needs_details" && "outline-2 outline-dashed outline-offset-[-2px] outline-accent",
                      stay.status === "flagged" && "outline-2 outline-offset-[-2px] outline-destructive",
                    )}
                    title={
                      echoes.length > 0
                        ? `${name} · ${copy.alsoClosedOn} ${echoes.map((e) => channels[e.channel as Channel]).join(", ")}`
                        : name
                    }
                  >
                    {stay.status === "checked_in" ? <Check className="size-3.5 shrink-0" aria-label={calCopy.checkedIn} /> : null}
                    <span className="min-w-0 flex-1 truncate">{firstNight ? name : ""}</span>
                    {firstNight && act?.messages ? (
                      <span className="flex shrink-0 items-center rounded bg-background/80 px-1 text-[10px] text-foreground" aria-label={calCopy.unread(act.messages)}>
                        <MessageCircle className="size-3" />
                        {act.messages}
                      </span>
                    ) : null}
                    {firstNight && act?.requests ? (
                      <span className="flex shrink-0 items-center rounded bg-background/80 px-1 text-[10px] text-foreground" aria-label={calCopy.requests(act.requests)}>
                        <Sparkles className="size-3" />
                        {act.requests}
                      </span>
                    ) : null}
                    {firstNight && echoes.length > 0 ? (
                      <span className="shrink-0 rounded bg-background/70 px-1 text-[10px] text-foreground">+{echoes.length}</span>
                    ) : null}
                  </button>
                ) : closed ? (
                  <button
                    type="button"
                    onClick={() => onOpen(closed.id)}
                    className="hatched flex h-12 w-full items-center truncate rounded-lg border border-border px-2 text-left text-xs text-muted-foreground"
                    title={`${copy.blockedCell} · ${channels[closed.channel as Channel]}`}
                  >
                    <span className="truncate">{d === closed.check_in_date || d === days[0] ? `${copy.blockedCell} · ${channels[closed.channel as Channel]}` : ""}</span>
                  </button>
                ) : (
                  <div className="h-12" />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
