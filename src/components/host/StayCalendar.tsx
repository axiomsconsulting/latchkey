import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, MessageCircle, Sparkles } from "lucide-react";

import { ChannelIcon } from "@/components/ChannelIcon";
import type { Channel } from "@/components/ChannelBadge";
import { bookings as copy, channels, stayCalendar as calCopy } from "@/content/copy";
import { useBookingSites } from "@/hooks/use-host-data";
import { platformKey, type Site } from "@/lib/booking-sites";
import { lanes, roomHue, roomSwatch, spanFor, stayColours, type Span } from "@/lib/calendar-layout";
import { dayOfWeek, formatUkDate, nightsBetween } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type CalendarStay = {
  id: string;
  room_id: string | null;
  channel: string;
  site_key?: string | null;
  status: string;
  guest_full_name: string | null;
  check_in_date: string;
  check_out_date: string;
  mirror_of?: string | null;
};

export type Activity = Record<string, { messages: number; requests: number }>;

const ROOM_COLUMN = "10rem";
const LANE = "3rem";

/**
 * Rooms down the side, days across. Each stay is one continuous block in its
 * room's colour, a different shade per guest, with the booking site's icon.
 * Blocked nights are hatched, cleaning windows shaded, and small marks show
 * what each guest is doing: checked in, unread messages, open requests.
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
  const sites = useBookingSites();
  const columns = `${ROOM_COLUMN} repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div style={{ minWidth: `${10 + days.length * 5.5}rem` }}>
      <div className="grid border-b border-border bg-muted/40 text-xs font-medium" style={{ gridTemplateColumns: columns }}>
        <div className="px-3 py-2">{calCopy.room}</div>
        {days.map((d) => (
          <div key={d} className={cn("px-1 py-2 text-center", d === today && "text-primary")}>
            {formatUkDate(d)}
          </div>
        ))}
      </div>

      {rooms.map((r, roomIndex) => {
        const hue = roomHue(roomIndex);
        const inRoom = stays
          .filter((b) => b.room_id === r.id && b.status !== "cancelled")
          .map((b) => ({ ...b, span: spanFor(days, b.check_in_date, b.check_out_date) }))
          .filter((b): b is CalendarStay & { span: Span } => b.span !== null);
        const guests = inRoom.filter((b) => b.status !== "blocked" && !b.mirror_of);
        // A closed night only shows where no guest is staying.
        const closed = inRoom.filter(
          (b) =>
            (b.status === "blocked" || !!b.mirror_of) &&
            !guests.some((g) => g.span.start < b.span.start + b.span.length && b.span.start < g.span.start + g.span.length),
        );
        const { lane, count } = lanes([...guests, ...closed]);
        const last = roomIndex === rooms.length - 1;
        // Shades follow arrival order, so neighbouring guests always differ.
        const shadeOf = new Map(
          [...guests].sort((a, b) => a.check_in_date.localeCompare(b.check_in_date)).map((g, i) => [g.id, i]),
        );

        return (
          <div
            key={r.id}
            className="grid gap-x-0 gap-y-1 border-b border-border py-1 last:border-0"
            style={{ gridTemplateColumns: columns, gridTemplateRows: `repeat(${count}, ${LANE})` }}
          >
            <div className="flex items-center gap-2 px-3 text-sm font-medium" style={{ gridRow: `1 / span ${count}` }}>
              <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: roomSwatch(hue) }} />
              <span className="truncate">{r.display_name}</span>
            </div>

            {/* Day backgrounds: today and cleaning windows. */}
            {days.map((d, i) => {
              const cleaning = windows.some((w) => (w.room_id === null || w.room_id === r.id) && w.day_of_week === dayOfWeek(d));
              return (
                <div
                  key={d}
                  aria-hidden
                  className={cn("mx-0.5 rounded-lg", cleaning && "hatched", d === today && "bg-primary/5")}
                  style={{ gridColumn: i + 2, gridRow: `1 / span ${count}` }}
                />
              );
            })}

            {guests.map((stay) => (
              <StayBlock
                key={stay.id}
                stay={stay}
                site={sites.find((s) => s.key === platformKey(stay)) ?? null}
                colours={stayColours(hue, shadeOf.get(stay.id) ?? 0)}
                row={lane[stay.id]! + 1}
                rightHalf={stay.span.start + stay.span.length / 2 > days.length / 2}
                popAbove={last && lane[stay.id] === count - 1}
                activity={activity?.[stay.id]}
                echoes={everyone.filter((b) => b.mirror_of === stay.id && b.status !== "cancelled")}
                onOpen={onOpen}
              />
            ))}

            {closed.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onOpen(b.id)}
                className="hatched mx-0.5 flex min-w-0 items-center truncate rounded-lg border border-border px-2 text-left text-xs text-muted-foreground"
                style={{ gridColumn: `${b.span.start + 2} / span ${b.span.length}`, gridRow: lane[b.id]! + 1 }}
                title={`${copy.blockedCell} · ${channels[b.channel as Channel]}`}
              >
                <span className="truncate">{`${copy.blockedCell} · ${channels[b.channel as Channel]}`}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * One guest's stay as a single block. When the name doesn't fit (often a
 * one-night stay), hovering with a mouse shows a small popup that goes away
 * by itself, and holding a finger on it stretches the block to show the full
 * name and details until the finger lifts.
 */
function StayBlock({
  stay,
  site,
  colours,
  row,
  rightHalf,
  popAbove,
  activity,
  echoes,
  onOpen,
}: {
  stay: CalendarStay & { span: Span };
  site: Site | null;
  colours: { background: string; borderColor: string };
  row: number;
  rightHalf: boolean;
  popAbove: boolean;
  activity: { messages: number; requests: number } | undefined;
  echoes: CalendarStay[];
  onOpen: (id: string) => void;
}) {
  const nameRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | null>(null);
  // A press held long enough to read the stretched block isn't a tap.
  const pressedAt = useRef(0);
  const held = useRef(false);
  const [peek, setPeek] = useState(false);
  const [grown, setGrown] = useState(false);
  // Grow towards whichever side of the screen has room.
  const [growLeft, setGrowLeft] = useState(false);
  const name = stay.guest_full_name ?? copy.guestUnknown;
  const nights = nightsBetween(stay.check_in_date, stay.check_out_date);
  const label = site?.label ?? channels[stay.channel as Channel] ?? stay.channel;
  const details = `${calCopy.stayDates(formatUkDate(stay.check_in_date), formatUkDate(stay.check_out_date))} · ${calCopy.nights(nights)} · ${label}`;
  const echoNote = echoes.length > 0 ? ` · ${copy.alsoClosedOn} ${echoes.map((e) => channels[e.channel as Channel]).join(", ")}` : "";

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const truncated = () => {
    const el = nameRef.current;
    return !!el && el.scrollWidth > el.clientWidth + 1;
  };

  function showPeek() {
    if (!truncated()) return;
    setPeek(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPeek(false), 2500);
  }
  function hidePeek() {
    if (timer.current) window.clearTimeout(timer.current);
    setPeek(false);
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (held.current) {
          held.current = false;
          return;
        }
        onOpen(stay.id);
      }}
      onPointerEnter={(e) => (e.pointerType === "mouse" ? showPeek() : undefined)}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") hidePeek();
        else setGrown(false);
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== "touch") return;
        pressedAt.current = Date.now();
        held.current = false;
        const rect = e.currentTarget.getBoundingClientRect();
        setGrowLeft(rect.left + 224 > window.innerWidth && rect.right > 224);
        setGrown(true);
      }}
      onPointerUp={(e) => {
        if (e.pointerType !== "touch") return;
        held.current = Date.now() - pressedAt.current > 450;
        setGrown(false);
      }}
      onPointerCancel={() => setGrown(false)}
      // Keyboard focus only: a tap also focuses, and mustn't pop anything up.
      onFocus={(e) => (e.currentTarget.matches(":focus-visible") ? showPeek() : undefined)}
      onBlur={hidePeek}
      onContextMenu={(e) => grown && e.preventDefault()}
      aria-label={`${name}. ${details}${echoNote}`}
      className={cn(
        "relative mx-0.5 flex min-w-0 select-none items-center gap-1.5 rounded-lg border-l-4 px-2 text-left text-xs font-medium text-foreground transition-[box-shadow,width] duration-150 [-webkit-touch-callout:none]",
        stay.status === "needs_details" && "outline-2 outline-dashed outline-offset-[-2px] outline-accent",
        stay.status === "flagged" && "outline-2 outline-offset-[-2px] outline-destructive",
        stay.span.before && "rounded-l-none",
        stay.span.after && "rounded-r-none",
        grown && "z-30 h-auto w-max min-w-[calc(100%-0.25rem)] max-w-56 self-start py-1.5 shadow-lifted",
        grown && growLeft && "justify-self-end",
      )}
      style={{
        gridColumn: `${stay.span.start + 2} / span ${stay.span.length}`,
        gridRow: row,
        // The room colour over a solid card, so cleaning hatches don't show through.
        background: `linear-gradient(${colours.background}, ${colours.background}), var(--surface)`,
        borderLeftColor: colours.borderColor,
      }}
    >
      {stay.span.before ? <ChevronLeft className="size-3 shrink-0 opacity-60" aria-label={calCopy.continued} /> : null}
      <ChannelIcon channel={stay.channel} iconUrl={site?.iconUrl ?? null} label={label} size="1.15rem" />
      {stay.status === "checked_in" ? <Check className="size-3.5 shrink-0" aria-label={calCopy.checkedIn} /> : null}
      <span className="min-w-0 flex-1">
        <span ref={nameRef} className={cn("block", grown ? "whitespace-normal break-words" : "truncate")}>
          {name}
        </span>
        {grown ? <span className="block whitespace-normal text-[10px] font-normal text-muted-foreground">{details}</span> : null}
      </span>
      {activity?.messages ? (
        <span className="flex shrink-0 items-center rounded bg-background/80 px-1 text-[10px]" aria-label={calCopy.unread(activity.messages)}>
          <MessageCircle className="size-3" />
          {activity.messages}
        </span>
      ) : null}
      {activity?.requests ? (
        <span className="flex shrink-0 items-center rounded bg-background/80 px-1 text-[10px]" aria-label={calCopy.requests(activity.requests)}>
          <Sparkles className="size-3" />
          {activity.requests}
        </span>
      ) : null}
      {echoes.length > 0 ? <span className="shrink-0 rounded bg-background/70 px-1 text-[10px]">+{echoes.length}</span> : null}
      {stay.span.after ? <ChevronRight className="size-3 shrink-0 opacity-60" aria-label={calCopy.continues} /> : null}

      {peek ? (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-40 w-max max-w-xs rounded-xl border border-border bg-popover px-3 py-2 text-left text-popover-foreground shadow-lifted animate-in fade-in zoom-in-95",
            popAbove ? "bottom-full mb-1" : "top-full mt-1",
            rightHalf ? "right-0" : "left-0",
          )}
        >
          <span className="block text-sm font-medium">{name}</span>
          <span className="block text-xs text-muted-foreground">
            {details}
            {echoNote}
          </span>
        </span>
      ) : null}
    </button>
  );
}
