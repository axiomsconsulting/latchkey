import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useUi } from "@/hooks/use-site";
import { arrange } from "@/lib/ui-config";
import { ChevronDown, Maximize2, Minimize2 } from "lucide-react";

import { dashboardCopy as copy } from "@/content/copy";
import {
  bands,
  defaultPlaces,
  placeCard,
  readLayout,
  setPlace,
  toggleCollapsed,
  type Layout,
  type Place,
} from "@/lib/dashboard-layout";
import { moveItem } from "@/lib/reorder";
import { cn } from "@/lib/utils";

type Ctx = {
  collapsed: (id: string) => boolean;
  toggle: (id: string) => void;
  grabProps: (id: string, title: string) => React.ButtonHTMLAttributes<HTMLButtonElement>;
  dragging: string | null;
  wide: (id: string) => boolean;
  setWide: (id: string, wide: boolean) => void;
};

const SectionsContext = createContext<Ctx | null>(null);

/**
 * Today's sections, which the host can move, widen and fold. Each card is
 * full width or sits in the left or right column; the cards between two
 * full-width ones form two independent columns, each stacked tightly. The
 * grab bar works like the menu's: drag it onto another card to take that
 * place (a column, or full width over a full-width card) or into a column's
 * empty space, tap it to fold, or use the arrow keys (up/down to move,
 * left/right for the column) and Enter to fold. The width button switches
 * between full width and a column. Phones show one column in order.
 * Remembered in this browser.
 */
export function DashboardSections({
  storageKey,
  items: all,
  page,
}: {
  storageKey: string;
  items: Array<{ id: string; wide?: boolean; node: ReactNode }>;
  /** The super admin's layout for this page (src/lib/ui-config.ts): their order is the starting order, hidden sections never show. */
  page?: string;
}) {
  const ui = useUi();
  const allowed = page
    ? arrange(
        ui.pages[page],
        all.map((i) => i.id),
      )
    : all.map((i) => i.id);
  const items = allowed.map((id) => all.find((i) => i.id === id)!).filter(Boolean);
  const defaults = items.map((i) => i.id);
  const defaultPlace = defaultPlaces(items);
  const [layout, setLayoutState] = useState<Layout>({
    order: defaults,
    collapsed: [],
    place: defaultPlace,
  });
  const [dragging, setDragging] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean; layout: Layout } | null>(
    null,
  );

  useEffect(() => {
    try {
      setLayoutState(readLayout(window.localStorage.getItem(storageKey), defaults, defaultPlace));
    } catch {
      setLayoutState(readLayout(null, defaults, defaultPlace));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, defaults.join()]);

  const setLayout = (l: Layout) => {
    setLayoutState(l);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(l));
    } catch {
      // Not remembered this time.
    }
  };
  const toggle = (id: string) => setLayout(toggleCollapsed(layout, id));
  const move = (id: string, by: -1 | 1) => {
    const from = layout.order.indexOf(id);
    const next = moveItem(layout.order, from, from + by);
    if (next !== layout.order) setLayout({ ...layout, order: next });
  };

  /** Where the pointer would drop the card: next to the card under it, or at the end of a column. */
  function dropAt(id: string, x: number, y: number, l: Layout): Layout {
    const root = listRef.current;
    if (!root) return l;
    const hit = (el: Element) => {
      const b = el.getBoundingClientRect();
      return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom ? b : null;
    };
    for (const li of root.querySelectorAll<HTMLLIElement>("li[data-section]")) {
      const target = li.dataset["section"]!;
      const b = li.offsetParent ? hit(li) : null;
      if (!b || target === id) continue;
      const place = (li.dataset["place"] as Place) ?? "l";
      return placeCard(l, id, target, y < b.top + b.height / 2 ? "before" : "after", place);
    }
    for (const col of root.querySelectorAll<HTMLElement>("[data-col]")) {
      if (!hit(col)) continue;
      const last = col.dataset["last"]!;
      return last === id
        ? setPlace(l, id, col.dataset["col"] as Place)
        : placeCard(l, id, last, "after", col.dataset["col"] as Place);
    }
    return l;
  }

  // The latest state for window listeners (a card that changes band is mounted afresh mid-drag).
  const live = useRef({ layout, setLayout, toggle, dropAt });
  live.current = { layout, setLayout, toggle, dropAt };

  const grabProps = (id: string, title: string): React.ButtonHTMLAttributes<HTMLButtonElement> => ({
    type: "button",
    "aria-label": copy.grab(title, layout.collapsed.includes(id)),
    title: copy.grabHint,
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      drag.current = { id, x: e.clientX, y: e.clientY, moved: false, layout };
      const onMove = (ev: PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        if (!d.moved && Math.abs(ev.clientX - d.x) + Math.abs(ev.clientY - d.y) > 6) {
          d.moved = true;
          setDragging(id);
        }
        if (!d.moved) return;
        const next = live.current.dropAt(id, ev.clientX, ev.clientY, d.layout);
        if (next !== d.layout) {
          d.layout = next;
          setLayoutState(next);
        }
      };
      const onEnd = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
        const d = drag.current;
        drag.current = null;
        setDragging(null);
        if (!d || ev.type === "pointercancel") return;
        // A tap folds or unfolds, like the menu's grab bar changes the menu.
        if (!d.moved) return live.current.toggle(id);
        live.current.setLayout(d.layout);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
    },
    onKeyDown: (e) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        move(id, -1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        move(id, 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        setLayout(setPlace(layout, id, e.key === "ArrowLeft" ? "l" : "r"));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle(id);
      }
    },
  });

  const byId = new Map(items.map((i) => [i.id, i]));
  const shown = layout.order.filter((id) => {
    const node = byId.get(id)?.node;
    return node !== null && node !== false && node !== undefined;
  });
  const rank = new Map(shown.map((id, i) => [id, i]));
  const changed =
    layout.order.join() !== defaults.join() ||
    layout.collapsed.length > 0 ||
    defaults.some((id) => layout.place[id] !== defaultPlace[id]);
  const card = (id: string, place: Place) => (
    <li
      key={id}
      data-section={id}
      data-place={place}
      // Phones: one column in the page's order (the columns dissolve, so each card's order counts).
      style={{ order: rank.get(id) }}
      className={cn("min-w-0 empty:hidden", dragging === id && "opacity-80")}
    >
      {byId.get(id)!.node}
    </li>
  );

  return (
    <SectionsContext.Provider
      value={{
        collapsed: (id) => layout.collapsed.includes(id),
        toggle,
        grabProps,
        dragging,
        wide: (id) => layout.place[id] === "w",
        setWide: (id, w) => setLayout(setPlace(layout, id, w ? "w" : "l")),
      }}
    >
      <div ref={listRef} className="flex flex-col gap-5 pt-2">
        {bands(layout, shown).map((band) =>
          band.kind === "wide" ? (
            <ul key={band.id} className="flex flex-col">
              {card(band.id, "w")}
            </ul>
          ) : (
            <div key={`cols-${band.last}`} className="flex flex-col gap-5 lg:grid lg:grid-cols-2">
              {(["l", "r"] as const).map((col) => (
                <ul
                  key={col}
                  data-col={col}
                  data-last={band.last}
                  className="contents lg:flex lg:min-h-8 lg:flex-col lg:gap-5"
                >
                  {(col === "l" ? band.left : band.right).map((id) => card(id, col))}
                </ul>
              ))}
            </div>
          ),
        )}
      </div>
      {changed ? (
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setLayout({ order: defaults, collapsed: [], place: defaultPlace })}
        >
          {copy.reset}
        </button>
      ) : null}
    </SectionsContext.Provider>
  );
}

/**
 * One of Today's sections: a card with the menu's grab bar on its top edge
 * and a fold button. Outside DashboardSections it's a plain card.
 */
export function DashSection({
  id,
  icon: Icon,
  title,
  action,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const ctx = useContext(SectionsContext);
  const folded = ctx?.collapsed(id) ?? false;
  return (
    <section
      id={`today-${id}`}
      className={cn(
        "card-soft relative flex flex-col p-5 scroll-mt-24",
        ctx?.dragging === id && "shadow-lifted ring-2 ring-primary/40",
      )}
    >
      {ctx ? (
        <button
          {...ctx.grabProps(id, title)}
          className="group absolute -top-2 left-1/2 grid h-4 w-20 -translate-x-1/2 cursor-grab touch-none place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        >
          <span className="h-1 w-12 rounded-full bg-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
        </button>
      ) : null}
      <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", !folded && "mb-3")}>
        <Icon className="size-5 shrink-0 text-primary" />
        <h2 className="mr-auto text-lg">{title}</h2>
        {action ? <span className="text-sm">{action}</span> : null}
        {ctx ? (
          <button
            type="button"
            onClick={() => ctx.setWide(id, !ctx.wide(id))}
            aria-label={ctx.wide(id) ? copy.narrow(title) : copy.widen(title)}
            title={ctx.wide(id) ? copy.narrowHint : copy.widenHint}
            className="hidden size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted lg:grid"
          >
            {ctx.wide(id) ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        ) : null}
        {ctx ? (
          <button
            type="button"
            onClick={() => ctx.toggle(id)}
            aria-expanded={!folded}
            aria-label={folded ? copy.unfold(title) : copy.fold(title)}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <ChevronDown className={cn("size-4 transition-transform", folded && "-rotate-90")} />
          </button>
        ) : null}
      </div>
      {folded ? null : children}
    </section>
  );
}
