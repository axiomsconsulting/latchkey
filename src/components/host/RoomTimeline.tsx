import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { timelineCopy as copy } from "@/content/copy";
import {
  MINUTES_PER_DAY,
  ZOOMS,
  daysIn,
  dayNumber,
  laneOf,
  panBy,
  place,
  rangeLabel,
  step,
  ticks,
  viewFor,
  zoomAt,
  zoomOf,
  type View,
  type ZoomKey,
} from "@/lib/timeline";
import { cn } from "@/lib/utils";

/**
 * Something on a room's line: "back" things fill the line behind (cleaning
 * windows, the turnover between two guests), "front" things are the stays,
 * on their own lines where they overlap.
 */
export type TimelineItem = {
  id: string;
  roomId: string;
  start: number;
  end: number;
  layer: "back" | "front";
  title: string;
  label?: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  /** A name the guided tour can point at (src/lib/tour.ts). */
  tour?: string;
};

const LANE = { normal: 34, dense: 26 } as const;

/**
 * Rooms down the side, time across: one day in hours up to a month in days.
 * Always the width of its card (never scrolls sideways); many rooms scroll
 * down inside it under a header that stays put. Swipe or drag sideways to
 * move through time, pinch (or Ctrl/⌘ + scroll) to zoom, or use the buttons.
 * Bookings and Housekeeping lay their own things over it.
 */
export function RoomTimeline({
  rooms,
  view,
  onView,
  today,
  now,
  items,
  roomLabel,
  toolbar,
  maxHeight = "calc(100dvh - 15rem)",
  tourName,
}: {
  rooms: Array<{ id: string; display_name: string }>;
  view: View;
  onView: (v: View) => void;
  today: string;
  /** Now on the property's clock (timeline minutes), for the line across. */
  now: number | null;
  items: TimelineItem[];
  roomLabel?: (room: { id: string; display_name: string }) => ReactNode;
  /** Filters and the like, after the zoom buttons. */
  toolbar?: ReactNode;
  maxHeight?: string;
  /** A name the guided tour can point at (src/lib/tour.ts). */
  tourName?: string;
}) {
  const track = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(600);
  const live = useRef(view);
  live.current = view;

  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width || 600));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width || 600);
    return () => ro.disconnect();
  }, []);

  // Swipe to move, pinch to zoom: touch, pen or mouse. Up and down stays the page's own scrolling.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    mode: "none" | "maybe" | "pan" | "pinch";
    start: View;
    x: number;
    y: number;
    dist: number;
    anchor: number;
    moved: boolean;
  }>({ mode: "none", start: view, x: 0, y: 0, dist: 0, anchor: 0.5, moved: false });
  const anchorAt = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    return r && r.width ? Math.min(1, Math.max(0, (clientX - r.left) / r.width)) : 0.5;
  };
  const begin = () => {
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
      gesture.current = {
        mode: "pinch",
        start: live.current,
        x: 0,
        y: 0,
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        anchor: anchorAt((a.x + b.x) / 2),
        moved: true,
      };
    } else if (pts.length === 1) {
      gesture.current = {
        ...gesture.current,
        mode: "maybe",
        start: live.current,
        x: pts[0]!.x,
        y: pts[0]!.y,
      };
    } else gesture.current = { ...gesture.current, mode: "none" };
  };

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // Ctrl/⌘ + scroll (and a trackpad pinch) zooms; sideways scrolling moves through time.
    const wheel = (e: WheelEvent) => {
      const w = track.current?.getBoundingClientRect().width || 600;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        onView(zoomAt(live.current, Math.exp(e.deltaY * 0.01), anchorAt(e.clientX)));
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        onView(panBy(live.current, e.deltaX / w));
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [onView]);

  const ticksNow = ticks(view, width, width < 480 ? 48 : 60);
  const days = daysIn(view);
  const dense = rooms.length > 12;
  const lane = dense ? LANE.dense : LANE.normal;
  const left = (t: number) => `${((t - view.from) / view.span) * 100}%`;
  const zoom = zoomOf(view.span);

  return (
    <section className="card-soft overflow-hidden p-0" data-tour={tourName}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-2 py-2 sm:px-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={copy.earlier}
            onClick={() => onView(step(view, -1))}
          >
            <ChevronLeft className="size-5" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onView(viewFor(zoom, today))}>
            {copy.today}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={copy.later}
            onClick={() => onView(step(view, 1))}
          >
            <ChevronRight className="size-5" />
          </Button>
        </div>
        <p className="min-w-0 flex-1 truncate font-medium" aria-live="polite">
          {rangeLabel(view)}
        </p>
        <div
          role="radiogroup"
          aria-label={copy.zoom}
          className="flex w-full rounded-xl bg-muted p-0.5 sm:w-auto"
        >
          {ZOOMS.map((z) => (
            <button
              key={z.key}
              type="button"
              role="radio"
              aria-checked={zoom === z.key}
              onClick={() =>
                onView(viewFor(z.key as ZoomKey, days[Math.floor(days.length / 2)] ?? today))
              }
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium sm:flex-none sm:px-2.5",
                zoom === z.key
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {copy.zooms[z.key]}
            </button>
          ))}
        </div>
        {toolbar ? <div className="flex w-full flex-wrap items-center gap-2">{toolbar}</div> : null}
      </div>

      <div
        ref={scroller}
        className="relative select-none overflow-y-auto overscroll-contain [--label-w:6.5rem] sm:[--label-w:10rem]"
        style={{ maxHeight, touchAction: "pan-y" }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          gesture.current.moved = false;
          begin();
        }}
        onPointerMove={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const g = gesture.current;
          const w = track.current?.getBoundingClientRect().width || 600;
          if (g.mode === "pinch") {
            const [a, b] = [...pointers.current.values()] as [
              { x: number; y: number },
              { x: number; y: number },
            ];
            onView(zoomAt(g.start, g.dist / (Math.hypot(a.x - b.x, a.y - b.y) || 1), g.anchor));
          } else if (g.mode === "maybe" || g.mode === "pan") {
            const dx = e.clientX - g.x;
            const dy = e.clientY - g.y;
            if (g.mode === "maybe" && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy))
              g.mode = "pan";
            if (g.mode === "pan") {
              g.moved = true;
              onView(panBy(g.start, -dx / w));
            }
          }
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          begin();
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          begin();
        }}
        // A swipe or pinch never also opens what it started on.
        onClickCapture={(e) => {
          if (gesture.current.moved) {
            e.stopPropagation();
            e.preventDefault();
            gesture.current.moved = false;
          }
        }}
      >
        {/* The marks along the top stay put while the rooms scroll. */}
        <div className="sticky top-0 z-20 grid grid-cols-[var(--label-w)_minmax(0,1fr)] border-b border-border bg-surface/95 backdrop-blur">
          <span className="px-2 py-2 text-xs text-muted-foreground sm:px-3">{copy.room}</span>
          <div
            ref={track}
            className="relative h-8 overflow-hidden text-[11px] tabular-nums text-muted-foreground"
          >
            {ticksNow.map((t) => (
              <span
                key={t.at}
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-1",
                  t.day && "font-semibold text-foreground",
                )}
                style={{ left: left(t.at) }}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>

        <div className="relative">
          {/* Days behind everything: weekends, today, each midnight, and the time now. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-[var(--label-w)] right-0 overflow-hidden"
          >
            {days.map((d) => {
              const start = dayNumber(d) * MINUTES_PER_DAY;
              const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
              const p = place(view, start, start + MINUTES_PER_DAY);
              if (!p) return null;
              return (
                <span
                  key={d}
                  className={cn(
                    "absolute inset-y-0 border-l border-border/70",
                    d === today ? "bg-primary/[0.06]" : dow === 0 || dow === 6 ? "bg-muted/40" : "",
                  )}
                  style={{ left: `${p.left * 100}%`, width: `${p.width * 100}%` }}
                />
              );
            })}
            {now !== null && now > view.from && now < view.from + view.span ? (
              <span
                className="absolute inset-y-0 z-10 w-0.5 bg-destructive"
                style={{ left: left(now) }}
              />
            ) : null}
          </div>

          {rooms.map((room) => {
            const mine = items.filter((i) => i.roomId === room.id);
            const front = mine.filter((i) => i.layer === "front");
            const { lane: laneIx, count } = laneOf(front);
            const height = count * lane + 8;
            return (
              <div
                key={room.id}
                className="grid grid-cols-[var(--label-w)_minmax(0,1fr)] border-b border-border last:border-b-0"
              >
                <div
                  className="flex min-w-0 items-center px-2 sm:px-3"
                  style={{ minHeight: height }}
                >
                  {roomLabel ? (
                    roomLabel(room)
                  ) : (
                    <span className="truncate text-sm font-medium">{room.display_name}</span>
                  )}
                </div>
                <div className="relative" style={{ height }}>
                  {mine.map((it) => {
                    const p = place(view, it.start, it.end);
                    if (!p) return null;
                    const wide = p.width * width > 34;
                    const front = it.layer === "front";
                    const style: CSSProperties = {
                      left: `${p.left * 100}%`,
                      width: `${p.width * 100}%`,
                      ...(front ? { top: 4 + laneIx[it.id]! * lane, height: lane - 4 } : {}),
                      ...it.style,
                    };
                    const cls = cn(
                      "absolute flex min-w-0 items-center overflow-hidden text-left text-xs",
                      front ? "gap-1 rounded-md px-1.5 font-medium" : "inset-y-0",
                      front && p.cutStart && "rounded-l-none",
                      front && p.cutEnd && "rounded-r-none",
                      it.onClick &&
                        "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      it.className,
                    );
                    const content = wide ? it.label : null;
                    return it.onClick ? (
                      <button
                        key={it.id}
                        type="button"
                        title={it.title}
                        aria-label={it.title}
                        className={cls}
                        style={style}
                        onClick={it.onClick}
                        data-tour={it.tour}
                      >
                        {content}
                      </button>
                    ) : (
                      <span key={it.id} title={it.title} className={cls} style={style}>
                        {content}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        {copy.hint}
      </p>
    </section>
  );
}
