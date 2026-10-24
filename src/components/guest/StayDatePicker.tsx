import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { bookPageCopy as copy } from "@/content/copy";
import { inStay, monthGrid, moveStay, paintStay, tapDay, type Bounds, type Focus, type Stay } from "@/lib/date-pick";
import { cn } from "@/lib/utils";

/** How long a finger rests on a day before dragging starts (so a swipe still scrolls the page). */
const HOLD_MS = 260;

type Drag = { kind: "move" | "paint"; from: string; over: string; moved: boolean };

/**
 * The booking page's calendar. Tap the arrival, then the leaving day (a new
 * arrival keeps the number of nights). Drag across days to paint a stay, or
 * drag the stay itself to move it, keeping its nights. Mouse drags start
 * straight away; on a touch screen, press and hold a moment first. Nights
 * with no room free are struck through; offer nights carry a dot.
 */
export function StayDatePicker({
  stay,
  focus,
  bounds,
  months,
  onChange,
  onDone,
  full,
  offer,
}: {
  stay: Stay;
  focus: Focus;
  bounds: Bounds;
  months: 1 | 2;
  onChange: (stay: Stay, focus: Focus) => void;
  /** Both ends chosen by tapping: the panel may fold away. */
  onDone?: () => void;
  full: (day: string) => boolean;
  offer: (day: string) => boolean;
}) {
  const [view, setView] = useState(() => ({ y: Number(stay.checkIn.slice(0, 4)), m: Number(stay.checkIn.slice(5, 7)) - 1 }));
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const hold = useRef<{ timer: number; x: number; y: number; day: string } | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ stay, focus, bounds, onChange });
  latest.current = { stay, focus, bounds, onChange };

  const setDragBoth = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  // What the calendar shows while dragging.
  const shown: Stay = useMemo(() => {
    if (!drag || !drag.moved) return stay;
    if (drag.kind === "move") return moveStay(stay, drag.from, drag.over, bounds);
    return paintStay(drag.from, drag.over, bounds) ?? stay;
  }, [drag, stay, bounds]);

  const dayAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-day]");
    return el?.dataset["day"] ?? null;
  };

  function begin(day: string) {
    const s = latest.current.stay;
    setDragBoth({ kind: inStay(s, day) ? "move" : "paint", from: day, over: day, moved: false });
  }
  function over(day: string | null) {
    const d = dragRef.current;
    if (!d || !day || day === d.over) return;
    setDragBoth({ ...d, over: day, moved: d.moved || day !== d.from });
  }
  function finish() {
    const d = dragRef.current;
    setDragBoth(null);
    if (!d || !d.moved) return;
    suppressClick.current = true;
    const { stay: s, bounds: b, onChange: change } = latest.current;
    const next = d.kind === "move" ? moveStay(s, d.from, d.over, b) : paintStay(d.from, d.over, b);
    if (next) change(next, "in");
  }

  // Mouse and pen: drag straight away.
  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "touch" || e.button !== 0) return;
    const day = (e.target as HTMLElement).closest<HTMLElement>("[data-day]")?.dataset["day"];
    if (!day || day < bounds.min) return;
    begin(day);
    const move = (ev: PointerEvent) => over(dayAt(ev.clientX, ev.clientY));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      finish();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Touch: press and hold, then drag; a quick swipe scrolls as usual.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0]!;
      const day = (e.target as HTMLElement).closest<HTMLElement>("[data-day]")?.dataset["day"];
      if (!day || day < latest.current.bounds.min) return;
      const timer = window.setTimeout(() => {
        begin(day);
        navigator.vibrate?.(8);
      }, HOLD_MS);
      hold.current = { timer, x: t.clientX, y: t.clientY, day };
    };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (dragRef.current) {
        e.preventDefault();
        over(dayAt(t.clientX, t.clientY));
      } else if (hold.current && Math.hypot(t.clientX - hold.current.x, t.clientY - hold.current.y) > 8) {
        window.clearTimeout(hold.current.timer);
        hold.current = null;
      }
    };
    const end = () => {
      if (hold.current) window.clearTimeout(hold.current.timer);
      hold.current = null;
      if (dragRef.current) finish();
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tap(day: string) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const r = tapDay(stay, focus, day, bounds);
    onChange(r.stay, r.focus);
    if (r.done) onDone?.();
  }

  const shift = (n: number) => setView((v) => {
    const d = new Date(Date.UTC(v.y, v.m + n, 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });
  const minMonth = Number(bounds.min.slice(0, 4)) * 12 + Number(bounds.min.slice(5, 7)) - 1;
  const atStart = view.y * 12 + view.m <= minMonth;
  const shownMonths = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(view.y, view.m + i, 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });
  const title = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="select-none">
      <div ref={gridRef} onPointerDown={onPointerDown} className={cn("grid gap-6", months === 2 && "md:grid-cols-2")}>
        {shownMonths.map(({ y, m }, i) => (
          <div key={`${y}-${m}`}>
            <div className="mb-2 flex h-10 items-center justify-between">
              {i === 0 ? (
                <button type="button" onClick={() => shift(-1)} disabled={atStart} aria-label={copy.prevMonth} className="grid size-10 place-items-center rounded-full hover:bg-secondary disabled:opacity-30">
                  <ChevronLeft className="size-5" />
                </button>
              ) : <span className="size-10" />}
              <p className="font-semibold">{title(y, m)}</p>
              {i === shownMonths.length - 1 ? (
                <button type="button" onClick={() => shift(1)} aria-label={copy.nextMonth} className="grid size-10 place-items-center rounded-full hover:bg-secondary">
                  <ChevronRight className="size-5" />
                </button>
              ) : <span className="size-10" />}
            </div>
            <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground" aria-hidden>
              {["M", "T", "W", "T", "F", "S", "S"].map((d, k) => <span key={k} className="py-1">{d}</span>)}
            </div>
            <div role="grid" aria-label={title(y, m)} className="grid grid-cols-7">
              {monthGrid(y, m).flat().map((day, k) => {
                if (!day) return <span key={k} />;
                const past = day < bounds.min || day > bounds.max;
                const start = day === shown.checkIn;
                const end = day === shown.checkOut;
                const within = day > shown.checkIn && day < shown.checkOut;
                const isFull = !past && full(day);
                return (
                  <div key={day} className={cn("relative py-0.5", within && "bg-primary/12", start && shown.checkOut > shown.checkIn && "bg-gradient-to-r from-transparent from-50% to-primary/12 to-50%", end && "bg-gradient-to-l from-transparent from-50% to-primary/12 to-50%")}>
                    <button
                      type="button"
                      data-day={past ? undefined : day}
                      disabled={past}
                      onClick={() => tap(day)}
                      aria-label={new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) + (isFull ? `, ${copy.legendFull}` : "")}
                      aria-pressed={start || end}
                      className={cn(
                        "relative mx-auto grid aspect-square w-full max-w-11 place-items-center rounded-full text-sm tabular-nums transition-colors",
                        past ? "text-muted-foreground/40" : "hover:bg-secondary",
                        isFull && !start && !end && "text-muted-foreground line-through decoration-1",
                        (start || end) && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                        drag?.moved && (start || end) && "ring-2 ring-primary/40 ring-offset-2",
                        inStay(stay, day) && !drag && "cursor-grab",
                      )}
                    >
                      {Number(day.slice(8))}
                      {offer(day) && !past ? <span className={cn("absolute bottom-1 size-1 rounded-full", start || end ? "bg-primary-foreground" : "bg-accent")} aria-hidden /> : null}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{copy.calendarHelp}</span>
        <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-accent" aria-hidden /> {copy.legendOffer}</span>
        <span className="line-through">{copy.legendFullShort}</span>
      </p>
    </div>
  );
}
